// src/components/common/CodeSandboxPlayer/CodeSandboxPlayer.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Code, Maximize, Minimize, CheckCircle, Play, Loader2, Plus, X, Trash2, Pencil, FilePlus, Download, Github, FolderArchive, RefreshCw, AlertTriangle, ScrollText, SquareTerminal } from 'lucide-react';
import {
    SandpackProvider,
    SandpackLayout,
    SandpackCodeEditor,
    SandpackFileExplorer,
    useSandpack
} from "@codesandbox/sandpack-react";
import { useToast } from '../Toast/Toast';
import JSZip from 'jszip';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { StatusModal } from '../StatusModal/StatusModal';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { getWebContainer } from './webcontainerManager';
import type { FileSystemTree, WebContainer, WebContainerProcess } from '@webcontainer/api';
import { createPortal } from 'react-dom';

export interface SandboxFileMap {
    [path: string]: string;
}

export interface SandboxBlock {
    id: string;
    title?: string;
    template?: string;
    question?: string;
    initialFiles?: SandboxFileMap;
}

export interface SandboxAnswerPayload {
    snapshot?: string | SandboxFileMap;
    dependencies?: Record<string, string>;
    immediate?: boolean;
}

export interface CodeSandboxPlayerProps {
    block: SandboxBlock;
    learnerAns: SandboxAnswerPayload | null | undefined;
    onChange?: (answer: SandboxAnswerPayload) => void | Promise<void>;
    readOnly?: boolean;
}

const MLAB_DEBUG = false; // flip to true only when actively debugging save/load issues
const mlog = (...args: any[]) => { if (MLAB_DEBUG) console.log(...args); };
const mwarn = (...args: any[]) => { if (MLAB_DEBUG) console.warn(...args); };
const merror = (...args: any[]) => { if (MLAB_DEBUG) console.error(...args); };

const sanitizeBlockId = (id: string | undefined): string => {
    const clean = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    return clean || 'mlab-default';
};

const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache', '.npm-cache'];
const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

const shouldIgnorePath = (relPath: string) => {
    const parts = relPath.split('/').filter(Boolean);
    if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
    const fileName = parts[parts.length - 1] || '';
    if (SYNC_IGNORE_FILES.includes(fileName)) return true;
    if (fileName.endsWith('.log')) return true;
    return false;
};

const createSafeSnapshot = (files: Record<string, string>, onDropped?: (path: string) => void) => {
    const safeFiles: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
        if (shouldIgnorePath(path)) continue;
        if (content.length > 500000) {
            console.warn(`File ${path} is too large. Excluding from auto-save.`);
            onDropped?.(path);
            continue;
        }
        safeFiles[path] = content;
    }
    return JSON.stringify(safeFiles);
};

const isValidSnapshot = (obj: unknown): obj is SandboxFileMap => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    return Object.entries(obj as Record<string, unknown>).every(
        ([path, content]) => typeof path === 'string' && path.length < 500 && typeof content === 'string'
    );
};

const safeParseSnapshot = (raw: string): SandboxFileMap | null => {
    try {
        const parsed = JSON.parse(raw);
        return isValidSnapshot(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const convertToTree = (files: Record<string, string>): FileSystemTree => {
    const tree: FileSystemTree = {};
    for (const [path, content] of Object.entries(files)) {
        const parts = path.split('/').filter(Boolean);
        let current = tree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                let fileContent: string | Uint8Array = content;
                if (typeof content === 'string' && content.startsWith('__mlab_base64__')) {
                    const binStr = atob(content.substring(15));
                    const arr = new Uint8Array(binStr.length);
                    for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
                    fileContent = arr;
                }
                current[part] = { file: { contents: fileContent } };
            } else {
                if (!current[part]) current[part] = { directory: {} };
                current = (current[part] as any).directory;
            }
        }
    }
    return tree;
};

const detectTemplate = (files: Record<string, string>, overrideTemplate?: string): "vite-react-ts" | "vite-react" | any => {
    if (overrideTemplate && overrideTemplate !== 'create-react-app') return overrideTemplate;
    return Object.keys(files).some(p => p.endsWith('.tsx') || p.endsWith('.ts')) || !!files['/tsconfig.json'] ? "vite-react-ts" : "vite-react";
};

const getEffectiveTemplate = (files: Record<string, string>, fallback: string | undefined): string => {
    const fileNames = Object.keys(files);

    const hasReactFile = fileNames.some(p => p.endsWith('.jsx') || p.endsWith('.tsx') || p === '/vite.config.js' || p === '/vite.config.ts');
    const pkgJson = files['/package.json'];
    const hasReactDep = pkgJson ? pkgJson.includes('"react"') || pkgJson.includes("'react'") : false;

    if (hasReactFile || hasReactDep) {
        const hasTS = fileNames.some(p => p.endsWith('.ts') || p.endsWith('.tsx'));
        return hasTS ? 'vite-react-ts' : 'vite-react';
    }

    if (pkgJson) {
        return 'node';
    }

    if (fallback === 'javascript' || fallback === 'html') return 'vanilla';
    if (fallback === 'typescript') return 'vanilla-ts';
    if (fallback === 'create-react-app') return 'vite-react';

    return fallback || 'vanilla';
};

// 🚀 RE-ADDED: The translator function I accidentally deleted in the last turn
const resolveSandpackTemplate = (dbTemplateKey?: string): any => {
    if (!dbTemplateKey) return "vanilla";
    const templateMap: Record<string, string> = {
        "javascript": "vanilla",
        "html": "vanilla",
        "typescript": "vanilla-ts",
        "create-react-app": "react",
        "vite-react": "vite-react",
        "vite-react-ts": "vite-react-ts",
        "node": "node",
        "python": "vanilla",
        "sql": "vanilla",
    };
    return templateMap[dbTemplateKey] || dbTemplateKey;
};

const processProjectData = (rawFiles: Record<string, string>, targetPort: number, templateType: string, blockId: string) => {
    const out = { ...rawFiles };
    const isReact = templateType === 'vite-react' || templateType === 'create-react-app' || templateType === 'vite-react-ts';
    const isNode = templateType === 'node';

    Object.keys(out).forEach(k => {
        if (shouldIgnorePath(k)) delete out[k];
    });

    if (!out['/package.json']) {
        out['/package.json'] = JSON.stringify({ name: "mlab-workspace-project", type: "module" }, null, 2);
    }

    try {
        const pkg = JSON.parse(out['/package.json']);
        pkg.type = pkg.type || "module";
        pkg.dependencies = pkg.dependencies || {};
        pkg.devDependencies = pkg.devDependencies || {};
        pkg.scripts = pkg.scripts || {};

        if (isNode) {
            pkg.scripts.dev = pkg.scripts.dev || `node index.js`;
        } else {
            pkg.scripts.dev = `vite --port ${targetPort} --strictPort`;
            pkg.devDependencies['vite'] = pkg.devDependencies['vite'] || "^4.5.3";
        }

        if (isReact) {
            pkg.dependencies['react'] = pkg.dependencies['react'] || "^18.2.0";
            pkg.dependencies['react-dom'] = pkg.dependencies['react-dom'] || "^18.2.0";
            pkg.devDependencies['@vitejs/plugin-react'] = pkg.devDependencies['@vitejs/plugin-react'] || "^4.2.1";
        }

        delete pkg.engines;
        delete pkg.packageManager;
        out['/package.json'] = JSON.stringify(pkg, null, 2);
    } catch (e) { }

    if (isReact) {
        if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
            out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
        }

        const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
        const ext = isTSProject ? 'tsx' : 'jsx';

        if (out[`/App.${ext}`] && !out[`/src/App.${ext}`]) {
            out[`/src/App.${ext}`] = out[`/App.${ext}`];
        }
        if (out[`/App.js`] && !out[`/src/App.jsx`]) {
            out[`/src/App.jsx`] = out[`/App.js`];
        }

        const ghosts = ['/index.js', '/index.jsx', '/index.ts', '/index.tsx', '/src/index.js', '/src/index.jsx', '/src/index.ts', '/src/index.tsx', '/App.js', '/App.jsx', '/App.ts', '/App.tsx'];
        ghosts.forEach(g => delete out[g]);

        const actualExt = out['/src/App.tsx'] ? 'tsx' : 'jsx';

        if (!out['/src/App.jsx'] && !out['/src/App.tsx']) {
            out[`/src/App.${actualExt}`] = 'export default function App() {\n  return <h1>Vite + React Canvas Online!</h1>;\n}';
        }

        out[`/App.${actualExt}`] = `export { default } from "./src/App.${actualExt}";\n`;

        if (!out['/src/main.jsx'] && !out['/src/main.tsx']) {
            out[`/src/main.${actualExt}`] = `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "../App.${actualExt}";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);`;
        }

        if (!out['/src/index.css']) out['/src/index.css'] = `body { font-family: sans-serif; padding: 2rem; }`;
    } else if (!isNode) {
        if (!out['/index.html']) {
            out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>Vanilla App</title>\n</head>\n<body>\n  <div id="app"></div>\n  <script type="module" src="/index.js"></script>\n</body>\n</html>`;
        }
        if (!out['/index.js']) {
            out['/index.js'] = `document.getElementById('app').innerHTML = '<h1>Hello Vanilla!</h1>';`;
        }
    }

    const consoleInterceptor = `\n<script>\n  (function() {\n    const orig = { ...console };\n    ['log', 'warn', 'error', 'info'].forEach(m => {\n      console[m] = (...args) => {\n        orig[m](...args);\n        try { window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*'); } catch(e) {}\n      };\n    });\n    window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m: 'error', p: e.message }, '*'));\n  })();\n</script>\n`;

    let htmlKey = out['/index.html'] ? '/index.html' : out['/public/index.html'] ? '/public/index.html' : null;

    if (htmlKey) {
        let html = out[htmlKey];
        if (!html.includes("source: 'preview-console'")) {
            if (html.includes('<head>')) {
                html = html.replace('<head>', `<head>${consoleInterceptor}`);
            } else if (html.includes('<html>')) {
                html = html.replace('<html>', `<html><head>${consoleInterceptor}</head>`);
            } else {
                html = `${consoleInterceptor}${html}`;
            }
        }
        out[htmlKey] = html;
    } else if (isReact) {
        const entryPoint = templateType === 'vite-react' ? '/src/main' : '/src/index';
        const ext = out['/src/App.tsx'] ? 'tsx' : 'jsx';
        out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>${consoleInterceptor}</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="${entryPoint}.${ext}"></script>\n</body>\n</html>`;
    }

    return out;
};

const GIT_SHIM_SCRIPT = `#!/usr/bin/env node
console.log("\\n\\x1b[1;33m⚠️  Git is not natively supported in this browser environment.\\x1b[0m");
console.log("\\x1b[1;36mHOW TO MANAGE YOUR CODE:\\x1b[0m");
console.log("  • \\x1b[1;34mClone/Pull:\\x1b[0m Use \\x1b[1;32mnpx degit <github-username>/<repo>\\x1b[0m to download templates.");
console.log("  • \\x1b[1;34mSave/Push:\\x1b[0m Your code is actively auto-saving to the platform.");
console.log("  • \\x1b[1;34mExport:\\x1b[0m Click \\x1b[1;32mDownload ZIP\\x1b[0m in the toolbar above to get your files locally.\\n");
`;

const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', transition: 'color 0.2s' };
const FILE_ACTIONS_BAR_STYLE: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#252526', padding: '6px 16px', borderBottom: '1px solid #333', flexShrink: 0, minHeight: '36px' };

const SandpackFileActions: React.FC<{ readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>>, wcInstance: WebContainer | null, blockId: string }> = ({ readOnly, canonicalKeysRef, wcInstance, blockId }) => {
    const { sandpack } = useSandpack();

    const [action, setAction] = useState<'idle' | 'add' | 'rename'>('idle');
    const [inputValue, setInputValue] = useState('');

    if (readOnly) return null;

    const handleAction = async () => {
        if (!inputValue.trim()) { setAction('idle'); return; }
        const WORK_DIR = `/${blockId}`;

        if (action === 'add') {
            let path = inputValue.trim();
            if (!path.startsWith('/')) path = '/' + path;
            if (sandpack.files[path]) { window.alert("A file with this path already exists."); return; }

            if (typeof sandpack.addFile === 'function') sandpack.addFile(path, "// New file\n");
            else sandpack.updateFile(path, "// New file\n");
            if (typeof sandpack.setActiveFile === 'function') sandpack.setActiveFile(path);
            canonicalKeysRef.current.add(path);

            if (wcInstance) {
                try {
                    const parts = path.split('/').filter(Boolean);
                    if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
                    await wcInstance.fs.writeFile(`${WORK_DIR}${path}`, "// New file\n");
                } catch { }
            }
        } else if (action === 'rename') {
            const oldPath = sandpack.activeFile;
            let newPath = inputValue.trim();
            if (!newPath.startsWith('/')) newPath = '/' + newPath;

            if (newPath !== oldPath) {
                if (sandpack.files[newPath]) { window.alert("A file with that name already exists."); return; }
                const content = sandpack.files[oldPath].code;
                if (typeof sandpack.addFile === 'function') {
                    sandpack.addFile(newPath, content);
                    sandpack.deleteFile(oldPath);
                    sandpack.setActiveFile(newPath);
                }
                canonicalKeysRef.current.add(newPath);
                canonicalKeysRef.current.delete(oldPath);

                if (wcInstance) {
                    try {
                        const parts = newPath.split('/').filter(Boolean);
                        if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
                        await wcInstance.fs.writeFile(`${WORK_DIR}${newPath}`, content);
                        await wcInstance.fs.rm(`${WORK_DIR}${oldPath}`);
                    } catch { }
                }
            }
        }
        setAction('idle');
        setInputValue('');
    };

    const handleDelete = async () => {
        const path = sandpack.activeFile;
        if (Object.keys(sandpack.files).length <= 1) { window.alert("You cannot delete the last remaining file."); return; }
        if (window.confirm(`Are you sure you want to delete ${path}?`)) {
            if (typeof sandpack.deleteFile === 'function') sandpack.deleteFile(path);
            canonicalKeysRef.current.delete(path);
            if (wcInstance) { try { await wcInstance.fs.rm(`/${blockId}${path}`); } catch { } }
        }
    };

    return (
        <div style={FILE_ACTIONS_BAR_STYLE}>
            {action === 'idle' ? (
                <><span style={{ fontSize: '0.7rem', color: '#ccc', fontWeight: 600, letterSpacing: '0.5px' }}>EXPLORER</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setAction('add'); setInputValue(''); }} style={iconBtnStyle}><FilePlus size={15} /></button>
                        <button onClick={() => { setAction('rename'); setInputValue(sandpack.activeFile); }} style={iconBtnStyle}><Pencil size={14} /></button>
                        <button onClick={handleDelete} style={{ ...iconBtnStyle, color: '#ef4444' }}><Trash2 size={15} /></button>
                    </div></>
            ) : (
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: action === 'add' ? '#10b981' : '#eab308', fontWeight: 'bold' }}>{action === 'add' ? 'NEW:' : 'RENAME:'}</span>
                    <input autoFocus value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAction(); if (e.key === 'Escape') setAction('idle'); }} onBlur={() => { if (inputValue.trim() && inputValue !== sandpack.activeFile) handleAction(); else setAction('idle'); }} style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: `1px solid ${action === 'add' ? '#10b981' : '#eab308'}`, outline: 'none', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', minWidth: 0 }} />
                </div>
            )}
        </div>
    );
};

const WebContainerSyncBridge: React.FC<{ wcInstance: WebContainer | null, blockId: string, readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>> }> = ({ wcInstance, blockId, readOnly, canonicalKeysRef }) => {
    const { sandpack } = useSandpack();
    const lastCodeRef = useRef<Record<string, string>>({});
    const isWritingRef = useRef<boolean>(false);

    if (Object.keys(lastCodeRef.current).length === 0) {
        Object.entries(sandpack.files).forEach(([path, fileObj]) => {
            lastCodeRef.current[path] = fileObj.code;
        });
    }

    useEffect(() => {
        if (!wcInstance || readOnly) return;
        const timeoutId = setTimeout(() => {
            Object.entries(sandpack.files).forEach(([path, fileObj]) => {
                const code = fileObj.code;
                if (code !== undefined && lastCodeRef.current[path] !== code) {
                    lastCodeRef.current[path] = code;
                    let outCode: string | Uint8Array = code;
                    if (typeof code === 'string' && code.startsWith('__mlab_base64__')) {
                        const binStr = atob(code.substring(15));
                        const arr = new Uint8Array(binStr.length);
                        for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
                        outCode = arr;
                    }
                    const WORK_DIR = `/${blockId}`;
                    const fullPath = `${WORK_DIR}${path.startsWith('/') ? path : `/${path}`}`;
                    const relativeParts = path.split('/').filter(Boolean);

                    isWritingRef.current = true;
                    if (relativeParts.length > 1) {
                        wcInstance.fs.mkdir(`${WORK_DIR}/` + relativeParts.slice(0, -1).join('/'), { recursive: true })
                            .then(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }))
                            .catch(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }));
                    } else {
                        wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
                    }
                }
            });
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [sandpack.files, wcInstance, blockId, readOnly]);

    useEffect(() => {
        if (!wcInstance || readOnly) return;
        let mounted = true;
        let inFlight = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let watcher: { close?: () => void } | null = null;

        const walk = async (dir: string, relBase: string, acc: Record<string, string>) => {
            let entries: any[];
            try {
                entries = await wcInstance.fs.readdir(dir, { withFileTypes: true } as any);
            } catch { return; }

            for (const entry of entries) {
                const name = typeof entry === 'string' ? entry : entry.name;
                const isDir = typeof entry === 'string' ? false : entry.isDirectory?.();
                const relPath = `${relBase}/${name}`;
                if (shouldIgnorePath(relPath)) continue;

                if (isDir) {
                    await walk(`${dir}/${name}`, relPath, acc);
                } else {
                    const isBinaryFile = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm', '.svg'].some(ext => name.toLowerCase().endsWith(ext));
                    if (isBinaryFile) continue;

                    try {
                        const content = await wcInstance.fs.readFile(`${dir}/${name}`, 'utf-8');
                        acc[relPath] = content;
                    } catch { }
                }
            }
        };

        const syncFromDisk = async () => {
            if (isWritingRef.current || inFlight) return;
            inFlight = true;
            try {
                const diskFiles: Record<string, string> = {};
                await walk(`/${blockId}`, '', diskFiles);

                for (const [relPath, content] of Object.entries(diskFiles)) {
                    if (!mounted) break;
                    const currentCode = sandpack.files[relPath]?.code;
                    if (content !== currentCode && content !== lastCodeRef.current[relPath]) {
                        lastCodeRef.current[relPath] = content;
                        canonicalKeysRef.current.add(relPath);
                        if (sandpack.files[relPath] !== undefined) {
                            sandpack.updateFile(relPath, content);
                        } else if (typeof sandpack.addFile === 'function') {
                            sandpack.addFile(relPath, content);
                        }
                    }
                }
            } catch { }
            inFlight = false;
        };

        const setup = async () => {
            try {
                const w = (wcInstance.fs as any).watch?.(`/${blockId}`, { recursive: true }, () => {
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(syncFromDisk, 400);
                });
                if (w && typeof w.close === 'function') {
                    watcher = w;
                } else {
                    throw new Error('fs.watch unavailable');
                }
            } catch {
                intervalId = setInterval(syncFromDisk, 2500);
            }
        };
        setup();

        return () => {
            mounted = false;
            if (intervalId) clearInterval(intervalId);
            if (debounceTimer) clearTimeout(debounceTimer);
            if (watcher?.close) { try { watcher.close(); } catch { } }
        };
    }, [wcInstance, blockId, sandpack, canonicalKeysRef, readOnly]);

    return null;
};

const StateHarvester: React.FC<{ readOnly: boolean, onChange: (answer: { snapshot: string; dependencies: Record<string, string>; immediate: boolean }) => void }> = ({ readOnly, onChange }) => {
    const { sandpack } = useSandpack();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (readOnly) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            const currentFiles: Record<string, string> = {};
            for (const [path, fileObj] of Object.entries(sandpack.files)) {
                const cleanPath = path.startsWith('/') ? path : `/${path}`;
                if (fileObj && !fileObj.hidden && typeof fileObj.code === 'string') {
                    currentFiles[cleanPath] = fileObj.code;
                }
            }

            const pkgJson = currentFiles['/package.json'];
            let dependencies = {};
            if (pkgJson) {
                try { dependencies = JSON.parse(pkgJson).dependencies || {}; } catch (e) { }
            }

            onChange({ snapshot: createSafeSnapshot(currentFiles), dependencies, immediate: false });
        }, 400); // wait for a pause in typing before serializing the whole file map

        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [sandpack.files, readOnly, onChange]);
    return null;
};

let globalNpmMutex: Promise<void> = Promise.resolve();

export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false }) => {
    // console.log('[MLAB][render] CodeSandboxPlayer render. blockId:', block?.id, 'learnerAns present:', !!learnerAns, 'has onChange prop:', !!onChange, 'readOnly:', readOnly);
    const toast = useToast();
    const [isMaximized, setIsMaximized] = useState(false);
    const [pendingZipFile, setPendingZipFile] = useState<Blob | null>(null);

    const onChangeRef = useRef(onChange);

    const [showGithubModal, setShowGithubModal] = useState(false);
    const [githubUrl, setGithubUrl] = useState('');
    const [isFetchingGithub, setIsFetchingGithub] = useState(false);

    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

    const safeBlockId = useMemo(() => sanitizeBlockId(block?.id), [block?.id]);

    const assignedPort = useMemo(() => {
        let hash = 0;
        const str = safeBlockId;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return 5000 + (Math.abs(hash) % 1000);
    }, [safeBlockId]);

    const getInitialConfig = useCallback(() => {
        const rawSnapshot = learnerAns?.snapshot;
        console.log('[MLAB][getInitialConfig] learnerAns present?', !!learnerAns, 'rawSnapshot type:', typeof rawSnapshot, 'rawSnapshot preview:', typeof rawSnapshot === 'string' ? rawSnapshot.slice(0, 200) : rawSnapshot);
        const parsedSnapshot = typeof rawSnapshot === 'string' ? safeParseSnapshot(rawSnapshot) : (rawSnapshot ? { ...rawSnapshot } : null);
        console.log('[MLAB][getInitialConfig] parsedSnapshot valid?', !!parsedSnapshot, 'keys:', parsedSnapshot ? Object.keys(parsedSnapshot) : null);
        const filesToLoad = parsedSnapshot || { ...(block.initialFiles || {}) };
        console.log('[MLAB][getInitialConfig] using', parsedSnapshot ? 'SAVED SNAPSHOT' : 'DEFAULT initialFiles', 'fileCount:', Object.keys(filesToLoad).length);

        const tpl = getEffectiveTemplate(filesToLoad, block.template);

        return {
            files: processProjectData(filesToLoad, assignedPort, tpl, safeBlockId),
            template: tpl
        };
    }, [learnerAns?.snapshot, block.initialFiles, block.template, assignedPort, safeBlockId]);

    const [lockedFiles, setLockedFiles] = useState(() => getInitialConfig().files);
    const [template, setTemplate] = useState<any>(() => getInitialConfig().template);

    const [runId, setRunId] = useState(Date.now().toString());
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
    const [statusText, setStatusText] = useState("Booting OS...");
    const [wcReady, setWcReady] = useState(false);
    const [iframeKey, setIframeKey] = useState(0);
    const [bootFailed, setBootFailed] = useState(false);
    const previewOriginRef = useRef<string>('');

    const wcInstanceRef = useRef<WebContainer | null>(null);

    const [activeTerminalTab, setActiveTerminalTab] = useState<'logs' | 'shell'>('logs');

    const debugTerminalRef = useRef<HTMLDivElement>(null);
    const shellTerminalRef = useRef<HTMLDivElement>(null);
    const debugXtermRef = useRef<Terminal | null>(null);
    const shellXtermRef = useRef<Terminal | null>(null);
    const debugFitRef = useRef<FitAddon | null>(null);
    const shellFitRef = useRef<FitAddon | null>(null);
    const devProcessRef = useRef<WebContainerProcess | null>(null);
    const shellProcessRef = useRef<WebContainerProcess | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const shellResizeObserverRef = useRef<ResizeObserver | null>(null);

    const canonicalKeysRef = useRef<Set<string>>(new Set(Object.keys(lockedFiles).map(p => p.startsWith('/') ? p : '/' + p)));
    const latestFrontendFilesRef = useRef<Record<string, string>>({});
    const lockedFilesRef = useRef(lockedFiles);
    useEffect(() => { lockedFilesRef.current = lockedFiles; }, [lockedFiles]);

    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedSnapshotRef = useRef<string>('');
    const warnedDroppedFilesRef = useRef<Set<string>>(new Set());

    const flushSave = useCallback((isImmediate = false) => {
        console.log('[MLAB][flushSave] called. isImmediate:', isImmediate, 'hasOnChange:', !!onChangeRef.current, 'readOnly:', readOnly);
        if (!onChangeRef.current || readOnly) {
            console.log('[MLAB][flushSave] ABORTED — no onChange or readOnly');
            return;
        }

        const filteredSnapshot: Record<string, string> = {};
        for (const [path, content] of Object.entries(latestFrontendFilesRef.current)) {
            filteredSnapshot[path] = content;
        }
        console.log('[MLAB][flushSave] latestFrontendFilesRef fileCount:', Object.keys(filteredSnapshot).length, 'paths:', Object.keys(filteredSnapshot));

        const serialized = createSafeSnapshot(filteredSnapshot, (path) => {
            if (!warnedDroppedFilesRef.current.has(path)) {
                warnedDroppedFilesRef.current.add(path);
                toast?.error(`"${path}" is too large to save (max 500KB) and was left out of your saved project.`);
            }
        });

        const unchanged = !isImmediate && serialized === lastSavedSnapshotRef.current;
        console.log('[MLAB][flushSave] unchanged (skip)?', unchanged, 'serialized length:', serialized.length, 'lastSaved length:', lastSavedSnapshotRef.current.length);
        if (unchanged) {
            console.log('[MLAB][flushSave] SKIPPED — snapshot matches last saved snapshot');
            return;
        }

        let dependencies = {};
        if (filteredSnapshot['/package.json']) {
            try { dependencies = JSON.parse(filteredSnapshot['/package.json']).dependencies || {}; } catch { }
        }

        const pendingSnapshot = serialized;
        console.log('[MLAB][flushSave] CALLING onChangeRef.current now with immediate=', isImmediate);
        const result = onChangeRef.current({ snapshot: serialized, dependencies, immediate: isImmediate });
        if (result && typeof (result as any).then === 'function') {
            console.log('[MLAB][flushSave] onChange returned a Promise, awaiting...');
            (result as Promise<void>)
                .then(() => {
                    lastSavedSnapshotRef.current = pendingSnapshot;
                    console.log('[MLAB][flushSave] ✅ SAVE RESOLVED OK. lastSavedSnapshotRef updated.');
                })
                .catch((err) => {
                    console.error('[MLAB][flushSave] ❌ SAVE REJECTED:', err);
                    toast?.error('Failed to save your latest changes. Retrying shortly…');
                });
        } else {
            console.warn('[MLAB][flushSave] ⚠️ onChange did NOT return a Promise. PARENT onChange prop is synchronous or fire-and-forget — CodeSandboxPlayer cannot confirm Firebase write succeeded. Check the parent component\'s onChange handler / Firestore write logic, NOT this file.');
            lastSavedSnapshotRef.current = pendingSnapshot;
        }
    }, [readOnly, toast]);

    const scheduleSave = useCallback(() => {
        console.log('[MLAB][scheduleSave] debounce (re)started, will flush in 1500ms');
        if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = setTimeout(() => {
            console.log('[MLAB][scheduleSave] debounce elapsed, flushing now');
            flushSaveRef.current(false);
            saveDebounceRef.current = null;
        }, 1500);
    }, []);

    const handleFilesChange = useCallback((answerPayload: { snapshot: string }) => {
        if (readOnly) return;
        const files = safeParseSnapshot(answerPayload.snapshot);
        if (!files) {
            console.warn('[MLAB][handleFilesChange] snapshot failed to parse, ignoring update');
            return;
        }
        // console.log('[MLAB][handleFilesChange] StateHarvester pushed new files, count:', Object.keys(files).length);
        latestFrontendFilesRef.current = files;
        scheduleSave();
    }, [scheduleSave, readOnly]);

    const flushSaveRef = useRef(flushSave);
    useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

    useEffect(() => {
        if (onChangeRef.current && !readOnly) flushSaveRef.current(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const handleBeforeUnload = () => {
            // console.log('[MLAB][beforeunload] firing flushSave(true)'); 
            flushSaveRef.current(true);
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                // console.log('[MLAB][visibilitychange->hidden] firing flushSave(true)');
                flushSaveRef.current(true);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
            flushSaveRef.current(true);
        };
    }, []);

    useEffect(() => {
        // Safety net only — normal saves are handled by scheduleSave's debounce.
        // Longer interval since this is a backstop, not the primary save path.
        const intervalId = setInterval(() => flushSaveRef.current(false), 30000);
        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        const handleMessage = (e: MessageEvent) => {
            if (previewOriginRef.current && e.origin !== previewOriginRef.current) return;
            if (e.data?.source === 'preview-console' && e.data?.blockId === safeBlockId && debugXtermRef.current) {
                let prefix = '\x1b[34m[LOG]\x1b[0m';
                if (e.data.m === 'warn') prefix = '\x1b[33m[WARN]\x1b[0m';
                if (e.data.m === 'error') prefix = '\x1b[31m[ERROR]\x1b[0m';
                if (e.data.m === 'info') prefix = '\x1b[36m[INFO]\x1b[0m';
                debugXtermRef.current.writeln(`${prefix} ${String(e.data.p).slice(0, 2000)}`);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [safeBlockId]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [hasBeenVisible, setHasBeenVisible] = useState(false);

    useEffect(() => {
        if (hasBeenVisible || !containerRef.current) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) {
                setHasBeenVisible(true);
                observer.disconnect();
            }
        }, { threshold: 0.1 });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [hasBeenVisible]);

    useEffect(() => {
        if (!hasBeenVisible) return;

        let mounted = true;
        setPreviewUrl('');
        setStatusText("Initializing Environment...");

        const debugTerm = new Terminal({ theme: { background: '#0f172a', foreground: '#38bdf8' }, fontFamily: 'monospace', fontSize: 11, convertEol: true });
        const debugFit = new FitAddon();
        debugTerm.loadAddon(debugFit);
        debugXtermRef.current = debugTerm;
        debugFitRef.current = debugFit;

        const shellTerm = new Terminal({ theme: { background: '#0f172a', foreground: '#e2e8f0' }, fontFamily: 'monospace', fontSize: 11, convertEol: true, cursorBlink: true });
        const shellFit = new FitAddon();
        shellTerm.loadAddon(shellFit);
        shellXtermRef.current = shellTerm;
        shellFitRef.current = shellFit;

        if (debugTerminalRef.current) {
            try { debugTerm.open(debugTerminalRef.current); } catch (e) { }
            resizeObserverRef.current = new ResizeObserver(() => {
                if (mounted && debugTerminalRef.current && debugTerminalRef.current.clientWidth > 0) try { debugFit.fit(); } catch (e) { }
            });
            resizeObserverRef.current.observe(debugTerminalRef.current);
        }

        if (shellTerminalRef.current) {
            try { shellTerm.open(shellTerminalRef.current); } catch (e) { }
            shellResizeObserverRef.current = new ResizeObserver(() => {
                if (mounted && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0) {
                    try { shellFit.fit(); if (shellProcessRef.current) shellProcessRef.current.resize({ cols: shellTerm.cols, rows: shellTerm.rows }); } catch (e) { }
                }
            });
            shellResizeObserverRef.current.observe(shellTerminalRef.current);
        }

        let shellInputListener: { dispose: () => void } | null = null;
        let serverReadyHandled = false;
        let serverReadyUnsub: (() => void) | null = null;

        const boot = async () => {
            const WORK_DIR = `/${safeBlockId}`;

            try {
                const wc = await getWebContainer();
                if (!mounted) return;

                // Track the instance in both State and Ref for bulletproof teardowns
                setWcInstance(wc);
                wcInstanceRef.current = wc;

                if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } devProcessRef.current = null; }
                if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } shellProcessRef.current = null; }
                try { await wc.fs.rm(WORK_DIR, { recursive: true, force: true }); } catch { }

                debugTerm.writeln('\x1b[1;32m>> SYSTEM ONLINE - MOUNTING FILESYSTEM\x1b[0m');
                const bootTemplate = template;
                const tree = convertToTree(processProjectData(lockedFilesRef.current, assignedPort, bootTemplate, safeBlockId));

                await wc.mount({ [safeBlockId]: { directory: tree } });

                if (mounted) setWcReady(true);

                await wc.fs.mkdir(`${WORK_DIR}/.bin`, { recursive: true });
                await wc.fs.writeFile(`${WORK_DIR}/.bin/git`, GIT_SHIM_SCRIPT);

                debugTerm.writeln('\x1b[1;33m>> Queuing npm install...\x1b[0m');
                let installFailed = false;
                await new Promise<void>(resolve => {
                    globalNpmMutex = globalNpmMutex.then(async () => {
                        if (!mounted) return resolve();
                        let installProcess: any = null;
                        try {
                            debugTerm.writeln('\x1b[1;33m>> Running npm install...\x1b[0m');
                            installProcess = await wc.spawn('npm', ['install', '--no-package-lock'], { cwd: WORK_DIR });

                            installProcess.output.pipeTo(new WritableStream({
                                write: data => { if (mounted) debugTerm.write(data); }
                            })).catch(() => { });

                            const exitCode = await Promise.race([
                                installProcess.exit,
                                new Promise<number>((_, reject) => setTimeout(() => reject(new Error('npm install timed out after 5 minutes')), 300000))
                            ]);
                            if (exitCode !== 0) throw new Error("Installation process aborted.");
                        } catch (err: any) {
                            installFailed = true;
                            if (mounted) debugTerm.writeln(`\x1b[1;31m>> NPM Error: ${err.message || err}\x1b[0m`);
                            try { installProcess?.kill(); } catch { }
                        }
                        resolve();
                    });
                });

                if (!mounted) return;
                if (installFailed) {
                    setStatusText("Boot Failed");
                    setBootFailed(true);
                    return;
                }

                debugTerm.writeln('\n\x1b[1;36m>> Booting local Vite telemetry server...\x1b[0m');
                const devProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: WORK_DIR });
                devProcessRef.current = devProcess;

                devProcess.output.pipeTo(new WritableStream({
                    write: data => { if (mounted) debugTerm.write(data); }
                })).catch(() => { });

                const shellProcess = await wc.spawn('jsh', { terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 15 }, cwd: WORK_DIR });
                shellProcessRef.current = shellProcess;

                shellProcess.output.pipeTo(new WritableStream({
                    write: data => { if (mounted) shellTerm.write(data); }
                })).catch(() => { });

                const inputWriter = shellProcess.input.getWriter();
                await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH"\nclear\n').catch(() => { });
                shellInputListener = shellTerm.onData(data => {
                    if (mounted) inputWriter.write(data).catch(() => { });
                });

                serverReadyUnsub = wc.on('server-ready', (port, url) => {
                    if (!mounted || serverReadyHandled) return;
                    if (port !== assignedPort) return;

                    serverReadyHandled = true;
                    try { previewOriginRef.current = new URL(url).origin; } catch { }
                    setPreviewUrl(url);
                    setStatusText("Online");
                    debugTerm.writeln(`\n\x1b[1;32m>> Preview running on port ${port}\x1b[0m\n`);
                });

            } catch (err: any) {
                if (mounted) {
                    debugTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
                    setStatusText("Boot Failed");
                    setBootFailed(true);
                }
            }
        };

        setBootFailed(false);
        boot();
        //Catch page refreshes and tab closes
        const handleUnload = () => {
            if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
            if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }
            if (wcInstanceRef.current) {
                try { wcInstanceRef.current.teardown(); } catch (e) { }
            }
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            mounted = false;
            window.removeEventListener('beforeunload', handleUnload);

            if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
            if (shellResizeObserverRef.current) shellResizeObserverRef.current.disconnect();
            if (shellInputListener) shellInputListener.dispose();
            if (serverReadyUnsub) serverReadyUnsub();

            debugTerm.dispose();
            shellTerm.dispose();

            if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
            if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }

            // FATAL LEAK FIX: Explicitly destroy the OS container on 'Back' clicks
            if (wcInstanceRef.current) {
                try {
                    wcInstanceRef.current.teardown();
                    console.log("[MLAB] WebContainer explicitly torn down on unmount.");
                } catch (e) {
                    console.error("Failed to teardown WebContainer", e);
                }
                wcInstanceRef.current = null;
            }
            setWcInstance(null);
        };

    }, [runId, template, assignedPort, safeBlockId, hasBeenVisible]);

    const [previewHeight, setPreviewHeight] = useState(400);
    const [isDragging, setIsDragging] = useState(false);

    const handleResizerMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        const startY = e.clientY;
        const startHeight = previewHeight;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            setPreviewHeight(Math.max(10, Math.min(600, startHeight + (moveEvent.clientY - startY))));
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            try {
                if (debugXtermRef.current?.element && debugTerminalRef.current && debugTerminalRef.current.clientWidth > 0 && debugFitRef.current) {
                    debugFitRef.current.fit();
                }
                if (shellXtermRef.current?.element && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0 && shellFitRef.current) {
                    shellFitRef.current.fit();
                    if (shellProcessRef.current) {
                        shellProcessRef.current.resize({ cols: shellXtermRef.current.cols, rows: shellXtermRef.current.rows });
                    }
                }
            } catch (e) { }
        }, 250);
        return () => clearTimeout(timeoutId);
    }, [isMaximized, activeTerminalTab]);

    useEffect(() => {
        if (isMaximized) {
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';

            let el = containerRef.current?.parentElement;
            while (el && el !== document.body) {
                el.style.setProperty('overflow', 'hidden', 'important');
                el.style.setProperty('transform', 'none', 'important');
                el.style.setProperty('filter', 'none', 'important');
                el.style.setProperty('perspective', 'none', 'important');
                el = el.parentElement;
            }
        } else {
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';

            let el = containerRef.current?.parentElement;
            while (el && el !== document.body) {
                el.style.removeProperty('overflow');
                el.style.removeProperty('transform');
                el.style.removeProperty('filter');
                el.style.removeProperty('perspective');
                el = el.parentElement;
            }
        }
    }, [isMaximized]);

    const containerStyle: React.CSSProperties = useMemo(() => isMaximized ? {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999, border: 'none', borderRadius: 0, overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column', margin: 0, padding: 0, boxSizing: 'border-box'
    } : {
        position: 'relative', width: '100%', height: '750px', marginTop: '1rem', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
    }, [isMaximized]);

    const terminalTabBtnStyle = useCallback((active: boolean): React.CSSProperties => ({
        background: active ? '#334155' : 'transparent', border: 'none', color: active ? '#fff' : '#94a3b8',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold'
    }), []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPendingZipFile(file);
        e.target.value = '';
    };

    const processZipBlob = async (blob: Blob) => {
        const zip = new JSZip();
        const contents = await zip.loadAsync(blob);

        const allPaths = Object.keys(contents.files).filter(p => !contents.files[p].dir && !p.includes('__MACOSX') && !p.startsWith('.'));

        // 🚀 FIX: STRICT TEMPLATE ENFORCEMENT (THE BOUNCER)
        const expectedTemplate = (block.template || 'javascript').toLowerCase();
        const isVanillaExpected = ['javascript', 'html', 'vanilla'].includes(expectedTemplate);

        let hasReactFiles = false;
        for (const p of allPaths) {
            if (p.endsWith('.jsx') || p.endsWith('.tsx')) hasReactFiles = true;
            if (p.endsWith('package.json')) {
                try {
                    const pkgStr = await contents.files[p].async('string');
                    if (pkgStr.includes('"react"')) hasReactFiles = true;
                } catch (e) { }
            }
        }

        if (isVanillaExpected && hasReactFiles) {
            toast?.error("Upload Blocked: This assignment requires a pure Vanilla JavaScript project. React projects are not allowed here.");
            return; // 🛑 ABORT! Do not load or save into the IDE.
        }

        let commonPrefix: string | null = null;
        for (const p of allPaths) {
            const topFolder = p.split('/')[0];
            if (!p.includes('/')) { commonPrefix = null; break; }
            if (commonPrefix === null) commonPrefix = topFolder;
            else if (commonPrefix !== topFolder) { commonPrefix = null; break; }
        }

        const isBinaryFile = (path: string) => ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm', '.svg'].some(ext => path.toLowerCase().endsWith(ext));

        const newFiles: Record<string, string> = {};
        for (const path of allPaths) {
            const strippedPath = commonPrefix ? path.slice(commonPrefix.length + 1) : path;
            if (!strippedPath) continue;
            if (isBinaryFile(path)) {
                newFiles[`/${strippedPath}`] = `__mlab_base64__${await contents.files[path].async('base64')}`;
            } else {
                newFiles[`/${strippedPath}`] = await contents.files[path].async('string');
            }
        }

        const tempTpl = getEffectiveTemplate(newFiles, block.template);
        const cleanFiles = processProjectData(newFiles, assignedPort, tempTpl, block.id);

        console.log('[MLAB][processZipBlob] import parsed. fileCount:', Object.keys(cleanFiles).length, 'paths:', Object.keys(cleanFiles), 'template:', tempTpl);

        setTemplate(resolveSandpackTemplate(tempTpl));
        setLockedFiles(cleanFiles);
        canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));

        latestFrontendFilesRef.current = cleanFiles;
        console.log('[MLAB][processZipBlob] latestFrontendFilesRef set. Triggering immediate flushSave...');

        setRunId(Date.now().toString());

        flushSaveRef.current(true);
        console.log('[MLAB][processZipBlob] flushSave(true) called — check above logs for [MLAB][flushSave] result');
        toast?.success("Project Imported Successfully!");
    };

    const confirmZipImport = async () => {
        if (!pendingZipFile) return;
        await processZipBlob(pendingZipFile);
        setPendingZipFile(null);
    };

    const handleGithubImport = async () => {
        if (!githubUrl.trim()) return;
        try {
            setIsFetchingGithub(true);

            const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (!match) throw new Error("Invalid GitHub URL. Must be a valid repo link.");

            const user = match[1];
            const repo = match[2].replace('.git', '');

            const response = await fetch(`https://api.github.com/repos/${user}/${repo}/zipball`);
            if (!response.ok) throw new Error("Could not fetch repo. Ensure it is public.");

            const blob = await response.blob();

            setShowGithubModal(false);
            setGithubUrl('');
            setPendingZipFile(blob);
        } catch (err: any) {
            toast?.error(err.message || "Failed to import from GitHub.");
        } finally {
            setIsFetchingGithub(false);
        }
    };

    const handleDownloadZip = async () => {
        const zip = new JSZip();
        const filesToZip = Object.keys(latestFrontendFilesRef.current).length > 0 ? latestFrontendFilesRef.current : lockedFiles;

        Object.entries(filesToZip).forEach(([path, content]) => {
            if (canonicalKeysRef.current.has(path)) {
                const cleanPath = path.startsWith('/') ? path.substring(1) : path;
                if (typeof content === 'string' && content.startsWith('__mlab_base64__')) zip.file(cleanPath, content.substring(15), { base64: true });
                else zip.file(cleanPath, content as string);
            }
        });
        const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
        const a = document.createElement('a'); a.href = url; a.download = `codetribe_project_${block.id}.zip`; a.click();
        URL.revokeObjectURL(url);
        toast?.success("Project Downloaded Successfully!");
    };

    return (
        <div ref={containerRef} style={containerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #334155', flexShrink: 0 }}>
                <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Code size={14} color="#3b82f6" /> {block.title || 'Live IDE'}
                    {readOnly && <span style={{ background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>GRADING MODE (LOCKED)</span>}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {!readOnly && (
                        <>
                            <label style={{ background: '#3b82f6', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FolderArchive size={14} /> Import ZIP<input type="file" accept=".zip" hidden onChange={handleFileSelect} />
                            </label>
                            <button onClick={() => setShowGithubModal(true)} style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                <Github size={14} /> GitHub
                            </button>
                        </>
                    )}
                    <button onClick={handleDownloadZip} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><Download size={14} /> <span className="ap-hide-mobile">ZIP</span></button>
                    <button onClick={() => setIframeKey(k => k + 1)} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><RefreshCw size={14} /> Reload Preview</button>
                    <button onClick={() => setIsMaximized(!isMaximized)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>{isMaximized ? <Minimize size={14} /> : <Maximize size={14} />} {isMaximized ? 'Exit' : 'Fullscreen'}</button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                <Group direction="horizontal" style={{ width: '100%', height: '100%' }}>
                    <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <style>{`.sp-layout, .sp-wrapper { height: 100% !important; max-height: 100% !important; min-height: 0 !important; min-width: 0 !important; } [data-panel-group], [data-panel] { height: 100% !important; }`}</style>
                        <SandpackProvider key={runId} template={resolveSandpackTemplate(template)} files={lockedFiles} theme="dark">
                            <SandpackLayout style={{ flex: 1, height: '100%', border: 'none', borderRadius: 0, overflow: 'hidden', minHeight: 0 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', minWidth: 0 }}>
                                    <SandpackFileActions readOnly={readOnly} canonicalKeysRef={canonicalKeysRef} wcInstance={wcInstance} blockId={block.id} />
                                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
                                        <div style={{ width: '160px', borderRight: '1px solid #334155', flexShrink: 0, overflowY: 'auto', overflowX: 'hidden' }}><SandpackFileExplorer style={{ height: '100%' }} /></div>
                                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}><SandpackCodeEditor showTabs closableTabs style={{ height: '100%' }} readOnly={readOnly} /></div>
                                    </div>
                                </div>
                            </SandpackLayout>
                            {!readOnly && wcReady && <WebContainerSyncBridge wcInstance={wcInstance} blockId={block.id} canonicalKeysRef={canonicalKeysRef} readOnly={readOnly} />}
                            {!readOnly && <StateHarvester readOnly={readOnly} onChange={handleFilesChange} />}
                        </SandpackProvider>
                    </Panel>
                    <Separator style={{ width: '4px', background: '#334155', cursor: 'col-resize' }} />
                    <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', overflow: 'hidden' }}>
                        <div style={{ height: `${previewHeight}px`, position: 'relative', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                            {previewUrl ? <iframe key={iframeKey} src={`${previewUrl}${previewUrl.includes('?') ? '&' : '?'}t=${iframeKey}`} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" /> : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', gap: '10px' }}>
                                    {bootFailed ? <AlertTriangle size={24} color="#ef4444" /> : <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />}
                                    <span style={{ fontSize: '0.85rem' }}>{statusText}</span>
                                    {bootFailed && (
                                        <button onClick={() => { setBootFailed(false); setRunId(Date.now().toString()); }} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <RefreshCw size={13} /> Retry
                                        </button>
                                    )}
                                </div>
                            )}
                            {isDragging && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />}
                        </div>
                        <div onMouseDown={handleResizerMouseDown} style={{ height: '4px', background: '#334155', cursor: 'row-resize', flexShrink: 0 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                            <div style={{ padding: '4px 8px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <button style={terminalTabBtnStyle(activeTerminalTab === 'logs')} onClick={() => setActiveTerminalTab('logs')}><ScrollText size={12} /> Logs</button>
                                <button style={terminalTabBtnStyle(activeTerminalTab === 'shell')} onClick={() => setActiveTerminalTab('shell')}><SquareTerminal size={12} /> Shell</button>
                            </div>
                            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
                                <div style={{ position: 'absolute', inset: 0, padding: '8px', visibility: activeTerminalTab === 'logs' ? 'visible' : 'hidden', pointerEvents: activeTerminalTab === 'logs' ? 'auto' : 'none' }}>
                                    <div ref={debugTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
                                </div>
                                <div style={{ position: 'absolute', inset: 0, padding: '8px', visibility: activeTerminalTab === 'shell' ? 'visible' : 'hidden', pointerEvents: activeTerminalTab === 'shell' ? 'auto' : 'none' }}>
                                    <div ref={shellTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
                                </div>
                            </div>
                        </div>
                    </Panel>
                </Group>
            </div>

            {showGithubModal && createPortal(
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#1e293b', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                        <h3 style={{ color: '#fff', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><Github size={20} /> Import from GitHub</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '15px' }}>Enter the URL of a public GitHub repository. This will completely overwrite your current code.</p>

                        <input
                            type="text"
                            placeholder="https://github.com/user/repo"
                            value={githubUrl}
                            onChange={(e) => setGithubUrl(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', marginBottom: '20px', fontSize: '0.9rem', outline: 'none' }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setShowGithubModal(false)} disabled={isFetchingGithub} style={{ padding: '8px 16px', background: 'transparent', color: '#cbd5e1', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                            <button onClick={handleGithubImport} disabled={isFetchingGithub || !githubUrl} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', opacity: (isFetchingGithub || !githubUrl) ? 0.5 : 1 }}>
                                {isFetchingGithub ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
                                {isFetchingGithub ? 'Pulling...' : 'Import Repo'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {pendingZipFile && createPortal(
                <StatusModal
                    type="warning"
                    title="Overwrite Existing Code?"
                    message="Importing this ZIP file will completely replace your current project files. This action cannot be undone. Do you want to proceed?"
                    confirmText="Yes, Import"
                    onClose={confirmZipImport}
                    onCancel={() => setPendingZipFile(null)}
                />,
                document.body
            )}
        </div>
    );
};

export default CodeSandboxPlayer;


// import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// import { Code, Maximize, Minimize, Save, CheckCircle, TerminalSquare, Play, Loader2, Plus, X, Trash2, Pencil, FilePlus, Download, Github, FolderArchive, UploadCloud, RefreshCw, AlertTriangle, ScrollText, SquareTerminal } from 'lucide-react';
// import {
//     SandpackProvider,
//     SandpackLayout,
//     SandpackCodeEditor,
//     SandpackFileExplorer,
//     useSandpack
// } from "@codesandbox/sandpack-react";
// import { useToast } from '../Toast/Toast';
// import JSZip from 'jszip';
// import { Group, Panel, Separator } from 'react-resizable-panels';
// import { StatusModal } from '../StatusModal/StatusModal';
// import { Terminal } from 'xterm';
// import { FitAddon } from 'xterm-addon-fit';
// import 'xterm/css/xterm.css';
// import { getWebContainer } from './webcontainerManager';
// import type { FileSystemTree, WebContainer, WebContainerProcess } from '@webcontainer/api';

// export interface SandboxFileMap {
//     [path: string]: string;
// }

// export interface SandboxBlock {
//     id: string;
//     title?: string;
//     template?: string;
//     question?: string;
//     initialFiles?: SandboxFileMap;
// }

// export interface SandboxAnswerPayload {
//     snapshot?: string | SandboxFileMap;
//     dependencies?: Record<string, string>;
//     immediate?: boolean;
// }

// export interface CodeSandboxPlayerProps {
//     block: SandboxBlock;
//     learnerAns: SandboxAnswerPayload | null | undefined;
//     onChange?: (answer: SandboxAnswerPayload) => void | Promise<void>;
//     readOnly?: boolean;
// }

// const sanitizeBlockId = (id: string | undefined): string => {
//     const clean = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
//     return clean || 'mlab-default';
// };

// const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache', '.npm-cache'];
// const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

// const shouldIgnorePath = (relPath: string) => {
//     const parts = relPath.split('/').filter(Boolean);
//     if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
//     const fileName = parts[parts.length - 1] || '';
//     if (SYNC_IGNORE_FILES.includes(fileName)) return true;
//     if (fileName.endsWith('.log')) return true;
//     return false;
// };

// const createSafeSnapshot = (files: Record<string, string>, onDropped?: (path: string) => void) => {
//     const safeFiles: Record<string, string> = {};
//     for (const [path, content] of Object.entries(files)) {
//         if (shouldIgnorePath(path)) continue;
//         if (content.length > 500000) {
//             console.warn(`File ${path} is too large. Excluding from auto-save.`);
//             onDropped?.(path);
//             continue;
//         }
//         safeFiles[path] = content;
//     }
//     return JSON.stringify(safeFiles);
// };

// const isValidSnapshot = (obj: unknown): obj is SandboxFileMap => {
//     if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
//     return Object.entries(obj as Record<string, unknown>).every(
//         ([path, content]) => typeof path === 'string' && path.length < 500 && typeof content === 'string'
//     );
// };

// const safeParseSnapshot = (raw: string): SandboxFileMap | null => {
//     try {
//         const parsed = JSON.parse(raw);
//         return isValidSnapshot(parsed) ? parsed : null;
//     } catch {
//         return null;
//     }
// };

// const convertToTree = (files: Record<string, string>): FileSystemTree => {
//     const tree: FileSystemTree = {};
//     for (const [path, content] of Object.entries(files)) {
//         const parts = path.split('/').filter(Boolean);
//         let current = tree;
//         for (let i = 0; i < parts.length; i++) {
//             const part = parts[i];
//             if (i === parts.length - 1) {
//                 let fileContent: string | Uint8Array = content;
//                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) {
//                     const binStr = atob(content.substring(15));
//                     const arr = new Uint8Array(binStr.length);
//                     for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
//                     fileContent = arr;
//                 }
//                 current[part] = { file: { contents: fileContent } };
//             } else {
//                 if (!current[part]) current[part] = { directory: {} };
//                 current = (current[part] as any).directory;
//             }
//         }
//     }
//     return tree;
// };

// const detectTemplate = (files: Record<string, string>, overrideTemplate?: string): "vite-react-ts" | "vite-react" | any => {
//     if (overrideTemplate && overrideTemplate !== 'create-react-app') return overrideTemplate;
//     return Object.keys(files).some(p => p.endsWith('.tsx') || p.endsWith('.ts')) || !!files['/tsconfig.json'] ? "vite-react-ts" : "vite-react";
// };

// const resolveSandpackTemplate = (dbTemplateKey?: string): any => {
//     if (!dbTemplateKey) return "vanilla";
//     const templateMap: Record<string, string> = {
//         "javascript": "vanilla",
//         "html": "vanilla",
//         "typescript": "vanilla-ts",
//         "create-react-app": "react",
//         "vite-react": "vite-react",
//         "vite-react-ts": "vite-react-ts",
//         "node": "node",
//         "python": "vanilla",
//         "sql": "vanilla",
//     };
//     return templateMap[dbTemplateKey] || "vanilla";
// };

// // 🚀 UPGRADED: Synthesize missing configuration files for pure JS/HTML frameworks to ensure WebContainer boots properly
// const processProjectData = (rawFiles: Record<string, string>, targetPort: number, templateType: string, blockId: string) => {
//     const out = { ...rawFiles };
//     const isReact = templateType === 'vite-react' || templateType === 'create-react-app' || templateType === 'vite-react-ts';
//     const isNode = templateType === 'node';

//     Object.keys(out).forEach(k => {
//         if (shouldIgnorePath(k)) delete out[k];
//     });

//     // 🚀 FIX: Prevent WebContainer crashing on missing package.json for pure JS/Vanilla projects
//     if (!out['/package.json']) {
//         out['/package.json'] = JSON.stringify({ name: "mlab-workspace-project", type: "module" }, null, 2);
//     }

//     try {
//         const pkg = JSON.parse(out['/package.json']);
//         pkg.type = pkg.type || "module";
//         pkg.dependencies = pkg.dependencies || {};
//         pkg.devDependencies = pkg.devDependencies || {};
//         pkg.scripts = pkg.scripts || {};

//         if (isNode) {
//             pkg.scripts.dev = pkg.scripts.dev || `node index.js`;
//         } else {
//             // Force Vite for all frontend environments (Vanilla JS, HTML, React) to handle hot reloads
//             pkg.scripts.dev = `vite --port ${targetPort} --strictPort`;
//             pkg.devDependencies['vite'] = pkg.devDependencies['vite'] || "^4.5.3";
//         }

//         if (isReact) {
//             pkg.dependencies['react'] = pkg.dependencies['react'] || "^18.2.0";
//             pkg.dependencies['react-dom'] = pkg.dependencies['react-dom'] || "^18.2.0";
//             pkg.devDependencies['@vitejs/plugin-react'] = pkg.devDependencies['@vitejs/plugin-react'] || "^4.2.1";
//         }

//         delete pkg.engines;
//         delete pkg.packageManager;
//         out['/package.json'] = JSON.stringify(pkg, null, 2);
//     } catch (e) { }

//     if (isReact) {
//         if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
//             out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
//         }

//         const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
//         const ext = isTSProject ? 'tsx' : 'jsx';

//         if (out[`/App.${ext}`] && !out[`/src/App.${ext}`]) {
//             out[`/src/App.${ext}`] = out[`/App.${ext}`];
//         }
//         if (out[`/App.js`] && !out[`/src/App.jsx`]) {
//             out[`/src/App.jsx`] = out[`/App.js`];
//         }

//         const ghosts = ['/index.js', '/index.jsx', '/index.ts', '/index.tsx', '/src/index.js', '/src/index.jsx', '/src/index.ts', '/src/index.tsx', '/App.js', '/App.jsx', '/App.ts', '/App.tsx'];
//         ghosts.forEach(g => delete out[g]);

//         const actualExt = out['/src/App.tsx'] ? 'tsx' : 'jsx';

//         if (!out['/src/App.jsx'] && !out['/src/App.tsx']) {
//             out[`/src/App.${actualExt}`] = 'export default function App() {\n  return <h1>Vite + React Canvas Online!</h1>;\n}';
//         }

//         out[`/App.${actualExt}`] = `export { default } from "./src/App.${actualExt}";\n`;

//         if (!out['/src/main.jsx'] && !out['/src/main.tsx']) {
//             out[`/src/main.${actualExt}`] = `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "../App.${actualExt}";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);`;
//         }

//         if (!out['/src/index.css']) out['/src/index.css'] = `body { font-family: sans-serif; padding: 2rem; }`;
//     } else if (!isNode) {
//         // Vanilla JS generic fallback: ensures Vite has a base entrypoint if none is uploaded
//         if (!out['/index.html']) {
//             out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>Vanilla App</title>\n</head>\n<body>\n  <div id="app"></div>\n  <script type="module" src="/index.js"></script>\n</body>\n</html>`;
//         }
//         if (!out['/index.js']) {
//             out['/index.js'] = `document.getElementById('app').innerHTML = '<h1>Hello Vanilla!</h1>';`;
//         }
//     }

//     const consoleInterceptor = `\n<script>\n  (function() {\n    const orig = { ...console };\n    ['log', 'warn', 'error', 'info'].forEach(m => {\n      console[m] = (...args) => {\n        orig[m](...args);\n        try { window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*'); } catch(e) {}\n      };\n    });\n    window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m: 'error', p: e.message }, '*'));\n  })();\n</script>\n`;

//     let htmlKey = out['/index.html'] ? '/index.html' : out['/public/index.html'] ? '/public/index.html' : null;

//     if (htmlKey) {
//         let html = out[htmlKey];
//         if (!html.includes("source: 'preview-console'")) {
//             if (html.includes('<head>')) {
//                 html = html.replace('<head>', `<head>${consoleInterceptor}`);
//             } else if (html.includes('<html>')) {
//                 html = html.replace('<html>', `<html><head>${consoleInterceptor}</head>`);
//             } else {
//                 html = `${consoleInterceptor}${html}`;
//             }
//         }
//         out[htmlKey] = html;
//     } else if (isReact) {
//         const entryPoint = templateType === 'vite-react' ? '/src/main' : '/src/index';
//         const ext = out['/src/App.tsx'] ? 'tsx' : 'jsx';
//         out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>${consoleInterceptor}</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="${entryPoint}.${ext}"></script>\n</body>\n</html>`;
//     }

//     return out;
// };

// const GIT_SHIM_SCRIPT = `#!/usr/bin/env node
// console.log("\\n\\x1b[1;33m⚠️  Git is not natively supported in this browser environment.\\x1b[0m");
// console.log("\\x1b[1;36mHOW TO MANAGE YOUR CODE:\\x1b[0m");
// console.log("  • \\x1b[1;34mClone/Pull:\\x1b[0m Use \\x1b[1;32mnpx degit <github-username>/<repo>\\x1b[0m to download templates.");
// console.log("  • \\x1b[1;34mSave/Push:\\x1b[0m Your code is actively auto-saving to the platform.");
// console.log("  • \\x1b[1;34mExport:\\x1b[0m Click \\x1b[1;32mDownload ZIP\\x1b[0m in the toolbar above to get your files locally.\\n");
// `;

// const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', transition: 'color 0.2s' };
// const FILE_ACTIONS_BAR_STYLE: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#252526', padding: '6px 16px', borderBottom: '1px solid #333', flexShrink: 0, minHeight: '36px' };

// const SandpackFileActions: React.FC<{ readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>>, wcInstance: WebContainer | null, blockId: string }> = ({ readOnly, canonicalKeysRef, wcInstance, blockId }) => {
//     const { sandpack } = useSandpack();

//     const [action, setAction] = useState<'idle' | 'add' | 'rename'>('idle');
//     const [inputValue, setInputValue] = useState('');

//     if (readOnly) return null;

//     const handleAction = async () => {
//         if (!inputValue.trim()) { setAction('idle'); return; }
//         const WORK_DIR = `/${blockId}`;

//         if (action === 'add') {
//             let path = inputValue.trim();
//             if (!path.startsWith('/')) path = '/' + path;
//             if (sandpack.files[path]) { window.alert("A file with this path already exists."); return; }

//             if (typeof sandpack.addFile === 'function') sandpack.addFile(path, "// New file\n");
//             else sandpack.updateFile(path, "// New file\n");
//             if (typeof sandpack.setActiveFile === 'function') sandpack.setActiveFile(path);
//             canonicalKeysRef.current.add(path);

//             if (wcInstance) {
//                 try {
//                     const parts = path.split('/').filter(Boolean);
//                     if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
//                     await wcInstance.fs.writeFile(`${WORK_DIR}${path}`, "// New file\n");
//                 } catch { }
//             }
//         } else if (action === 'rename') {
//             const oldPath = sandpack.activeFile;
//             let newPath = inputValue.trim();
//             if (!newPath.startsWith('/')) newPath = '/' + newPath;

//             if (newPath !== oldPath) {
//                 if (sandpack.files[newPath]) { window.alert("A file with that name already exists."); return; }
//                 const content = sandpack.files[oldPath].code;
//                 if (typeof sandpack.addFile === 'function') {
//                     sandpack.addFile(newPath, content);
//                     sandpack.deleteFile(oldPath);
//                     sandpack.setActiveFile(newPath);
//                 }
//                 canonicalKeysRef.current.add(newPath);
//                 canonicalKeysRef.current.delete(oldPath);

//                 if (wcInstance) {
//                     try {
//                         const parts = newPath.split('/').filter(Boolean);
//                         if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
//                         await wcInstance.fs.writeFile(`${WORK_DIR}${newPath}`, content);
//                         await wcInstance.fs.rm(`${WORK_DIR}${oldPath}`);
//                     } catch { }
//                 }
//             }
//         }
//         setAction('idle');
//         setInputValue('');
//     };

//     const handleDelete = async () => {
//         const path = sandpack.activeFile;
//         if (Object.keys(sandpack.files).length <= 1) { window.alert("You cannot delete the last remaining file."); return; }
//         if (window.confirm(`Are you sure you want to delete ${path}?`)) {
//             if (typeof sandpack.deleteFile === 'function') sandpack.deleteFile(path);
//             canonicalKeysRef.current.delete(path);
//             if (wcInstance) { try { await wcInstance.fs.rm(`/${blockId}${path}`); } catch { } }
//         }
//     };

//     return (
//         <div style={FILE_ACTIONS_BAR_STYLE}>
//             {action === 'idle' ? (
//                 <><span style={{ fontSize: '0.7rem', color: '#ccc', fontWeight: 600, letterSpacing: '0.5px' }}>EXPLORER</span>
//                     <div style={{ display: 'flex', gap: '6px' }}>
//                         <button onClick={() => { setAction('add'); setInputValue(''); }} style={iconBtnStyle}><FilePlus size={15} /></button>
//                         <button onClick={() => { setAction('rename'); setInputValue(sandpack.activeFile); }} style={iconBtnStyle}><Pencil size={14} /></button>
//                         <button onClick={handleDelete} style={{ ...iconBtnStyle, color: '#ef4444' }}><Trash2 size={15} /></button>
//                     </div></>
//             ) : (
//                 <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px' }}>
//                     <span style={{ fontSize: '0.75rem', color: action === 'add' ? '#10b981' : '#eab308', fontWeight: 'bold' }}>{action === 'add' ? 'NEW:' : 'RENAME:'}</span>
//                     <input autoFocus value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAction(); if (e.key === 'Escape') setAction('idle'); }} onBlur={() => { if (inputValue.trim() && inputValue !== sandpack.activeFile) handleAction(); else setAction('idle'); }} style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: `1px solid ${action === 'add' ? '#10b981' : '#eab308'}`, outline: 'none', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', minWidth: 0 }} />
//                 </div>
//             )}
//         </div>
//     );
// };

// const WebContainerSyncBridge: React.FC<{ wcInstance: WebContainer | null, blockId: string, readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>> }> = ({ wcInstance, blockId, readOnly, canonicalKeysRef }) => {
//     const { sandpack } = useSandpack();
//     const lastCodeRef = useRef<Record<string, string>>({});
//     const isWritingRef = useRef<boolean>(false);

//     if (Object.keys(lastCodeRef.current).length === 0) {
//         Object.entries(sandpack.files).forEach(([path, fileObj]) => {
//             lastCodeRef.current[path] = fileObj.code;
//         });
//     }

//     useEffect(() => {
//         if (!wcInstance || readOnly) return;
//         const timeoutId = setTimeout(() => {
//             Object.entries(sandpack.files).forEach(([path, fileObj]) => {
//                 const code = fileObj.code;
//                 if (code !== undefined && lastCodeRef.current[path] !== code) {
//                     lastCodeRef.current[path] = code;
//                     let outCode: string | Uint8Array = code;
//                     if (typeof code === 'string' && code.startsWith('__mlab_base64__')) {
//                         const binStr = atob(code.substring(15));
//                         const arr = new Uint8Array(binStr.length);
//                         for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
//                         outCode = arr;
//                     }
//                     const WORK_DIR = `/${blockId}`;
//                     const fullPath = `${WORK_DIR}${path.startsWith('/') ? path : `/${path}`}`;
//                     const relativeParts = path.split('/').filter(Boolean);

//                     isWritingRef.current = true;
//                     if (relativeParts.length > 1) {
//                         wcInstance.fs.mkdir(`${WORK_DIR}/` + relativeParts.slice(0, -1).join('/'), { recursive: true })
//                             .then(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }))
//                             .catch(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }));
//                     } else {
//                         wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
//                     }
//                 }
//             });
//         }, 300);
//         return () => clearTimeout(timeoutId);
//     }, [sandpack.files, wcInstance, blockId, readOnly]);

//     useEffect(() => {
//         if (!wcInstance || readOnly) return;
//         let mounted = true;
//         let inFlight = false;
//         let intervalId: ReturnType<typeof setInterval> | null = null;
//         let debounceTimer: ReturnType<typeof setTimeout> | null = null;
//         let watcher: { close?: () => void } | null = null;

//         const walk = async (dir: string, relBase: string, acc: Record<string, string>) => {
//             let entries: any[];
//             try {
//                 entries = await wcInstance.fs.readdir(dir, { withFileTypes: true } as any);
//             } catch { return; }

//             for (const entry of entries) {
//                 const name = typeof entry === 'string' ? entry : entry.name;
//                 const isDir = typeof entry === 'string' ? false : entry.isDirectory?.();
//                 const relPath = `${relBase}/${name}`;
//                 if (shouldIgnorePath(relPath)) continue;

//                 if (isDir) {
//                     await walk(`${dir}/${name}`, relPath, acc);
//                 } else {
//                     const isBinaryFile = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm', '.svg'].some(ext => name.toLowerCase().endsWith(ext));
//                     if (isBinaryFile) continue;

//                     try {
//                         const content = await wcInstance.fs.readFile(`${dir}/${name}`, 'utf-8');
//                         acc[relPath] = content;
//                     } catch { }
//                 }
//             }
//         };

//         const syncFromDisk = async () => {
//             if (isWritingRef.current || inFlight) return;
//             inFlight = true;
//             try {
//                 const diskFiles: Record<string, string> = {};
//                 await walk(`/${blockId}`, '', diskFiles);

//                 for (const [relPath, content] of Object.entries(diskFiles)) {
//                     if (!mounted) break;
//                     const currentCode = sandpack.files[relPath]?.code;
//                     if (content !== currentCode && content !== lastCodeRef.current[relPath]) {
//                         lastCodeRef.current[relPath] = content;
//                         canonicalKeysRef.current.add(relPath);
//                         if (sandpack.files[relPath] !== undefined) {
//                             sandpack.updateFile(relPath, content);
//                         } else if (typeof sandpack.addFile === 'function') {
//                             sandpack.addFile(relPath, content);
//                         }
//                     }
//                 }
//             } catch { }
//             inFlight = false;
//         };

//         const setup = async () => {
//             try {
//                 const w = (wcInstance.fs as any).watch?.(`/${blockId}`, { recursive: true }, () => {
//                     if (debounceTimer) clearTimeout(debounceTimer);
//                     debounceTimer = setTimeout(syncFromDisk, 400);
//                 });
//                 if (w && typeof w.close === 'function') {
//                     watcher = w;
//                 } else {
//                     throw new Error('fs.watch unavailable');
//                 }
//             } catch {
//                 intervalId = setInterval(syncFromDisk, 2500);
//             }
//         };
//         setup();

//         return () => {
//             mounted = false;
//             if (intervalId) clearInterval(intervalId);
//             if (debounceTimer) clearTimeout(debounceTimer);
//             if (watcher?.close) { try { watcher.close(); } catch { } }
//         };
//     }, [wcInstance, blockId, sandpack, canonicalKeysRef, readOnly]);

//     return null;
// };

// const StateHarvester: React.FC<{ readOnly: boolean, onChange: (answer: { snapshot: string; dependencies: Record<string, string>; immediate: boolean }) => void }> = ({ readOnly, onChange }) => {
//     const { sandpack } = useSandpack();
//     useEffect(() => {
//         if (readOnly) return;

//         const currentFiles: Record<string, string> = {};
//         for (const [path, fileObj] of Object.entries(sandpack.files)) {
//             const cleanPath = path.startsWith('/') ? path : `/${path}`;
//             if (fileObj && !fileObj.hidden && typeof fileObj.code === 'string') {
//                 currentFiles[cleanPath] = fileObj.code;
//             }
//         }

//         const pkgJson = currentFiles['/package.json'];
//         let dependencies = {};
//         if (pkgJson) {
//             try { dependencies = JSON.parse(pkgJson).dependencies || {}; } catch (e) { }
//         }

//         onChange({ snapshot: createSafeSnapshot(currentFiles), dependencies, immediate: false });
//     }, [sandpack.files, readOnly, onChange]);
//     return null;
// };

// let globalNpmMutex: Promise<void> = Promise.resolve();

// export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false }) => {
//     const toast = useToast();
//     const [isMaximized, setIsMaximized] = useState(false);
//     const [pendingZipFile, setPendingZipFile] = useState<Blob | null>(null);

//     const onChangeRef = useRef(onChange);

//     const [showGithubModal, setShowGithubModal] = useState(false);
//     const [githubUrl, setGithubUrl] = useState('');
//     const [isFetchingGithub, setIsFetchingGithub] = useState(false);

//     useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

//     const safeBlockId = useMemo(() => sanitizeBlockId(block?.id), [block?.id]);

//     const assignedPort = useMemo(() => {
//         let hash = 0;
//         const str = safeBlockId;
//         for (let i = 0; i < str.length; i++) {
//             hash = str.charCodeAt(i) + ((hash << 5) - hash);
//         }
//         return 5000 + (Math.abs(hash) % 1000);
//     }, [safeBlockId]);

//     const [lockedFiles, setLockedFiles] = useState(() => {
//         const rawSnapshot = learnerAns?.snapshot;
//         const parsedSnapshot = typeof rawSnapshot === 'string' ? safeParseSnapshot(rawSnapshot) : (rawSnapshot ? { ...rawSnapshot } : null);
//         const filesToLoad = parsedSnapshot || { ...(block.initialFiles || {}) };
//         const tempTpl = block.template || detectTemplate(filesToLoad);
//         return processProjectData(filesToLoad, assignedPort, tempTpl, safeBlockId);
//     });

//     const [template, setTemplate] = useState<"vite-react-ts" | "vite-react" | any>(() => detectTemplate(lockedFiles, block.template));

//     const [runId, setRunId] = useState(Date.now().toString());
//     const [previewUrl, setPreviewUrl] = useState<string>('');
//     const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
//     const [statusText, setStatusText] = useState("Booting OS...");
//     const [wcReady, setWcReady] = useState(false);
//     const [iframeKey, setIframeKey] = useState(0);
//     const [bootFailed, setBootFailed] = useState(false);
//     const previewOriginRef = useRef<string>('');

//     const [activeTerminalTab, setActiveTerminalTab] = useState<'logs' | 'shell'>('logs');

//     const debugTerminalRef = useRef<HTMLDivElement>(null);
//     const shellTerminalRef = useRef<HTMLDivElement>(null);
//     const debugXtermRef = useRef<Terminal | null>(null);
//     const shellXtermRef = useRef<Terminal | null>(null);
//     const debugFitRef = useRef<FitAddon | null>(null);
//     const shellFitRef = useRef<FitAddon | null>(null);
//     const devProcessRef = useRef<WebContainerProcess | null>(null);
//     const shellProcessRef = useRef<WebContainerProcess | null>(null);
//     const resizeObserverRef = useRef<ResizeObserver | null>(null);
//     const shellResizeObserverRef = useRef<ResizeObserver | null>(null);

//     const canonicalKeysRef = useRef<Set<string>>(new Set(Object.keys(lockedFiles).map(p => p.startsWith('/') ? p : '/' + p)));
//     const latestFrontendFilesRef = useRef<Record<string, string>>({});
//     const lockedFilesRef = useRef(lockedFiles);
//     useEffect(() => { lockedFilesRef.current = lockedFiles; }, [lockedFiles]);

//     const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
//     const lastSavedSnapshotRef = useRef<string>('');
//     const warnedDroppedFilesRef = useRef<Set<string>>(new Set());

//     const flushSave = useCallback((isImmediate = false) => {
//         if (!onChangeRef.current || readOnly) return;

//         const filteredSnapshot: Record<string, string> = {};
//         for (const [path, content] of Object.entries(latestFrontendFilesRef.current)) {
//             filteredSnapshot[path] = content;
//         }

//         const serialized = createSafeSnapshot(filteredSnapshot, (path) => {
//             if (!warnedDroppedFilesRef.current.has(path)) {
//                 warnedDroppedFilesRef.current.add(path);
//                 toast?.error(`"${path}" is too large to save (max 500KB) and was left out of your saved project.`);
//             }
//         });

//         if (!isImmediate && serialized === lastSavedSnapshotRef.current) return;

//         let dependencies = {};
//         if (filteredSnapshot['/package.json']) {
//             try { dependencies = JSON.parse(filteredSnapshot['/package.json']).dependencies || {}; } catch { }
//         }

//         const pendingSnapshot = serialized;
//         const result = onChangeRef.current({ snapshot: serialized, dependencies, immediate: isImmediate });
//         if (result && typeof (result as any).then === 'function') {
//             (result as Promise<void>)
//                 .then(() => { lastSavedSnapshotRef.current = pendingSnapshot; })
//                 .catch(() => { toast?.error('Failed to save your latest changes. Retrying shortly…'); });
//         } else {
//             lastSavedSnapshotRef.current = pendingSnapshot;
//         }
//     }, [readOnly]);

//     const scheduleSave = useCallback(() => {
//         if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
//         saveDebounceRef.current = setTimeout(() => {
//             flushSaveRef.current(false);
//             saveDebounceRef.current = null;
//         }, 1500);
//     }, []);

//     const handleFilesChange = useCallback((answerPayload: { snapshot: string }) => {
//         if (readOnly) return;
//         const files = safeParseSnapshot(answerPayload.snapshot);
//         if (!files) return;
//         latestFrontendFilesRef.current = files;
//         scheduleSave();
//     }, [scheduleSave, readOnly]);

//     useEffect(() => {
//         if (onChangeRef.current && !readOnly) flushSave(false);
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, []);

//     const flushSaveRef = useRef(flushSave);
//     useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

//     useEffect(() => {
//         const handleBeforeUnload = () => flushSaveRef.current(true);
//         const handleVisibilityChange = () => { if (document.visibilityState === 'hidden') flushSaveRef.current(true); };

//         window.addEventListener('beforeunload', handleBeforeUnload);
//         document.addEventListener('visibilitychange', handleVisibilityChange);
//         return () => {
//             window.removeEventListener('beforeunload', handleBeforeUnload);
//             document.removeEventListener('visibilitychange', handleVisibilityChange);
//         };
//     }, []);

//     useEffect(() => {
//         return () => {
//             if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
//             flushSaveRef.current(true);
//         };
//     }, []);

//     useEffect(() => {
//         const intervalId = setInterval(() => flushSaveRef.current(false), 5000);
//         return () => clearInterval(intervalId);
//     }, []);

//     useEffect(() => {
//         const handleMessage = (e: MessageEvent) => {
//             if (previewOriginRef.current && e.origin !== previewOriginRef.current) return;
//             if (e.data?.source === 'preview-console' && e.data?.blockId === safeBlockId && debugXtermRef.current) {
//                 let prefix = '\x1b[34m[LOG]\x1b[0m';
//                 if (e.data.m === 'warn') prefix = '\x1b[33m[WARN]\x1b[0m';
//                 if (e.data.m === 'error') prefix = '\x1b[31m[ERROR]\x1b[0m';
//                 if (e.data.m === 'info') prefix = '\x1b[36m[INFO]\x1b[0m';
//                 debugXtermRef.current.writeln(`${prefix} ${String(e.data.p).slice(0, 2000)}`);
//             }
//         };
//         window.addEventListener('message', handleMessage);
//         return () => window.removeEventListener('message', handleMessage);
//     }, [safeBlockId]);

//     const containerRef = useRef<HTMLDivElement>(null);
//     const [hasBeenVisible, setHasBeenVisible] = useState(false);

//     useEffect(() => {
//         if (hasBeenVisible || !containerRef.current) return;
//         const observer = new IntersectionObserver((entries) => {
//             if (entries[0]?.isIntersecting) {
//                 setHasBeenVisible(true);
//                 observer.disconnect();
//             }
//         }, { threshold: 0.1 });
//         observer.observe(containerRef.current);
//         return () => observer.disconnect();
//     }, [hasBeenVisible]);

//     useEffect(() => {
//         if (!hasBeenVisible) return;

//         let mounted = true;
//         setPreviewUrl('');
//         setStatusText("Initializing Environment...");

//         const debugTerm = new Terminal({ theme: { background: '#0f172a', foreground: '#38bdf8' }, fontFamily: 'monospace', fontSize: 11, convertEol: true });
//         const debugFit = new FitAddon();
//         debugTerm.loadAddon(debugFit);
//         debugXtermRef.current = debugTerm;
//         debugFitRef.current = debugFit;

//         const shellTerm = new Terminal({ theme: { background: '#0f172a', foreground: '#e2e8f0' }, fontFamily: 'monospace', fontSize: 11, convertEol: true, cursorBlink: true });
//         const shellFit = new FitAddon();
//         shellTerm.loadAddon(shellFit);
//         shellXtermRef.current = shellTerm;
//         shellFitRef.current = shellFit;

//         if (debugTerminalRef.current) {
//             try { debugTerm.open(debugTerminalRef.current); } catch (e) { }
//             resizeObserverRef.current = new ResizeObserver(() => {
//                 if (mounted && debugTerminalRef.current && debugTerminalRef.current.clientWidth > 0) try { debugFit.fit(); } catch (e) { }
//             });
//             resizeObserverRef.current.observe(debugTerminalRef.current);
//         }

//         if (shellTerminalRef.current) {
//             try { shellTerm.open(shellTerminalRef.current); } catch (e) { }
//             shellResizeObserverRef.current = new ResizeObserver(() => {
//                 if (mounted && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0) {
//                     try { shellFit.fit(); if (shellProcessRef.current) shellProcessRef.current.resize({ cols: shellTerm.cols, rows: shellTerm.rows }); } catch (e) { }
//                 }
//             });
//             shellResizeObserverRef.current.observe(shellTerminalRef.current);
//         }

//         let shellInputListener: { dispose: () => void } | null = null;
//         let serverReadyHandled = false;
//         let serverReadyUnsub: (() => void) | null = null;

//         const boot = async () => {
//             const WORK_DIR = `/${safeBlockId}`;

//             try {
//                 const wc = await getWebContainer();
//                 if (!mounted) return;
//                 setWcInstance(wc);

//                 if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } devProcessRef.current = null; }
//                 if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } shellProcessRef.current = null; }
//                 try { await wc.fs.rm(WORK_DIR, { recursive: true, force: true }); } catch { }

//                 debugTerm.writeln('\x1b[1;32m>> SYSTEM ONLINE - MOUNTING FILESYSTEM\x1b[0m');
//                 const bootTemplate = block.template || detectTemplate(lockedFilesRef.current);
//                 const tree = convertToTree(processProjectData(lockedFilesRef.current, assignedPort, bootTemplate, safeBlockId));

//                 await wc.mount({ [safeBlockId]: { directory: tree } });

//                 if (mounted) setWcReady(true);

//                 await wc.fs.mkdir(`${WORK_DIR}/.bin`, { recursive: true });
//                 await wc.fs.writeFile(`${WORK_DIR}/.bin/git`, GIT_SHIM_SCRIPT);

//                 debugTerm.writeln('\x1b[1;33m>> Queuing npm install...\x1b[0m');
//                 let installFailed = false;
//                 await new Promise<void>(resolve => {
//                     globalNpmMutex = globalNpmMutex.then(async () => {
//                         if (!mounted) return resolve();
//                         let installProcess: any = null;
//                         try {
//                             debugTerm.writeln('\x1b[1;33m>> Running npm install...\x1b[0m');
//                             installProcess = await wc.spawn('npm', ['install', '--no-package-lock'], { cwd: WORK_DIR });

//                             installProcess.output.pipeTo(new WritableStream({
//                                 write: data => { if (mounted) debugTerm.write(data); }
//                             })).catch(() => { });

//                             const exitCode = await Promise.race([
//                                 installProcess.exit,
//                                 new Promise<number>((_, reject) => setTimeout(() => reject(new Error('npm install timed out after 5 minutes')), 300000))
//                             ]);
//                             if (exitCode !== 0) throw new Error("Installation process aborted.");
//                         } catch (err: any) {
//                             installFailed = true;
//                             if (mounted) debugTerm.writeln(`\x1b[1;31m>> NPM Error: ${err.message || err}\x1b[0m`);
//                             try { installProcess?.kill(); } catch { }
//                         }
//                         resolve();
//                     });
//                 });

//                 if (!mounted) return;
//                 if (installFailed) {
//                     setStatusText("Boot Failed");
//                     setBootFailed(true);
//                     return;
//                 }

//                 debugTerm.writeln('\n\x1b[1;36m>> Booting local Vite telemetry server...\x1b[0m');
//                 const devProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: WORK_DIR });
//                 devProcessRef.current = devProcess;

//                 devProcess.output.pipeTo(new WritableStream({
//                     write: data => { if (mounted) debugTerm.write(data); }
//                 })).catch(() => { });

//                 const shellProcess = await wc.spawn('jsh', { terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 15 }, cwd: WORK_DIR });
//                 shellProcessRef.current = shellProcess;

//                 shellProcess.output.pipeTo(new WritableStream({
//                     write: data => { if (mounted) shellTerm.write(data); }
//                 })).catch(() => { });

//                 const inputWriter = shellProcess.input.getWriter();
//                 await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH"\nclear\n').catch(() => { });
//                 shellInputListener = shellTerm.onData(data => {
//                     if (mounted) inputWriter.write(data).catch(() => { });
//                 });

//                 serverReadyUnsub = wc.on('server-ready', (port, url) => {
//                     if (!mounted || serverReadyHandled) return;
//                     if (port !== assignedPort) return;

//                     serverReadyHandled = true;
//                     try { previewOriginRef.current = new URL(url).origin; } catch { }
//                     setPreviewUrl(url);
//                     setStatusText("Online");
//                     debugTerm.writeln(`\n\x1b[1;32m>> Preview running on port ${port}\x1b[0m\n`);
//                 });

//             } catch (err: any) {
//                 if (mounted) {
//                     debugTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
//                     setStatusText("Boot Failed");
//                     setBootFailed(true);
//                 }
//             }
//         };

//         setBootFailed(false);
//         boot();

//         return () => {
//             mounted = false;
//             if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
//             if (shellResizeObserverRef.current) shellResizeObserverRef.current.disconnect();
//             if (shellInputListener) shellInputListener.dispose();
//             if (serverReadyUnsub) serverReadyUnsub();
//             debugTerm.dispose();
//             shellTerm.dispose();
//             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
//             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }
//         };

//     }, [runId, template, assignedPort, safeBlockId, hasBeenVisible]);

//     const [previewHeight, setPreviewHeight] = useState(400);
//     const [isDragging, setIsDragging] = useState(false);

//     const handleResizerMouseDown = (e: React.MouseEvent) => {
//         e.preventDefault();
//         setIsDragging(true);
//         const startY = e.clientY;
//         const startHeight = previewHeight;

//         const handleMouseMove = (moveEvent: MouseEvent) => {
//             setPreviewHeight(Math.max(10, Math.min(600, startHeight + (moveEvent.clientY - startY))));
//         };

//         const handleMouseUp = () => {
//             setIsDragging(false);
//             document.removeEventListener('mousemove', handleMouseMove);
//             document.removeEventListener('mouseup', handleMouseUp);
//         };

//         document.addEventListener('mousemove', handleMouseMove);
//         document.addEventListener('mouseup', handleMouseUp);
//     };

//     useEffect(() => {
//         const timeoutId = setTimeout(() => {
//             try {
//                 if (debugXtermRef.current?.element && debugTerminalRef.current && debugTerminalRef.current.clientWidth > 0 && debugFitRef.current) {
//                     debugFitRef.current.fit();
//                 }
//                 if (shellXtermRef.current?.element && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0 && shellFitRef.current) {
//                     shellFitRef.current.fit();
//                     if (shellProcessRef.current) {
//                         shellProcessRef.current.resize({ cols: shellXtermRef.current.cols, rows: shellXtermRef.current.rows });
//                     }
//                 }
//             } catch (e) { }
//         }, 250);
//         return () => clearTimeout(timeoutId);
//     }, [isMaximized, activeTerminalTab]);

//     useEffect(() => {
//         if (isMaximized) {
//             document.documentElement.style.overflow = 'hidden';
//             document.body.style.overflow = 'hidden';

//             let el = containerRef.current?.parentElement;
//             while (el && el !== document.body) {
//                 el.style.setProperty('overflow', 'hidden', 'important');
//                 el.style.setProperty('transform', 'none', 'important');
//                 el.style.setProperty('filter', 'none', 'important');
//                 el.style.setProperty('perspective', 'none', 'important');
//                 el = el.parentElement;
//             }
//         } else {
//             document.documentElement.style.overflow = '';
//             document.body.style.overflow = '';

//             let el = containerRef.current?.parentElement;
//             while (el && el !== document.body) {
//                 el.style.removeProperty('overflow');
//                 el.style.removeProperty('transform');
//                 el.style.removeProperty('filter');
//                 el.style.removeProperty('perspective');
//                 el = el.parentElement;
//             }
//         }
//     }, [isMaximized]);

//     const containerStyle: React.CSSProperties = useMemo(() => isMaximized ? {
//         position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999, border: 'none', borderRadius: 0, overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column', margin: 0, padding: 0, boxSizing: 'border-box'
//     } : {
//         position: 'relative', width: '100%', height: '750px', marginTop: '1rem', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
//     }, [isMaximized]);

//     const terminalTabBtnStyle = useCallback((active: boolean): React.CSSProperties => ({
//         background: active ? '#334155' : 'transparent', border: 'none', color: active ? '#fff' : '#94a3b8',
//         cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold'
//     }), []);

//     const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0];
//         if (!file) return;
//         setPendingZipFile(file);
//         e.target.value = '';
//     };

//     const processZipBlob = async (blob: Blob) => {
//         const zip = new JSZip();
//         const contents = await zip.loadAsync(blob);

//         const allPaths = Object.keys(contents.files).filter(p => !contents.files[p].dir && !p.includes('__MACOSX') && !p.startsWith('.'));
//         let commonPrefix: string | null = null;
//         for (const p of allPaths) {
//             const topFolder = p.split('/')[0];
//             if (!p.includes('/')) { commonPrefix = null; break; }
//             if (commonPrefix === null) commonPrefix = topFolder;
//             else if (commonPrefix !== topFolder) { commonPrefix = null; break; }
//         }

//         const isBinaryFile = (path: string) => ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm', '.svg'].some(ext => path.toLowerCase().endsWith(ext));

//         const newFiles: Record<string, string> = {};
//         for (const path of allPaths) {
//             const strippedPath = commonPrefix ? path.slice(commonPrefix.length + 1) : path;
//             if (!strippedPath) continue;
//             if (isBinaryFile(path)) {
//                 newFiles[`/${strippedPath}`] = `__mlab_base64__${await contents.files[path].async('base64')}`;
//             } else {
//                 newFiles[`/${strippedPath}`] = await contents.files[path].async('string');
//             }
//         }

//         const tempTpl = detectTemplate(newFiles);
//         const cleanFiles = processProjectData(newFiles, assignedPort, tempTpl, block.id);

//         setTemplate(tempTpl === 'create-react-app' ? 'vite-react' : tempTpl);
//         setLockedFiles(cleanFiles);
//         canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));
//         latestFrontendFilesRef.current = {};
//         setRunId(Date.now().toString());

//         if (onChangeRef.current) onChangeRef.current({ snapshot: createSafeSnapshot(cleanFiles) });
//         toast?.success("Project Imported Successfully!");
//     };

//     const confirmZipImport = async () => {
//         if (!pendingZipFile) return;
//         await processZipBlob(pendingZipFile);
//         setPendingZipFile(null);
//     };

//     const handleGithubImport = async () => {
//         if (!githubUrl.trim()) return;
//         try {
//             setIsFetchingGithub(true);

//             const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
//             if (!match) throw new Error("Invalid GitHub URL. Must be a valid repo link.");

//             const user = match[1];
//             const repo = match[2].replace('.git', '');

//             const response = await fetch(`https://api.github.com/repos/${user}/${repo}/zipball`);
//             if (!response.ok) throw new Error("Could not fetch repo. Ensure it is public.");

//             const blob = await response.blob();

//             setShowGithubModal(false);
//             setGithubUrl('');
//             setPendingZipFile(blob);
//         } catch (err: any) {
//             toast?.error(err.message || "Failed to import from GitHub.");
//         } finally {
//             setIsFetchingGithub(false);
//         }
//     };

//     const handleDownloadZip = async () => {
//         const zip = new JSZip();
//         const filesToZip = Object.keys(latestFrontendFilesRef.current).length > 0 ? latestFrontendFilesRef.current : lockedFiles;

//         Object.entries(filesToZip).forEach(([path, content]) => {
//             if (canonicalKeysRef.current.has(path)) {
//                 const cleanPath = path.startsWith('/') ? path.substring(1) : path;
//                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) zip.file(cleanPath, content.substring(15), { base64: true });
//                 else zip.file(cleanPath, content as string);
//             }
//         });
//         const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
//         const a = document.createElement('a'); a.href = url; a.download = `codetribe_project_${block.id}.zip`; a.click();
//         URL.revokeObjectURL(url);
//         toast?.success("Project Downloaded Successfully!");
//     };

//     return (
//         <div ref={containerRef} style={containerStyle}>
//             <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #334155', flexShrink: 0 }}>
//                 <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
//                     <Code size={14} color="#3b82f6" /> {block.title || 'Live IDE'}
//                     {readOnly && <span style={{ background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>GRADING MODE (LOCKED)</span>}
//                 </span>
//                 <div style={{ display: 'flex', gap: '8px' }}>
//                     {!readOnly && (
//                         <>
//                             <label style={{ background: '#3b82f6', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                 <FolderArchive size={14} /> Import ZIP<input type="file" accept=".zip" hidden onChange={handleFileSelect} />
//                             </label>
//                             <button onClick={() => setShowGithubModal(true)} style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
//                                 <Github size={14} /> GitHub
//                             </button>
//                         </>
//                     )}
//                     <button onClick={handleDownloadZip} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><Download size={14} /> <span className="ap-hide-mobile">ZIP</span></button>
//                     <button onClick={() => setIframeKey(k => k + 1)} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><RefreshCw size={14} /> Reload Preview</button>
//                     <button onClick={() => setIsMaximized(!isMaximized)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>{isMaximized ? <Minimize size={14} /> : <Maximize size={14} />} {isMaximized ? 'Exit' : 'Fullscreen'}</button>
//                 </div>
//             </div>

//             <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
//                 <Group direction="horizontal" style={{ width: '100%', height: '100%' }}>
//                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
//                         <style>{`.sp-layout, .sp-wrapper { height: 100% !important; max-height: 100% !important; min-height: 0 !important; min-width: 0 !important; } [data-panel-group], [data-panel] { height: 100% !important; }`}</style>
//                         <SandpackProvider key={runId} template={resolveSandpackTemplate(template)} files={lockedFiles} theme="dark">
//                             <SandpackLayout style={{ flex: 1, height: '100%', border: 'none', borderRadius: 0, overflow: 'hidden', minHeight: 0 }}>
//                                 <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', minWidth: 0 }}>
//                                     <SandpackFileActions readOnly={readOnly} canonicalKeysRef={canonicalKeysRef} wcInstance={wcInstance} blockId={block.id} />
//                                     <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
//                                         <div style={{ width: '160px', borderRight: '1px solid #334155', flexShrink: 0, overflowY: 'auto', overflowX: 'hidden' }}><SandpackFileExplorer style={{ height: '100%' }} /></div>
//                                         <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}><SandpackCodeEditor showTabs closableTabs style={{ height: '100%' }} readOnly={readOnly} /></div>
//                                     </div>
//                                 </div>
//                             </SandpackLayout>
//                             {!readOnly && wcReady && <WebContainerSyncBridge wcInstance={wcInstance} blockId={block.id} canonicalKeysRef={canonicalKeysRef} readOnly={readOnly} />}
//                             {!readOnly && <StateHarvester readOnly={readOnly} onChange={handleFilesChange} />}
//                         </SandpackProvider>
//                     </Panel>
//                     <Separator style={{ width: '4px', background: '#334155', cursor: 'col-resize' }} />
//                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', overflow: 'hidden' }}>
//                         <div style={{ height: `${previewHeight}px`, position: 'relative', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
//                             {previewUrl ? <iframe key={iframeKey} src={`${previewUrl}${previewUrl.includes('?') ? '&' : '?'}t=${iframeKey}`} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" /> : (
//                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', gap: '10px' }}>
//                                     {bootFailed ? <AlertTriangle size={24} color="#ef4444" /> : <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />}
//                                     <span style={{ fontSize: '0.85rem' }}>{statusText}</span>
//                                     {bootFailed && (
//                                         <button onClick={() => { setBootFailed(false); setRunId(Date.now().toString()); }} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <RefreshCw size={13} /> Retry
//                                         </button>
//                                     )}
//                                 </div>
//                             )}
//                             {isDragging && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />}
//                         </div>
//                         <div onMouseDown={handleResizerMouseDown} style={{ height: '4px', background: '#334155', cursor: 'row-resize', flexShrink: 0 }} />
//                         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
//                             <div style={{ padding: '4px 8px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
//                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'logs')} onClick={() => setActiveTerminalTab('logs')}><ScrollText size={12} /> Logs</button>
//                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'shell')} onClick={() => setActiveTerminalTab('shell')}><SquareTerminal size={12} /> Shell</button>
//                             </div>
//                             <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
//                                 <div style={{ position: 'absolute', inset: 0, padding: '8px', visibility: activeTerminalTab === 'logs' ? 'visible' : 'hidden', pointerEvents: activeTerminalTab === 'logs' ? 'auto' : 'none' }}>
//                                     <div ref={debugTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
//                                 </div>
//                                 <div style={{ position: 'absolute', inset: 0, padding: '8px', visibility: activeTerminalTab === 'shell' ? 'visible' : 'hidden', pointerEvents: activeTerminalTab === 'shell' ? 'auto' : 'none' }}>
//                                     <div ref={shellTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
//                                 </div>
//                             </div>
//                         </div>
//                     </Panel>
//                 </Group>
//             </div>

//             {showGithubModal && (
//                 <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                     <div style={{ background: '#1e293b', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
//                         <h3 style={{ color: '#fff', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><Github size={20} /> Import from GitHub</h3>
//                         <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '15px' }}>Enter the URL of a public GitHub repository. This will completely overwrite your current code.</p>

//                         <input
//                             type="text"
//                             placeholder="https://github.com/user/repo"
//                             value={githubUrl}
//                             onChange={(e) => setGithubUrl(e.target.value)}
//                             style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', marginBottom: '20px', fontSize: '0.9rem', outline: 'none' }}
//                         />

//                         <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
//                             <button onClick={() => setShowGithubModal(false)} disabled={isFetchingGithub} style={{ padding: '8px 16px', background: 'transparent', color: '#cbd5e1', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
//                             <button onClick={handleGithubImport} disabled={isFetchingGithub || !githubUrl} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', opacity: (isFetchingGithub || !githubUrl) ? 0.5 : 1 }}>
//                                 {isFetchingGithub ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
//                                 {isFetchingGithub ? 'Pulling...' : 'Import Repo'}
//                             </button>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {pendingZipFile && (
//                 <StatusModal
//                     type="warning"
//                     title="Overwrite Existing Code?"
//                     message="Importing this ZIP file will completely replace your current project files. This action cannot be undone. Do you want to proceed?"
//                     confirmText="Yes, Import"
//                     onClose={confirmZipImport}
//                     onCancel={() => setPendingZipFile(null)}
//                 />
//             )}
//         </div>
//     );
// };

// export default CodeSandboxPlayer;
// // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // import { Code, Maximize, Minimize, Save, CheckCircle, TerminalSquare, Play, Loader2, Plus, X, Trash2, Pencil, FilePlus, Download, Github, FolderArchive, UploadCloud, RefreshCw, AlertTriangle, ScrollText, SquareTerminal } from 'lucide-react';
// // import {
// //     SandpackProvider,
// //     SandpackLayout,
// //     SandpackCodeEditor,
// //     SandpackFileExplorer,
// //     useSandpack
// // } from "@codesandbox/sandpack-react";
// // import { useToast } from '../Toast/Toast';
// // import JSZip from 'jszip';
// // import { Group, Panel, Separator } from 'react-resizable-panels';
// // import { StatusModal } from '../StatusModal/StatusModal';
// // import { Terminal } from 'xterm';
// // import { FitAddon } from 'xterm-addon-fit';
// // import 'xterm/css/xterm.css';
// // import { getWebContainer } from './webcontainerManager';
// // import type { FileSystemTree, WebContainer, WebContainerProcess } from '@webcontainer/api';

// // export interface SandboxFileMap {
// //     [path: string]: string;
// // }

// // export interface SandboxBlock {
// //     id: string;
// //     title?: string;
// //     template?: string;
// //     question?: string;
// //     initialFiles?: SandboxFileMap;
// // }

// // export interface SandboxAnswerPayload {
// //     snapshot?: string | SandboxFileMap;
// //     dependencies?: Record<string, string>;
// //     immediate?: boolean;
// // }

// // export interface CodeSandboxPlayerProps {
// //     block: SandboxBlock;
// //     learnerAns: SandboxAnswerPayload | null | undefined;
// //     onChange?: (answer: SandboxAnswerPayload) => void | Promise<void>;
// //     readOnly?: boolean;
// // }

// // // 🚀 SECURITY: block.id lands directly in fs paths (wc.fs.rm, wc.mount, cwd). Strip
// // // anything that isn't a safe path segment so it can never escape its own directory.
// // const sanitizeBlockId = (id: string | undefined): string => {
// //     const clean = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
// //     return clean || 'mlab-default';
// // };

// // const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache', '.npm-cache'];
// // const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

// // const shouldIgnorePath = (relPath: string) => {
// //     const parts = relPath.split('/').filter(Boolean);
// //     if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
// //     const fileName = parts[parts.length - 1] || '';
// //     if (SYNC_IGNORE_FILES.includes(fileName)) return true;
// //     if (fileName.endsWith('.log')) return true;
// //     return false;
// // };

// // // Report which files got silently excluded so the caller can warn the learner (Fix #9).
// // const createSafeSnapshot = (files: Record<string, string>, onDropped?: (path: string) => void) => {
// //     const safeFiles: Record<string, string> = {};
// //     for (const [path, content] of Object.entries(files)) {
// //         if (shouldIgnorePath(path)) continue;
// //         if (content.length > 500000) {
// //             console.warn(`File ${path} is too large. Excluding from auto-save.`);
// //             onDropped?.(path);
// //             continue;
// //         }
// //         safeFiles[path] = content;
// //     }
// //     return JSON.stringify(safeFiles);
// // };

// // // Never trust a snapshot blindly - a malformed/corrupted Firestore doc should fall back
// // // to defaults instead of being fed straight into the WebContainer filesystem.
// // const isValidSnapshot = (obj: unknown): obj is SandboxFileMap => {
// //     if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
// //     return Object.entries(obj as Record<string, unknown>).every(
// //         ([path, content]) => typeof path === 'string' && path.length < 500 && typeof content === 'string'
// //     );
// // };

// // const safeParseSnapshot = (raw: string): SandboxFileMap | null => {
// //     try {
// //         const parsed = JSON.parse(raw);
// //         return isValidSnapshot(parsed) ? parsed : null;
// //     } catch {
// //         return null;
// //     }
// // };

// // const convertToTree = (files: Record<string, string>): FileSystemTree => {
// //     const tree: FileSystemTree = {};
// //     for (const [path, content] of Object.entries(files)) {
// //         const parts = path.split('/').filter(Boolean);
// //         let current = tree;
// //         for (let i = 0; i < parts.length; i++) {
// //             const part = parts[i];
// //             if (i === parts.length - 1) {
// //                 let fileContent: string | Uint8Array = content;
// //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) {
// //                     const binStr = atob(content.substring(15));
// //                     const arr = new Uint8Array(binStr.length);
// //                     for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// //                     fileContent = arr;
// //                 }
// //                 current[part] = { file: { contents: fileContent } };
// //             } else {
// //                 if (!current[part]) current[part] = { directory: {} };
// //                 current = (current[part] as any).directory;
// //             }
// //         }
// //     }
// //     return tree;
// // };

// // const detectTemplate = (files: Record<string, string>, overrideTemplate?: string): "vite-react-ts" | "vite-react" | any => {
// //     if (overrideTemplate && overrideTemplate !== 'create-react-app') return overrideTemplate;
// //     return Object.keys(files).some(p => p.endsWith('.tsx') || p.endsWith('.ts')) || !!files['/tsconfig.json'] ? "vite-react-ts" : "vite-react";
// // };

// // const processProjectData = (rawFiles: Record<string, string>, targetPort: number, templateType: string, blockId: string) => {
// //     const out = { ...rawFiles };
// //     const isReact = templateType === 'vite-react' || templateType === 'create-react-app' || templateType === 'vite-react-ts';

// //     Object.keys(out).forEach(k => {
// //         if (shouldIgnorePath(k)) delete out[k];
// //     });

// //     if (isReact) {
// //         if (!out['/package.json']) {
// //             out['/package.json'] = JSON.stringify({ name: "mlab-workspace-project", type: "module" }, null, 2);
// //         }
// //         try {
// //             const pkg = JSON.parse(out['/package.json']);
// //             pkg.type = pkg.type || "module";
// //             pkg.dependencies = pkg.dependencies || {};
// //             pkg.dependencies['react'] = pkg.dependencies['react'] || "^18.2.0";
// //             pkg.dependencies['react-dom'] = pkg.dependencies['react-dom'] || "^18.2.0";

// //             pkg.devDependencies = pkg.devDependencies || {};
// //             pkg.devDependencies['vite'] = pkg.devDependencies['vite'] || "^4.5.3";
// //             pkg.devDependencies['@vitejs/plugin-react'] = pkg.devDependencies['@vitejs/plugin-react'] || "^4.2.1";
// //             pkg.scripts = pkg.scripts || {};

// //             // 🚀 FIX: Force the port via CLI so we NEVER overwrite the user's custom vite.config.ts!
// //             pkg.scripts.dev = `vite --port ${targetPort} --strictPort`;

// //             delete pkg.engines;
// //             delete pkg.packageManager;
// //             out['/package.json'] = JSON.stringify(pkg, null, 2);
// //         } catch (e) { }

// //         // 🚀 FIX: Only provide a default config if the user didn't upload one (Protects Tailwind!)
// //         if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
// //             out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
// //         }

// //         const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
// //         const ext = isTSProject ? 'tsx' : 'jsx';

// //         // Shift user code from root into /src if needed
// //         if (out[`/App.${ext}`] && !out[`/src/App.${ext}`]) {
// //             out[`/src/App.${ext}`] = out[`/App.${ext}`];
// //         }
// //         if (out[`/App.js`] && !out[`/src/App.jsx`]) {
// //             out[`/src/App.jsx`] = out[`/App.js`];
// //         }

// //         // Clean up old root entry points so they don't conflict
// //         const ghosts = ['/index.js', '/index.jsx', '/index.ts', '/index.tsx', '/src/index.js', '/src/index.jsx', '/src/index.ts', '/src/index.tsx', '/App.js', '/App.jsx', '/App.ts', '/App.tsx'];
// //         ghosts.forEach(g => delete out[g]);

// //         const actualExt = out['/src/App.tsx'] ? 'tsx' : 'jsx';

// //         if (!out['/src/App.jsx'] && !out['/src/App.tsx']) {
// //             out[`/src/App.${actualExt}`] = 'export default function App() {\n  return <h1>Vite + React Canvas Online!</h1>;\n}';
// //         }

// //         out[`/App.${actualExt}`] = `export { default } from "./src/App.${actualExt}";\n`;

// //         if (!out['/src/main.jsx'] && !out['/src/main.tsx']) {
// //             out[`/src/main.${actualExt}`] = `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "../App.${actualExt}";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);`;
// //         }

// //         if (!out['/src/index.css']) out['/src/index.css'] = `body { font-family: sans-serif; padding: 2rem; }`;
// //     }

// //     const consoleInterceptor = `\n<script>\n  (function() {\n    const orig = { ...console };\n    ['log', 'warn', 'error', 'info'].forEach(m => {\n      console[m] = (...args) => {\n        orig[m](...args);\n        try { window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*'); } catch(e) {}\n      };\n    });\n    window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m: 'error', p: e.message }, '*'));\n  })();\n</script>\n`;

// //     let htmlKey = out['/index.html'] ? '/index.html' : out['/public/index.html'] ? '/public/index.html' : null;

// //     if (htmlKey) {
// //         let html = out[htmlKey];
// //         if (!html.includes("source: 'preview-console'")) {
// //             if (html.includes('<head>')) {
// //                 html = html.replace('<head>', `<head>${consoleInterceptor}`);
// //             } else if (html.includes('<html>')) {
// //                 html = html.replace('<html>', `<html><head>${consoleInterceptor}</head>`);
// //             } else {
// //                 html = `${consoleInterceptor}${html}`;
// //             }
// //         }
// //         out[htmlKey] = html;
// //     } else if (isReact) {
// //         const entryPoint = templateType === 'vite-react' ? '/src/main' : '/src/index';
// //         const ext = out['/src/App.tsx'] ? 'tsx' : 'jsx';
// //         out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>${consoleInterceptor}</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="${entryPoint}.${ext}"></script>\n</body>\n</html>`;
// //     }

// //     return out;
// // };

// // const GIT_SHIM_SCRIPT = `#!/usr/bin/env node
// // console.log("\\n\\x1b[1;33m⚠️  Git is not natively supported in this browser environment.\\x1b[0m");
// // console.log("\\x1b[1;36mHOW TO MANAGE YOUR CODE:\\x1b[0m");
// // console.log("  • \\x1b[1;34mClone/Pull:\\x1b[0m Use \\x1b[1;32mnpx degit <github-username>/<repo>\\x1b[0m to download templates.");
// // console.log("  • \\x1b[1;34mSave/Push:\\x1b[0m Your code is actively auto-saving to the platform.");
// // console.log("  • \\x1b[1;34mExport:\\x1b[0m Click \\x1b[1;32mDownload ZIP\\x1b[0m in the toolbar above to get your files locally.\\n");
// // `;

// // const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', transition: 'color 0.2s' };
// // const FILE_ACTIONS_BAR_STYLE: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#252526', padding: '6px 16px', borderBottom: '1px solid #333', flexShrink: 0, minHeight: '36px' };

// // const SandpackFileActions: React.FC<{ readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>>, wcInstance: WebContainer | null, blockId: string }> = ({ readOnly, canonicalKeysRef, wcInstance, blockId }) => {
// //     const { sandpack } = useSandpack();

// //     const [action, setAction] = useState<'idle' | 'add' | 'rename'>('idle');
// //     const [inputValue, setInputValue] = useState('');

// //     if (readOnly) return null;

// //     const handleAction = async () => {
// //         if (!inputValue.trim()) { setAction('idle'); return; }
// //         const WORK_DIR = `/${blockId}`;

// //         if (action === 'add') {
// //             let path = inputValue.trim();
// //             if (!path.startsWith('/')) path = '/' + path;
// //             if (sandpack.files[path]) { window.alert("A file with this path already exists."); return; }

// //             if (typeof sandpack.addFile === 'function') sandpack.addFile(path, "// New file\n");
// //             else sandpack.updateFile(path, "// New file\n");
// //             if (typeof sandpack.setActiveFile === 'function') sandpack.setActiveFile(path);
// //             canonicalKeysRef.current.add(path);

// //             if (wcInstance) {
// //                 try {
// //                     const parts = path.split('/').filter(Boolean);
// //                     if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
// //                     await wcInstance.fs.writeFile(`${WORK_DIR}${path}`, "// New file\n");
// //                 } catch { }
// //             }
// //         } else if (action === 'rename') {
// //             const oldPath = sandpack.activeFile;
// //             let newPath = inputValue.trim();
// //             if (!newPath.startsWith('/')) newPath = '/' + newPath;

// //             if (newPath !== oldPath) {
// //                 if (sandpack.files[newPath]) { window.alert("A file with that name already exists."); return; }
// //                 const content = sandpack.files[oldPath].code;
// //                 if (typeof sandpack.addFile === 'function') {
// //                     sandpack.addFile(newPath, content);
// //                     sandpack.deleteFile(oldPath);
// //                     sandpack.setActiveFile(newPath);
// //                 }
// //                 canonicalKeysRef.current.add(newPath);
// //                 canonicalKeysRef.current.delete(oldPath);

// //                 if (wcInstance) {
// //                     try {
// //                         const parts = newPath.split('/').filter(Boolean);
// //                         if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
// //                         await wcInstance.fs.writeFile(`${WORK_DIR}${newPath}`, content);
// //                         await wcInstance.fs.rm(`${WORK_DIR}${oldPath}`);
// //                     } catch { }
// //                 }
// //             }
// //         }
// //         setAction('idle');
// //         setInputValue('');
// //     };

// //     const handleDelete = async () => {
// //         const path = sandpack.activeFile;
// //         if (Object.keys(sandpack.files).length <= 1) { window.alert("You cannot delete the last remaining file."); return; }
// //         if (window.confirm(`Are you sure you want to delete ${path}?`)) {
// //             if (typeof sandpack.deleteFile === 'function') sandpack.deleteFile(path);
// //             canonicalKeysRef.current.delete(path);
// //             if (wcInstance) { try { await wcInstance.fs.rm(`/${blockId}${path}`); } catch { } }
// //         }
// //     };

// //     return (
// //         <div style={FILE_ACTIONS_BAR_STYLE}>
// //             {action === 'idle' ? (
// //                 <><span style={{ fontSize: '0.7rem', color: '#ccc', fontWeight: 600, letterSpacing: '0.5px' }}>EXPLORER</span>
// //                     <div style={{ display: 'flex', gap: '6px' }}>
// //                         <button onClick={() => { setAction('add'); setInputValue(''); }} style={iconBtnStyle}><FilePlus size={15} /></button>
// //                         <button onClick={() => { setAction('rename'); setInputValue(sandpack.activeFile); }} style={iconBtnStyle}><Pencil size={14} /></button>
// //                         <button onClick={handleDelete} style={{ ...iconBtnStyle, color: '#ef4444' }}><Trash2 size={15} /></button>
// //                     </div></>
// //             ) : (
// //                 <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px' }}>
// //                     <span style={{ fontSize: '0.75rem', color: action === 'add' ? '#10b981' : '#eab308', fontWeight: 'bold' }}>{action === 'add' ? 'NEW:' : 'RENAME:'}</span>
// //                     <input autoFocus value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAction(); if (e.key === 'Escape') setAction('idle'); }} onBlur={() => { if (inputValue.trim() && inputValue !== sandpack.activeFile) handleAction(); else setAction('idle'); }} style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: `1px solid ${action === 'add' ? '#10b981' : '#eab308'}`, outline: 'none', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', minWidth: 0 }} />
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };

// // const WebContainerSyncBridge: React.FC<{ wcInstance: WebContainer | null, blockId: string, readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>> }> = ({ wcInstance, blockId, readOnly, canonicalKeysRef }) => {
// //     const { sandpack } = useSandpack();
// //     const lastCodeRef = useRef<Record<string, string>>({});
// //     const isWritingRef = useRef<boolean>(false);

// //     if (Object.keys(lastCodeRef.current).length === 0) {
// //         Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// //             lastCodeRef.current[path] = fileObj.code;
// //         });
// //     }

// //     useEffect(() => {
// //         if (!wcInstance || readOnly) return;
// //         const timeoutId = setTimeout(() => {
// //             Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// //                 const code = fileObj.code;
// //                 if (code !== undefined && lastCodeRef.current[path] !== code) {
// //                     lastCodeRef.current[path] = code;
// //                     let outCode: string | Uint8Array = code;
// //                     if (typeof code === 'string' && code.startsWith('__mlab_base64__')) {
// //                         const binStr = atob(code.substring(15));
// //                         const arr = new Uint8Array(binStr.length);
// //                         for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// //                         outCode = arr;
// //                     }
// //                     const WORK_DIR = `/${blockId}`;
// //                     const fullPath = `${WORK_DIR}${path.startsWith('/') ? path : `/${path}`}`;
// //                     const relativeParts = path.split('/').filter(Boolean);

// //                     isWritingRef.current = true;
// //                     if (relativeParts.length > 1) {
// //                         wcInstance.fs.mkdir(`${WORK_DIR}/` + relativeParts.slice(0, -1).join('/'), { recursive: true })
// //                             .then(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }))
// //                             .catch(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }));
// //                     } else {
// //                         wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// //                     }
// //                 }
// //             });
// //         }, 300);
// //         return () => clearTimeout(timeoutId);
// //     }, [sandpack.files, wcInstance, blockId, readOnly]);

// //     useEffect(() => {
// //         if (!wcInstance || readOnly) return;
// //         let mounted = true;
// //         let inFlight = false;
// //         let intervalId: ReturnType<typeof setInterval> | null = null;
// //         let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// //         let watcher: { close?: () => void } | null = null;

// //         const walk = async (dir: string, relBase: string, acc: Record<string, string>) => {
// //             let entries: any[];
// //             try {
// //                 entries = await wcInstance.fs.readdir(dir, { withFileTypes: true } as any);
// //             } catch { return; }

// //             for (const entry of entries) {
// //                 const name = typeof entry === 'string' ? entry : entry.name;
// //                 const isDir = typeof entry === 'string' ? false : entry.isDirectory?.();
// //                 const relPath = `${relBase}/${name}`;
// //                 if (shouldIgnorePath(relPath)) continue;

// //                 if (isDir) {
// //                     await walk(`${dir}/${name}`, relPath, acc);
// //                 } else {
// //                     const isBinaryFile = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm', '.svg'].some(ext => name.toLowerCase().endsWith(ext));
// //                     if (isBinaryFile) continue;

// //                     try {
// //                         const content = await wcInstance.fs.readFile(`${dir}/${name}`, 'utf-8');
// //                         acc[relPath] = content;
// //                     } catch { }
// //                 }
// //             }
// //         };

// //         const syncFromDisk = async () => {
// //             if (isWritingRef.current || inFlight) return;
// //             inFlight = true;
// //             try {
// //                 const diskFiles: Record<string, string> = {};
// //                 await walk(`/${blockId}`, '', diskFiles);

// //                 for (const [relPath, content] of Object.entries(diskFiles)) {
// //                     if (!mounted) break;
// //                     const currentCode = sandpack.files[relPath]?.code;
// //                     if (content !== currentCode && content !== lastCodeRef.current[relPath]) {
// //                         lastCodeRef.current[relPath] = content;
// //                         canonicalKeysRef.current.add(relPath);
// //                         if (sandpack.files[relPath] !== undefined) {
// //                             sandpack.updateFile(relPath, content);
// //                         } else if (typeof sandpack.addFile === 'function') {
// //                             sandpack.addFile(relPath, content);
// //                         }
// //                     }
// //                 }
// //             } catch { }
// //             inFlight = false;
// //         };

// //         // React to actual filesystem changes instead of walking the whole tree on a
// //         // fixed timer forever. Falls back to polling if fs.watch isn't available.
// //         const setup = async () => {
// //             try {
// //                 const w = (wcInstance.fs as any).watch?.(`/${blockId}`, { recursive: true }, () => {
// //                     if (debounceTimer) clearTimeout(debounceTimer);
// //                     debounceTimer = setTimeout(syncFromDisk, 400);
// //                 });
// //                 if (w && typeof w.close === 'function') {
// //                     watcher = w;
// //                 } else {
// //                     throw new Error('fs.watch unavailable');
// //                 }
// //             } catch {
// //                 intervalId = setInterval(syncFromDisk, 2500);
// //             }
// //         };
// //         setup();

// //         return () => {
// //             mounted = false;
// //             if (intervalId) clearInterval(intervalId);
// //             if (debounceTimer) clearTimeout(debounceTimer);
// //             if (watcher?.close) { try { watcher.close(); } catch { } }
// //         };
// //     }, [wcInstance, blockId, sandpack, canonicalKeysRef, readOnly]);

// //     return null;
// // };

// // const StateHarvester: React.FC<{ readOnly: boolean, onChange: (answer: { snapshot: string; dependencies: Record<string, string>; immediate: boolean }) => void }> = ({ readOnly, onChange }) => {
// //     const { sandpack } = useSandpack();
// //     useEffect(() => {
// //         if (readOnly) return;

// //         const currentFiles: Record<string, string> = {};
// //         for (const [path, fileObj] of Object.entries(sandpack.files)) {
// //             const cleanPath = path.startsWith('/') ? path : `/${path}`;
// //             if (fileObj && !fileObj.hidden && typeof fileObj.code === 'string') {
// //                 currentFiles[cleanPath] = fileObj.code;
// //             }
// //         }

// //         const pkgJson = currentFiles['/package.json'];
// //         let dependencies = {};
// //         if (pkgJson) {
// //             try { dependencies = JSON.parse(pkgJson).dependencies || {}; } catch (e) { }
// //         }

// //         onChange({ snapshot: createSafeSnapshot(currentFiles), dependencies, immediate: false });
// //     }, [sandpack.files, readOnly, onChange]);
// //     return null;
// // };

// // // Shared across every CodeSandboxPlayer instance on the page so concurrent installs
// // // don't race on the same WebContainer cache. Each link resolves and is dereferenced
// // // once its install finishes (the 90s timeout above guarantees that) - this is always
// // // just "the current tail of the queue," not a growing history of past installs.
// // let globalNpmMutex: Promise<void> = Promise.resolve();

// // export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false }) => {
// //     const toast = useToast();
// //     const [isMaximized, setIsMaximized] = useState(false);
// //     const [pendingZipFile, setPendingZipFile] = useState<Blob | null>(null);

// //     const onChangeRef = useRef(onChange);

// //     const [showGithubModal, setShowGithubModal] = useState(false);
// //     const [githubUrl, setGithubUrl] = useState('');
// //     const [isFetchingGithub, setIsFetchingGithub] = useState(false);

// //     useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

// //     // Everything filesystem-related uses this instead of raw block.id from here on.
// //     const safeBlockId = useMemo(() => sanitizeBlockId(block?.id), [block?.id]);

// //     const assignedPort = useMemo(() => {
// //         let hash = 0;
// //         const str = safeBlockId;
// //         for (let i = 0; i < str.length; i++) {
// //             hash = str.charCodeAt(i) + ((hash << 5) - hash);
// //         }
// //         return 5000 + (Math.abs(hash) % 1000);
// //     }, [safeBlockId]);

// //     const [lockedFiles, setLockedFiles] = useState(() => {
// //         const rawSnapshot = learnerAns?.snapshot;
// //         const parsedSnapshot = typeof rawSnapshot === 'string' ? safeParseSnapshot(rawSnapshot) : (rawSnapshot ? { ...rawSnapshot } : null);
// //         const filesToLoad = parsedSnapshot || { ...(block.initialFiles || {}) };
// //         const tempTpl = block.template || detectTemplate(filesToLoad);
// //         return processProjectData(filesToLoad, assignedPort, tempTpl, safeBlockId);
// //     });

// //     const [template, setTemplate] = useState<"vite-react-ts" | "vite-react" | any>(() => detectTemplate(lockedFiles, block.template));

// //     const [runId, setRunId] = useState(Date.now().toString());
// //     const [previewUrl, setPreviewUrl] = useState<string>('');
// //     const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
// //     const [statusText, setStatusText] = useState("Booting OS...");
// //     const [wcReady, setWcReady] = useState(false);
// //     const [iframeKey, setIframeKey] = useState(0);
// //     const [bootFailed, setBootFailed] = useState(false);
// //     const previewOriginRef = useRef<string>('');

// //     const [activeTerminalTab, setActiveTerminalTab] = useState<'logs' | 'shell'>('logs');

// //     const debugTerminalRef = useRef<HTMLDivElement>(null);
// //     const shellTerminalRef = useRef<HTMLDivElement>(null);
// //     const debugXtermRef = useRef<Terminal | null>(null);
// //     const shellXtermRef = useRef<Terminal | null>(null);
// //     const debugFitRef = useRef<FitAddon | null>(null);
// //     const shellFitRef = useRef<FitAddon | null>(null);
// //     const devProcessRef = useRef<WebContainerProcess | null>(null);
// //     const shellProcessRef = useRef<WebContainerProcess | null>(null);
// //     const resizeObserverRef = useRef<ResizeObserver | null>(null);
// //     const shellResizeObserverRef = useRef<ResizeObserver | null>(null);

// //     const canonicalKeysRef = useRef<Set<string>>(new Set(Object.keys(lockedFiles).map(p => p.startsWith('/') ? p : '/' + p)));
// //     const latestFrontendFilesRef = useRef<Record<string, string>>({});
// //     const lockedFilesRef = useRef(lockedFiles);
// //     useEffect(() => { lockedFilesRef.current = lockedFiles; }, [lockedFiles]);

// //     const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// //     const lastSavedSnapshotRef = useRef<string>('');
// //     const warnedDroppedFilesRef = useRef<Set<string>>(new Set());

// //     const flushSave = useCallback((isImmediate = false) => {
// //         if (!onChangeRef.current || readOnly) return;

// //         const filteredSnapshot: Record<string, string> = {};
// //         for (const [path, content] of Object.entries(latestFrontendFilesRef.current)) {
// //             filteredSnapshot[path] = content;
// //         }

// //         const serialized = createSafeSnapshot(filteredSnapshot, (path) => {
// //             if (!warnedDroppedFilesRef.current.has(path)) {
// //                 warnedDroppedFilesRef.current.add(path);
// //                 toast?.error(`"${path}" is too large to save (max 500KB) and was left out of your saved project.`);
// //             }
// //         });

// //         if (!isImmediate && serialized === lastSavedSnapshotRef.current) return;

// //         let dependencies = {};
// //         if (filteredSnapshot['/package.json']) {
// //             try { dependencies = JSON.parse(filteredSnapshot['/package.json']).dependencies || {}; } catch { }
// //         }

// //         // Only mark this snapshot as "saved" once the caller confirms it persisted.
// //         // If onChange is async and rejects, lastSavedSnapshotRef stays stale on purpose
// //         // so the next autosave tick retries instead of assuming a failed write succeeded.
// //         const pendingSnapshot = serialized;
// //         const result = onChangeRef.current({ snapshot: serialized, dependencies, immediate: isImmediate });
// //         if (result && typeof (result as any).then === 'function') {
// //             (result as Promise<void>)
// //                 .then(() => { lastSavedSnapshotRef.current = pendingSnapshot; })
// //                 .catch(() => { toast?.error('Failed to save your latest changes. Retrying shortly…'); });
// //         } else {
// //             lastSavedSnapshotRef.current = pendingSnapshot;
// //         }
// //     }, [readOnly]);

// //     // const scheduleSave = useCallback(() => {
// //     //     if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// //     //     saveDebounceRef.current = setTimeout(() => {
// //     //         flushSave(false);
// //     //         saveDebounceRef.current = null;
// //     //     }, 1500);
// //     // }, [flushSave]);

// //     const scheduleSave = useCallback(() => {
// //         if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// //         saveDebounceRef.current = setTimeout(() => {
// //             flushSaveRef.current(false);
// //             saveDebounceRef.current = null;
// //         }, 1500);
// //     }, []); // 🚀 FIX: Empty array prevents loop triggers

// //     const handleFilesChange = useCallback((answerPayload: { snapshot: string }) => {
// //         if (readOnly) return;
// //         const files = safeParseSnapshot(answerPayload.snapshot);
// //         if (!files) return; // malformed snapshot - ignore rather than corrupt state
// //         latestFrontendFilesRef.current = files;
// //         scheduleSave();
// //     }, [scheduleSave, readOnly]);

// //     useEffect(() => {
// //         if (onChangeRef.current && !readOnly) flushSave(false);
// //         // eslint-disable-next-line react-hooks/exhaustive-deps
// //     }, []);

// //     // 🚀 FIX: Create a stable reference so effects NEVER tear down during a normal render
// //     const flushSaveRef = useRef(flushSave);
// //     useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

// //     useEffect(() => {
// //         const handleBeforeUnload = () => flushSaveRef.current(true);
// //         const handleVisibilityChange = () => { if (document.visibilityState === 'hidden') flushSaveRef.current(true); };

// //         window.addEventListener('beforeunload', handleBeforeUnload);
// //         document.addEventListener('visibilitychange', handleVisibilityChange);
// //         return () => {
// //             window.removeEventListener('beforeunload', handleBeforeUnload);
// //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// //         };
// //     }, []); // Empty array

// //     useEffect(() => {
// //         return () => {
// //             if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// //             flushSaveRef.current(true);
// //         };
// //     }, []); // Empty array

// //     useEffect(() => {
// //         const intervalId = setInterval(() => flushSaveRef.current(false), 5000);
// //         return () => clearInterval(intervalId);
// //     }, []); // Empty array

// //     useEffect(() => {
// //         const handleMessage = (e: MessageEvent) => {
// //             // Only trust messages actually coming from this block's own preview iframe.
// //             // Without this, any page holding a reference to this window could post
// //             // arbitrary text straight into the terminal.
// //             if (previewOriginRef.current && e.origin !== previewOriginRef.current) return;
// //             if (e.data?.source === 'preview-console' && e.data?.blockId === safeBlockId && debugXtermRef.current) {
// //                 let prefix = '\x1b[34m[LOG]\x1b[0m';
// //                 if (e.data.m === 'warn') prefix = '\x1b[33m[WARN]\x1b[0m';
// //                 if (e.data.m === 'error') prefix = '\x1b[31m[ERROR]\x1b[0m';
// //                 if (e.data.m === 'info') prefix = '\x1b[36m[INFO]\x1b[0m';
// //                 debugXtermRef.current.writeln(`${prefix} ${String(e.data.p).slice(0, 2000)}`);
// //             }
// //         };
// //         window.addEventListener('message', handleMessage);
// //         return () => window.removeEventListener('message', handleMessage);
// //     }, [safeBlockId]);


// //     const containerRef = useRef<HTMLDivElement>(null);
// //     const [hasBeenVisible, setHasBeenVisible] = useState(false);

// //     useEffect(() => {
// //         if (hasBeenVisible || !containerRef.current) return;
// //         const observer = new IntersectionObserver((entries) => {
// //             if (entries[0]?.isIntersecting) {
// //                 setHasBeenVisible(true);
// //                 observer.disconnect();
// //             }
// //         }, { threshold: 0.1 });
// //         observer.observe(containerRef.current);
// //         return () => observer.disconnect();
// //     }, [hasBeenVisible]);

// //     useEffect(() => {
// //         // Don't spin up a full WebContainer(install + dev server + 2 terminals) for a
// //         // block that's off-screen. Multiple code_sandbox blocks on one page is what
// //         // actually costs CPU/battery, not any single instance.
// //         if (!hasBeenVisible) return;

// //         let mounted = true;
// //         setPreviewUrl('');
// //         setStatusText("Initializing Environment...");

// //         const debugTerm = new Terminal({ theme: { background: '#0f172a', foreground: '#38bdf8' }, fontFamily: 'monospace', fontSize: 11, convertEol: true });
// //         const debugFit = new FitAddon();
// //         debugTerm.loadAddon(debugFit);
// //         debugXtermRef.current = debugTerm;
// //         debugFitRef.current = debugFit;

// //         const shellTerm = new Terminal({ theme: { background: '#0f172a', foreground: '#e2e8f0' }, fontFamily: 'monospace', fontSize: 11, convertEol: true, cursorBlink: true });
// //         const shellFit = new FitAddon();
// //         shellTerm.loadAddon(shellFit);
// //         shellXtermRef.current = shellTerm;
// //         shellFitRef.current = shellFit;

// //         if (debugTerminalRef.current) {
// //             try { debugTerm.open(debugTerminalRef.current); } catch (e) { }
// //             resizeObserverRef.current = new ResizeObserver(() => {
// //                 if (mounted && debugTerminalRef.current && debugTerminalRef.current.clientWidth > 0) try { debugFit.fit(); } catch (e) { }
// //             });
// //             resizeObserverRef.current.observe(debugTerminalRef.current);
// //         }

// //         if (shellTerminalRef.current) {
// //             try { shellTerm.open(shellTerminalRef.current); } catch (e) { }
// //             shellResizeObserverRef.current = new ResizeObserver(() => {
// //                 if (mounted && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0) {
// //                     try { shellFit.fit(); if (shellProcessRef.current) shellProcessRef.current.resize({ cols: shellTerm.cols, rows: shellTerm.rows }); } catch (e) { }
// //                 }
// //             });
// //             shellResizeObserverRef.current.observe(shellTerminalRef.current);
// //         }

// //         let shellInputListener: { dispose: () => void } | null = null;
// //         let serverReadyHandled = false;
// //         let serverReadyUnsub: (() => void) | null = null;

// //         const boot = async () => {
// //             // 🚀 FIX: Standardize the path to /home/project so NPM and Vite can always find it
// //             const WORK_DIR = `/${safeBlockId}`;

// //             try {
// //                 const wc = await getWebContainer();
// //                 if (!mounted) return;
// //                 setWcInstance(wc);

// //                 if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } devProcessRef.current = null; }
// //                 if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } shellProcessRef.current = null; }
// //                 try { await wc.fs.rm(WORK_DIR, { recursive: true, force: true }); } catch { }

// //                 debugTerm.writeln('\x1b[1;32m>> SYSTEM ONLINE - MOUNTING FILESYSTEM\x1b[0m');
// //                 const bootTemplate = block.template || detectTemplate(lockedFilesRef.current);
// //                 const tree = convertToTree(processProjectData(lockedFilesRef.current, assignedPort, bootTemplate, safeBlockId));

// //                 await wc.mount({ [safeBlockId]: { directory: tree } });

// //                 if (mounted) setWcReady(true);

// //                 await wc.fs.mkdir(`${WORK_DIR}/.bin`, { recursive: true });
// //                 await wc.fs.writeFile(`${WORK_DIR}/.bin/git`, GIT_SHIM_SCRIPT);

// //                 debugTerm.writeln('\x1b[1;33m>> Queuing npm install...\x1b[0m');
// //                 let installFailed = false;
// //                 await new Promise<void>(resolve => {
// //                     globalNpmMutex = globalNpmMutex.then(async () => {
// //                         if (!mounted) return resolve();
// //                         let installProcess: any = null;
// //                         try {
// //                             debugTerm.writeln('\x1b[1;33m>> Running npm install...\x1b[0m');
// //                             installProcess = await wc.spawn('npm', ['install', '--no-package-lock'], { cwd: WORK_DIR });

// //                             // 🚀 FIX: Catch broken streams so they don't crash the proxy
// //                             installProcess.output.pipeTo(new WritableStream({
// //                                 write: data => { if (mounted) debugTerm.write(data); }
// //                             })).catch(() => { });

// //                             // 🚀 FIX: 5 Minute timeout for heavy projects
// //                             const exitCode = await Promise.race([
// //                                 installProcess.exit,
// //                                 new Promise<number>((_, reject) => setTimeout(() => reject(new Error('npm install timed out after 5 minutes')), 300000))
// //                             ]);
// //                             if (exitCode !== 0) throw new Error("Installation process aborted.");
// //                         } catch (err: any) {
// //                             installFailed = true;
// //                             if (mounted) debugTerm.writeln(`\x1b[1;31m>> NPM Error: ${err.message || err}\x1b[0m`);
// //                             try { installProcess?.kill(); } catch { }
// //                         }
// //                         resolve();
// //                     });
// //                 });

// //                 if (!mounted) return;
// //                 if (installFailed) {
// //                     setStatusText("Boot Failed");
// //                     setBootFailed(true);
// //                     return;
// //                 }

// //                 debugTerm.writeln('\n\x1b[1;36m>> Booting local Vite telemetry server...\x1b[0m');
// //                 const devProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: WORK_DIR });
// //                 devProcessRef.current = devProcess;

// //                 devProcess.output.pipeTo(new WritableStream({
// //                     write: data => { if (mounted) debugTerm.write(data); }
// //                 })).catch(() => { });

// //                 const shellProcess = await wc.spawn('jsh', { terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 15 }, cwd: WORK_DIR });
// //                 shellProcessRef.current = shellProcess;

// //                 shellProcess.output.pipeTo(new WritableStream({
// //                     write: data => { if (mounted) shellTerm.write(data); }
// //                 })).catch(() => { });

// //                 const inputWriter = shellProcess.input.getWriter();
// //                 await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH"\nclear\n').catch(() => { });
// //                 shellInputListener = shellTerm.onData(data => {
// //                     if (mounted) inputWriter.write(data).catch(() => { });
// //                 });

// //                 serverReadyUnsub = wc.on('server-ready', (port, url) => {
// //                     if (!mounted || serverReadyHandled) return;
// //                     if (port !== assignedPort) return;

// //                     serverReadyHandled = true;
// //                     try { previewOriginRef.current = new URL(url).origin; } catch { }
// //                     setPreviewUrl(url);
// //                     setStatusText("Online");
// //                     debugTerm.writeln(`\n\x1b[1;32m>> Preview running on port ${port}\x1b[0m\n`);
// //                 });

// //             } catch (err: any) {
// //                 if (mounted) {
// //                     debugTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
// //                     setStatusText("Boot Failed");
// //                     setBootFailed(true);
// //                 }
// //             }
// //         };

// //         setBootFailed(false);
// //         boot();

// //         return () => {
// //             mounted = false;
// //             if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
// //             if (shellResizeObserverRef.current) shellResizeObserverRef.current.disconnect();
// //             if (shellInputListener) shellInputListener.dispose();
// //             if (serverReadyUnsub) serverReadyUnsub();
// //             debugTerm.dispose();
// //             shellTerm.dispose();
// //             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
// //             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }
// //         };

// //     }, [runId, template, assignedPort, safeBlockId, hasBeenVisible]);

// //     const [previewHeight, setPreviewHeight] = useState(400);
// //     const [isDragging, setIsDragging] = useState(false);

// //     const handleResizerMouseDown = (e: React.MouseEvent) => {
// //         e.preventDefault();
// //         setIsDragging(true);
// //         const startY = e.clientY;
// //         const startHeight = previewHeight;

// //         const handleMouseMove = (moveEvent: MouseEvent) => {
// //             setPreviewHeight(Math.max(10, Math.min(600, startHeight + (moveEvent.clientY - startY))));
// //         };

// //         const handleMouseUp = () => {
// //             setIsDragging(false);
// //             document.removeEventListener('mousemove', handleMouseMove);
// //             document.removeEventListener('mouseup', handleMouseUp);
// //         };

// //         document.addEventListener('mousemove', handleMouseMove);
// //         document.addEventListener('mouseup', handleMouseUp);
// //     };

// //     useEffect(() => {
// //         const timeoutId = setTimeout(() => {
// //             try {
// //                 if (debugXtermRef.current?.element && debugTerminalRef.current && debugTerminalRef.current.clientWidth > 0 && debugFitRef.current) {
// //                     debugFitRef.current.fit();
// //                 }
// //                 if (shellXtermRef.current?.element && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0 && shellFitRef.current) {
// //                     shellFitRef.current.fit();
// //                     if (shellProcessRef.current) {
// //                         shellProcessRef.current.resize({ cols: shellXtermRef.current.cols, rows: shellXtermRef.current.rows });
// //                     }
// //                 }
// //             } catch (e) { }
// //         }, 250);
// //         return () => clearTimeout(timeoutId);
// //     }, [isMaximized, activeTerminalTab]);

// //     // useEffect(() => {
// //     //     if (isMaximized) {
// //     //         document.documentElement.style.overflow = 'hidden';
// //     //         document.body.style.overflow = 'hidden';

// //     //         // 🚀 FIX: Escape the CSS "transform trap". This climbs the DOM tree and 
// //     //         // safely disables animations/transforms on parent divs while in fullscreen
// //     //         // so the IDE snaps to the true browser window edges.
// //     //         let el = containerRef.current?.parentElement;
// //     //         while (el && el !== document.body) {
// //     //             el.style.setProperty('transform', 'none', 'important');
// //     //             el.style.setProperty('filter', 'none', 'important');
// //     //             el.style.setProperty('perspective', 'none', 'important');
// //     //             el = el.parentElement;
// //     //         }
// //     //     } else {
// //     //         document.documentElement.style.overflow = '';
// //     //         document.body.style.overflow = '';

// //     //         let el = containerRef.current?.parentElement;
// //     //         while (el && el !== document.body) {
// //     //             el.style.removeProperty('transform');
// //     //             el.style.removeProperty('filter');
// //     //             el.style.removeProperty('perspective');
// //     //             el = el.parentElement;
// //     //         }
// //     //     }
// //     // }, [isMaximized]);
// //     useEffect(() => {
// //         if (isMaximized) {
// //             document.documentElement.style.overflow = 'hidden';
// //             document.body.style.overflow = 'hidden';

// //             let el = containerRef.current?.parentElement;
// //             while (el && el !== document.body) {
// //                 // Force no overflow on any scrollable ancestor
// //                 el.style.setProperty('overflow', 'hidden', 'important');
// //                 // Also remove transforms / filters that break fixed positioning
// //                 el.style.setProperty('transform', 'none', 'important');
// //                 el.style.setProperty('filter', 'none', 'important');
// //                 el.style.setProperty('perspective', 'none', 'important');
// //                 el = el.parentElement;
// //             }
// //         } else {
// //             document.documentElement.style.overflow = '';
// //             document.body.style.overflow = '';

// //             let el = containerRef.current?.parentElement;
// //             while (el && el !== document.body) {
// //                 el.style.removeProperty('overflow');
// //                 el.style.removeProperty('transform');
// //                 el.style.removeProperty('filter');
// //                 el.style.removeProperty('perspective');
// //                 el = el.parentElement;
// //             }
// //         }
// //     }, [isMaximized]);

// //     const containerStyle: React.CSSProperties = useMemo(() => isMaximized ? {
// //         // 🚀 FIX: Added strict bounding box (margin/padding 0, box-sizing) and bumped zIndex
// //         position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999, border: 'none', borderRadius: 0, overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column', margin: 0, padding: 0, boxSizing: 'border-box'
// //     } : {
// //         position: 'relative', width: '100%', height: '750px', marginTop: '1rem', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// //     }, [isMaximized]);

// //     const terminalTabBtnStyle = useCallback((active: boolean): React.CSSProperties => ({
// //         background: active ? '#334155' : 'transparent', border: 'none', color: active ? '#fff' : '#94a3b8',
// //         cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold'
// //     }), []);

// //     const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;
// //         setPendingZipFile(file); // This triggers the modal to open
// //         e.target.value = ''; // Reset input so they can re-upload the same file if canceled
// //     };

// //     // 🚀 NEW: Generalized function that accepts any Blob (File or Network Response)
// //     const processZipBlob = async (blob: Blob) => {
// //         const zip = new JSZip();
// //         const contents = await zip.loadAsync(blob);

// //         const allPaths = Object.keys(contents.files).filter(p => !contents.files[p].dir && !p.includes('__MACOSX') && !p.startsWith('.'));
// //         let commonPrefix: string | null = null;
// //         for (const p of allPaths) {
// //             const topFolder = p.split('/')[0];
// //             if (!p.includes('/')) { commonPrefix = null; break; }
// //             if (commonPrefix === null) commonPrefix = topFolder;
// //             else if (commonPrefix !== topFolder) { commonPrefix = null; break; }
// //         }

// //         const isBinaryFile = (path: string) => ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm', '.svg'].some(ext => path.toLowerCase().endsWith(ext));

// //         const newFiles: Record<string, string> = {};
// //         for (const path of allPaths) {
// //             const strippedPath = commonPrefix ? path.slice(commonPrefix.length + 1) : path;
// //             if (!strippedPath) continue;
// //             if (isBinaryFile(path)) {
// //                 newFiles[`/${strippedPath}`] = `__mlab_base64__${await contents.files[path].async('base64')}`;
// //             } else {
// //                 newFiles[`/${strippedPath}`] = await contents.files[path].async('string');
// //             }
// //         }

// //         const tempTpl = detectTemplate(newFiles);
// //         const cleanFiles = processProjectData(newFiles, assignedPort, tempTpl, block.id);

// //         setTemplate(tempTpl === 'create-react-app' ? 'vite-react' : tempTpl);
// //         setLockedFiles(cleanFiles);
// //         canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));
// //         latestFrontendFilesRef.current = {};
// //         setRunId(Date.now().toString());

// //         if (onChangeRef.current) onChangeRef.current({ snapshot: createSafeSnapshot(cleanFiles) });
// //         toast?.success("Project Imported Successfully!");
// //     };

// //     // Keep this for the local File Upload modal
// //     const confirmZipImport = async () => {
// //         if (!pendingZipFile) return;
// //         await processZipBlob(pendingZipFile);
// //         setPendingZipFile(null);
// //     };

// //     const handleGithubImport = async () => {
// //         if (!githubUrl.trim()) return;
// //         try {
// //             setIsFetchingGithub(true);

// //             // Extract user and repo from URL (e.g., https://github.com/facebook/react)
// //             const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
// //             if (!match) throw new Error("Invalid GitHub URL. Must be a valid repo link.");

// //             const user = match[1];
// //             const repo = match[2].replace('.git', '');

// //             // The GitHub API zipball endpoint supports cross-origin requests
// //             const response = await fetch(`https://api.github.com/repos/${user}/${repo}/zipball`);
// //             if (!response.ok) throw new Error("Could not fetch repo. Ensure it is public.");

// //             const blob = await response.blob();

// //             setShowGithubModal(false);
// //             setGithubUrl('');

// //             // 🚀 FIX: Instead of processing immediately, put it in the pending state.
// //             // This forces the "Overwrite Existing Code?" StatusModal to pop up!
// //             setPendingZipFile(blob);
// //         } catch (err: any) {
// //             toast?.error(err.message || "Failed to import from GitHub.");
// //         } finally {
// //             setIsFetchingGithub(false);
// //         }
// //     };

// //     const handleDownloadZip = async () => {
// //         const zip = new JSZip();
// //         const filesToZip = Object.keys(latestFrontendFilesRef.current).length > 0 ? latestFrontendFilesRef.current : lockedFiles;

// //         Object.entries(filesToZip).forEach(([path, content]) => {
// //             if (canonicalKeysRef.current.has(path)) {
// //                 const cleanPath = path.startsWith('/') ? path.substring(1) : path;
// //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) zip.file(cleanPath, content.substring(15), { base64: true });
// //                 else zip.file(cleanPath, content as string);
// //             }
// //         });
// //         const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
// //         const a = document.createElement('a'); a.href = url; a.download = `codetribe_project_${block.id}.zip`; a.click();
// //         URL.revokeObjectURL(url);
// //         toast?.success("Project Downloaded Successfully!");
// //     };

// //     return (
// //         <div ref={containerRef} style={containerStyle}>
// //             <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #334155', flexShrink: 0 }}>
// //                 <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                     <Code size={14} color="#3b82f6" /> {block.title || 'Live IDE'}
// //                     {readOnly && <span style={{ background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>GRADING MODE (LOCKED)</span>}
// //                 </span>
// //                 <div style={{ display: 'flex', gap: '8px' }}>
// //                     {!readOnly && (
// //                         <>
// //                             <label style={{ background: '#3b82f6', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                 <FolderArchive size={14} /> Import ZIP<input type="file" accept=".zip" hidden onChange={handleFileSelect} />
// //                             </label>
// //                             <button onClick={() => setShowGithubModal(true)} style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// //                                 <Github size={14} /> GitHub
// //                             </button>
// //                         </>
// //                     )}
// //                     <button onClick={handleDownloadZip} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><Download size={14} /> <span className="ap-hide-mobile">ZIP</span></button>
// //                     <button onClick={() => setIframeKey(k => k + 1)} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><RefreshCw size={14} /> Reload Preview</button>
// //                     <button onClick={() => setIsMaximized(!isMaximized)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>{isMaximized ? <Minimize size={14} /> : <Maximize size={14} />} {isMaximized ? 'Exit' : 'Fullscreen'}</button>
// //                 </div>
// //             </div>

// //             <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
// //                 <Group direction="horizontal" style={{ width: '100%', height: '100%' }}>
// //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
// //                         <style>{`.sp-layout, .sp-wrapper { height: 100% !important; max-height: 100% !important; min-height: 0 !important; min-width: 0 !important; } [data-panel-group], [data-panel] { height: 100% !important; }`}</style>
// //                         <SandpackProvider key={runId} template={template === 'create-react-app' ? 'vite-react' : template} files={lockedFiles} theme="dark">
// //                             <SandpackLayout style={{ flex: 1, height: '100%', border: 'none', borderRadius: 0, overflow: 'hidden', minHeight: 0 }}>
// //                                 <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', minWidth: 0 }}>
// //                                     <SandpackFileActions readOnly={readOnly} canonicalKeysRef={canonicalKeysRef} wcInstance={wcInstance} blockId={block.id} />
// //                                     <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
// //                                         <div style={{ width: '160px', borderRight: '1px solid #334155', flexShrink: 0, overflowY: 'auto', overflowX: 'hidden' }}><SandpackFileExplorer style={{ height: '100%' }} /></div>
// //                                         <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}><SandpackCodeEditor showTabs closableTabs style={{ height: '100%' }} readOnly={readOnly} /></div>
// //                                     </div>
// //                                 </div>
// //                             </SandpackLayout>
// //                             {!readOnly && wcReady && <WebContainerSyncBridge wcInstance={wcInstance} blockId={block.id} canonicalKeysRef={canonicalKeysRef} readOnly={readOnly} />}
// //                             {!readOnly && <StateHarvester readOnly={readOnly} onChange={handleFilesChange} />}
// //                         </SandpackProvider>
// //                     </Panel>
// //                     <Separator style={{ width: '4px', background: '#334155', cursor: 'col-resize' }} />
// //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', overflow: 'hidden' }}>
// //                         <div style={{ height: `${previewHeight}px`, position: 'relative', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
// //                             {previewUrl ? <iframe key={iframeKey} src={`${previewUrl}${previewUrl.includes('?') ? '&' : '?'}t=${iframeKey}`} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" /> : (
// //                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', gap: '10px' }}>
// //                                     {bootFailed ? <AlertTriangle size={24} color="#ef4444" /> : <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />}
// //                                     <span style={{ fontSize: '0.85rem' }}>{statusText}</span>
// //                                     {bootFailed && (
// //                                         <button onClick={() => { setBootFailed(false); setRunId(Date.now().toString()); }} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                             <RefreshCw size={13} /> Retry
// //                                         </button>
// //                                     )}
// //                                 </div>
// //                             )}
// //                             {isDragging && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />}
// //                         </div>
// //                         <div onMouseDown={handleResizerMouseDown} style={{ height: '4px', background: '#334155', cursor: 'row-resize', flexShrink: 0 }} />
// //                         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
// //                             <div style={{ padding: '4px 8px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
// //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'logs')} onClick={() => setActiveTerminalTab('logs')}><ScrollText size={12} /> Logs</button>
// //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'shell')} onClick={() => setActiveTerminalTab('shell')}><SquareTerminal size={12} /> Shell</button>
// //                             </div>
// //                             <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
// //                                 <div style={{ position: 'absolute', inset: 0, padding: '8px', visibility: activeTerminalTab === 'logs' ? 'visible' : 'hidden', pointerEvents: activeTerminalTab === 'logs' ? 'auto' : 'none' }}>
// //                                     <div ref={debugTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
// //                                 </div>
// //                                 <div style={{ position: 'absolute', inset: 0, padding: '8px', visibility: activeTerminalTab === 'shell' ? 'visible' : 'hidden', pointerEvents: activeTerminalTab === 'shell' ? 'auto' : 'none' }}>
// //                                     <div ref={shellTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     </Panel>
// //                 </Group>
// //             </div>

// //             {showGithubModal && (
// //                 <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //                     <div style={{ background: '#1e293b', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
// //                         <h3 style={{ color: '#fff', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><Github size={20} /> Import from GitHub</h3>
// //                         <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '15px' }}>Enter the URL of a public GitHub repository. This will completely overwrite your current code.</p>

// //                         <input
// //                             type="text"
// //                             placeholder="https://github.com/user/repo"
// //                             value={githubUrl}
// //                             onChange={(e) => setGithubUrl(e.target.value)}
// //                             style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', marginBottom: '20px', fontSize: '0.9rem', outline: 'none' }}
// //                         />

// //                         <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
// //                             <button onClick={() => setShowGithubModal(false)} disabled={isFetchingGithub} style={{ padding: '8px 16px', background: 'transparent', color: '#cbd5e1', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
// //                             <button onClick={handleGithubImport} disabled={isFetchingGithub || !githubUrl} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', opacity: (isFetchingGithub || !githubUrl) ? 0.5 : 1 }}>
// //                                 {isFetchingGithub ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
// //                                 {isFetchingGithub ? 'Pulling...' : 'Import Repo'}
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {pendingZipFile && (
// //                 <StatusModal
// //                     type="warning"
// //                     title="Overwrite Existing Code?"
// //                     message="Importing this ZIP file will completely replace your current project files. This action cannot be undone. Do you want to proceed?"
// //                     confirmText="Yes, Import"
// //                     onClose={confirmZipImport}
// //                     onCancel={() => setPendingZipFile(null)}
// //                 />
// //             )}
// //         </div>
// //     );
// // };

// // export default CodeSandboxPlayer;



// // // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // // import { Code, Maximize, Minimize, Save, CheckCircle, TerminalSquare, Play, Loader2, Plus, X, Trash2, Pencil, FilePlus, Download, Github, FolderArchive, UploadCloud, RefreshCw, AlertTriangle, ScrollText, SquareTerminal } from 'lucide-react';
// // // import {
// // //     SandpackProvider,
// // //     SandpackLayout,
// // //     SandpackCodeEditor,
// // //     SandpackFileExplorer,
// // //     useSandpack
// // // } from "@codesandbox/sandpack-react";
// // // import { useToast } from '../Toast/Toast';
// // // import JSZip from 'jszip';
// // // import { Group, Panel, Separator } from 'react-resizable-panels';
// // // import { StatusModal } from '../StatusModal/StatusModal';
// // // import { Terminal } from 'xterm';
// // // import { FitAddon } from 'xterm-addon-fit';
// // // import 'xterm/css/xterm.css';
// // // import { getWebContainer } from './webcontainerManager';
// // // import type { FileSystemTree, WebContainer } from '@webcontainer/api';

// // // export interface CodeSandboxPlayerProps {
// // //     block: any;
// // //     learnerAns: any;
// // //     onChange?: (answer: any) => void;
// // //     readOnly?: boolean;
// // // }

// // // // Paths / dirs we never want to pull back from disk into the editor or into the saved snapshot.
// // // const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache'];
// // // const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

// // // const shouldIgnorePath = (relPath: string) => {
// // //     const parts = relPath.split('/').filter(Boolean);
// // //     if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
// // //     const fileName = parts[parts.length - 1] || '';
// // //     if (SYNC_IGNORE_FILES.includes(fileName)) return true;
// // //     if (fileName.endsWith('.log')) return true;
// // //     return false;
// // // };

// // // // 🚀 Aggressive backend crash protection to prevent Firebase 500/503 errors
// // // const createSafeSnapshot = (files: Record<string, string>) => {
// // //     const safeFiles: Record<string, string> = {};
// // //     for (const [path, content] of Object.entries(files)) {
// // //         if (typeof content === 'string' && content.startsWith('__mlab_base64__')) continue;
// // //         if (path.includes('package-lock.json') || path.includes('node_modules')) continue;

// // //         if (content.length > 100000) {
// // //             console.warn(`File ${path} is too large (${content.length} bytes). Excluding from auto-save.`);
// // //             continue;
// // //         }
// // //         safeFiles[path] = content;
// // //     }
// // //     return JSON.stringify(safeFiles);
// // // };

// // // const convertToTree = (files: Record<string, string>): FileSystemTree => {
// // //     const tree: FileSystemTree = {};
// // //     for (const [path, content] of Object.entries(files)) {
// // //         const parts = path.split('/').filter(Boolean);
// // //         let current = tree;
// // //         for (let i = 0; i < parts.length; i++) {
// // //             const part = parts[i];
// // //             if (i === parts.length - 1) {
// // //                 let fileContent: string | Uint8Array = content;
// // //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) {
// // //                     const b64 = content.substring(15);
// // //                     const binStr = atob(b64);
// // //                     const arr = new Uint8Array(binStr.length);
// // //                     for (let j = 0; j < binStr.length; j++) {
// // //                         arr[j] = binStr.charCodeAt(j);
// // //                     }
// // //                     fileContent = arr;
// // //                 }
// // //                 current[part] = { file: { contents: fileContent } };
// // //             } else {
// // //                 if (!current[part]) current[part] = { directory: {} };
// // //                 current = (current[part] as any).directory;
// // //             }
// // //         }
// // //     }
// // //     return tree;
// // // };

// // // const detectTemplate = (files: Record<string, string>): "vite-react-ts" | "vite-react" => {
// // //     const isTS = Object.keys(files).some(p => p.endsWith('.tsx') || p.endsWith('.ts')) || !!files['/tsconfig.json'];
// // //     return isTS ? "vite-react-ts" : "vite-react";
// // // };

// // // const processProjectData = (rawFiles: Record<string, string>, targetPort: number) => {
// // //     const out = { ...rawFiles };

// // //     Object.keys(out).forEach(k => {
// // //         if (k.endsWith('.lockb') || k.endsWith('.lock') || k.includes('node_modules') || k.endsWith('.log')) delete out[k];
// // //         if (k.toLowerCase().includes('vite.config')) delete out[k];
// // //         if (k.startsWith('/dependencies') || k.startsWith('/files')) delete out[k];
// // //     });

// // //     if (!out['/package.json']) {
// // //         out['/package.json'] = JSON.stringify({
// // //             name: "mlab-recovered-project",
// // //             type: "module",
// // //             dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0" },
// // //             devDependencies: { "vite": "^4.5.3", "@vitejs/plugin-react": "^4.2.1", "esbuild-wasm": "^0.20.2", "@rollup/wasm-node": "^4.22.4" },
// // //             scripts: { "dev": "vite", "build": "vite build", "preview": "vite preview" }
// // //         }, null, 2);
// // //     } else {
// // //         try {
// // //             const pkg = JSON.parse(out['/package.json']);
// // //             pkg.type = "module";

// // //             pkg.dependencies = pkg.dependencies || {};
// // //             pkg.dependencies['react'] = pkg.dependencies['react'] || "^18.2.0";
// // //             pkg.dependencies['react-dom'] = pkg.dependencies['react-dom'] || "^18.2.0";

// // //             pkg.devDependencies = pkg.devDependencies || {};
// // //             pkg.devDependencies['vite'] = "^4.5.3";
// // //             pkg.devDependencies['@vitejs/plugin-react'] = "^4.2.1";
// // //             pkg.devDependencies['esbuild-wasm'] = "^0.20.2";
// // //             pkg.devDependencies['@rollup/wasm-node'] = "^4.22.4";
// // //             pkg.scripts = pkg.scripts || {};
// // //             pkg.scripts.dev = "vite";

// // //             delete pkg.engines;
// // //             delete pkg.packageManager;
// // //             out['/package.json'] = JSON.stringify(pkg, null, 2);
// // //         } catch (e) { }
// // //     }

// // //     if (!out['/index.html'] && !out['/public/index.html']) {
// // //         out['/index.html'] = '<!DOCTYPE html><html lang="en"><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>';
// // //     }

// // //     if (!out['/src/main.jsx'] && !out['/src/main.tsx'] && !out['/src/index.jsx'] && !out['/src/index.tsx']) {
// // //         out['/src/main.jsx'] = 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.jsx";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);';
// // //     }

// // //     if (!out['/src/App.jsx'] && !out['/src/App.tsx']) {
// // //         out['/src/App.jsx'] = 'export default function App() { return <h1>Environment Healed Successfully!</h1>; }';
// // //     }

// // //     out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    port: ${targetPort},\n    strictPort: true,\n    watch: {\n      usePolling: true\n    },\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;

// // //     const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
// // //     const ext = isTSProject ? 'tsx' : 'jsx';

// // //     if (out['/App.jsx'] && !out['/src/App.jsx']) out['/src/App.jsx'] = out['/App.jsx'];
// // //     if (out['/App.tsx'] && !out['/src/App.tsx']) out['/src/App.tsx'] = out['/App.tsx'];

// // //     const realAppPath = out['/src/App.tsx'] ? './src/App.tsx' : out['/src/App.jsx'] ? './src/App.jsx' : null;
// // //     const realMainPath = out['/src/main.tsx'] ? './src/main.tsx' : out['/src/main.jsx'] ? './src/main.jsx' : out['/src/index.tsx'] ? './src/index.tsx' : out['/src/index.jsx'] ? './src/index.jsx' : null;
// // //     const realStylesPath = out['/src/index.css'] ? './src/index.css' : out['/src/App.css'] ? './src/App.css' : null;

// // //     delete out['/App.tsx']; delete out['/App.jsx']; delete out['/App.js'];
// // //     delete out['/index.tsx']; delete out['/index.jsx']; delete out['/index.js'];
// // //     delete out['/main.tsx']; delete out['/main.jsx']; delete out['/main.js'];
// // //     delete out['/styles.css'];

// // //     if (realAppPath) out[`/App.${ext}`] = `export { default } from "${realAppPath}";\n`;
// // //     if (realMainPath) out[`/main.${ext}`] = `import "${realMainPath}";\n`;
// // //     if (realStylesPath) out['/styles.css'] = `@import "${realStylesPath}";\n`;

// // //     const consoleInterceptor = `
// // //     <script>
// // //       (function() {
// // //         const orig = { ...console };
// // //         ['log', 'warn', 'error', 'info'].forEach(m => {
// // //           console[m] = (...args) => {
// // //             orig[m](...args);
// // //             try { window.parent.postMessage({ source: 'preview-console', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*'); } catch(e) {}
// // //           };
// // //         });
// // //         window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', m: 'error', p: e.message }, '*'));
// // //       })();
// // //     </script>`;

// // //     let html = out['/index.html'] || out['/public/index.html'] || '';

// // //     // 🚀 THE FIX: Strict hierarchical locator prevents the script tag from preceding the DOCTYPE node
// // //     if (html && !html.includes("source: 'preview-console'")) {
// // //         if (html.includes('<head>')) {
// // //             html = html.replace('<head>', `<head>\n${consoleInterceptor}`);
// // //         } else if (html.includes('<html>')) {
// // //             html = html.replace('<html>', `<html>\n<head>\n${consoleInterceptor}\n</head>`);
// // //         } else if (html.includes('<!DOCTYPE html>')) {
// // //             html = html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n<head>\n${consoleInterceptor}\n</head>`);
// // //         } else {
// // //             html = `<!DOCTYPE html>\n<html>\n<head>\n${consoleInterceptor}\n</head>\n<body>\n${html}\n</body>\n</html>`;
// // //         }
// // //     }

// // //     out['/index.html'] = html;
// // //     if (out['/public/index.html']) delete out['/public/index.html'];

// // //     return out;
// // // };

// // // const GIT_SHIM_SCRIPT = `#!/usr/bin/env node
// // // console.log("\\n\\x1b[1;33m⚠️  Git is not natively supported in this browser environment.\\x1b[0m");
// // // console.log("\\x1b[1;36mHOW TO MANAGE YOUR CODE:\\x1b[0m");
// // // console.log("  • \\x1b[1;34mClone/Pull:\\x1b[0m Use \\x1b[1;32mnpx degit <github-username>/<repo>\\x1b[0m to download templates.");
// // // console.log("  • \\x1b[1;34mSave/Push:\\x1b[0m Your code is actively auto-saving to the platform.");
// // // console.log("  • \\x1b[1;34mExport:\\x1b[0m Click \\x1b[1;32mDownload ZIP\\x1b[0m in the toolbar above to get your files locally.\\n");
// // // `;

// // // const SandpackFileActions: React.FC<{ readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>>, wcInstance: WebContainer | null, blockId: string }> = ({ readOnly, canonicalKeysRef, wcInstance, blockId }) => {
// // //     const { sandpack } = useSandpack();
// // //     const [action, setAction] = useState<'idle' | 'add' | 'rename'>('idle');
// // //     const [inputValue, setInputValue] = useState('');

// // //     if (readOnly) return null;

// // //     const handleAction = async () => {
// // //         if (!inputValue.trim()) { setAction('idle'); return; }
// // //         if (action === 'add') {
// // //             let path = inputValue.trim();
// // //             if (!path.startsWith('/')) path = '/' + path;
// // //             if (sandpack.files[path]) { window.alert("A file with this path already exists."); return; }

// // //             if (typeof sandpack.addFile === 'function') sandpack.addFile(path, "// New file\n");
// // //             else sandpack.updateFile(path, "// New file\n");
// // //             if (typeof sandpack.setActiveFile === 'function') sandpack.setActiveFile(path);
// // //             canonicalKeysRef.current.add(path);

// // //             if (wcInstance) {
// // //                 try {
// // //                     const parts = path.split('/').filter(Boolean);
// // //                     if (parts.length > 1) await wcInstance.fs.mkdir('/' + blockId + '/' + parts.slice(0, -1).join('/'), { recursive: true });
// // //                     await wcInstance.fs.writeFile(`/${blockId}${path}`, "// New file\n");
// // //                 } catch (e) { }
// // //             }
// // //         } else if (action === 'rename') {
// // //             const oldPath = sandpack.activeFile;
// // //             let newPath = inputValue.trim();
// // //             if (!newPath.startsWith('/')) newPath = '/' + newPath;

// // //             if (newPath !== oldPath) {
// // //                 if (sandpack.files[newPath]) { window.alert("A file with that name already exists."); return; }
// // //                 const content = sandpack.files[oldPath].code;
// // //                 if (typeof sandpack.addFile === 'function') {
// // //                     sandpack.addFile(newPath, content);
// // //                     sandpack.deleteFile(oldPath);
// // //                     sandpack.setActiveFile(newPath);
// // //                 }
// // //                 canonicalKeysRef.current.add(newPath);
// // //                 canonicalKeysRef.current.delete(oldPath);

// // //                 if (wcInstance) {
// // //                     try {
// // //                         const parts = newPath.split('/').filter(Boolean);
// // //                         if (parts.length > 1) await wcInstance.fs.mkdir('/' + blockId + '/' + parts.slice(0, -1).join('/'), { recursive: true });
// // //                         await wcInstance.fs.writeFile(`/${blockId}${newPath}`, content);
// // //                         await wcInstance.fs.rm(`/${blockId}${oldPath}`);
// // //                     } catch (e) { }
// // //                 }
// // //             }
// // //         }
// // //         setAction('idle');
// // //         setInputValue('');
// // //     };

// // //     const handleDelete = async () => {
// // //         const path = sandpack.activeFile;
// // //         if (Object.keys(sandpack.files).length <= 1) { window.alert("You cannot delete the last remaining file."); return; }
// // //         if (window.confirm(`Are you sure you want to delete ${path}?`)) {
// // //             if (typeof sandpack.deleteFile === 'function') sandpack.deleteFile(path);
// // //             canonicalKeysRef.current.delete(path);
// // //             if (wcInstance) { try { await wcInstance.fs.rm(`/${blockId}${path}`); } catch (e) { } }
// // //         }
// // //     };

// // //     const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', transition: 'color 0.2s' };

// // //     return (
// // //         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#252526', padding: '6px 16px', borderBottom: '1px solid #333', flexShrink: 0, minHeight: '36px' }}>
// // //             {action === 'idle' ? (
// // //                 <><span style={{ fontSize: '0.7rem', color: '#ccc', fontWeight: 600, letterSpacing: '0.5px' }}>EXPLORER</span>
// // //                     <div style={{ display: 'flex', gap: '6px' }}>
// // //                         <button onClick={() => { setAction('add'); setInputValue(''); }} style={iconBtnStyle}><FilePlus size={15} /></button>
// // //                         <button onClick={() => { setAction('rename'); setInputValue(sandpack.activeFile); }} style={iconBtnStyle}><Pencil size={14} /></button>
// // //                         <button onClick={handleDelete} style={{ ...iconBtnStyle, color: '#ef4444' }}><Trash2 size={15} /></button>
// // //                     </div></>
// // //             ) : (
// // //                 <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px' }}>
// // //                     <span style={{ fontSize: '0.75rem', color: action === 'add' ? '#10b981' : '#eab308', fontWeight: 'bold' }}>{action === 'add' ? 'NEW:' : 'RENAME:'}</span>
// // //                     <input autoFocus value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAction(); if (e.key === 'Escape') setAction('idle'); }} onBlur={() => { if (inputValue.trim() && inputValue !== sandpack.activeFile) handleAction(); else setAction('idle'); }} style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: `1px solid ${action === 'add' ? '#10b981' : '#eab308'}`, outline: 'none', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px' }} />
// // //                 </div>
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // const WebContainerSyncBridge: React.FC<{
// // //     wcInstance: WebContainer | null,
// // //     blockId: string,
// // //     canonicalKeysRef: React.MutableRefObject<Set<string>>,
// // // }> = ({ wcInstance, blockId, canonicalKeysRef }) => {
// // //     const { sandpack } = useSandpack();
// // //     const lastCodeRef = useRef<Record<string, string>>({});
// // //     const isWritingRef = useRef<boolean>(false);

// // //     if (Object.keys(lastCodeRef.current).length === 0) {
// // //         Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // //             lastCodeRef.current[path] = fileObj.code;
// // //         });
// // //     }

// // //     // Direction A: Sync Editor edits down to OS disk safely
// // //     useEffect(() => {
// // //         if (!wcInstance) return;
// // //         const timeoutId = setTimeout(() => {
// // //             Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // //                 const code = fileObj.code;
// // //                 if (code !== undefined && lastCodeRef.current[path] !== code) {
// // //                     lastCodeRef.current[path] = code;
// // //                     let outCode: string | Uint8Array = code;
// // //                     if (typeof code === 'string' && code.startsWith('__mlab_base64__')) {
// // //                         const binStr = atob(code.substring(15));
// // //                         const arr = new Uint8Array(binStr.length);
// // //                         for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// // //                         outCode = arr;
// // //                     }
// // //                     const fullPath = `/${blockId}${path.startsWith('/') ? path : `/${path}`}`;
// // //                     const parts = fullPath.split('/').filter(Boolean);
// // //                     isWritingRef.current = true;
// // //                     if (parts.length > 1) {
// // //                         wcInstance.fs.mkdir('/' + parts.slice(0, -1).join('/'), { recursive: true })
// // //                             .then(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }))
// // //                             .catch(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }));
// // //                     } else {
// // //                         wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// // //                     }
// // //                 }
// // //             });
// // //         }, 300);
// // //         return () => clearTimeout(timeoutId);
// // //     }, [sandpack.files, wcInstance, blockId]);

// // //     // Direction B: Walk the WHOLE project tree on disk periodically
// // //     useEffect(() => {
// // //         if (!wcInstance) return;
// // //         let mounted = true;
// // //         let inFlight = false;

// // //         const walk = async (dir: string, relBase: string, acc: Record<string, string>) => {
// // //             let entries: any[];
// // //             try {
// // //                 entries = await wcInstance.fs.readdir(dir, { withFileTypes: true } as any);
// // //             } catch (e) { return; }

// // //             for (const entry of entries) {
// // //                 const name = typeof entry === 'string' ? entry : entry.name;
// // //                 const isDir = typeof entry === 'string' ? false : entry.isDirectory?.();
// // //                 const relPath = `${relBase}/${name}`;
// // //                 if (shouldIgnorePath(relPath)) continue;

// // //                 if (isDir) {
// // //                     await walk(`${dir}/${name}`, relPath, acc);
// // //                 } else {
// // //                     try {
// // //                         const content = await wcInstance.fs.readFile(`${dir}/${name}`, 'utf-8');
// // //                         acc[relPath] = content;
// // //                     } catch (e) { /* binary or unreadable, skip */ }
// // //                 }
// // //             }
// // //         };

// // //         const poll = async () => {
// // //             if (isWritingRef.current || inFlight) return;
// // //             inFlight = true;
// // //             try {
// // //                 const diskFiles: Record<string, string> = {};
// // //                 await walk(`/${blockId}`, '', diskFiles);

// // //                 for (const [relPath, content] of Object.entries(diskFiles)) {
// // //                     if (!mounted) break;
// // //                     const currentCode = sandpack.files[relPath]?.code;
// // //                     if (content !== currentCode && content !== lastCodeRef.current[relPath]) {
// // //                         lastCodeRef.current[relPath] = content;
// // //                         canonicalKeysRef.current.add(relPath);
// // //                         if (sandpack.files[relPath] !== undefined) {
// // //                             sandpack.updateFile(relPath, content);
// // //                         } else if (typeof sandpack.addFile === 'function') {
// // //                             sandpack.addFile(relPath, content);
// // //                         }
// // //                     }
// // //                 }
// // //             } catch (e) { /* non-fatal, retry next tick */ }
// // //             inFlight = false;
// // //         };

// // //         const intervalId = setInterval(poll, 2500);
// // //         return () => {
// // //             mounted = false;
// // //             clearInterval(intervalId);
// // //         };
// // //     }, [wcInstance, blockId, sandpack, canonicalKeysRef]);

// // //     return null;
// // // };

// // // const StateHarvester: React.FC<{ onFilesChange: (files: Record<string, string>) => void }> = ({ onFilesChange }) => {
// // //     const { sandpack } = useSandpack();
// // //     useEffect(() => {
// // //         const currentFiles: Record<string, string> = {};
// // //         for (const [path, fileObj] of Object.entries(sandpack.files)) {
// // //             const cleanPath = path.startsWith('/') ? path : `/${path}`;
// // //             if (fileObj && !fileObj.hidden && typeof fileObj.code === 'string') {
// // //                 currentFiles[cleanPath] = fileObj.code;
// // //             }
// // //         }
// // //         onFilesChange(currentFiles);
// // //     }, [sandpack.files, onFilesChange]);
// // //     return null;
// // // };

// // // export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false }) => {
// // //     const toast = useToast();
// // //     const [isMaximized, setIsMaximized] = useState(false);
// // //     const onChangeRef = useRef(onChange);
// // //     useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

// // //     const assignedPort = useMemo(() => {
// // //         let hash = 0;
// // //         const str = String(block?.id || 'mlab');
// // //         for (let i = 0; i < str.length; i++) {
// // //             hash = str.charCodeAt(i) + ((hash << 5) - hash);
// // //         }
// // //         return 5000 + (Math.abs(hash) % 1000);
// // //     }, [block.id]);

// // //     const [lockedFiles, setLockedFiles] = useState(() => {
// // //         const filesToLoad = learnerAns?.snapshot ? (typeof learnerAns.snapshot === 'string' ? JSON.parse(learnerAns.snapshot) : { ...learnerAns.snapshot }) : { ...(block.initialFiles || {}) };
// // //         return processProjectData(filesToLoad, assignedPort);
// // //     });
// // //     const [template, setTemplate] = useState<"vite-react-ts" | "vite-react">(() => detectTemplate(lockedFiles));

// // //     const [runId, setRunId] = useState(Date.now().toString());
// // //     const [previewUrl, setPreviewUrl] = useState<string>('');
// // //     const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
// // //     const [statusText, setStatusText] = useState("Booting OS...");
// // //     const [wcReady, setWcReady] = useState(false);
// // //     const [iframeKey, setIframeKey] = useState(0);

// // //     const [activeTerminalTab, setActiveTerminalTab] = useState<'logs' | 'shell'>('logs');

// // //     const debugTerminalRef = useRef<HTMLDivElement>(null);
// // //     const shellTerminalRef = useRef<HTMLDivElement>(null);
// // //     const debugXtermRef = useRef<Terminal | null>(null);
// // //     const shellXtermRef = useRef<Terminal | null>(null);
// // //     const debugFitRef = useRef<FitAddon | null>(null);
// // //     const shellFitRef = useRef<FitAddon | null>(null);
// // //     const devProcessRef = useRef<any>(null);
// // //     const shellProcessRef = useRef<any>(null);
// // //     const resizeObserverRef = useRef<ResizeObserver | null>(null);

// // //     const canonicalKeysRef = useRef<Set<string>>(new Set(Object.keys(lockedFiles).map(p => p.startsWith('/') ? p : '/' + p)));
// // //     const latestFrontendFilesRef = useRef<Record<string, string>>({});

// // //     const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// // //     const flushSave = useCallback(() => {
// // //         if (!onChangeRef.current || readOnly) return;
// // //         const filteredSnapshot: Record<string, string> = {};
// // //         for (const [path, content] of Object.entries(latestFrontendFilesRef.current)) {
// // //             if (canonicalKeysRef.current.has(path)) {
// // //                 filteredSnapshot[path] = content;
// // //             }
// // //         }
// // //         onChangeRef.current({ snapshot: createSafeSnapshot(filteredSnapshot), lastSavedAt: new Date().toISOString() });
// // //     }, [readOnly]);

// // //     const scheduleSave = useCallback(() => {
// // //         if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// // //         saveDebounceRef.current = setTimeout(() => {
// // //             flushSave();
// // //             saveDebounceRef.current = null;
// // //         }, 1500);
// // //     }, [flushSave]);

// // //     const handleFilesChange = useCallback((files: Record<string, string>) => {
// // //         latestFrontendFilesRef.current = files;
// // //         scheduleSave();
// // //     }, [scheduleSave]);

// // //     useEffect(() => {
// // //         if (onChangeRef.current && !readOnly) {
// // //             onChangeRef.current({ snapshot: createSafeSnapshot(lockedFiles), lastSavedAt: new Date().toISOString() });
// // //         }
// // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // //     }, []);

// // //     useEffect(() => {
// // //         const handleBeforeUnload = () => flushSave();
// // //         window.addEventListener('beforeunload', handleBeforeUnload);
// // //         return () => {
// // //             window.removeEventListener('beforeunload', handleBeforeUnload);
// // //             flushSave();
// // //         };
// // //     }, [flushSave]);

// // //     useEffect(() => {
// // //         const intervalId = setInterval(flushSave, 5000);
// // //         return () => clearInterval(intervalId);
// // //     }, [flushSave]);

// // //     useEffect(() => {
// // //         const handleMessage = (e: MessageEvent) => {
// // //             if (e.data?.source === 'preview-console' && debugXtermRef.current) {
// // //                 let prefix = '\x1b[34m[LOG]\x1b[0m';
// // //                 if (e.data.m === 'warn') prefix = '\x1b[33m[WARN]\x1b[0m';
// // //                 if (e.data.m === 'error') prefix = '\x1b[31m[ERROR]\x1b[0m';
// // //                 if (e.data.m === 'info') prefix = '\x1b[36m[INFO]\x1b[0m';
// // //                 debugXtermRef.current.writeln(`${prefix} ${e.data.p}`);
// // //             }
// // //         };
// // //         window.addEventListener('message', handleMessage);
// // //         return () => window.removeEventListener('message', handleMessage);
// // //     }, []);

// // //     useEffect(() => {
// // //         let mounted = true;
// // //         setPreviewUrl('');
// // //         setStatusText("Initializing Environment...");

// // //         const debugTerm = new Terminal({ theme: { background: '#0f172a', foreground: '#38bdf8' }, fontFamily: 'monospace', fontSize: 11, convertEol: true });
// // //         const debugFit = new FitAddon();
// // //         debugTerm.loadAddon(debugFit);
// // //         debugXtermRef.current = debugTerm;
// // //         debugFitRef.current = debugFit;

// // //         const shellTerm = new Terminal({ theme: { background: '#0f172a', foreground: '#e2e8f0' }, fontFamily: 'monospace', fontSize: 11, convertEol: true, cursorBlink: true });
// // //         const shellFit = new FitAddon();
// // //         shellTerm.loadAddon(shellFit);
// // //         shellXtermRef.current = shellTerm;
// // //         shellFitRef.current = shellFit;

// // //         if (debugTerminalRef.current) {
// // //             try { debugTerm.open(debugTerminalRef.current); } catch (e) { }
// // //             resizeObserverRef.current = new ResizeObserver(() => {
// // //                 if (mounted && debugTerminalRef.current && debugTerminalRef.current.clientWidth > 0) try { debugFit.fit(); } catch (e) { }
// // //             });
// // //             resizeObserverRef.current.observe(debugTerminalRef.current);
// // //         }

// // //         if (shellTerminalRef.current) {
// // //             try { shellTerm.open(shellTerminalRef.current); } catch (e) { }
// // //             const obs = new ResizeObserver(() => {
// // //                 if (mounted && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0) {
// // //                     try { shellFit.fit(); if (shellProcessRef.current) shellProcessRef.current.resize({ cols: shellTerm.cols, rows: shellTerm.rows }); } catch (e) { }
// // //                 }
// // //             });
// // //             obs.observe(shellTerminalRef.current);
// // //         }

// // //         let shellInputListener: { dispose: () => void } | null = null;
// // //         let serverReadyHandled = false;

// // //         const boot = async () => {
// // //             try {
// // //                 const wc = await getWebContainer();
// // //                 if (!mounted) return;
// // //                 setWcInstance(wc);

// // //                 if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } devProcessRef.current = null; }
// // //                 if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } shellProcessRef.current = null; }
// // //                 try { await wc.fs.rm(block.id, { recursive: true, force: true }); } catch (e) { }

// // //                 debugTerm.writeln('\x1b[1;32m>> SYSTEM ONLINE - MOUNTING FILESYSTEM\x1b[0m');
// // //                 const tree = convertToTree(processProjectData(lockedFiles, assignedPort));
// // //                 await wc.mount({ [block.id]: { directory: tree } });

// // //                 if (mounted) setWcReady(true);

// // //                 await wc.fs.mkdir(`/${block.id}/.bin`, { recursive: true });
// // //                 await wc.fs.writeFile(`/${block.id}/.bin/git`, `#!/usr/bin/env node\nconsole.log("\\n\\x1b[1;33m⚠️  Git is not natively supported in this browser environment.\\x1b[0m\\n");\n`);

// // //                 debugTerm.writeln('\x1b[1;33m>> Running npm install...\x1b[0m');
// // //                 const installProcess = await wc.spawn('npm', ['install', '--no-package-lock'], { cwd: `/${block.id}` });
// // //                 installProcess.output.pipeTo(new WritableStream({ write: data => debugTerm.write(data) }));
// // //                 const exitCode = await installProcess.exit;
// // //                 if (exitCode !== 0) throw new Error("Installation process aborted.");

// // //                 debugTerm.writeln('\n\x1b[1;36m>> Booting local Vite telemetry server...\x1b[0m');
// // //                 const devProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: `/${block.id}` });
// // //                 devProcessRef.current = devProcess;
// // //                 devProcess.output.pipeTo(new WritableStream({ write: data => debugTerm.write(data) }));

// // //                 const shellProcess = await wc.spawn('jsh', { terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 15 }, cwd: `/${block.id}` });
// // //                 shellProcessRef.current = shellProcess;
// // //                 shellProcess.output.pipeTo(new WritableStream({ write: data => shellTerm.write(data) }));

// // //                 const inputWriter = shellProcess.input.getWriter();
// // //                 await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH"\nclear\n');
// // //                 shellInputListener = shellTerm.onData(data => { inputWriter.write(data); });

// // //                 wc.on('server-ready', (port, url) => {
// // //                     if (!mounted || serverReadyHandled) return;
// // //                     if (port !== assignedPort) return;

// // //                     serverReadyHandled = true;
// // //                     setPreviewUrl(url);
// // //                     setStatusText("Online");
// // //                     debugTerm.writeln(`\n\x1b[1;32m>> Preview running on port ${port}\x1b[0m\n`);
// // //                 });

// // //             } catch (err: any) {
// // //                 debugTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
// // //                 setStatusText("Boot Failed");
// // //             }
// // //         };

// // //         boot();

// // //         return () => {
// // //             mounted = false;
// // //             if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
// // //             if (shellInputListener) shellInputListener.dispose();
// // //             debugTerm.dispose();
// // //             shellTerm.dispose();
// // //             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
// // //             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }
// // //         };
// // //     }, [runId, template, assignedPort, lockedFiles, block.id]);

// // //     const [previewHeight, setPreviewHeight] = useState(400);
// // //     const [isDragging, setIsDragging] = useState(false);

// // //     const handleResizerMouseDown = (e: React.MouseEvent) => {
// // //         e.preventDefault();
// // //         setIsDragging(true);
// // //         const startY = e.clientY;
// // //         const startHeight = previewHeight;

// // //         const handleMouseMove = (moveEvent: MouseEvent) => {
// // //             setPreviewHeight(Math.max(10, Math.min(600, startHeight + (moveEvent.clientY - startY))));
// // //         };

// // //         const handleMouseUp = () => {
// // //             setIsDragging(false);
// // //             document.removeEventListener('mousemove', handleMouseMove);
// // //             document.removeEventListener('mouseup', handleMouseUp);
// // //         };

// // //         document.addEventListener('mousemove', handleMouseMove);
// // //         document.addEventListener('mouseup', handleMouseUp);
// // //     };

// // //     const containerStyle: React.CSSProperties = isMaximized ? {
// // //         position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, border: 'none', borderRadius: 0, overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// // //     } : {
// // //         position: 'relative', width: '100%', height: '750px', marginTop: '1rem', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// // //     };

// // //     const terminalTabBtnStyle = (active: boolean): React.CSSProperties => ({
// // //         background: active ? '#334155' : 'transparent', border: 'none', color: active ? '#fff' : '#94a3b8',
// // //         cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold'
// // //     });

// // //     const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         const file = e.target.files?.[0];
// // //         if (!file) return;
// // //         const zip = new JSZip();
// // //         const contents = await zip.loadAsync(file);

// // //         const allPaths = Object.keys(contents.files).filter(p => !contents.files[p].dir && !p.includes('__MACOSX') && !p.startsWith('.'));
// // //         let commonPrefix: string | null = null;
// // //         for (const p of allPaths) {
// // //             const topFolder = p.split('/')[0];
// // //             if (!p.includes('/')) { commonPrefix = null; break; }
// // //             if (commonPrefix === null) commonPrefix = topFolder;
// // //             else if (commonPrefix !== topFolder) { commonPrefix = null; break; }
// // //         }

// // //         const isBinaryFile = (path: string) => ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm'].some(ext => path.toLowerCase().endsWith(ext));

// // //         const newFiles: Record<string, string> = {};
// // //         for (const path of allPaths) {
// // //             const strippedPath = commonPrefix ? path.slice(commonPrefix.length + 1) : path;
// // //             if (!strippedPath) continue;
// // //             if (isBinaryFile(path)) {
// // //                 newFiles[`/${strippedPath}`] = `__mlab_base64__${await contents.files[path].async('base64')}`;
// // //             } else {
// // //                 newFiles[`/${strippedPath}`] = await contents.files[path].async('string');
// // //             }
// // //         }

// // //         const cleanFiles = processProjectData(newFiles, assignedPort);
// // //         setTemplate(detectTemplate(cleanFiles));
// // //         setLockedFiles(cleanFiles);
// // //         canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));
// // //         latestFrontendFilesRef.current = {};
// // //         setRunId(Date.now().toString());
// // //         e.target.value = '';
// // //         if (onChangeRef.current) onChangeRef.current({ snapshot: createSafeSnapshot(cleanFiles), lastSavedAt: new Date().toISOString() });
// // //         toast?.success("Project Imported Successfully!");
// // //     };

// // //     const handleDownloadZip = async () => {
// // //         const zip = new JSZip();
// // //         Object.entries(latestFrontendFilesRef.current).forEach(([path, content]) => {
// // //             if (canonicalKeysRef.current.has(path)) {
// // //                 const cleanPath = path.startsWith('/') ? path.substring(1) : path;
// // //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) zip.file(cleanPath, content.substring(15), { base64: true });
// // //                 else zip.file(cleanPath, content);
// // //             }
// // //         });
// // //         const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
// // //         const a = document.createElement('a'); a.href = url; a.download = `codetribe_project_${block.id}.zip`; a.click();
// // //         URL.revokeObjectURL(url);
// // //         toast?.success("Project Downloaded Successfully!");
// // //     };

// // //     return (
// // //         <div style={containerStyle}>
// // //             <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #334155', flexShrink: 0 }}>
// // //                 <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Code size={14} color="#3b82f6" /> {block.title || 'Live IDE'}</span>
// // //                 <div style={{ display: 'flex', gap: '8px' }}>
// // //                     <label style={{ background: '#3b82f6', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}><FolderArchive size={14} /> Import ZIP<input type="file" accept=".zip" hidden onChange={handleZipImport} /></label>
// // //                     <button onClick={handleDownloadZip} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><Download size={14} /> <span className="ap-hide-mobile">ZIP</span></button>
// // //                     <button onClick={() => setIframeKey(k => k + 1)} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><RefreshCw size={14} /> Reload Preview</button>
// // //                     <button onClick={() => setIsMaximized(!isMaximized)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>{isMaximized ? <Minimize size={14} /> : <Maximize size={14} />} {isMaximized ? 'Exit' : 'Fullscreen'}</button>
// // //                 </div>
// // //             </div>
// // //             <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
// // //                 <Group direction="horizontal" style={{ width: '100%', height: '100%' }}>
// // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column' }}>
// // //                         <style>{`.sp-layout, .sp-wrapper { height: 100% !important; max-height: 100% !important; } [data-panel-group], [data-panel] { height: 100% !important; }`}</style>
// // //                         <SandpackProvider key={runId} template={template} files={lockedFiles} theme="dark">
// // //                             <SandpackLayout style={{ flex: 1, height: '100%', border: 'none', borderRadius: 0 }}>
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
// // //                                     <SandpackFileActions readOnly={readOnly} canonicalKeysRef={canonicalKeysRef} wcInstance={wcInstance} blockId={block.id} />
// // //                                     <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
// // //                                         <div style={{ width: '160px', borderRight: '1px solid #334155', flexShrink: 0 }}><SandpackFileExplorer style={{ height: '100%' }} /></div>
// // //                                         <div style={{ flex: 1 }}><SandpackCodeEditor showTabs closableTabs style={{ height: '100%' }} readOnly={readOnly} /></div>
// // //                                     </div>
// // //                                 </div>
// // //                             </SandpackLayout>
// // //                             {!readOnly && wcReady && <WebContainerSyncBridge wcInstance={wcInstance} blockId={block.id} canonicalKeysRef={canonicalKeysRef} />}
// // //                             <StateHarvester onFilesChange={handleFilesChange} />
// // //                         </SandpackProvider>
// // //                     </Panel>
// // //                     <Separator style={{ width: '4px', background: '#334155', cursor: 'col-resize' }} />
// // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
// // //                         <div style={{ height: `${previewHeight}px`, position: 'relative', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
// // //                             {previewUrl ? <iframe key={iframeKey} src={`${previewUrl}${previewUrl.includes('?') ? '&' : '?'}t=${iframeKey}`} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" /> : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} /><span style={{ fontSize: '0.85rem' }}>{statusText}</span></div>}
// // //                             {isDragging && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />}
// // //                         </div>
// // //                         <div onMouseDown={handleResizerMouseDown} style={{ height: '4px', background: '#334155', cursor: 'row-resize', flexShrink: 0 }} />
// // //                         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
// // //                             <div style={{ padding: '4px 8px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
// // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'logs')} onClick={() => setActiveTerminalTab('logs')}><ScrollText size={12} /> Logs</button>
// // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'shell')} onClick={() => setActiveTerminalTab('shell')}><SquareTerminal size={12} /> Shell</button>
// // //                             </div>
// // //                             <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
// // //                                 <div style={{ position: 'absolute', inset: 0, padding: '8px', visibility: activeTerminalTab === 'logs' ? 'visible' : 'hidden', pointerEvents: activeTerminalTab === 'logs' ? 'auto' : 'none' }}>
// // //                                     <div ref={debugTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
// // //                                 </div>
// // //                                 <div style={{ position: 'absolute', inset: 0, padding: '8px', visibility: activeTerminalTab === 'shell' ? 'visible' : 'hidden', pointerEvents: activeTerminalTab === 'shell' ? 'auto' : 'none' }}>
// // //                                     <div ref={shellTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     </Panel>
// // //                 </Group>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // export default CodeSandboxPlayer;



// // // // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // // // import { Code, Maximize, Minimize, Save, CheckCircle, TerminalSquare, Play, Loader2, Plus, X, Trash2, Pencil, FilePlus, Download, Github, FolderArchive, UploadCloud, RefreshCw, AlertTriangle, ScrollText, SquareTerminal } from 'lucide-react';
// // // // import {
// // // //     SandpackProvider,
// // // //     SandpackLayout,
// // // //     SandpackCodeEditor,
// // // //     SandpackFileExplorer,
// // // //     useSandpack
// // // // } from "@codesandbox/sandpack-react";
// // // // import { useToast } from '../Toast/Toast';
// // // // import JSZip from 'jszip';
// // // // import { Group, Panel, Separator } from 'react-resizable-panels';
// // // // import { StatusModal } from '../StatusModal/StatusModal';
// // // // import { Terminal } from 'xterm';
// // // // import { FitAddon } from 'xterm-addon-fit';
// // // // import 'xterm/css/xterm.css';
// // // // import { getWebContainer } from './webcontainerManager';
// // // // import type { FileSystemTree, WebContainer } from '@webcontainer/api';

// // // // export interface CodeSandboxPlayerProps {
// // // //     block: any;
// // // //     learnerAns: any;
// // // //     onChange?: (answer: any) => void;
// // // //     readOnly?: boolean;
// // // // }

// // // // const createSafeSnapshot = (files: Record<string, string>) => {
// // // //     const safeFiles: Record<string, string> = {};
// // // //     for (const [path, content] of Object.entries(files)) {
// // // //         if (typeof content === 'string' && content.startsWith('__mlab_base64__')) continue;
// // // //         if (path.includes('package-lock.json') || path.includes('node_modules')) continue;

// // // //         if (content.length > 100000) {
// // // //             console.warn(`File ${path} is too large. Excluding from auto-save.`);
// // // //             continue;
// // // //         }
// // // //         safeFiles[path] = content;
// // // //     }
// // // //     return JSON.stringify(safeFiles);
// // // // };

// // // // const convertToTree = (files: Record<string, string>): FileSystemTree => {
// // // //     const tree: FileSystemTree = {};
// // // //     for (const [path, content] of Object.entries(files)) {
// // // //         const parts = path.split('/').filter(Boolean);
// // // //         let current = tree;
// // // //         for (let i = 0; i < parts.length; i++) {
// // // //             const part = parts[i];
// // // //             if (i === parts.length - 1) {
// // // //                 let fileContent: string | Uint8Array = content;
// // // //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) {
// // // //                     const binStr = atob(content.substring(15));
// // // //                     const arr = new Uint8Array(binStr.length);
// // // //                     for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// // // //                     fileContent = arr;
// // // //                 }
// // // //                 current[part] = { file: { contents: fileContent } };
// // // //             } else {
// // // //                 if (!current[part]) current[part] = { directory: {} };
// // // //                 current = (current[part] as any).directory;
// // // //             }
// // // //         }
// // // //     }
// // // //     return tree;
// // // // };

// // // // const detectTemplate = (files: Record<string, string>): "vite-react-ts" | "vite-react" => {
// // // //     return Object.keys(files).some(p => p.endsWith('.tsx') || p.endsWith('.ts')) || !!files['/tsconfig.json'] ? "vite-react-ts" : "vite-react";
// // // // };

// // // // const processProjectData = (rawFiles: Record<string, string>) => {
// // // //     const out = { ...rawFiles };

// // // //     Object.keys(out).forEach(k => {
// // // //         if (k.endsWith('.lockb') || k.endsWith('.lock') || k.includes('node_modules') || k.endsWith('.log')) delete out[k];
// // // //         if (k.toLowerCase().includes('vite.config')) delete out[k];
// // // //         if (k.startsWith('/dependencies') || k.startsWith('/files')) delete out[k];
// // // //     });

// // // //     if (!out['/package.json']) {
// // // //         out['/package.json'] = JSON.stringify({
// // // //             name: "mlab-recovered-project", type: "module",
// // // //             dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0" },
// // // //             devDependencies: { "vite": "^4.5.3", "@vitejs/plugin-react": "^4.2.1", "esbuild-wasm": "^0.20.2", "@rollup/wasm-node": "^4.22.4" },
// // // //             scripts: { "dev": "vite", "build": "vite build", "preview": "vite preview" }
// // // //         }, null, 2);
// // // //     } else {
// // // //         try {
// // // //             const pkg = JSON.parse(out['/package.json']);
// // // //             pkg.type = "module";
// // // //             pkg.dependencies = pkg.dependencies || {};
// // // //             pkg.dependencies['react'] = pkg.dependencies['react'] || "^18.2.0";
// // // //             pkg.dependencies['react-dom'] = pkg.dependencies['react-dom'] || "^18.2.0";
// // // //             pkg.devDependencies = pkg.devDependencies || {};
// // // //             pkg.devDependencies['vite'] = "^4.5.3";
// // // //             pkg.devDependencies['@vitejs/plugin-react'] = "^4.2.1";
// // // //             pkg.scripts = pkg.scripts || {};
// // // //             pkg.scripts.dev = "vite";
// // // //             delete pkg.engines;
// // // //             delete pkg.packageManager;
// // // //             out['/package.json'] = JSON.stringify(pkg, null, 2);
// // // //         } catch (e) { }
// // // //     }

// // // //     if (!out['/src/main.jsx'] && !out['/src/main.tsx'] && !out['/src/index.jsx'] && !out['/src/index.tsx']) {
// // // //         out['/src/main.jsx'] = 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.jsx";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);';
// // // //     }

// // // //     const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
// // // //     const ext = isTSProject ? 'tsx' : 'jsx';

// // // //     // 🚀 FIX: Prevent the script from silently deleting the learner's root App.jsx code!
// // // //     // We gently shift it to the src folder BEFORE generating your requested proxy structure.
// // // //     if (out['/App.jsx'] && !out['/src/App.jsx']) out['/src/App.jsx'] = out['/App.jsx'];
// // // //     if (out['/App.tsx'] && !out['/src/App.tsx']) out['/src/App.tsx'] = out['/App.tsx'];

// // // //     if (!out['/src/App.jsx'] && !out['/src/App.tsx']) {
// // // //         out['/src/App.jsx'] = 'export default function App() { return <h1>Environment Healed Successfully!</h1>; }';
// // // //     }

// // // //     const realAppPath = out['/src/App.tsx'] ? './src/App.tsx' : out['/src/App.jsx'] ? './src/App.jsx' : null;
// // // //     const realMainPath = out['/src/main.tsx'] ? './src/main.tsx' : out['/src/main.jsx'] ? './src/main.jsx' : out['/src/index.tsx'] ? './src/index.tsx' : out['/src/index.jsx'] ? './src/index.jsx' : null;
// // // //     const realStylesPath = out['/src/index.css'] ? './src/index.css' : out['/src/App.css'] ? './src/App.css' : null;

// // // //     delete out['/App.tsx']; delete out['/App.jsx']; delete out['/App.js'];
// // // //     delete out['/index.tsx']; delete out['/index.jsx']; delete out['/index.js'];
// // // //     delete out['/main.tsx']; delete out['/main.jsx']; delete out['/main.js'];
// // // //     delete out['/styles.css'];

// // // //     if (realAppPath) out[`/App.${ext}`] = `export { default } from "${realAppPath}";\n`;
// // // //     if (realMainPath) out[`/main.${ext}`] = `import "${realMainPath}";\n`;
// // // //     if (realStylesPath) out['/styles.css'] = `@import "${realStylesPath}";\n`;

// // // //     // 🚀 FIX: Enforce polling and wss port configuration so Vite Hot Reload works on WebContainers
// // // //     out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { watch: { usePolling: true }, hmr: { clientPort: 443 } }\n});\n`;

// // // //     // 🚀 FIX: Inject Console Spy into HTML to beam browser console.logs to your terminal
// // // //     const consoleInterceptor = `
// // // //     <script>
// // // //       (function() {
// // // //         const orig = { ...console };
// // // //         ['log', 'warn', 'error', 'info'].forEach(m => {
// // // //           console[m] = (...args) => {
// // // //             orig[m](...args);
// // // //             try { window.parent.postMessage({ source: 'preview-console', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*'); } catch(e) {}
// // // //           };
// // // //         });
// // // //         window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', m: 'error', p: e.message }, '*'));
// // // //       })();
// // // //     </script>`;

// // // //     let html = out['/index.html'] || out['/public/index.html'];
// // // //     if (!html) html = `<!DOCTYPE html><html lang="en"><head></head><body><div id="root"></div><script type="module" src="/src/main.${ext}"></script></body></html>`;
// // // //     if (!html.includes("source: 'preview-console'")) {
// // // //         html = html.includes('<head>') ? html.replace('<head>', `<head>\n${consoleInterceptor}`) : consoleInterceptor + html;
// // // //     }
// // // //     out['/index.html'] = html;
// // // //     if (out['/public/index.html']) delete out['/public/index.html'];

// // // //     return out;
// // // // };

// // // // const SandpackFileActions: React.FC<{ readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>>, wcInstance: WebContainer | null, blockId: string }> = ({ readOnly, canonicalKeysRef, wcInstance, blockId }) => {
// // // //     const { sandpack } = useSandpack();
// // // //     const [action, setAction] = useState<'idle' | 'add' | 'rename'>('idle');
// // // //     const [inputValue, setInputValue] = useState('');

// // // //     if (readOnly) return null;

// // // //     const handleAction = async () => {
// // // //         if (!inputValue.trim()) { setAction('idle'); return; }
// // // //         if (action === 'add') {
// // // //             let path = inputValue.trim();
// // // //             if (!path.startsWith('/')) path = '/' + path;
// // // //             if (sandpack.files[path]) { window.alert("A file with this path already exists."); return; }

// // // //             if (typeof sandpack.addFile === 'function') sandpack.addFile(path, "// New file\n");
// // // //             else sandpack.updateFile(path, "// New file\n");
// // // //             if (typeof sandpack.setActiveFile === 'function') sandpack.setActiveFile(path);
// // // //             canonicalKeysRef.current.add(path);

// // // //             if (wcInstance) {
// // // //                 try {
// // // //                     const parts = path.split('/').filter(Boolean);
// // // //                     if (parts.length > 1) await wcInstance.fs.mkdir('/' + blockId + '/' + parts.slice(0, -1).join('/'), { recursive: true });
// // // //                     await wcInstance.fs.writeFile(`/${blockId}${path}`, "// New file\n");
// // // //                 } catch (e) { }
// // // //             }
// // // //         } else if (action === 'rename') {
// // // //             const oldPath = sandpack.activeFile;
// // // //             let newPath = inputValue.trim();
// // // //             if (!newPath.startsWith('/')) newPath = '/' + newPath;

// // // //             if (newPath !== oldPath) {
// // // //                 if (sandpack.files[newPath]) { window.alert("A file with that name already exists."); return; }
// // // //                 const content = sandpack.files[oldPath].code;
// // // //                 if (typeof sandpack.addFile === 'function') {
// // // //                     sandpack.addFile(newPath, content);
// // // //                     sandpack.deleteFile(oldPath);
// // // //                     sandpack.setActiveFile(newPath);
// // // //                 }
// // // //                 canonicalKeysRef.current.add(newPath);
// // // //                 canonicalKeysRef.current.delete(oldPath);

// // // //                 if (wcInstance) {
// // // //                     try {
// // // //                         const parts = newPath.split('/').filter(Boolean);
// // // //                         if (parts.length > 1) await wcInstance.fs.mkdir('/' + blockId + '/' + parts.slice(0, -1).join('/'), { recursive: true });
// // // //                         await wcInstance.fs.writeFile(`/${blockId}${newPath}`, content);
// // // //                         await wcInstance.fs.rm(`/${blockId}${oldPath}`);
// // // //                     } catch (e) { }
// // // //                 }
// // // //             }
// // // //         }
// // // //         setAction('idle');
// // // //         setInputValue('');
// // // //     };

// // // //     const handleDelete = async () => {
// // // //         const path = sandpack.activeFile;
// // // //         if (Object.keys(sandpack.files).length <= 1) { window.alert("You cannot delete the last remaining file."); return; }
// // // //         if (window.confirm(`Are you sure you want to delete ${path}?`)) {
// // // //             if (typeof sandpack.deleteFile === 'function') sandpack.deleteFile(path);
// // // //             canonicalKeysRef.current.delete(path);
// // // //             if (wcInstance) { try { await wcInstance.fs.rm(`/${blockId}${path}`); } catch (e) { } }
// // // //         }
// // // //     };

// // // //     const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', transition: 'color 0.2s' };

// // // //     return (
// // // //         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#252526', padding: '6px 16px', borderBottom: '1px solid #333', flexShrink: 0, minHeight: '36px' }}>
// // // //             {action === 'idle' ? (
// // // //                 <><span style={{ fontSize: '0.7rem', color: '#ccc', fontWeight: 600, letterSpacing: '0.5px' }}>EXPLORER</span>
// // // //                     <div style={{ display: 'flex', gap: '6px' }}>
// // // //                         <button onClick={() => { setAction('add'); setInputValue(''); }} style={iconBtnStyle}><FilePlus size={15} /></button>
// // // //                         <button onClick={() => { setAction('rename'); setInputValue(sandpack.activeFile); }} style={iconBtnStyle}><Pencil size={14} /></button>
// // // //                         <button onClick={handleDelete} style={{ ...iconBtnStyle, color: '#ef4444' }}><Trash2 size={15} /></button>
// // // //                     </div></>
// // // //             ) : (
// // // //                 <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px' }}>
// // // //                     <span style={{ fontSize: '0.75rem', color: action === 'add' ? '#10b981' : '#eab308', fontWeight: 'bold' }}>{action === 'add' ? 'NEW:' : 'RENAME:'}</span>
// // // //                     <input autoFocus value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAction(); if (e.key === 'Escape') setAction('idle'); }} onBlur={() => { if (inputValue.trim() && inputValue !== sandpack.activeFile) handleAction(); else setAction('idle'); }} style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: `1px solid ${action === 'add' ? '#10b981' : '#eab308'}`, outline: 'none', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px' }} />
// // // //                 </div>
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };

// // // // const WebContainerSyncBridge: React.FC<{ wcInstance: WebContainer | null, blockId: string }> = ({ wcInstance, blockId }) => {
// // // //     const { sandpack } = useSandpack();
// // // //     const lastCodeRef = useRef<Record<string, string>>({});
// // // //     const isWritingRef = useRef<boolean>(false);

// // // //     if (Object.keys(lastCodeRef.current).length === 0) {
// // // //         Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // // //             lastCodeRef.current[path] = fileObj.code;
// // // //         });
// // // //     }

// // // //     useEffect(() => {
// // // //         if (!wcInstance) return;
// // // //         const timeoutId = setTimeout(() => {
// // // //             Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // // //                 const code = fileObj.code;
// // // //                 if (code !== undefined && lastCodeRef.current[path] !== code) {
// // // //                     lastCodeRef.current[path] = code;
// // // //                     let outCode: string | Uint8Array = code;
// // // //                     if (typeof code === 'string' && code.startsWith('__mlab_base64__')) {
// // // //                         const binStr = atob(code.substring(15));
// // // //                         const arr = new Uint8Array(binStr.length);
// // // //                         for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// // // //                         outCode = arr;
// // // //                     }
// // // //                     const fullPath = `/${blockId}${path.startsWith('/') ? path : `/${path}`}`;
// // // //                     const parts = fullPath.split('/').filter(Boolean);
// // // //                     isWritingRef.current = true;
// // // //                     if (parts.length > 1) {
// // // //                         wcInstance.fs.mkdir('/' + parts.slice(0, -1).join('/'), { recursive: true })
// // // //                             .then(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }))
// // // //                             .catch(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }));
// // // //                     } else {
// // // //                         wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// // // //                     }
// // // //                 }
// // // //             });
// // // //         }, 300);
// // // //         return () => clearTimeout(timeoutId);
// // // //     }, [sandpack.files, wcInstance, blockId]);

// // // //     useEffect(() => {
// // // //         if (!wcInstance) return;
// // // //         let mounted = true;
// // // //         const intervalId = setInterval(async () => {
// // // //             if (isWritingRef.current) return;
// // // //             try {
// // // //                 const content = await wcInstance.fs.readFile(`/${blockId}/package.json`, 'utf-8');
// // // //                 if (content && content.trim() !== sandpack.files['/package.json']?.code?.trim() && mounted) {
// // // //                     lastCodeRef.current['/package.json'] = content;
// // // //                     sandpack.updateFile('/package.json', content);
// // // //                 }
// // // //             } catch (e) { }
// // // //         }, 2000);
// // // //         return () => { mounted = false; clearInterval(intervalId); };
// // // //     }, [wcInstance, sandpack.files['/package.json']?.code, blockId, sandpack.updateFile]);

// // // //     return null;
// // // // };

// // // // export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false }) => {
// // // //     const toast = useToast();
// // // //     const [isMaximized, setIsMaximized] = useState(false);
// // // //     const onChangeRef = useRef(onChange);
// // // //     useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

// // // //     const [lockedFiles, setLockedFiles] = useState(() => {
// // // //         const filesToLoad = learnerAns?.snapshot ? (typeof learnerAns.snapshot === 'string' ? JSON.parse(learnerAns.snapshot) : { ...learnerAns.snapshot }) : { ...(block.initialFiles || {}) };
// // // //         return processProjectData(filesToLoad);
// // // //     });
// // // //     const [template, setTemplate] = useState<"vite-react-ts" | "vite-react">(() => detectTemplate(lockedFiles));

// // // //     const [runId, setRunId] = useState(Date.now().toString());
// // // //     const [previewUrl, setPreviewUrl] = useState<string>('');
// // // //     const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
// // // //     const [statusText, setStatusText] = useState("Booting OS...");
// // // //     const [wcReady, setWcReady] = useState(false);
// // // //     const [iframeKey, setIframeKey] = useState(0);

// // // //     const [activeTerminalTab, setActiveTerminalTab] = useState<'logs' | 'shell'>('logs');

// // // //     const debugTerminalRef = useRef<HTMLDivElement>(null);
// // // //     const shellTerminalRef = useRef<HTMLDivElement>(null);
// // // //     const debugXtermRef = useRef<Terminal | null>(null);
// // // //     const shellXtermRef = useRef<Terminal | null>(null);
// // // //     const debugFitRef = useRef<FitAddon | null>(null);
// // // //     const shellFitRef = useRef<FitAddon | null>(null);
// // // //     const devProcessRef = useRef<any>(null);
// // // //     const shellProcessRef = useRef<any>(null);
// // // //     const resizeObserverRef = useRef<ResizeObserver | null>(null);

// // // //     const canonicalKeysRef = useRef<Set<string>>(new Set(Object.keys(lockedFiles).map(p => p.startsWith('/') ? p : '/' + p)));
// // // //     const latestFrontendFilesRef = useRef<Record<string, string>>({});

// // // //     const flushSave = useCallback(() => {
// // // //         if (!onChangeRef.current || readOnly) return;
// // // //         const filteredSnapshot: Record<string, string> = {};
// // // //         for (const [path, content] of Object.entries(latestFrontendFilesRef.current)) {
// // // //             if (canonicalKeysRef.current.has(path)) {
// // // //                 filteredSnapshot[path] = content;
// // // //             }
// // // //         }
// // // //         onChangeRef.current({ snapshot: createSafeSnapshot(filteredSnapshot), lastSavedAt: new Date().toISOString() });
// // // //     }, [readOnly]);

// // // //     useEffect(() => {
// // // //         if (onChangeRef.current && !readOnly) {
// // // //             onChangeRef.current({ snapshot: createSafeSnapshot(lockedFiles), lastSavedAt: new Date().toISOString() });
// // // //         }
// // // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // // //     }, []);

// // // //     // 🚀 FIX: Prevent Data Loss. Triggers a save immediately before page reload or tab unmount
// // // //     useEffect(() => {
// // // //         const handleBeforeUnload = () => flushSave();
// // // //         window.addEventListener('beforeunload', handleBeforeUnload);
// // // //         return () => {
// // // //             window.removeEventListener('beforeunload', handleBeforeUnload);
// // // //             flushSave();
// // // //         };
// // // //     }, [flushSave]);

// // // //     useEffect(() => {
// // // //         const intervalId = setInterval(flushSave, 5000);
// // // //         return () => clearInterval(intervalId);
// // // //     }, [flushSave]);

// // // //     useEffect(() => {
// // // //         const handleMessage = (e: MessageEvent) => {
// // // //             if (e.data?.source === 'preview-console' && debugXtermRef.current) {
// // // //                 let prefix = '\x1b[34m[LOG]\x1b[0m';
// // // //                 if (e.data.m === 'warn') prefix = '\x1b[33m[WARN]\x1b[0m';
// // // //                 if (e.data.m === 'error') prefix = '\x1b[31m[ERROR]\x1b[0m';
// // // //                 if (e.data.m === 'info') prefix = '\x1b[36m[INFO]\x1b[0m';
// // // //                 debugXtermRef.current.writeln(`${prefix} ${e.data.p}`);
// // // //             }
// // // //         };
// // // //         window.addEventListener('message', handleMessage);
// // // //         return () => window.removeEventListener('message', handleMessage);
// // // //     }, []);

// // // //     useEffect(() => {
// // // //         let mounted = true;
// // // //         setPreviewUrl('');
// // // //         setStatusText("Initializing Environment...");

// // // //         const debugTerm = new Terminal({ theme: { background: '#0f172a', foreground: '#38bdf8' }, fontFamily: 'monospace', fontSize: 11, convertEol: true });
// // // //         const debugFit = new FitAddon();
// // // //         debugTerm.loadAddon(debugFit);
// // // //         debugXtermRef.current = debugTerm;
// // // //         debugFitRef.current = debugFit;

// // // //         const shellTerm = new Terminal({ theme: { background: '#0f172a', foreground: '#e2e8f0' }, fontFamily: 'monospace', fontSize: 11, convertEol: true, cursorBlink: true });
// // // //         const shellFit = new FitAddon();
// // // //         shellTerm.loadAddon(shellFit);
// // // //         shellXtermRef.current = shellTerm;
// // // //         shellFitRef.current = shellFit;

// // // //         if (debugTerminalRef.current) {
// // // //             try { debugTerm.open(debugTerminalRef.current); } catch (e) { }
// // // //             resizeObserverRef.current = new ResizeObserver(() => {
// // // //                 if (mounted && debugTerminalRef.current && debugTerminalRef.current.clientWidth > 0) try { debugFit.fit(); } catch (e) { }
// // // //             });
// // // //             resizeObserverRef.current.observe(debugTerminalRef.current);
// // // //         }

// // // //         if (shellTerminalRef.current) {
// // // //             try { shellTerm.open(shellTerminalRef.current); } catch (e) { }
// // // //             const obs = new ResizeObserver(() => {
// // // //                 if (mounted && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0) {
// // // //                     try { shellFit.fit(); if (shellProcessRef.current) shellProcessRef.current.resize({ cols: shellTerm.cols, rows: shellTerm.rows }); } catch (e) { }
// // // //                 }
// // // //             });
// // // //             obs.observe(shellTerminalRef.current);
// // // //         }

// // // //         let shellInputListener: { dispose: () => void } | null = null;
// // // //         let serverReadyHandled = false;

// // // //         const boot = async () => {
// // // //             try {
// // // //                 const wc = await getWebContainer();
// // // //                 if (!mounted) return;
// // // //                 setWcInstance(wc);

// // // //                 if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } devProcessRef.current = null; }
// // // //                 if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } shellProcessRef.current = null; }
// // // //                 try { await wc.fs.rm(block.id, { recursive: true, force: true }); } catch (e) { }

// // // //                 debugTerm.writeln('\x1b[1;32m>> SYSTEM ONLINE - MOUNTING FILESYSTEM\x1b[0m');
// // // //                 const tree = convertToTree(lockedFiles);
// // // //                 await wc.mount({ [block.id]: { directory: tree } });

// // // //                 if (mounted) setWcReady(true);

// // // //                 await wc.fs.mkdir(`/${block.id}/.bin`, { recursive: true });
// // // //                 await wc.fs.writeFile(`/${block.id}/.bin/git`, `#!/usr/bin/env node\nconsole.log("\\n\\x1b[1;33m⚠️  Git is not natively supported in this browser environment.\\x1b[0m\\n");\n`);

// // // //                 debugTerm.writeln('\x1b[1;33m>> Running npm install...\x1b[0m');
// // // //                 const installProcess = await wc.spawn('npm', ['install', '--no-package-lock'], { cwd: `/${block.id}` });
// // // //                 installProcess.output.pipeTo(new WritableStream({ write: data => debugTerm.write(data) }));
// // // //                 const exitCode = await installProcess.exit;
// // // //                 if (exitCode !== 0) throw new Error("Installation process aborted.");

// // // //                 debugTerm.writeln('\n\x1b[1;36m>> Booting local Vite telemetry server...\x1b[0m');
// // // //                 const devProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: `/${block.id}` });
// // // //                 devProcessRef.current = devProcess;
// // // //                 devProcess.output.pipeTo(new WritableStream({ write: data => debugTerm.write(data) }));

// // // //                 const shellProcess = await wc.spawn('jsh', { terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 15 }, cwd: `/${block.id}` });
// // // //                 shellProcessRef.current = shellProcess;
// // // //                 shellProcess.output.pipeTo(new WritableStream({ write: data => shellTerm.write(data) }));

// // // //                 const inputWriter = shellProcess.input.getWriter();
// // // //                 await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH"\nclear\n');
// // // //                 shellInputListener = shellTerm.onData(data => { inputWriter.write(data); });

// // // //                 wc.on('server-ready', (port, url) => {
// // // //                     if (!mounted || serverReadyHandled) return;
// // // //                     serverReadyHandled = true;
// // // //                     setPreviewUrl(url);
// // // //                     setStatusText("Online");
// // // //                     debugTerm.writeln(`\n\x1b[1;32m>> Preview running on port ${port}\x1b[0m\n`);
// // // //                 });

// // // //             } catch (err: any) {
// // // //                 debugTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
// // // //                 setStatusText("Boot Failed");
// // // //             }
// // // //         };

// // // //         boot();

// // // //         return () => {
// // // //             mounted = false;
// // // //             if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
// // // //             if (shellInputListener) shellInputListener.dispose();
// // // //             debugTerm.dispose();
// // // //             shellTerm.dispose();
// // // //             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
// // // //             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }
// // // //         };
// // // //     }, [runId, template]);

// // // //     const [previewHeight, setPreviewHeight] = useState(400);
// // // //     const [isDragging, setIsDragging] = useState(false);

// // // //     const handleResizerMouseDown = (e: React.MouseEvent) => {
// // // //         e.preventDefault();
// // // //         setIsDragging(true);
// // // //         const startY = e.clientY;
// // // //         const startHeight = previewHeight;

// // // //         const handleMouseMove = (moveEvent: MouseEvent) => {
// // // //             setPreviewHeight(Math.max(10, Math.min(600, startHeight + (moveEvent.clientY - startY))));
// // // //         };

// // // //         const handleMouseUp = () => {
// // // //             setIsDragging(false);
// // // //             document.removeEventListener('mousemove', handleMouseMove);
// // // //             document.removeEventListener('mouseup', handleMouseUp);
// // // //         };

// // // //         document.addEventListener('mousemove', handleMouseMove);
// // // //         document.addEventListener('mouseup', handleMouseUp);
// // // //     };

// // // //     const StateHarvester: React.FC = () => {
// // // //         const { sandpack } = useSandpack();
// // // //         useEffect(() => {
// // // //             const currentFiles: Record<string, string> = {};
// // // //             Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // // //                 if (fileObj && typeof fileObj.code === 'string') {
// // // //                     currentFiles[path.startsWith('/') ? path : `/${path}`] = fileObj.code;
// // // //                 }
// // // //             });
// // // //             latestFrontendFilesRef.current = currentFiles;
// // // //         }, [sandpack.files]);
// // // //         return null;
// // // //     };

// // // //     useEffect(() => {
// // // //         const timeoutId = setTimeout(() => {
// // // //             try {
// // // //                 if (debugXtermRef.current?.element && debugFitRef.current) debugFitRef.current.fit();
// // // //                 if (shellXtermRef.current?.element && shellFitRef.current) {
// // // //                     shellFitRef.current.fit();
// // // //                     if (shellProcessRef.current) shellProcessRef.current.resize({ cols: shellXtermRef.current.cols, rows: shellXtermRef.current.rows });
// // // //                 }
// // // //             } catch (e) { }
// // // //         }, 250);
// // // //         return () => clearTimeout(timeoutId);
// // // //     }, [isMaximized, activeTerminalTab]);

// // // //     useEffect(() => {
// // // //         if (isMaximized) {
// // // //             document.documentElement.style.overflow = 'hidden';
// // // //             document.body.style.overflow = 'hidden';
// // // //         } else {
// // // //             document.documentElement.style.overflow = '';
// // // //             document.body.style.overflow = '';
// // // //         }
// // // //     }, [isMaximized]);

// // // //     const containerStyle: React.CSSProperties = isMaximized ? {
// // // //         position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, border: 'none', borderRadius: 0, overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// // // //     } : {
// // // //         position: 'relative', width: '100%', height: '750px', marginTop: '1rem', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// // // //     };

// // // //     const terminalTabBtnStyle = (active: boolean): React.CSSProperties => ({
// // // //         background: active ? '#334155' : 'transparent', border: 'none', color: active ? '#fff' : '#94a3b8',
// // // //         cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold'
// // // //     });

// // // //     const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
// // // //         const file = e.target.files?.[0];
// // // //         if (!file) return;
// // // //         const zip = new JSZip();
// // // //         const contents = await zip.loadAsync(file);

// // // //         const allPaths = Object.keys(contents.files).filter(p => !contents.files[p].dir && !p.includes('__MACOSX') && !p.startsWith('.'));
// // // //         let commonPrefix: string | null = null;
// // // //         for (const p of allPaths) {
// // // //             const topFolder = p.split('/')[0];
// // // //             if (!p.includes('/')) { commonPrefix = null; break; }
// // // //             if (commonPrefix === null) commonPrefix = topFolder;
// // // //             else if (commonPrefix !== topFolder) { commonPrefix = null; break; }
// // // //         }

// // // //         const isBinaryFile = (path: string) => ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm'].some(ext => path.toLowerCase().endsWith(ext));

// // // //         const newFiles: Record<string, string> = {};
// // // //         for (const path of allPaths) {
// // // //             const strippedPath = commonPrefix ? path.slice(commonPrefix.length + 1) : path;
// // // //             if (!strippedPath) continue;
// // // //             if (isBinaryFile(path)) {
// // // //                 newFiles[`/${strippedPath}`] = `__mlab_base64__${await contents.files[path].async('base64')}`;
// // // //             } else {
// // // //                 newFiles[`/${strippedPath}`] = await contents.files[path].async('string');
// // // //             }
// // // //         }

// // // //         const cleanFiles = processProjectData(newFiles);
// // // //         setTemplate(detectTemplate(cleanFiles));
// // // //         setLockedFiles(cleanFiles);
// // // //         canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));
// // // //         latestFrontendFilesRef.current = {};
// // // //         setRunId(Date.now().toString());
// // // //         e.target.value = '';
// // // //         if (onChangeRef.current) onChangeRef.current({ snapshot: createSafeSnapshot(cleanFiles), lastSavedAt: new Date().toISOString() });
// // // //         toast?.success("Project Imported Successfully!");
// // // //     };

// // // //     const handleDownloadZip = async () => {
// // // //         const zip = new JSZip();
// // // //         Object.entries(latestFrontendFilesRef.current).forEach(([path, content]) => {
// // // //             if (canonicalKeysRef.current.has(path)) {
// // // //                 const cleanPath = path.startsWith('/') ? path.substring(1) : path;
// // // //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) zip.file(cleanPath, content.substring(15), { base64: true });
// // // //                 else zip.file(cleanPath, content);
// // // //             }
// // // //         });
// // // //         const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
// // // //         const a = document.createElement('a'); a.href = url; a.download = `codetribe_project_${block.id}.zip`; a.click();
// // // //         URL.revokeObjectURL(url);
// // // //         toast?.success("Project Downloaded Successfully!");
// // // //     };

// // // //     return (
// // // //         <div style={containerStyle}>
// // // //             <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #334155', flexShrink: 0 }}>
// // // //                 <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Code size={14} color="#3b82f6" /> {block.title || 'Live IDE'}</span>
// // // //                 <div style={{ display: 'flex', gap: '8px' }}>
// // // //                     <label style={{ background: '#3b82f6', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}><FolderArchive size={14} /> Import ZIP<input type="file" accept=".zip" hidden onChange={handleZipImport} /></label>
// // // //                     <button onClick={handleDownloadZip} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><Download size={14} /> <span className="ap-hide-mobile">ZIP</span></button>
// // // //                     {/* 🚀 FIX: Reload uses a dynamic cache-busting timestamp URL */}
// // // //                     <button onClick={() => setIframeKey(k => k + 1)} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><RefreshCw size={14} /> Reload Preview</button>
// // // //                     <button onClick={() => setIsMaximized(!isMaximized)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>{isMaximized ? <Minimize size={14} /> : <Maximize size={14} />} {isMaximized ? 'Exit' : 'Fullscreen'}</button>
// // // //                 </div>
// // // //             </div>
// // // //             <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
// // // //                 <Group direction="horizontal" style={{ width: '100%', height: '100%' }}>
// // // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column' }}>
// // // //                         <style>{`.sp-layout, .sp-wrapper { height: 100% !important; max-height: 100% !important; } [data-panel-group], [data-panel] { height: 100% !important; }`}</style>
// // // //                         <SandpackProvider key={runId} template={template} files={lockedFiles} theme="dark">
// // // //                             <SandpackLayout style={{ flex: 1, height: '100%', border: 'none', borderRadius: 0 }}>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
// // // //                                     <SandpackFileActions readOnly={readOnly} canonicalKeysRef={canonicalKeysRef} wcInstance={wcInstance} blockId={block.id} />
// // // //                                     <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
// // // //                                         <div style={{ width: '160px', borderRight: '1px solid #334155', flexShrink: 0 }}><SandpackFileExplorer style={{ height: '100%' }} /></div>
// // // //                                         <div style={{ flex: 1 }}><SandpackCodeEditor showTabs closableTabs style={{ height: '100%' }} readOnly={readOnly} /></div>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </SandpackLayout>
// // // //                             {!readOnly && wcReady && <WebContainerSyncBridge wcInstance={wcInstance} blockId={block.id} />}
// // // //                             <StateHarvester />
// // // //                         </SandpackProvider>
// // // //                     </Panel>
// // // //                     <Separator style={{ width: '4px', background: '#334155', cursor: 'col-resize' }} />
// // // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
// // // //                         <div style={{ height: `${previewHeight}px`, position: 'relative', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
// // // //                             {previewUrl ? <iframe key={iframeKey} src={`${previewUrl}${previewUrl.includes('?') ? '&' : '?'}t=${iframeKey}`} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" /> : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} /><span style={{ fontSize: '0.85rem' }}>{statusText}</span></div>}
// // // //                             {isDragging && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />}
// // // //                         </div>
// // // //                         <div onMouseDown={handleResizerMouseDown} style={{ height: '4px', background: '#334155', cursor: 'row-resize', flexShrink: 0 }} />
// // // //                         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
// // // //                             <div style={{ padding: '4px 8px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
// // // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'logs')} onClick={() => setActiveTerminalTab('logs')}><ScrollText size={12} /> Logs</button>
// // // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'shell')} onClick={() => setActiveTerminalTab('shell')}><SquareTerminal size={12} /> Shell</button>
// // // //                             </div>
// // // //                             <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
// // // //                                 <div style={{ position: 'absolute', inset: 0, padding: '8px', visibility: activeTerminalTab === 'logs' ? 'visible' : 'hidden', pointerEvents: activeTerminalTab === 'logs' ? 'auto' : 'none' }}>
// // // //                                     <div ref={debugTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
// // // //                                 </div>
// // // //                                 <div style={{ position: 'absolute', inset: 0, padding: '8px', visibility: activeTerminalTab === 'shell' ? 'visible' : 'hidden', pointerEvents: activeTerminalTab === 'shell' ? 'auto' : 'none' }}>
// // // //                                     <div ref={shellTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     </Panel>
// // // //                 </Group>
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };

// // // // export default CodeSandboxPlayer;



// // // // // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // // // // import { Code, Maximize, Minimize, Save, CheckCircle, TerminalSquare, Play, Loader2, Plus, X, Trash2, Pencil, FilePlus, Download, Github, FolderArchive, UploadCloud, RefreshCw, AlertTriangle, ScrollText, SquareTerminal } from 'lucide-react';
// // // // // import {
// // // // //     SandpackProvider,
// // // // //     SandpackLayout,
// // // // //     SandpackCodeEditor,
// // // // //     SandpackFileExplorer,
// // // // //     useSandpack
// // // // // } from "@codesandbox/sandpack-react";
// // // // // import { useToast } from '../Toast/Toast';
// // // // // import JSZip from 'jszip';
// // // // // import { Group, Panel, Separator } from 'react-resizable-panels';
// // // // // import { StatusModal } from '../StatusModal/StatusModal';
// // // // // import { Terminal } from 'xterm';
// // // // // import { FitAddon } from 'xterm-addon-fit';
// // // // // import 'xterm/css/xterm.css';
// // // // // import { getWebContainer } from './webcontainerManager';
// // // // // import type { FileSystemTree, WebContainer } from '@webcontainer/api';

// // // // // export interface CodeSandboxPlayerProps {
// // // // //     block: any;
// // // // //     learnerAns: any;
// // // // //     onChange?: (answer: any) => void;
// // // // //     readOnly?: boolean;
// // // // // }

// // // // // // Paths / dirs we never want to pull back from disk into the editor or into the saved snapshot.
// // // // // const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache'];
// // // // // const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

// // // // // const shouldIgnorePath = (relPath: string) => {
// // // // //     const parts = relPath.split('/').filter(Boolean);
// // // // //     if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
// // // // //     const fileName = parts[parts.length - 1] || '';
// // // // //     if (SYNC_IGNORE_FILES.includes(fileName)) return true;
// // // // //     if (fileName.endsWith('.log')) return true;
// // // // //     return false;
// // // // // };

// // // // // // 🚀 Aggressive backend crash protection to prevent Firebase 500/503 errors
// // // // // const createSafeSnapshot = (files: Record<string, string>) => {
// // // // //     const safeFiles: Record<string, string> = {};
// // // // //     for (const [path, content] of Object.entries(files)) {
// // // // //         if (typeof content === 'string' && content.startsWith('__mlab_base64__')) continue;
// // // // //         if (path.includes('package-lock.json') || path.includes('node_modules')) continue;

// // // // //         if (content.length > 100000) {
// // // // //             console.warn(`File ${path} is too large (${content.length} bytes). Excluding from auto-save.`);
// // // // //             continue;
// // // // //         }
// // // // //         safeFiles[path] = content;
// // // // //     }
// // // // //     return JSON.stringify(safeFiles);
// // // // // };

// // // // // const convertToTree = (files: Record<string, string>): FileSystemTree => {
// // // // //     const tree: FileSystemTree = {};
// // // // //     for (const [path, content] of Object.entries(files)) {
// // // // //         const parts = path.split('/').filter(Boolean);
// // // // //         let current = tree;
// // // // //         for (let i = 0; i < parts.length; i++) {
// // // // //             const part = parts[i];
// // // // //             if (i === parts.length - 1) {
// // // // //                 let fileContent: string | Uint8Array = content;
// // // // //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) {
// // // // //                     const b64 = content.substring(15);
// // // // //                     const binStr = atob(b64);
// // // // //                     const arr = new Uint8Array(binStr.length);
// // // // //                     for (let j = 0; j < binStr.length; j++) {
// // // // //                         arr[j] = binStr.charCodeAt(j);
// // // // //                     }
// // // // //                     fileContent = arr;
// // // // //                 }
// // // // //                 current[part] = { file: { contents: fileContent } };
// // // // //             } else {
// // // // //                 if (!current[part]) current[part] = { directory: {} };
// // // // //                 current = (current[part] as any).directory;
// // // // //             }
// // // // //         }
// // // // //     }
// // // // //     return tree;
// // // // // };

// // // // // const detectTemplate = (files: Record<string, string>): "vite-react-ts" | "vite-react" => {
// // // // //     const isTS = Object.keys(files).some(p => p.endsWith('.tsx') || p.endsWith('.ts')) || !!files['/tsconfig.json'];
// // // // //     return isTS ? "vite-react-ts" : "vite-react";
// // // // // };

// // // // // const processProjectData = (rawFiles: Record<string, string>) => {
// // // // //     const out = { ...rawFiles };

// // // // //     Object.keys(out).forEach(k => {
// // // // //         if (k.endsWith('.lockb') || k.endsWith('.lock') || k.includes('node_modules') || k.endsWith('.log')) delete out[k];
// // // // //         if (k.toLowerCase().includes('vite.config')) delete out[k];
// // // // //         if (k.startsWith('/dependencies') || k.startsWith('/files')) delete out[k];
// // // // //     });

// // // // //     if (!out['/package.json']) {
// // // // //         out['/package.json'] = JSON.stringify({
// // // // //             name: "mlab-recovered-project",
// // // // //             type: "module",
// // // // //             dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0" },
// // // // //             devDependencies: { "vite": "^4.5.3", "@vitejs/plugin-react": "^4.2.1", "esbuild-wasm": "^0.20.2", "@rollup/wasm-node": "^4.22.4" },
// // // // //             scripts: { "dev": "vite", "build": "vite build", "preview": "vite preview" }
// // // // //         }, null, 2);
// // // // //     } else {
// // // // //         try {
// // // // //             const pkg = JSON.parse(out['/package.json']);
// // // // //             pkg.type = "module";

// // // // //             pkg.dependencies = pkg.dependencies || {};
// // // // //             pkg.dependencies['react'] = pkg.dependencies['react'] || "^18.2.0";
// // // // //             pkg.dependencies['react-dom'] = pkg.dependencies['react-dom'] || "^18.2.0";

// // // // //             pkg.devDependencies = pkg.devDependencies || {};
// // // // //             pkg.devDependencies['vite'] = "^4.5.3";
// // // // //             pkg.devDependencies['@vitejs/plugin-react'] = "^4.2.1";
// // // // //             pkg.devDependencies['esbuild-wasm'] = "^0.20.2";
// // // // //             pkg.devDependencies['@rollup/wasm-node'] = "^4.22.4";
// // // // //             pkg.scripts = pkg.scripts || {};
// // // // //             pkg.scripts.dev = "vite";

// // // // //             delete pkg.engines;
// // // // //             delete pkg.packageManager;
// // // // //             out['/package.json'] = JSON.stringify(pkg, null, 2);
// // // // //         } catch (e) { }
// // // // //     }

// // // // //     if (!out['/src/main.jsx'] && !out['/src/main.tsx'] && !out['/src/index.jsx'] && !out['/src/index.tsx']) {
// // // // //         out['/src/main.jsx'] = 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.jsx";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);';
// // // // //     }

// // // // //     if (!out['/src/App.jsx'] && !out['/src/App.tsx']) {
// // // // //         out['/src/App.jsx'] = 'export default function App() { return <h1>Environment Healed Successfully!</h1>; }';
// // // // //     }

// // // // //     out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()]\n});\n`;

// // // // //     const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
// // // // //     const ext = isTSProject ? 'tsx' : 'jsx';

// // // // //     const realAppPath = out['/src/App.tsx'] ? './src/App.tsx' : out['/src/App.jsx'] ? './src/App.jsx' : null;
// // // // //     const realMainPath = out['/src/main.tsx'] ? './src/main.tsx' : out['/src/main.jsx'] ? './src/main.jsx' : out['/src/index.tsx'] ? './src/index.tsx' : out['/src/index.jsx'] ? './src/index.jsx' : null;
// // // // //     const realStylesPath = out['/src/index.css'] ? './src/index.css' : out['/src/App.css'] ? './src/App.css' : null;

// // // // //     delete out['/App.tsx']; delete out['/App.jsx']; delete out['/App.js'];
// // // // //     delete out['/index.tsx']; delete out['/index.jsx']; delete out['/index.js'];
// // // // //     delete out['/main.tsx']; delete out['/main.jsx']; delete out['/main.js'];
// // // // //     delete out['/styles.css'];

// // // // //     if (realAppPath) out[`/App.${ext}`] = `export { default } from "${realAppPath}";\n`;
// // // // //     if (realMainPath) out[`/main.${ext}`] = `import "${realMainPath}";\n`;
// // // // //     if (realStylesPath) out['/styles.css'] = `@import "${realStylesPath}";\n`;

// // // // //     // 🚀 INJECTED LOG CATCHER: This ensures browser console logs pass to your debug terminal
// // // // //     const consoleInterceptor = `
// // // // //     <script>
// // // // //       (function() {
// // // // //         const orig = { ...console };
// // // // //         ['log', 'warn', 'error', 'info'].forEach(m => {
// // // // //           console[m] = (...args) => {
// // // // //             orig[m](...args);
// // // // //             try {
// // // // //               window.parent.postMessage({ source: 'preview-console', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*');
// // // // //             } catch(e) {}
// // // // //           };
// // // // //         });
// // // // //         window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', m: 'error', p: e.message }, '*'));
// // // // //       })();
// // // // //     </script>`;

// // // // //     let html = out['/index.html'] || out['/public/index.html'];
// // // // //     if (!html) {
// // // // //         html = `<!DOCTYPE html><html lang="en"><head>\n${consoleInterceptor}</head><body><div id="root"></div><script type="module" src="/src/main.${ext}"></script></body></html>`;
// // // // //     } else if (!html.includes("source: 'preview-console'")) {
// // // // //         html = html.includes('<head>') ? html.replace('<head>', `<head>\n${consoleInterceptor}`) : consoleInterceptor + html;
// // // // //     }
// // // // //     out['/index.html'] = html;
// // // // //     if (out['/public/index.html']) delete out['/public/index.html'];

// // // // //     return out;
// // // // // };

// // // // // const GIT_SHIM_SCRIPT = `#!/usr/bin/env node
// // // // // console.log("\\n\\x1b[1;33m⚠️  Git is not natively supported in this browser environment.\\x1b[0m");
// // // // // console.log("\\x1b[1;36mHOW TO MANAGE YOUR CODE:\\x1b[0m");
// // // // // console.log("  • \\x1b[1;34mClone/Pull:\\x1b[0m Use \\x1b[1;32mnpx degit <github-username>/<repo>\\x1b[0m to download templates.");
// // // // // console.log("  • \\x1b[1;34mSave/Push:\\x1b[0m Your code is actively auto-saving to the platform.");
// // // // // console.log("  • \\x1b[1;34mExport:\\x1b[0m Click \\x1b[1;32mDownload ZIP\\x1b[0m in the toolbar above to get your files locally.\\n");
// // // // // `;

// // // // // const SandpackFileActions: React.FC<{
// // // // //     readOnly: boolean,
// // // // //     canonicalKeysRef: React.MutableRefObject<Set<string>>,
// // // // //     wcInstance: WebContainer | null,
// // // // //     blockId: string
// // // // // }> = ({ readOnly, canonicalKeysRef, wcInstance, blockId }) => {
// // // // //     const { sandpack } = useSandpack();
// // // // //     const [action, setAction] = useState<'idle' | 'add' | 'rename'>('idle');
// // // // //     const [inputValue, setInputValue] = useState('');

// // // // //     if (readOnly) return null;

// // // // //     const handleAction = async () => {
// // // // //         if (!inputValue.trim()) { setAction('idle'); return; }

// // // // //         if (action === 'add') {
// // // // //             let path = inputValue.trim();
// // // // //             if (!path.startsWith('/')) path = '/' + path;
// // // // //             if (sandpack.files[path]) { window.alert("A file with this path already exists."); return; }

// // // // //             if (typeof sandpack.addFile === 'function') sandpack.addFile(path, "// New file\n");
// // // // //             else sandpack.updateFile(path, "// New file\n");
// // // // //             if (typeof sandpack.setActiveFile === 'function') sandpack.setActiveFile(path);

// // // // //             canonicalKeysRef.current.add(path);

// // // // //             if (wcInstance) {
// // // // //                 try {
// // // // //                     const parts = path.split('/').filter(Boolean);
// // // // //                     if (parts.length > 1) {
// // // // //                         const dirPath = '/' + blockId + '/' + parts.slice(0, -1).join('/');
// // // // //                         await wcInstance.fs.mkdir(dirPath, { recursive: true });
// // // // //                     }
// // // // //                     await wcInstance.fs.writeFile(`/${blockId}${path}`, "// New file\n");
// // // // //                 } catch (e) { console.error("Failed to write to OS:", e); }
// // // // //             }

// // // // //         } else if (action === 'rename') {
// // // // //             const oldPath = sandpack.activeFile;
// // // // //             let newPath = inputValue.trim();
// // // // //             if (!newPath.startsWith('/')) newPath = '/' + newPath;

// // // // //             if (newPath !== oldPath) {
// // // // //                 if (sandpack.files[newPath]) { window.alert("A file with that name already exists."); return; }
// // // // //                 const content = sandpack.files[oldPath].code;

// // // // //                 if (typeof sandpack.addFile === 'function') {
// // // // //                     sandpack.addFile(newPath, content);
// // // // //                     sandpack.deleteFile(oldPath);
// // // // //                     sandpack.setActiveFile(newPath);
// // // // //                 }

// // // // //                 canonicalKeysRef.current.add(newPath);
// // // // //                 canonicalKeysRef.current.delete(oldPath);

// // // // //                 if (wcInstance) {
// // // // //                     try {
// // // // //                         const parts = newPath.split('/').filter(Boolean);
// // // // //                         if (parts.length > 1) {
// // // // //                             const dirPath = '/' + blockId + '/' + parts.slice(0, -1).join('/');
// // // // //                             await wcInstance.fs.mkdir(dirPath, { recursive: true });
// // // // //                         }
// // // // //                         await wcInstance.fs.writeFile(`/${blockId}${newPath}`, content);
// // // // //                         await wcInstance.fs.rm(`/${blockId}${oldPath}`);
// // // // //                     } catch (e) { console.error("Failed to rename in OS:", e); }
// // // // //                 }
// // // // //             }
// // // // //         }
// // // // //         setAction('idle');
// // // // //         setInputValue('');
// // // // //     };

// // // // //     const handleDelete = async () => {
// // // // //         const path = sandpack.activeFile;
// // // // //         if (Object.keys(sandpack.files).length <= 1) { window.alert("You cannot delete the last remaining file."); return; }
// // // // //         if (window.confirm(`Are you sure you want to delete ${path}?`)) {
// // // // //             if (typeof sandpack.deleteFile === 'function') sandpack.deleteFile(path);
// // // // //             canonicalKeysRef.current.delete(path);
// // // // //             if (wcInstance) {
// // // // //                 try {
// // // // //                     await wcInstance.fs.rm(`/${blockId}${path}`);
// // // // //                 } catch (e) { console.error("Failed to delete in OS:", e); }
// // // // //             }
// // // // //         }
// // // // //     };

// // // // //     const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', transition: 'color 0.2s' };

// // // // //     return (
// // // // //         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#252526', padding: '6px 16px', borderBottom: '1px solid #333', flexShrink: 0, minHeight: '36px' }}>
// // // // //             {action === 'idle' ? (
// // // // //                 <>
// // // // //                     <span style={{ fontSize: '0.7rem', color: '#ccc', fontWeight: 600, letterSpacing: '0.5px' }}>EXPLORER</span>
// // // // //                     <div style={{ display: 'flex', gap: '6px' }}>
// // // // //                         <button title="New File" onClick={() => { setAction('add'); setInputValue(''); }} style={iconBtnStyle} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#fff'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#858585'}><FilePlus size={15} /></button>
// // // // //                         <button title="Rename" onClick={() => { setAction('rename'); setInputValue(sandpack.activeFile); }} style={iconBtnStyle} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#fff'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#858585'}><Pencil size={14} /></button>
// // // // //                         <button title="Delete" onClick={handleDelete} style={iconBtnStyle} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#858585'}><Trash2 size={15} /></button>
// // // // //                     </div>
// // // // //                 </>
// // // // //             ) : (
// // // // //                 <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px' }}>
// // // // //                     <span style={{ fontSize: '0.75rem', color: action === 'add' ? '#10b981' : '#eab308', fontWeight: 'bold' }}>{action === 'add' ? 'NEW:' : 'RENAME:'}</span>
// // // // //                     <input
// // // // //                         autoFocus
// // // // //                         value={inputValue}
// // // // //                         onChange={e => setInputValue(e.target.value)}
// // // // //                         onKeyDown={e => { if (e.key === 'Enter') handleAction(); if (e.key === 'Escape') setAction('idle'); }}
// // // // //                         onBlur={() => { if (inputValue.trim() && inputValue !== sandpack.activeFile) handleAction(); else setAction('idle'); }}
// // // // //                         style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: `1px solid ${action === 'add' ? '#10b981' : '#eab308'}`, outline: 'none', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px' }}
// // // // //                     />
// // // // //                 </div>
// // // // //             )}
// // // // //         </div>
// // // // //     );
// // // // // };

// // // // // // 🚀 Two-way synchronization bridge, with FULL-TREE sync
// // // // // const WebContainerSyncBridge: React.FC<{
// // // // //     wcInstance: WebContainer | null,
// // // // //     blockId: string,
// // // // //     canonicalKeysRef: React.MutableRefObject<Set<string>>,
// // // // // }> = ({ wcInstance, blockId, canonicalKeysRef }) => {
// // // // //     const { sandpack } = useSandpack();
// // // // //     const lastCodeRef = useRef<Record<string, string>>({});
// // // // //     const isWritingRef = useRef<boolean>(false);

// // // // //     if (Object.keys(lastCodeRef.current).length === 0) {
// // // // //         Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // // // //             lastCodeRef.current[path] = fileObj.code;
// // // // //         });
// // // // //     }

// // // // //     // Direction A: Sync Editor edits down to OS disk safely
// // // // //     useEffect(() => {
// // // // //         if (!wcInstance) return;

// // // // //         const timeoutId = setTimeout(() => {
// // // // //             Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // // // //                 const code = fileObj.code;

// // // // //                 if (code !== undefined && lastCodeRef.current[path] !== code) {
// // // // //                     lastCodeRef.current[path] = code;

// // // // //                     let outCode: string | Uint8Array = code;
// // // // //                     if (typeof code === 'string' && code.startsWith('__mlab_base64__')) {
// // // // //                         const b64 = code.substring(15);
// // // // //                         const binStr = atob(b64);
// // // // //                         const arr = new Uint8Array(binStr.length);
// // // // //                         for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// // // // //                         outCode = arr;
// // // // //                     }

// // // // //                     const cleanPath = path.startsWith('/') ? path : `/${path}`;
// // // // //                     const fullPath = `/${blockId}${cleanPath}`;

// // // // //                     const parts = fullPath.split('/').filter(Boolean);
// // // // //                     isWritingRef.current = true;
// // // // //                     if (parts.length > 1) {
// // // // //                         const dirPath = '/' + parts.slice(0, -1).join('/');
// // // // //                         wcInstance.fs.mkdir(dirPath, { recursive: true }).then(() => {
// // // // //                             wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// // // // //                         }).catch(() => {
// // // // //                             wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// // // // //                         });
// // // // //                     } else {
// // // // //                         wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// // // // //                     }
// // // // //                 }
// // // // //             });
// // // // //         }, 300);

// // // // //         return () => clearTimeout(timeoutId);
// // // // //     }, [sandpack.files, wcInstance, blockId]);

// // // // //     // Direction B: Walk the WHOLE project tree on disk periodically
// // // // //     useEffect(() => {
// // // // //         if (!wcInstance) return;
// // // // //         let mounted = true;
// // // // //         let inFlight = false;

// // // // //         const walk = async (dir: string, relBase: string, acc: Record<string, string>) => {
// // // // //             let entries: any[];
// // // // //             try {
// // // // //                 entries = await wcInstance.fs.readdir(dir, { withFileTypes: true } as any);
// // // // //             } catch (e) { return; }

// // // // //             for (const entry of entries) {
// // // // //                 const name = typeof entry === 'string' ? entry : entry.name;
// // // // //                 const isDir = typeof entry === 'string' ? false : entry.isDirectory?.();
// // // // //                 const relPath = `${relBase}/${name}`;
// // // // //                 if (shouldIgnorePath(relPath)) continue;

// // // // //                 if (isDir) {
// // // // //                     await walk(`${dir}/${name}`, relPath, acc);
// // // // //                 } else {
// // // // //                     try {
// // // // //                         const content = await wcInstance.fs.readFile(`${dir}/${name}`, 'utf-8');
// // // // //                         acc[relPath] = content;
// // // // //                     } catch (e) { /* binary or unreadable, skip */ }
// // // // //                 }
// // // // //             }
// // // // //         };

// // // // //         const poll = async () => {
// // // // //             if (isWritingRef.current || inFlight) return;
// // // // //             inFlight = true;
// // // // //             try {
// // // // //                 const diskFiles: Record<string, string> = {};
// // // // //                 await walk(`/${blockId}`, '', diskFiles);

// // // // //                 for (const [relPath, content] of Object.entries(diskFiles)) {
// // // // //                     if (!mounted) break;
// // // // //                     const currentCode = sandpack.files[relPath]?.code;
// // // // //                     if (content !== currentCode && content !== lastCodeRef.current[relPath]) {
// // // // //                         lastCodeRef.current[relPath] = content;
// // // // //                         canonicalKeysRef.current.add(relPath);
// // // // //                         if (sandpack.files[relPath] !== undefined) {
// // // // //                             sandpack.updateFile(relPath, content);
// // // // //                         } else if (typeof sandpack.addFile === 'function') {
// // // // //                             sandpack.addFile(relPath, content);
// // // // //                         }
// // // // //                     }
// // // // //                 }
// // // // //             } catch (e) { /* non-fatal, retry next tick */ }
// // // // //             inFlight = false;
// // // // //         };

// // // // //         const intervalId = setInterval(poll, 2500);
// // // // //         return () => {
// // // // //             mounted = false;
// // // // //             clearInterval(intervalId);
// // // // //         };
// // // // //     }, [wcInstance, blockId, sandpack, canonicalKeysRef]);

// // // // //     return null;
// // // // // };

// // // // // // Lives at module scope (not redefined on every parent render) so it doesn't remount constantly.
// // // // // const StateHarvester: React.FC<{ onFilesChange: (files: Record<string, string>) => void }> = ({ onFilesChange }) => {
// // // // //     const { sandpack } = useSandpack();
// // // // //     useEffect(() => {
// // // // //         const currentFiles: Record<string, string> = {};
// // // // //         for (const [path, fileObj] of Object.entries(sandpack.files)) {
// // // // //             const cleanPath = path.startsWith('/') ? path : `/${path}`;
// // // // //             if (fileObj && !fileObj.hidden && typeof fileObj.code === 'string') {
// // // // //                 currentFiles[cleanPath] = fileObj.code;
// // // // //             }
// // // // //         }
// // // // //         onFilesChange(currentFiles);
// // // // //     }, [sandpack.files, onFilesChange]);
// // // // //     return null;
// // // // // };

// // // // // export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false }) => {
// // // // //     const toast = useToast();
// // // // //     const [isMaximized, setIsMaximized] = useState(false);
// // // // //     const onChangeRef = useRef(onChange);
// // // // //     useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

// // // // //     const [lockedFiles, setLockedFiles] = useState(() => {
// // // // //         const filesToLoad = learnerAns?.snapshot
// // // // //             ? (typeof learnerAns.snapshot === 'string' ? JSON.parse(learnerAns.snapshot) : { ...learnerAns.snapshot })
// // // // //             : { ...(block.initialFiles || {}) };
// // // // //         return processProjectData(filesToLoad);
// // // // //     });
// // // // //     const [template, setTemplate] = useState<"vite-react-ts" | "vite-react">(() => detectTemplate(lockedFiles));

// // // // //     const [runId, setRunId] = useState(Date.now().toString());
// // // // //     const [previewUrl, setPreviewUrl] = useState<string>('');
// // // // //     const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
// // // // //     const [statusText, setStatusText] = useState("Booting OS...");

// // // // //     const [wcReady, setWcReady] = useState(false);
// // // // //     const [iframeKey, setIframeKey] = useState(0);

// // // // //     // --- Dual terminals: one for persistent logs, one for an interactive shell ---
// // // // //     const [activeTerminalTab, setActiveTerminalTab] = useState<'logs' | 'shell'>('logs');

// // // // //     const logsTerminalRef = useRef<HTMLDivElement>(null);
// // // // //     const logsXtermRef = useRef<Terminal | null>(null);
// // // // //     const logsFitAddonRef = useRef<FitAddon | null>(null);

// // // // //     const shellTerminalRef = useRef<HTMLDivElement>(null);
// // // // //     const shellXtermRef = useRef<Terminal | null>(null);
// // // // //     const shellFitAddonRef = useRef<FitAddon | null>(null);

// // // // //     const devProcessRef = useRef<any>(null);
// // // // //     const shellProcessRef = useRef<any>(null);

// // // // //     const resizeObserverRef = useRef<ResizeObserver | null>(null);

// // // // //     const canonicalKeysRef = useRef<Set<string>>(new Set(Object.keys(lockedFiles).map(p => p.startsWith('/') ? p : '/' + p)));
// // // // //     const latestFrontendFilesRef = useRef<Record<string, string>>({});

// // // // //     // --- Robust autosave: debounce on every edit + flush on unload/hide/unmount ---
// // // // //     const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// // // // //     const flushSave = useCallback(() => {
// // // // //         if (!onChangeRef.current || readOnly) return;
// // // // //         const filteredSnapshot: Record<string, string> = {};
// // // // //         for (const [path, content] of Object.entries(latestFrontendFilesRef.current)) {
// // // // //             if (canonicalKeysRef.current.has(path)) {
// // // // //                 filteredSnapshot[path] = content;
// // // // //             }
// // // // //         }
// // // // //         onChangeRef.current({ snapshot: createSafeSnapshot(filteredSnapshot), lastSavedAt: new Date().toISOString() });
// // // // //     }, [readOnly]);

// // // // //     const scheduleSave = useCallback(() => {
// // // // //         if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// // // // //         saveDebounceRef.current = setTimeout(() => {
// // // // //             flushSave();
// // // // //             saveDebounceRef.current = null;
// // // // //         }, 1500);
// // // // //     }, [flushSave]);

// // // // //     const handleFilesChange = useCallback((files: Record<string, string>) => {
// // // // //         latestFrontendFilesRef.current = files;
// // // // //         scheduleSave();
// // // // //     }, [scheduleSave]);

// // // // //     // Save once immediately on mount so there's always a baseline snapshot.
// // // // //     useEffect(() => {
// // // // //         if (onChangeRef.current && !readOnly) {
// // // // //             onChangeRef.current({
// // // // //                 snapshot: createSafeSnapshot(lockedFiles),
// // // // //                 lastSavedAt: new Date().toISOString()
// // // // //             });
// // // // //         }
// // // // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // // // //     }, []);

// // // // //     // 🚀 INJECTED LOG CATCHER: This prints browser console.logs to the Logs Terminal Tab!
// // // // //     useEffect(() => {
// // // // //         const handleMessage = (e: MessageEvent) => {
// // // // //             if (e.data?.source === 'preview-console' && logsXtermRef.current) {
// // // // //                 const { m, p } = e.data;
// // // // //                 let prefix = '\x1b[1;34m[LOG]\x1b[0m';
// // // // //                 if (m === 'warn') prefix = '\x1b[1;33m[WARN]\x1b[0m';
// // // // //                 if (m === 'error') prefix = '\x1b[1;31m[ERROR]\x1b[0m';
// // // // //                 if (m === 'info') prefix = '\x1b[1;36m[INFO]\x1b[0m';
// // // // //                 logsXtermRef.current.writeln(`${prefix} ${p}`);
// // // // //             }
// // // // //         };
// // // // //         window.addEventListener('message', handleMessage);
// // // // //         return () => window.removeEventListener('message', handleMessage);
// // // // //     }, []);

// // // // //     // Flush on tab close, tab hide (backgrounded/switched away), and component unmount
// // // // //     useEffect(() => {
// // // // //         const handleBeforeUnload = () => { flushSave(); };
// // // // //         const handleVisibilityChange = () => { if (document.visibilityState === 'hidden') flushSave(); };

// // // // //         window.addEventListener('beforeunload', handleBeforeUnload);
// // // // //         document.addEventListener('visibilitychange', handleVisibilityChange);

// // // // //         return () => {
// // // // //             window.removeEventListener('beforeunload', handleBeforeUnload);
// // // // //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// // // // //             if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// // // // //             flushSave();
// // // // //         };
// // // // //     }, [flushSave]);

// // // // //     // Fallback safety-net save in case an edit never settles into a "quiet" 1.5s window
// // // // //     useEffect(() => {
// // // // //         const intervalId = setInterval(() => { flushSave(); }, 8000);
// // // // //         return () => clearInterval(intervalId);
// // // // //     }, [flushSave]);

// // // // //     useEffect(() => {
// // // // //         let mounted = true;
// // // // //         setPreviewUrl('');
// // // // //         setStatusText("Initializing Environment...");

// // // // //         const logsTerm = new Terminal({
// // // // //             theme: { background: '#0f172a', foreground: '#e2e8f0' },
// // // // //             fontFamily: 'monospace',
// // // // //             fontSize: 12,
// // // // //             convertEol: true,
// // // // //             cursorBlink: false,
// // // // //             disableStdin: true,
// // // // //         });
// // // // //         const logsFitAddon = new FitAddon();
// // // // //         logsTerm.loadAddon(logsFitAddon);
// // // // //         logsXtermRef.current = logsTerm;
// // // // //         logsFitAddonRef.current = logsFitAddon;
// // // // //         if (logsTerminalRef.current) {
// // // // //             try { logsTerm.open(logsTerminalRef.current); } catch (e) { console.error("Logs terminal open failed:", e); }
// // // // //         }

// // // // //         const shellTerm = new Terminal({
// // // // //             theme: { background: '#0f172a', foreground: '#e2e8f0' },
// // // // //             fontFamily: 'monospace',
// // // // //             fontSize: 12,
// // // // //             convertEol: true,
// // // // //             cursorBlink: true,
// // // // //         });
// // // // //         const shellFitAddon = new FitAddon();
// // // // //         shellTerm.loadAddon(shellFitAddon);
// // // // //         shellXtermRef.current = shellTerm;
// // // // //         shellFitAddonRef.current = shellFitAddon;
// // // // //         if (shellTerminalRef.current) {
// // // // //             try { shellTerm.open(shellTerminalRef.current); } catch (e) { console.error("Shell terminal open failed:", e); }
// // // // //         }

// // // // //         const fitBoth = () => {
// // // // //             try {
// // // // //                 if (logsTerm.element && logsTerminalRef.current && logsTerminalRef.current.clientWidth > 0) logsFitAddon.fit();
// // // // //             } catch (e) { }
// // // // //             try {
// // // // //                 if (shellTerm.element && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0) {
// // // // //                     shellFitAddon.fit();
// // // // //                     if (shellProcessRef.current) {
// // // // //                         shellProcessRef.current.resize({ cols: shellTerm.cols, rows: shellTerm.rows });
// // // // //                     }
// // // // //                 }
// // // // //             } catch (e) { }
// // // // //         };

// // // // //         resizeObserverRef.current = new ResizeObserver(() => { if (mounted) fitBoth(); });
// // // // //         if (logsTerminalRef.current) resizeObserverRef.current.observe(logsTerminalRef.current);
// // // // //         if (shellTerminalRef.current) resizeObserverRef.current.observe(shellTerminalRef.current);

// // // // //         const boot = async () => {
// // // // //             try {
// // // // //                 const wc = await getWebContainer();
// // // // //                 if (!mounted) return;
// // // // //                 setWcInstance(wc);

// // // // //                 if (devProcessRef.current) {
// // // // //                     try { devProcessRef.current.kill(); } catch (e) { }
// // // // //                     devProcessRef.current = null;
// // // // //                 }
// // // // //                 if (shellProcessRef.current) {
// // // // //                     try { shellProcessRef.current.kill(); } catch (e) { }
// // // // //                     shellProcessRef.current = null;
// // // // //                 }

// // // // //                 try {
// // // // //                     await wc.fs.rm(block.id, { recursive: true, force: true });
// // // // //                 } catch (e) { /* ignore */ }

// // // // //                 setStatusText("Mounting Files...");
// // // // //                 const tree = convertToTree(lockedFiles);
// // // // //                 await wc.mount({ [block.id]: { directory: tree } });

// // // // //                 if (mounted) setWcReady(true);

// // // // //                 await wc.fs.mkdir(`/${block.id}/.bin`, { recursive: true });
// // // // //                 await wc.fs.writeFile(`/${block.id}/.bin/git`, GIT_SHIM_SCRIPT);

// // // // //                 logsTerm.writeln('\x1b[1;32m>> WEB-CONTAINER SYSTEM ONLINE\x1b[0m');

// // // // //                 // Spawn the interactive shell immediately and independently
// // // // //                 try {
// // // // //                     const shellProcess = await wc.spawn('jsh', {
// // // // //                         terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 24 },
// // // // //                         cwd: `/${block.id}`
// // // // //                     });
// // // // //                     shellProcessRef.current = shellProcess;
// // // // //                     const inputWriter = shellProcess.input.getWriter();
// // // // //                     await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH" && clear\n');

// // // // //                     shellProcess.output.pipeTo(new WritableStream({
// // // // //                         write: data => shellTerm.write(data)
// // // // //                     }));
// // // // //                     shellTerm.onData(keyData => { inputWriter.write(keyData); });
// // // // //                 } catch (err: any) {
// // // // //                     console.error("Shell spawn error:", err);
// // // // //                     shellTerm.writeln(`\r\n\x1b[1;31m>> Failed to start interactive shell: ${err?.message ?? err}\x1b[0m`);
// // // // //                 }

// // // // //                 setStatusText("Installing Packages...");
// // // // //                 logsTerm.writeln('\x1b[1;33m>> Running npm install...\x1b[0m');

// // // // //                 const installProcess = await wc.spawn('npm', ['install', '--no-package-lock'], { cwd: `/${block.id}` });
// // // // //                 installProcess.output.pipeTo(new WritableStream({
// // // // //                     write: data => logsTerm.write(data)
// // // // //                 }));

// // // // //                 const exitCode = await installProcess.exit;
// // // // //                 if (exitCode !== 0) throw new Error("Installation failed");

// // // // //                 setStatusText("Starting Server...");
// // // // //                 logsTerm.writeln('\n\x1b[1;36m>> Starting Vite server...\x1b[0m');

// // // // //                 const devProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: `/${block.id}` });
// // // // //                 devProcessRef.current = devProcess;

// // // // //                 devProcess.output.pipeTo(new WritableStream({
// // // // //                     write: data => logsTerm.write(data)
// // // // //                 }));

// // // // //                 wc.on('server-ready', (port, url) => {
// // // // //                     if (!mounted) return;
// // // // //                     setPreviewUrl(url);
// // // // //                     setStatusText("Online");
// // // // //                     logsTerm.writeln(`\n\x1b[1;32m>> Server deployed on port ${port}\x1b[0m`);
// // // // //                 });

// // // // //             } catch (err: any) {
// // // // //                 logsTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
// // // // //                 setStatusText("Boot Failed");
// // // // //             }
// // // // //         };

// // // // //         boot();

// // // // //         return () => {
// // // // //             mounted = false;
// // // // //             if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
// // // // //             logsTerm.dispose();
// // // // //             shellTerm.dispose();
// // // // //             logsXtermRef.current = null;
// // // // //             logsFitAddonRef.current = null;
// // // // //             shellXtermRef.current = null;
// // // // //             shellFitAddonRef.current = null;
// // // // //             if (devProcessRef.current) {
// // // // //                 try { devProcessRef.current.kill(); } catch (e) { }
// // // // //                 devProcessRef.current = null;
// // // // //             }
// // // // //             if (shellProcessRef.current) {
// // // // //                 try { shellProcessRef.current.kill(); } catch (e) { }
// // // // //                 shellProcessRef.current = null;
// // // // //             }
// // // // //         };
// // // // //     }, [runId, template]);

// // // // //     const [previewHeight, setPreviewHeight] = useState(420);
// // // // //     const [isDragging, setIsDragging] = useState(false);

// // // // //     const handleResizerMouseDown = (e: React.MouseEvent) => {
// // // // //         e.preventDefault();
// // // // //         setIsDragging(true);
// // // // //         const startY = e.clientY;
// // // // //         const startHeight = previewHeight;

// // // // //         const resizerBar = e.currentTarget as HTMLDivElement;
// // // // //         const parentPanel = resizerBar.parentElement;
// // // // //         const totalHeight = parentPanel ? parentPanel.getBoundingClientRect().height : 700;

// // // // //         const handleMouseMove = (moveEvent: MouseEvent) => {
// // // // //             const deltaY = moveEvent.clientY - startY;
// // // // //             const minHeight = 10;
// // // // //             const maxHeight = totalHeight - 36;
// // // // //             const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
// // // // //             setPreviewHeight(newHeight);
// // // // //         };

// // // // //         const handleMouseUp = () => {
// // // // //             setIsDragging(false);
// // // // //             document.removeEventListener('mousemove', handleMouseMove);
// // // // //             document.removeEventListener('mouseup', handleMouseUp);
// // // // //         };

// // // // //         document.addEventListener('mousemove', handleMouseMove);
// // // // //         document.addEventListener('mouseup', handleMouseUp);
// // // // //     };

// // // // //     useEffect(() => {
// // // // //         const timeoutId = setTimeout(() => {
// // // // //             try {
// // // // //                 if (logsXtermRef.current?.element && logsFitAddonRef.current) logsFitAddonRef.current.fit();
// // // // //                 if (shellXtermRef.current?.element && shellFitAddonRef.current) {
// // // // //                     shellFitAddonRef.current.fit();
// // // // //                     if (shellProcessRef.current && shellXtermRef.current) {
// // // // //                         shellProcessRef.current.resize({
// // // // //                             cols: shellXtermRef.current.cols,
// // // // //                             rows: shellXtermRef.current.rows
// // // // //                         });
// // // // //                     }
// // // // //                 }
// // // // //             } catch (e) { }
// // // // //         }, 250);
// // // // //         return () => clearTimeout(timeoutId);
// // // // //     }, [isMaximized, activeTerminalTab]);

// // // // //     useEffect(() => {
// // // // //         if (isMaximized) {
// // // // //             document.documentElement.style.overflow = 'hidden';
// // // // //             document.body.style.overflow = 'hidden';
// // // // //         } else {
// // // // //             document.documentElement.style.overflow = '';
// // // // //             document.body.style.overflow = '';
// // // // //         }
// // // // //     }, [isMaximized]);

// // // // //     const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
// // // // //         const file = e.target.files?.[0];
// // // // //         if (!file) return;
// // // // //         const zip = new JSZip();
// // // // //         const contents = await zip.loadAsync(file);

// // // // //         const allPaths = Object.keys(contents.files).filter(
// // // // //             p => !contents.files[p].dir && !p.includes('__MACOSX') && !p.startsWith('.')
// // // // //         );

// // // // //         let commonPrefix: string | null = null;
// // // // //         for (const p of allPaths) {
// // // // //             const topFolder = p.split('/')[0];
// // // // //             if (!p.includes('/')) { commonPrefix = null; break; }
// // // // //             if (commonPrefix === null) commonPrefix = topFolder;
// // // // //             else if (commonPrefix !== topFolder) { commonPrefix = null; break; }
// // // // //         }

// // // // //         const isBinaryFile = (path: string) => {
// // // // //             const lowerPath = path.toLowerCase();
// // // // //             const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm'];
// // // // //             return binaryExtensions.some(ext => lowerPath.endsWith(ext));
// // // // //         };

// // // // //         const newFiles: Record<string, string> = {};
// // // // //         for (const path of allPaths) {
// // // // //             const strippedPath = commonPrefix ? path.slice(commonPrefix.length + 1) : path;
// // // // //             if (!strippedPath) continue;

// // // // //             if (isBinaryFile(path)) {
// // // // //                 const b64 = await contents.files[path].async('base64');
// // // // //                 newFiles[`/${strippedPath}`] = `__mlab_base64__${b64}`;
// // // // //             } else {
// // // // //                 newFiles[`/${strippedPath}`] = await contents.files[path].async('string');
// // // // //             }
// // // // //         }

// // // // //         const cleanFiles = processProjectData(newFiles);
// // // // //         setTemplate(detectTemplate(cleanFiles));
// // // // //         setLockedFiles(cleanFiles);
// // // // //         canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));
// // // // //         latestFrontendFilesRef.current = {};

// // // // //         setRunId(Date.now().toString());
// // // // //         e.target.value = '';

// // // // //         if (onChangeRef.current) onChangeRef.current({ snapshot: createSafeSnapshot(cleanFiles), lastSavedAt: new Date().toISOString() });
// // // // //         toast?.success("Project Imported Successfully!");
// // // // //     };

// // // // //     const handleDownloadZip = async () => {
// // // // //         const zip = new JSZip();
// // // // //         const filesToZip = latestFrontendFilesRef.current;

// // // // //         Object.entries(filesToZip).forEach(([path, content]) => {
// // // // //             if (canonicalKeysRef.current.has(path)) {
// // // // //                 const cleanPath = path.startsWith('/') ? path.substring(1) : path;
// // // // //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) {
// // // // //                     zip.file(cleanPath, content.substring(15), { base64: true });
// // // // //                 } else {
// // // // //                     zip.file(cleanPath, content);
// // // // //                 }
// // // // //             }
// // // // //         });

// // // // //         const blob = await zip.generateAsync({ type: "blob" });
// // // // //         const url = URL.createObjectURL(blob);
// // // // //         const a = document.createElement('a');
// // // // //         a.href = url;
// // // // //         a.download = `codetribe_project_${block.id}.zip`;
// // // // //         a.click();
// // // // //         URL.revokeObjectURL(url);
// // // // //         toast?.success("Project Downloaded Successfully!");
// // // // //     };

// // // // //     const containerStyle: React.CSSProperties = isMaximized ? {
// // // // //         position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999,
// // // // //         border: 'none', borderRadius: 0, overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// // // // //     } : {
// // // // //         position: 'relative', width: '100%', height: '700px', marginTop: '1rem',
// // // // //         border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// // // // //     };

// // // // //     const terminalTabBtnStyle = (active: boolean): React.CSSProperties => ({
// // // // //         background: active ? '#334155' : 'transparent',
// // // // //         border: 'none',
// // // // //         color: active ? '#fff' : '#94a3b8',
// // // // //         cursor: 'pointer',
// // // // //         display: 'flex',
// // // // //         alignItems: 'center',
// // // // //         gap: '5px',
// // // // //         padding: '4px 10px',
// // // // //         borderRadius: '4px',
// // // // //         fontSize: '0.7rem',
// // // // //         fontWeight: 'bold',
// // // // //     });

// // // // //     return (
// // // // //         <div style={containerStyle}>
// // // // //             {/* Toolbar */}
// // // // //             <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #334155' }}>
// // // // //                 <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                     <Code size={14} color="#3b82f6" /> {block.title || 'Live IDE'}
// // // // //                 </span>
// // // // //                 <div style={{ display: 'flex', gap: '8px' }}>
// // // // //                     <label style={{ background: '#3b82f6', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                         <FolderArchive size={14} /> Import ZIP
// // // // //                         <input type="file" accept=".zip" hidden onChange={handleZipImport} />
// // // // //                     </label>
// // // // //                     <button onClick={handleDownloadZip} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// // // // //                         <Download size={14} /> <span className="ap-hide-mobile">ZIP</span>
// // // // //                     </button>
// // // // //                     <button onClick={() => setIframeKey(k => k + 1)} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// // // // //                         <RefreshCw size={14} /> <span className="ap-hide-mobile">Reload</span>
// // // // //                     </button>
// // // // //                     <button onClick={() => setIsMaximized(!isMaximized)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// // // // //                         {isMaximized ? <Minimize size={14} /> : <Maximize size={14} />} {isMaximized ? 'Exit' : 'Fullscreen'}
// // // // //                     </button>
// // // // //                 </div>
// // // // //             </div>

// // // // //             {/* Content Body */}
// // // // //             <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
// // // // //                 <Group direction="horizontal" style={{ width: '100%', height: '100%' }}>

// // // // //                     {/* LEFT PANEL */}
// // // // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column' }}>
// // // // //                         <style>{`
// // // // //                             .sp-layout, .sp-wrapper { height: 100% !important; max-height: 100% !important; }
// // // // //                             [data-panel-group], [data-panel] { height: 100% !important; }
// // // // //                         `}</style>

// // // // //                         <SandpackProvider key={runId} template={template} files={lockedFiles} theme="dark">
// // // // //                             <SandpackLayout style={{ flex: 1, height: '100%', border: 'none', borderRadius: 0 }}>
// // // // //                                 <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
// // // // //                                     <SandpackFileActions readOnly={readOnly} canonicalKeysRef={canonicalKeysRef} wcInstance={wcInstance} blockId={block.id} />
// // // // //                                     <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
// // // // //                                         <div style={{ width: '200px', borderRight: '1px solid #334155' }}>
// // // // //                                             <SandpackFileExplorer style={{ height: '100%' }} />
// // // // //                                         </div>
// // // // //                                         <div style={{ flex: 1 }}>
// // // // //                                             <SandpackCodeEditor showTabs closableTabs style={{ height: '100%' }} readOnly={readOnly} />
// // // // //                                         </div>
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             </SandpackLayout>
// // // // //                             {!readOnly && wcReady && <WebContainerSyncBridge wcInstance={wcInstance} blockId={block.id} canonicalKeysRef={canonicalKeysRef} />}
// // // // //                             <StateHarvester onFilesChange={handleFilesChange} />
// // // // //                         </SandpackProvider>
// // // // //                     </Panel>

// // // // //                     <Separator style={{ width: '4px', background: '#334155', cursor: 'col-resize' }} />

// // // // //                     {/* RIGHT PANEL */}
// // // // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', background: '#0f172a' }}>

// // // // //                         <div style={{ height: `${previewHeight}px`, position: 'relative', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
// // // // //                             {previewUrl ? (
// // // // //                                 <iframe key={iframeKey} src={previewUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" />
// // // // //                             ) : (
// // // // //                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
// // // // //                                     <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
// // // // //                                     <span style={{ fontSize: '0.85rem' }}>{statusText}</span>
// // // // //                                 </div>
// // // // //                             )}
// // // // //                             {isDragging && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />}
// // // // //                         </div>

// // // // //                         <div
// // // // //                             onMouseDown={handleResizerMouseDown}
// // // // //                             style={{ height: '4px', background: '#334155', cursor: 'row-resize', flexShrink: 0, transition: 'background 0.15s' }}
// // // // //                             onMouseEnter={e => e.currentTarget.style.background = '#3b82f6'}
// // // // //                             onMouseLeave={e => e.currentTarget.style.background = '#334155'}
// // // // //                         />

// // // // //                         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
// // // // //                             <div style={{ padding: '4px 8px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
// // // // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'logs')} onClick={() => setActiveTerminalTab('logs')}>
// // // // //                                     <ScrollText size={12} /> Logs
// // // // //                                 </button>
// // // // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'shell')} onClick={() => setActiveTerminalTab('shell')}>
// // // // //                                     <SquareTerminal size={12} /> Shell
// // // // //                                 </button>
// // // // //                             </div>
// // // // //                             <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
// // // // //                                 {/* Both terminals stay mounted & running at all times — only visibility toggles,
// // // // //                                     so log output keeps accumulating in the background while you use the shell, and vice versa. */}
// // // // //                                 <div style={{
// // // // //                                     position: 'absolute', inset: 0, padding: '8px',
// // // // //                                     visibility: activeTerminalTab === 'logs' ? 'visible' : 'hidden',
// // // // //                                     pointerEvents: activeTerminalTab === 'logs' ? 'auto' : 'none',
// // // // //                                 }}>
// // // // //                                     <div ref={logsTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
// // // // //                                 </div>
// // // // //                                 <div style={{
// // // // //                                     position: 'absolute', inset: 0, padding: '8px',
// // // // //                                     visibility: activeTerminalTab === 'shell' ? 'visible' : 'hidden',
// // // // //                                     pointerEvents: activeTerminalTab === 'shell' ? 'auto' : 'none',
// // // // //                                 }}>
// // // // //                                     <div ref={shellTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>

// // // // //                     </Panel>
// // // // //                 </Group>
// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };

// // // // // export default CodeSandboxPlayer;


// // // // // // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // // // // // import { Code, Maximize, Minimize, Save, CheckCircle, TerminalSquare, Play, Loader2, Plus, X, Trash2, Pencil, FilePlus, Download, Github, FolderArchive, UploadCloud, RefreshCw, AlertTriangle, ScrollText, SquareTerminal } from 'lucide-react';
// // // // // // import {
// // // // // //     SandpackProvider,
// // // // // //     SandpackLayout,
// // // // // //     SandpackCodeEditor,
// // // // // //     SandpackFileExplorer,
// // // // // //     useSandpack
// // // // // // } from "@codesandbox/sandpack-react";
// // // // // // import { useToast } from '../Toast/Toast';
// // // // // // import JSZip from 'jszip';
// // // // // // import { Group, Panel, Separator } from 'react-resizable-panels';
// // // // // // import { StatusModal } from '../StatusModal/StatusModal';
// // // // // // import { Terminal } from 'xterm';
// // // // // // import { FitAddon } from 'xterm-addon-fit';
// // // // // // import 'xterm/css/xterm.css';
// // // // // // import { getWebContainer } from './webcontainerManager';
// // // // // // import type { FileSystemTree, WebContainer } from '@webcontainer/api';

// // // // // // export interface CodeSandboxPlayerProps {
// // // // // //     block: any;
// // // // // //     learnerAns: any;
// // // // // //     onChange?: (answer: any) => void;
// // // // // //     readOnly?: boolean;
// // // // // // }

// // // // // // // Paths / dirs we never want to pull back from disk into the editor or into the saved snapshot.
// // // // // // const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache'];
// // // // // // const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

// // // // // // const shouldIgnorePath = (relPath: string) => {
// // // // // //     const parts = relPath.split('/').filter(Boolean);
// // // // // //     if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
// // // // // //     const fileName = parts[parts.length - 1] || '';
// // // // // //     if (SYNC_IGNORE_FILES.includes(fileName)) return true;
// // // // // //     if (fileName.endsWith('.log')) return true;
// // // // // //     return false;
// // // // // // };

// // // // // // // 🚀 Aggressive backend crash protection to prevent Firebase 500/503 errors
// // // // // // const createSafeSnapshot = (files: Record<string, string>) => {
// // // // // //     const safeFiles: Record<string, string> = {};
// // // // // //     for (const [path, content] of Object.entries(files)) {
// // // // // //         if (typeof content === 'string' && content.startsWith('__mlab_base64__')) continue;
// // // // // //         if (path.includes('package-lock.json') || path.includes('node_modules')) continue;

// // // // // //         if (content.length > 100000) {
// // // // // //             console.warn(`File ${path} is too large (${content.length} bytes). Excluding from auto-save.`);
// // // // // //             continue;
// // // // // //         }
// // // // // //         safeFiles[path] = content;
// // // // // //     }
// // // // // //     return JSON.stringify(safeFiles);
// // // // // // };

// // // // // // const convertToTree = (files: Record<string, string>): FileSystemTree => {
// // // // // //     const tree: FileSystemTree = {};
// // // // // //     for (const [path, content] of Object.entries(files)) {
// // // // // //         const parts = path.split('/').filter(Boolean);
// // // // // //         let current = tree;
// // // // // //         for (let i = 0; i < parts.length; i++) {
// // // // // //             const part = parts[i];
// // // // // //             if (i === parts.length - 1) {
// // // // // //                 let fileContent: string | Uint8Array = content;
// // // // // //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) {
// // // // // //                     const b64 = content.substring(15);
// // // // // //                     const binStr = atob(b64);
// // // // // //                     const arr = new Uint8Array(binStr.length);
// // // // // //                     for (let j = 0; j < binStr.length; j++) {
// // // // // //                         arr[j] = binStr.charCodeAt(j);
// // // // // //                     }
// // // // // //                     fileContent = arr;
// // // // // //                 }
// // // // // //                 current[part] = { file: { contents: fileContent } };
// // // // // //             } else {
// // // // // //                 if (!current[part]) current[part] = { directory: {} };
// // // // // //                 current = (current[part] as any).directory;
// // // // // //             }
// // // // // //         }
// // // // // //     }
// // // // // //     return tree;
// // // // // // };

// // // // // // const detectTemplate = (files: Record<string, string>): "vite-react-ts" | "vite-react" => {
// // // // // //     const isTS = Object.keys(files).some(p => p.endsWith('.tsx') || p.endsWith('.ts')) || !!files['/tsconfig.json'];
// // // // // //     return isTS ? "vite-react-ts" : "vite-react";
// // // // // // };

// // // // // // const processProjectData = (rawFiles: Record<string, string>) => {
// // // // // //     const out = { ...rawFiles };

// // // // // //     Object.keys(out).forEach(k => {
// // // // // //         if (k.endsWith('.lockb') || k.endsWith('.lock') || k.includes('node_modules') || k.endsWith('.log')) delete out[k];
// // // // // //         if (k.toLowerCase().includes('vite.config')) delete out[k];
// // // // // //         if (k.startsWith('/dependencies') || k.startsWith('/files')) delete out[k];
// // // // // //     });

// // // // // //     if (!out['/package.json']) {
// // // // // //         out['/package.json'] = JSON.stringify({
// // // // // //             name: "mlab-recovered-project",
// // // // // //             type: "module",
// // // // // //             dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0" },
// // // // // //             devDependencies: { "vite": "^4.5.3", "@vitejs/plugin-react": "^4.2.1", "esbuild-wasm": "^0.20.2", "@rollup/wasm-node": "^4.22.4" },
// // // // // //             scripts: { "dev": "vite", "build": "vite build", "preview": "vite preview" }
// // // // // //         }, null, 2);
// // // // // //     } else {
// // // // // //         try {
// // // // // //             const pkg = JSON.parse(out['/package.json']);
// // // // // //             pkg.type = "module";

// // // // // //             pkg.dependencies = pkg.dependencies || {};
// // // // // //             pkg.dependencies['react'] = pkg.dependencies['react'] || "^18.2.0";
// // // // // //             pkg.dependencies['react-dom'] = pkg.dependencies['react-dom'] || "^18.2.0";

// // // // // //             pkg.devDependencies = pkg.devDependencies || {};
// // // // // //             pkg.devDependencies['vite'] = "^4.5.3";
// // // // // //             pkg.devDependencies['@vitejs/plugin-react'] = "^4.2.1";
// // // // // //             pkg.devDependencies['esbuild-wasm'] = "^0.20.2";
// // // // // //             pkg.devDependencies['@rollup/wasm-node'] = "^4.22.4";
// // // // // //             pkg.scripts = pkg.scripts || {};
// // // // // //             pkg.scripts.dev = "vite";

// // // // // //             delete pkg.engines;
// // // // // //             delete pkg.packageManager;
// // // // // //             out['/package.json'] = JSON.stringify(pkg, null, 2);
// // // // // //         } catch (e) { }
// // // // // //     }

// // // // // //     if (!out['/index.html'] && !out['/public/index.html']) {
// // // // // //         out['/index.html'] = '<!DOCTYPE html><html lang="en"><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>';
// // // // // //     }

// // // // // //     if (!out['/src/main.jsx'] && !out['/src/main.tsx'] && !out['/src/index.jsx'] && !out['/src/index.tsx']) {
// // // // // //         out['/src/main.jsx'] = 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.jsx";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);';
// // // // // //     }

// // // // // //     if (!out['/src/App.jsx'] && !out['/src/App.tsx']) {
// // // // // //         out['/src/App.jsx'] = 'export default function App() { return <h1>Environment Healed Successfully!</h1>; }';
// // // // // //     }

// // // // // //     out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()]\n});\n`;

// // // // // //     const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
// // // // // //     const ext = isTSProject ? 'tsx' : 'jsx';

// // // // // //     const realAppPath = out['/src/App.tsx'] ? './src/App.tsx' : out['/src/App.jsx'] ? './src/App.jsx' : null;
// // // // // //     const realMainPath = out['/src/main.tsx'] ? './src/main.tsx' : out['/src/main.jsx'] ? './src/main.jsx' : out['/src/index.tsx'] ? './src/index.tsx' : out['/src/index.jsx'] ? './src/index.jsx' : null;
// // // // // //     const realStylesPath = out['/src/index.css'] ? './src/index.css' : out['/src/App.css'] ? './src/App.css' : null;

// // // // // //     delete out['/App.tsx']; delete out['/App.jsx']; delete out['/App.js'];
// // // // // //     delete out['/index.tsx']; delete out['/index.jsx']; delete out['/index.js'];
// // // // // //     delete out['/main.tsx']; delete out['/main.jsx']; delete out['/main.js'];
// // // // // //     delete out['/styles.css'];

// // // // // //     if (realAppPath) out[`/App.${ext}`] = `export { default } from "${realAppPath}";\n`;
// // // // // //     if (realMainPath) out[`/main.${ext}`] = `import "${realMainPath}";\n`;
// // // // // //     if (realStylesPath) out['/styles.css'] = `@import "${realStylesPath}";\n`;

// // // // // //     return out;
// // // // // // };

// // // // // // const GIT_SHIM_SCRIPT = `#!/usr/bin/env node
// // // // // // console.log("\\n\\x1b[1;33m⚠️  Git is not natively supported in this browser environment.\\x1b[0m");
// // // // // // console.log("\\x1b[1;36mHOW TO MANAGE YOUR CODE:\\x1b[0m");
// // // // // // console.log("  • \\x1b[1;34mClone/Pull:\\x1b[0m Use \\x1b[1;32mnpx degit <github-username>/<repo>\\x1b[0m to download templates.");
// // // // // // console.log("  • \\x1b[1;34mSave/Push:\\x1b[0m Your code is actively auto-saving to the platform.");
// // // // // // console.log("  • \\x1b[1;34mExport:\\x1b[0m Click \\x1b[1;32mDownload ZIP\\x1b[0m in the toolbar above to get your files locally.\\n");
// // // // // // `;

// // // // // // const SandpackFileActions: React.FC<{
// // // // // //     readOnly: boolean,
// // // // // //     canonicalKeysRef: React.MutableRefObject<Set<string>>,
// // // // // //     wcInstance: WebContainer | null,
// // // // // //     blockId: string
// // // // // // }> = ({ readOnly, canonicalKeysRef, wcInstance, blockId }) => {
// // // // // //     const { sandpack } = useSandpack();
// // // // // //     const [action, setAction] = useState<'idle' | 'add' | 'rename'>('idle');
// // // // // //     const [inputValue, setInputValue] = useState('');

// // // // // //     if (readOnly) return null;

// // // // // //     const handleAction = async () => {
// // // // // //         if (!inputValue.trim()) { setAction('idle'); return; }

// // // // // //         if (action === 'add') {
// // // // // //             let path = inputValue.trim();
// // // // // //             if (!path.startsWith('/')) path = '/' + path;
// // // // // //             if (sandpack.files[path]) { window.alert("A file with this path already exists."); return; }

// // // // // //             if (typeof sandpack.addFile === 'function') sandpack.addFile(path, "// New file\n");
// // // // // //             else sandpack.updateFile(path, "// New file\n");
// // // // // //             if (typeof sandpack.setActiveFile === 'function') sandpack.setActiveFile(path);

// // // // // //             canonicalKeysRef.current.add(path);

// // // // // //             if (wcInstance) {
// // // // // //                 try {
// // // // // //                     const parts = path.split('/').filter(Boolean);
// // // // // //                     if (parts.length > 1) {
// // // // // //                         const dirPath = '/' + blockId + '/' + parts.slice(0, -1).join('/');
// // // // // //                         await wcInstance.fs.mkdir(dirPath, { recursive: true });
// // // // // //                     }
// // // // // //                     await wcInstance.fs.writeFile(`/${blockId}${path}`, "// New file\n");
// // // // // //                 } catch (e) { console.error("Failed to write to OS:", e); }
// // // // // //             }

// // // // // //         } else if (action === 'rename') {
// // // // // //             const oldPath = sandpack.activeFile;
// // // // // //             let newPath = inputValue.trim();
// // // // // //             if (!newPath.startsWith('/')) newPath = '/' + newPath;

// // // // // //             if (newPath !== oldPath) {
// // // // // //                 if (sandpack.files[newPath]) { window.alert("A file with that name already exists."); return; }
// // // // // //                 const content = sandpack.files[oldPath].code;

// // // // // //                 if (typeof sandpack.addFile === 'function') {
// // // // // //                     sandpack.addFile(newPath, content);
// // // // // //                     sandpack.deleteFile(oldPath);
// // // // // //                     sandpack.setActiveFile(newPath);
// // // // // //                 }

// // // // // //                 canonicalKeysRef.current.add(newPath);
// // // // // //                 canonicalKeysRef.current.delete(oldPath);

// // // // // //                 if (wcInstance) {
// // // // // //                     try {
// // // // // //                         const parts = newPath.split('/').filter(Boolean);
// // // // // //                         if (parts.length > 1) {
// // // // // //                             const dirPath = '/' + blockId + '/' + parts.slice(0, -1).join('/');
// // // // // //                             await wcInstance.fs.mkdir(dirPath, { recursive: true });
// // // // // //                         }
// // // // // //                         await wcInstance.fs.writeFile(`/${blockId}${newPath}`, content);
// // // // // //                         await wcInstance.fs.rm(`/${blockId}${oldPath}`);
// // // // // //                     } catch (e) { console.error("Failed to rename in OS:", e); }
// // // // // //                 }
// // // // // //             }
// // // // // //         }
// // // // // //         setAction('idle');
// // // // // //         setInputValue('');
// // // // // //     };

// // // // // //     const handleDelete = async () => {
// // // // // //         const path = sandpack.activeFile;
// // // // // //         if (Object.keys(sandpack.files).length <= 1) { window.alert("You cannot delete the last remaining file."); return; }
// // // // // //         if (window.confirm(`Are you sure you want to delete ${path}?`)) {
// // // // // //             if (typeof sandpack.deleteFile === 'function') sandpack.deleteFile(path);
// // // // // //             canonicalKeysRef.current.delete(path);
// // // // // //             if (wcInstance) {
// // // // // //                 try {
// // // // // //                     await wcInstance.fs.rm(`/${blockId}${path}`);
// // // // // //                 } catch (e) { console.error("Failed to delete in OS:", e); }
// // // // // //             }
// // // // // //         }
// // // // // //     };

// // // // // //     const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', transition: 'color 0.2s' };

// // // // // //     return (
// // // // // //         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#252526', padding: '6px 16px', borderBottom: '1px solid #333', flexShrink: 0, minHeight: '36px' }}>
// // // // // //             {action === 'idle' ? (
// // // // // //                 <>
// // // // // //                     <span style={{ fontSize: '0.7rem', color: '#ccc', fontWeight: 600, letterSpacing: '0.5px' }}>EXPLORER</span>
// // // // // //                     <div style={{ display: 'flex', gap: '6px' }}>
// // // // // //                         <button title="New File" onClick={() => { setAction('add'); setInputValue(''); }} style={iconBtnStyle} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#fff'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#858585'}><FilePlus size={15} /></button>
// // // // // //                         <button title="Rename" onClick={() => { setAction('rename'); setInputValue(sandpack.activeFile); }} style={iconBtnStyle} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#fff'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#858585'}><Pencil size={14} /></button>
// // // // // //                         <button title="Delete" onClick={handleDelete} style={iconBtnStyle} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#858585'}><Trash2 size={15} /></button>
// // // // // //                     </div>
// // // // // //                 </>
// // // // // //             ) : (
// // // // // //                 <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px' }}>
// // // // // //                     <span style={{ fontSize: '0.75rem', color: action === 'add' ? '#10b981' : '#eab308', fontWeight: 'bold' }}>{action === 'add' ? 'NEW:' : 'RENAME:'}</span>
// // // // // //                     <input
// // // // // //                         autoFocus
// // // // // //                         value={inputValue}
// // // // // //                         onChange={e => setInputValue(e.target.value)}
// // // // // //                         onKeyDown={e => { if (e.key === 'Enter') handleAction(); if (e.key === 'Escape') setAction('idle'); }}
// // // // // //                         onBlur={() => { if (inputValue.trim() && inputValue !== sandpack.activeFile) handleAction(); else setAction('idle'); }}
// // // // // //                         style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: `1px solid ${action === 'add' ? '#10b981' : '#eab308'}`, outline: 'none', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px' }}
// // // // // //                     />
// // // // // //                 </div>
// // // // // //             )}
// // // // // //         </div>
// // // // // //     );
// // // // // // };

// // // // // // // 🚀 Two-way synchronization bridge, with FULL-TREE sync (not just package.json) so that
// // // // // // // anything created/edited from the terminal (new files, files touched by CLI tools, etc.)
// // // // // // // makes it back into the Sandpack editor state — and therefore into the autosave snapshot.
// // // // // // const WebContainerSyncBridge: React.FC<{
// // // // // //     wcInstance: WebContainer | null,
// // // // // //     blockId: string,
// // // // // //     canonicalKeysRef: React.MutableRefObject<Set<string>>,
// // // // // // }> = ({ wcInstance, blockId, canonicalKeysRef }) => {
// // // // // //     const { sandpack } = useSandpack();
// // // // // //     const lastCodeRef = useRef<Record<string, string>>({});
// // // // // //     const isWritingRef = useRef<boolean>(false);

// // // // // //     if (Object.keys(lastCodeRef.current).length === 0) {
// // // // // //         Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // // // // //             lastCodeRef.current[path] = fileObj.code;
// // // // // //         });
// // // // // //     }

// // // // // //     // Direction A: Sync Editor edits down to OS disk safely
// // // // // //     useEffect(() => {
// // // // // //         if (!wcInstance) return;

// // // // // //         const timeoutId = setTimeout(() => {
// // // // // //             Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // // // // //                 const code = fileObj.code;

// // // // // //                 if (code !== undefined && lastCodeRef.current[path] !== code) {
// // // // // //                     lastCodeRef.current[path] = code;

// // // // // //                     let outCode: string | Uint8Array = code;
// // // // // //                     if (typeof code === 'string' && code.startsWith('__mlab_base64__')) {
// // // // // //                         const b64 = code.substring(15);
// // // // // //                         const binStr = atob(b64);
// // // // // //                         const arr = new Uint8Array(binStr.length);
// // // // // //                         for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// // // // // //                         outCode = arr;
// // // // // //                     }

// // // // // //                     const cleanPath = path.startsWith('/') ? path : `/${path}`;
// // // // // //                     const fullPath = `/${blockId}${cleanPath}`;

// // // // // //                     const parts = fullPath.split('/').filter(Boolean);
// // // // // //                     isWritingRef.current = true;
// // // // // //                     if (parts.length > 1) {
// // // // // //                         const dirPath = '/' + parts.slice(0, -1).join('/');
// // // // // //                         wcInstance.fs.mkdir(dirPath, { recursive: true }).then(() => {
// // // // // //                             wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// // // // // //                         }).catch(() => {
// // // // // //                             wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// // // // // //                         });
// // // // // //                     } else {
// // // // // //                         wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// // // // // //                     }
// // // // // //                 }
// // // // // //             });
// // // // // //         }, 300);

// // // // // //         return () => clearTimeout(timeoutId);
// // // // // //     }, [sandpack.files, wcInstance, blockId]);

// // // // // //     // Direction B: Walk the WHOLE project tree on disk periodically and pull any changes
// // // // // //     // (new files, files edited via the terminal, package.json changes from npm installs, etc.)
// // // // // //     // back into Sandpack. Guarded by isWritingRef so we don't fight with Direction A.
// // // // // //     useEffect(() => {
// // // // // //         if (!wcInstance) return;
// // // // // //         let mounted = true;
// // // // // //         let inFlight = false;

// // // // // //         const walk = async (dir: string, relBase: string, acc: Record<string, string>) => {
// // // // // //             let entries: any[];
// // // // // //             try {
// // // // // //                 entries = await wcInstance.fs.readdir(dir, { withFileTypes: true } as any);
// // // // // //             } catch (e) { return; }

// // // // // //             for (const entry of entries) {
// // // // // //                 const name = typeof entry === 'string' ? entry : entry.name;
// // // // // //                 const isDir = typeof entry === 'string' ? false : entry.isDirectory?.();
// // // // // //                 const relPath = `${relBase}/${name}`;
// // // // // //                 if (shouldIgnorePath(relPath)) continue;

// // // // // //                 if (isDir) {
// // // // // //                     await walk(`${dir}/${name}`, relPath, acc);
// // // // // //                 } else {
// // // // // //                     try {
// // // // // //                         const content = await wcInstance.fs.readFile(`${dir}/${name}`, 'utf-8');
// // // // // //                         acc[relPath] = content;
// // // // // //                     } catch (e) { /* binary or unreadable, skip */ }
// // // // // //                 }
// // // // // //             }
// // // // // //         };

// // // // // //         const poll = async () => {
// // // // // //             if (isWritingRef.current || inFlight) return;
// // // // // //             inFlight = true;
// // // // // //             try {
// // // // // //                 const diskFiles: Record<string, string> = {};
// // // // // //                 await walk(`/${blockId}`, '', diskFiles);

// // // // // //                 for (const [relPath, content] of Object.entries(diskFiles)) {
// // // // // //                     if (!mounted) break;
// // // // // //                     const currentCode = sandpack.files[relPath]?.code;
// // // // // //                     if (content !== currentCode && content !== lastCodeRef.current[relPath]) {
// // // // // //                         lastCodeRef.current[relPath] = content;
// // // // // //                         canonicalKeysRef.current.add(relPath);
// // // // // //                         if (sandpack.files[relPath] !== undefined) {
// // // // // //                             sandpack.updateFile(relPath, content);
// // // // // //                         } else if (typeof sandpack.addFile === 'function') {
// // // // // //                             sandpack.addFile(relPath, content);
// // // // // //                         }
// // // // // //                     }
// // // // // //                 }
// // // // // //             } catch (e) { /* non-fatal, retry next tick */ }
// // // // // //             inFlight = false;
// // // // // //         };

// // // // // //         const intervalId = setInterval(poll, 2500);
// // // // // //         return () => {
// // // // // //             mounted = false;
// // // // // //             clearInterval(intervalId);
// // // // // //         };
// // // // // //     }, [wcInstance, blockId, sandpack, canonicalKeysRef]);

// // // // // //     return null;
// // // // // // };

// // // // // // // Lives at module scope (not redefined on every parent render) so it doesn't remount constantly.
// // // // // // const StateHarvester: React.FC<{ onFilesChange: (files: Record<string, string>) => void }> = ({ onFilesChange }) => {
// // // // // //     const { sandpack } = useSandpack();
// // // // // //     useEffect(() => {
// // // // // //         const currentFiles: Record<string, string> = {};
// // // // // //         for (const [path, fileObj] of Object.entries(sandpack.files)) {
// // // // // //             const cleanPath = path.startsWith('/') ? path : `/${path}`;
// // // // // //             if (fileObj && !fileObj.hidden && typeof fileObj.code === 'string') {
// // // // // //                 currentFiles[cleanPath] = fileObj.code;
// // // // // //             }
// // // // // //         }
// // // // // //         onFilesChange(currentFiles);
// // // // // //     }, [sandpack.files, onFilesChange]);
// // // // // //     return null;
// // // // // // };

// // // // // // export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false }) => {
// // // // // //     const toast = useToast();
// // // // // //     const [isMaximized, setIsMaximized] = useState(false);
// // // // // //     const onChangeRef = useRef(onChange);
// // // // // //     useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

// // // // // //     const [lockedFiles, setLockedFiles] = useState(() => {
// // // // // //         const filesToLoad = learnerAns?.snapshot
// // // // // //             ? (typeof learnerAns.snapshot === 'string' ? JSON.parse(learnerAns.snapshot) : { ...learnerAns.snapshot })
// // // // // //             : { ...(block.initialFiles || {}) };
// // // // // //         return processProjectData(filesToLoad);
// // // // // //     });
// // // // // //     const [template, setTemplate] = useState<"vite-react-ts" | "vite-react">(() => detectTemplate(lockedFiles));

// // // // // //     const [runId, setRunId] = useState(Date.now().toString());
// // // // // //     const [previewUrl, setPreviewUrl] = useState<string>('');
// // // // // //     const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
// // // // // //     const [statusText, setStatusText] = useState("Booting OS...");

// // // // // //     const [wcReady, setWcReady] = useState(false);
// // // // // //     const [iframeKey, setIframeKey] = useState(0);

// // // // // //     // --- Dual terminals: one for persistent logs, one for an interactive shell ---
// // // // // //     const [activeTerminalTab, setActiveTerminalTab] = useState<'logs' | 'shell'>('logs');

// // // // // //     const logsTerminalRef = useRef<HTMLDivElement>(null);
// // // // // //     const logsXtermRef = useRef<Terminal | null>(null);
// // // // // //     const logsFitAddonRef = useRef<FitAddon | null>(null);

// // // // // //     const shellTerminalRef = useRef<HTMLDivElement>(null);
// // // // // //     const shellXtermRef = useRef<Terminal | null>(null);
// // // // // //     const shellFitAddonRef = useRef<FitAddon | null>(null);

// // // // // //     const devProcessRef = useRef<any>(null);
// // // // // //     const shellProcessRef = useRef<any>(null);

// // // // // //     const resizeObserverRef = useRef<ResizeObserver | null>(null);

// // // // // //     const canonicalKeysRef = useRef<Set<string>>(new Set(Object.keys(lockedFiles).map(p => p.startsWith('/') ? p : '/' + p)));
// // // // // //     const latestFrontendFilesRef = useRef<Record<string, string>>({});

// // // // // //     // --- Robust autosave: debounce on every edit + flush on unload/hide/unmount ---
// // // // // //     const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// // // // // //     const flushSave = useCallback(() => {
// // // // // //         if (!onChangeRef.current || readOnly) return;
// // // // // //         const filteredSnapshot: Record<string, string> = {};
// // // // // //         for (const [path, content] of Object.entries(latestFrontendFilesRef.current)) {
// // // // // //             if (canonicalKeysRef.current.has(path)) {
// // // // // //                 filteredSnapshot[path] = content;
// // // // // //             }
// // // // // //         }
// // // // // //         onChangeRef.current({ snapshot: createSafeSnapshot(filteredSnapshot), lastSavedAt: new Date().toISOString() });
// // // // // //     }, [readOnly]);

// // // // // //     const scheduleSave = useCallback(() => {
// // // // // //         if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// // // // // //         saveDebounceRef.current = setTimeout(() => {
// // // // // //             flushSave();
// // // // // //             saveDebounceRef.current = null;
// // // // // //         }, 1500);
// // // // // //     }, [flushSave]);

// // // // // //     const handleFilesChange = useCallback((files: Record<string, string>) => {
// // // // // //         latestFrontendFilesRef.current = files;
// // // // // //         scheduleSave();
// // // // // //     }, [scheduleSave]);

// // // // // //     // Save once immediately on mount so there's always a baseline snapshot.
// // // // // //     useEffect(() => {
// // // // // //         if (onChangeRef.current && !readOnly) {
// // // // // //             onChangeRef.current({
// // // // // //                 snapshot: createSafeSnapshot(lockedFiles),
// // // // // //                 lastSavedAt: new Date().toISOString()
// // // // // //             });
// // // // // //         }
// // // // // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // // // // //     }, []);

// // // // // //     // Flush on tab close, tab hide (backgrounded/switched away), and component unmount —
// // // // // //     // this is what actually prevents "lost work on reload".
// // // // // //     useEffect(() => {
// // // // // //         const handleBeforeUnload = () => { flushSave(); };
// // // // // //         const handleVisibilityChange = () => { if (document.visibilityState === 'hidden') flushSave(); };

// // // // // //         window.addEventListener('beforeunload', handleBeforeUnload);
// // // // // //         document.addEventListener('visibilitychange', handleVisibilityChange);

// // // // // //         return () => {
// // // // // //             window.removeEventListener('beforeunload', handleBeforeUnload);
// // // // // //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// // // // // //             if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// // // // // //             flushSave();
// // // // // //         };
// // // // // //     }, [flushSave]);

// // // // // //     // Fallback safety-net save in case an edit never settles into a "quiet" 1.5s window
// // // // // //     // (e.g. continuous programmatic writes from the terminal sync bridge).
// // // // // //     useEffect(() => {
// // // // // //         const intervalId = setInterval(() => { flushSave(); }, 8000);
// // // // // //         return () => clearInterval(intervalId);
// // // // // //     }, [flushSave]);

// // // // // //     useEffect(() => {
// // // // // //         let mounted = true;
// // // // // //         setPreviewUrl('');
// // // // // //         setStatusText("Initializing Environment...");

// // // // // //         const logsTerm = new Terminal({
// // // // // //             theme: { background: '#0f172a', foreground: '#e2e8f0' },
// // // // // //             fontFamily: 'monospace',
// // // // // //             fontSize: 12,
// // // // // //             convertEol: true,
// // // // // //             cursorBlink: false,
// // // // // //             disableStdin: true,
// // // // // //         });
// // // // // //         const logsFitAddon = new FitAddon();
// // // // // //         logsTerm.loadAddon(logsFitAddon);
// // // // // //         logsXtermRef.current = logsTerm;
// // // // // //         logsFitAddonRef.current = logsFitAddon;
// // // // // //         if (logsTerminalRef.current) {
// // // // // //             try { logsTerm.open(logsTerminalRef.current); } catch (e) { console.error("Logs terminal open failed:", e); }
// // // // // //         }

// // // // // //         const shellTerm = new Terminal({
// // // // // //             theme: { background: '#0f172a', foreground: '#e2e8f0' },
// // // // // //             fontFamily: 'monospace',
// // // // // //             fontSize: 12,
// // // // // //             convertEol: true,
// // // // // //             cursorBlink: true,
// // // // // //         });
// // // // // //         const shellFitAddon = new FitAddon();
// // // // // //         shellTerm.loadAddon(shellFitAddon);
// // // // // //         shellXtermRef.current = shellTerm;
// // // // // //         shellFitAddonRef.current = shellFitAddon;
// // // // // //         if (shellTerminalRef.current) {
// // // // // //             try { shellTerm.open(shellTerminalRef.current); } catch (e) { console.error("Shell terminal open failed:", e); }
// // // // // //         }

// // // // // //         const fitBoth = () => {
// // // // // //             try {
// // // // // //                 if (logsTerm.element && logsTerminalRef.current && logsTerminalRef.current.clientWidth > 0) logsFitAddon.fit();
// // // // // //             } catch (e) { }
// // // // // //             try {
// // // // // //                 if (shellTerm.element && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0) {
// // // // // //                     shellFitAddon.fit();
// // // // // //                     if (shellProcessRef.current) {
// // // // // //                         shellProcessRef.current.resize({ cols: shellTerm.cols, rows: shellTerm.rows });
// // // // // //                     }
// // // // // //                 }
// // // // // //             } catch (e) { }
// // // // // //         };

// // // // // //         resizeObserverRef.current = new ResizeObserver(() => { if (mounted) fitBoth(); });
// // // // // //         if (logsTerminalRef.current) resizeObserverRef.current.observe(logsTerminalRef.current);
// // // // // //         if (shellTerminalRef.current) resizeObserverRef.current.observe(shellTerminalRef.current);

// // // // // //         const boot = async () => {
// // // // // //             try {
// // // // // //                 const wc = await getWebContainer();
// // // // // //                 if (!mounted) return;
// // // // // //                 setWcInstance(wc);

// // // // // //                 if (devProcessRef.current) {
// // // // // //                     try { devProcessRef.current.kill(); } catch (e) { }
// // // // // //                     devProcessRef.current = null;
// // // // // //                 }
// // // // // //                 if (shellProcessRef.current) {
// // // // // //                     try { shellProcessRef.current.kill(); } catch (e) { }
// // // // // //                     shellProcessRef.current = null;
// // // // // //                 }

// // // // // //                 try {
// // // // // //                     await wc.fs.rm(block.id, { recursive: true, force: true });
// // // // // //                 } catch (e) { /* ignore */ }

// // // // // //                 setStatusText("Mounting Files...");
// // // // // //                 const tree = convertToTree(lockedFiles);
// // // // // //                 await wc.mount({ [block.id]: { directory: tree } });

// // // // // //                 if (mounted) setWcReady(true);

// // // // // //                 await wc.fs.mkdir(`/${block.id}/.bin`, { recursive: true });
// // // // // //                 await wc.fs.writeFile(`/${block.id}/.bin/git`, GIT_SHIM_SCRIPT);

// // // // // //                 logsTerm.writeln('\x1b[1;32m>> WEB-CONTAINER SYSTEM ONLINE\x1b[0m');

// // // // // //                 // Spawn the interactive shell immediately and independently — it no longer
// // // // // //                 // steals/clears the log terminal, and you can type in it right away.
// // // // // //                 try {
// // // // // //                     const shellProcess = await wc.spawn('jsh', {
// // // // // //                         terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 24 },
// // // // // //                         cwd: `/${block.id}`
// // // // // //                     });
// // // // // //                     shellProcessRef.current = shellProcess;
// // // // // //                     const inputWriter = shellProcess.input.getWriter();
// // // // // //                     await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH" && clear\n');

// // // // // //                     shellProcess.output.pipeTo(new WritableStream({
// // // // // //                         write: data => shellTerm.write(data)
// // // // // //                     }));
// // // // // //                     shellTerm.onData(keyData => { inputWriter.write(keyData); });
// // // // // //                 } catch (err: any) {
// // // // // //                     console.error("Shell spawn error:", err);
// // // // // //                     shellTerm.writeln(`\r\n\x1b[1;31m>> Failed to start interactive shell: ${err?.message ?? err}\x1b[0m`);
// // // // // //                 }

// // // // // //                 setStatusText("Installing Packages...");
// // // // // //                 logsTerm.writeln('\x1b[1;33m>> Running npm install...\x1b[0m');

// // // // // //                 const installProcess = await wc.spawn('npm', ['install', '--no-package-lock'], { cwd: `/${block.id}` });
// // // // // //                 installProcess.output.pipeTo(new WritableStream({
// // // // // //                     write: data => logsTerm.write(data)
// // // // // //                 }));

// // // // // //                 const exitCode = await installProcess.exit;
// // // // // //                 if (exitCode !== 0) throw new Error("Installation failed");

// // // // // //                 setStatusText("Starting Server...");
// // // // // //                 logsTerm.writeln('\n\x1b[1;36m>> Starting Vite server...\x1b[0m');

// // // // // //                 const devProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: `/${block.id}` });
// // // // // //                 devProcessRef.current = devProcess;

// // // // // //                 devProcess.output.pipeTo(new WritableStream({
// // // // // //                     write: data => logsTerm.write(data)
// // // // // //                 }));

// // // // // //                 wc.on('server-ready', (port, url) => {
// // // // // //                     if (!mounted) return;
// // // // // //                     setPreviewUrl(url);
// // // // // //                     setStatusText("Online");
// // // // // //                     logsTerm.writeln(`\n\x1b[1;32m>> Server deployed on port ${port}\x1b[0m`);
// // // // // //                 });

// // // // // //             } catch (err: any) {
// // // // // //                 logsTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
// // // // // //                 setStatusText("Boot Failed");
// // // // // //             }
// // // // // //         };

// // // // // //         boot();

// // // // // //         return () => {
// // // // // //             mounted = false;
// // // // // //             if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
// // // // // //             logsTerm.dispose();
// // // // // //             shellTerm.dispose();
// // // // // //             logsXtermRef.current = null;
// // // // // //             logsFitAddonRef.current = null;
// // // // // //             shellXtermRef.current = null;
// // // // // //             shellFitAddonRef.current = null;
// // // // // //             if (devProcessRef.current) {
// // // // // //                 try { devProcessRef.current.kill(); } catch (e) { }
// // // // // //                 devProcessRef.current = null;
// // // // // //             }
// // // // // //             if (shellProcessRef.current) {
// // // // // //                 try { shellProcessRef.current.kill(); } catch (e) { }
// // // // // //                 shellProcessRef.current = null;
// // // // // //             }
// // // // // //         };
// // // // // //     }, [runId, template]);

// // // // // //     const [previewHeight, setPreviewHeight] = useState(420);
// // // // // //     const [isDragging, setIsDragging] = useState(false);

// // // // // //     const handleResizerMouseDown = (e: React.MouseEvent) => {
// // // // // //         e.preventDefault();
// // // // // //         setIsDragging(true);
// // // // // //         const startY = e.clientY;
// // // // // //         const startHeight = previewHeight;

// // // // // //         const resizerBar = e.currentTarget as HTMLDivElement;
// // // // // //         const parentPanel = resizerBar.parentElement;
// // // // // //         const totalHeight = parentPanel ? parentPanel.getBoundingClientRect().height : 700;

// // // // // //         const handleMouseMove = (moveEvent: MouseEvent) => {
// // // // // //             const deltaY = moveEvent.clientY - startY;
// // // // // //             const minHeight = 10;
// // // // // //             const maxHeight = totalHeight - 36;
// // // // // //             const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
// // // // // //             setPreviewHeight(newHeight);
// // // // // //         };

// // // // // //         const handleMouseUp = () => {
// // // // // //             setIsDragging(false);
// // // // // //             document.removeEventListener('mousemove', handleMouseMove);
// // // // // //             document.removeEventListener('mouseup', handleMouseUp);
// // // // // //         };

// // // // // //         document.addEventListener('mousemove', handleMouseMove);
// // // // // //         document.addEventListener('mouseup', handleMouseUp);
// // // // // //     };

// // // // // //     useEffect(() => {
// // // // // //         const timeoutId = setTimeout(() => {
// // // // // //             try {
// // // // // //                 if (logsXtermRef.current?.element && logsFitAddonRef.current) logsFitAddonRef.current.fit();
// // // // // //                 if (shellXtermRef.current?.element && shellFitAddonRef.current) {
// // // // // //                     shellFitAddonRef.current.fit();
// // // // // //                     if (shellProcessRef.current && shellXtermRef.current) {
// // // // // //                         shellProcessRef.current.resize({
// // // // // //                             cols: shellXtermRef.current.cols,
// // // // // //                             rows: shellXtermRef.current.rows
// // // // // //                         });
// // // // // //                     }
// // // // // //                 }
// // // // // //             } catch (e) { }
// // // // // //         }, 250);
// // // // // //         return () => clearTimeout(timeoutId);
// // // // // //     }, [isMaximized, activeTerminalTab]);

// // // // // //     useEffect(() => {
// // // // // //         if (isMaximized) {
// // // // // //             document.documentElement.style.overflow = 'hidden';
// // // // // //             document.body.style.overflow = 'hidden';
// // // // // //         } else {
// // // // // //             document.documentElement.style.overflow = '';
// // // // // //             document.body.style.overflow = '';
// // // // // //         }
// // // // // //     }, [isMaximized]);

// // // // // //     const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
// // // // // //         const file = e.target.files?.[0];
// // // // // //         if (!file) return;
// // // // // //         const zip = new JSZip();
// // // // // //         const contents = await zip.loadAsync(file);

// // // // // //         const allPaths = Object.keys(contents.files).filter(
// // // // // //             p => !contents.files[p].dir && !p.includes('__MACOSX') && !p.startsWith('.')
// // // // // //         );

// // // // // //         let commonPrefix: string | null = null;
// // // // // //         for (const p of allPaths) {
// // // // // //             const topFolder = p.split('/')[0];
// // // // // //             if (!p.includes('/')) { commonPrefix = null; break; }
// // // // // //             if (commonPrefix === null) commonPrefix = topFolder;
// // // // // //             else if (commonPrefix !== topFolder) { commonPrefix = null; break; }
// // // // // //         }

// // // // // //         const isBinaryFile = (path: string) => {
// // // // // //             const lowerPath = path.toLowerCase();
// // // // // //             const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm'];
// // // // // //             return binaryExtensions.some(ext => lowerPath.endsWith(ext));
// // // // // //         };

// // // // // //         const newFiles: Record<string, string> = {};
// // // // // //         for (const path of allPaths) {
// // // // // //             const strippedPath = commonPrefix ? path.slice(commonPrefix.length + 1) : path;
// // // // // //             if (!strippedPath) continue;

// // // // // //             if (isBinaryFile(path)) {
// // // // // //                 const b64 = await contents.files[path].async('base64');
// // // // // //                 newFiles[`/${strippedPath}`] = `__mlab_base64__${b64}`;
// // // // // //             } else {
// // // // // //                 newFiles[`/${strippedPath}`] = await contents.files[path].async('string');
// // // // // //             }
// // // // // //         }

// // // // // //         const cleanFiles = processProjectData(newFiles);
// // // // // //         setTemplate(detectTemplate(cleanFiles));
// // // // // //         setLockedFiles(cleanFiles);
// // // // // //         canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));
// // // // // //         latestFrontendFilesRef.current = {};

// // // // // //         setRunId(Date.now().toString());
// // // // // //         e.target.value = '';

// // // // // //         if (onChangeRef.current) onChangeRef.current({ snapshot: createSafeSnapshot(cleanFiles), lastSavedAt: new Date().toISOString() });
// // // // // //         toast?.success("Project Imported Successfully!");
// // // // // //     };

// // // // // //     const handleDownloadZip = async () => {
// // // // // //         const zip = new JSZip();
// // // // // //         const filesToZip = latestFrontendFilesRef.current;

// // // // // //         Object.entries(filesToZip).forEach(([path, content]) => {
// // // // // //             if (canonicalKeysRef.current.has(path)) {
// // // // // //                 const cleanPath = path.startsWith('/') ? path.substring(1) : path;
// // // // // //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) {
// // // // // //                     zip.file(cleanPath, content.substring(15), { base64: true });
// // // // // //                 } else {
// // // // // //                     zip.file(cleanPath, content);
// // // // // //                 }
// // // // // //             }
// // // // // //         });

// // // // // //         const blob = await zip.generateAsync({ type: "blob" });
// // // // // //         const url = URL.createObjectURL(blob);
// // // // // //         const a = document.createElement('a');
// // // // // //         a.href = url;
// // // // // //         a.download = `codetribe_project_${block.id}.zip`;
// // // // // //         a.click();
// // // // // //         URL.revokeObjectURL(url);
// // // // // //         toast?.success("Project Downloaded Successfully!");
// // // // // //     };

// // // // // //     // 🚀 Properly declare containerStyle inside component block scope
// // // // // //     const containerStyle: React.CSSProperties = isMaximized ? {
// // // // // //         position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999,
// // // // // //         border: 'none', borderRadius: 0, overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// // // // // //     } : {
// // // // // //         position: 'relative', width: '100%', height: '700px', marginTop: '1rem',
// // // // // //         border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// // // // // //     };

// // // // // //     const terminalTabBtnStyle = (active: boolean): React.CSSProperties => ({
// // // // // //         background: active ? '#334155' : 'transparent',
// // // // // //         border: 'none',
// // // // // //         color: active ? '#fff' : '#94a3b8',
// // // // // //         cursor: 'pointer',
// // // // // //         display: 'flex',
// // // // // //         alignItems: 'center',
// // // // // //         gap: '5px',
// // // // // //         padding: '4px 10px',
// // // // // //         borderRadius: '4px',
// // // // // //         fontSize: '0.7rem',
// // // // // //         fontWeight: 'bold',
// // // // // //     });

// // // // // //     return (
// // // // // //         <div style={containerStyle}>
// // // // // //             {/* Toolbar */}
// // // // // //             <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #334155' }}>
// // // // // //                 <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // // //                     <Code size={14} color="#3b82f6" /> {block.title || 'Live IDE'}
// // // // // //                 </span>
// // // // // //                 <div style={{ display: 'flex', gap: '8px' }}>
// // // // // //                     <label style={{ background: '#3b82f6', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // // //                         <FolderArchive size={14} /> Import ZIP
// // // // // //                         <input type="file" accept=".zip" hidden onChange={handleZipImport} />
// // // // // //                     </label>
// // // // // //                     <button onClick={handleDownloadZip} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// // // // // //                         <Download size={14} /> <span className="ap-hide-mobile">ZIP</span>
// // // // // //                     </button>
// // // // // //                     <button onClick={() => setIframeKey(k => k + 1)} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// // // // // //                         <RefreshCw size={14} /> <span className="ap-hide-mobile">Reload</span>
// // // // // //                     </button>
// // // // // //                     <button onClick={() => setIsMaximized(!isMaximized)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// // // // // //                         {isMaximized ? <Minimize size={14} /> : <Maximize size={14} />} {isMaximized ? 'Exit' : 'Fullscreen'}
// // // // // //                     </button>
// // // // // //                 </div>
// // // // // //             </div>

// // // // // //             {/* Content Body */}
// // // // // //             <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
// // // // // //                 <Group direction="horizontal" style={{ width: '100%', height: '100%' }}>

// // // // // //                     {/* LEFT PANEL */}
// // // // // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column' }}>
// // // // // //                         <style>{`
// // // // // //                             .sp-layout, .sp-wrapper { height: 100% !important; max-height: 100% !important; }
// // // // // //                             [data-panel-group], [data-panel] { height: 100% !important; }
// // // // // //                         `}</style>

// // // // // //                         <SandpackProvider key={runId} template={template} files={lockedFiles} theme="dark">
// // // // // //                             <SandpackLayout style={{ flex: 1, height: '100%', border: 'none', borderRadius: 0 }}>
// // // // // //                                 <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
// // // // // //                                     <SandpackFileActions readOnly={readOnly} canonicalKeysRef={canonicalKeysRef} wcInstance={wcInstance} blockId={block.id} />
// // // // // //                                     <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
// // // // // //                                         <div style={{ width: '200px', borderRight: '1px solid #334155' }}>
// // // // // //                                             <SandpackFileExplorer style={{ height: '100%' }} />
// // // // // //                                         </div>
// // // // // //                                         <div style={{ flex: 1 }}>
// // // // // //                                             <SandpackCodeEditor showTabs closableTabs style={{ height: '100%' }} readOnly={readOnly} />
// // // // // //                                         </div>
// // // // // //                                     </div>
// // // // // //                                 </div>
// // // // // //                             </SandpackLayout>
// // // // // //                             {!readOnly && wcReady && <WebContainerSyncBridge wcInstance={wcInstance} blockId={block.id} canonicalKeysRef={canonicalKeysRef} />}
// // // // // //                             <StateHarvester onFilesChange={handleFilesChange} />
// // // // // //                         </SandpackProvider>
// // // // // //                     </Panel>

// // // // // //                     <Separator style={{ width: '4px', background: '#334155', cursor: 'col-resize' }} />

// // // // // //                     {/* RIGHT PANEL */}
// // // // // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', background: '#0f172a' }}>

// // // // // //                         <div style={{ height: `${previewHeight}px`, position: 'relative', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
// // // // // //                             {previewUrl ? (
// // // // // //                                 <iframe key={iframeKey} src={previewUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" />
// // // // // //                             ) : (
// // // // // //                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
// // // // // //                                     <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
// // // // // //                                     <span style={{ fontSize: '0.85rem' }}>{statusText}</span>
// // // // // //                                 </div>
// // // // // //                             )}
// // // // // //                             {isDragging && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />}
// // // // // //                         </div>

// // // // // //                         <div
// // // // // //                             onMouseDown={handleResizerMouseDown}
// // // // // //                             style={{ height: '4px', background: '#334155', cursor: 'row-resize', flexShrink: 0, transition: 'background 0.15s' }}
// // // // // //                             onMouseEnter={e => e.currentTarget.style.background = '#3b82f6'}
// // // // // //                             onMouseLeave={e => e.currentTarget.style.background = '#334155'}
// // // // // //                         />

// // // // // //                         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
// // // // // //                             <div style={{ padding: '4px 8px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
// // // // // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'logs')} onClick={() => setActiveTerminalTab('logs')}>
// // // // // //                                     <ScrollText size={12} /> Logs
// // // // // //                                 </button>
// // // // // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'shell')} onClick={() => setActiveTerminalTab('shell')}>
// // // // // //                                     <SquareTerminal size={12} /> Shell
// // // // // //                                 </button>
// // // // // //                             </div>
// // // // // //                             <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
// // // // // //                                 {/* Both terminals stay mounted & running at all times — only visibility toggles,
// // // // // //                                     so log output keeps accumulating in the background while you use the shell, and vice versa. */}
// // // // // //                                 <div style={{
// // // // // //                                     position: 'absolute', inset: 0, padding: '8px',
// // // // // //                                     visibility: activeTerminalTab === 'logs' ? 'visible' : 'hidden',
// // // // // //                                     pointerEvents: activeTerminalTab === 'logs' ? 'auto' : 'none',
// // // // // //                                 }}>
// // // // // //                                     <div ref={logsTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
// // // // // //                                 </div>
// // // // // //                                 <div style={{
// // // // // //                                     position: 'absolute', inset: 0, padding: '8px',
// // // // // //                                     visibility: activeTerminalTab === 'shell' ? 'visible' : 'hidden',
// // // // // //                                     pointerEvents: activeTerminalTab === 'shell' ? 'auto' : 'none',
// // // // // //                                 }}>
// // // // // //                                     <div ref={shellTerminalRef} style={{ width: '100%', height: '100%', minHeight: '10px', display: 'block' }} />
// // // // // //                                 </div>
// // // // // //                             </div>
// // // // // //                         </div>

// // // // // //                     </Panel>
// // // // // //                 </Group>
// // // // // //             </div>
// // // // // //         </div>
// // // // // //     );
// // // // // // };

// // // // // // export default CodeSandboxPlayer;
