// src/components/common/CodeSandboxPlayer/CodeSandboxPlayer.tsx

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Code, Maximize, Minimize, CheckCircle, Play, Loader2, Plus, X, Trash2, Pencil,
    FilePlus, Download, Github, FolderArchive, RefreshCw, AlertTriangle, ScrollText, SquareTerminal, ShieldAlert
} from 'lucide-react';
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
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { getWebContainer } from './webcontainerManager';
import type { FileSystemTree, WebContainer, WebContainerProcess } from '@webcontainer/api';
import { createPortal } from 'react-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { trace } from 'firebase/performance';
import { getStorage, ref as fbStorageRef, getBytes, uploadString } from 'firebase/storage';
import { db, perf } from '../../../lib/firebase';

export interface SandboxFileMap {
    [path: string]: string;
}

export interface SandboxBlock {
    id: string;
    title?: string;
    template?: string;
    question?: string;
    initialFiles?: SandboxFileMap;
    initialFilesStoragePath?: string;
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
    portalTarget?: HTMLElement;
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀 AUTOMATED SANDBOX CRASH & DIAGNOSTIC REPORTER
// ════════════════════════════════════════════════════════════════════════════
const reportSandboxCrash = async (errorName: string, errorMessage: string, errorStack?: string, extraCtx?: Record<string, any>) => {
    try {
        const analytics = getAnalytics();
        logEvent(analytics, 'exception', {
            description: `[CodeSandbox:${errorName}] ${errorMessage}`.substring(0, 100),
            fatal: false,
        });
    } catch (e) {
        /* Analytics blocked */
    }

    try {
        await addDoc(collection(db, 'system_crashes'), {
            errorName: `CodeSandboxPlayer: ${errorName}`,
            errorMessage: errorMessage || 'Unknown IDE Exception',
            errorStack: errorStack || '',
            componentStack: 'CodeSandboxPlayer Component',
            url: window.location.href,
            userAgent: navigator.userAgent,
            extraContext: extraCtx || {},
            timestamp: serverTimestamp(),
            createdAt: new Date().toISOString(),
        });
    } catch (dbErr) {
        console.error('Failed to log sandbox crash to Firestore:', dbErr);
    }
};

const measurePerformance = async <T,>(
    traceName: string,
    asyncFn: () => Promise<T>,
    attributes?: Record<string, string>
): Promise<T> => {
    if (!perf) return await asyncFn();
    const customTrace = trace(perf, traceName);
    if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
            if (value !== undefined && value !== null) customTrace.putAttribute(key, String(value));
        });
    }
    customTrace.start();
    try {
        const result = await asyncFn();
        customTrace.stop();
        return result;
    } catch (error: any) {
        customTrace.putAttribute('has_error', 'true');
        customTrace.stop();
        throw error;
    }
};

const sanitizeBlockId = (id: string | undefined): string => {
    const clean = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    return clean || 'mlab-default';
};

const isSensitivePath = (relPath: string) => {
    const fileName = relPath.split('/').filter(Boolean).pop() || '';
    return fileName === '.env' || fileName.startsWith('.env.');
};

const envConsentKey = (blockId: string, path: string) => `mlab_env_consent_${blockId}_${path}`;
const envContentKey = (blockId: string, path: string) => `mlab_env_local_${blockId}_${path}`;

const loadLocalOnlyEnvFiles = (blockId: string): Record<string, string> => {
    const out: Record<string, string> = {};
    try {
        const prefix = `mlab_env_local_${blockId}_`;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!;
            if (key.startsWith(prefix)) {
                const path = key.slice(prefix.length);
                const val = localStorage.getItem(key);
                if (val !== null) out[path] = val;
            }
        }
    } catch { }
    return out;
};

const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache', '.npm-cache', '__MACOSX'];
const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store', 'Thumbs.db'];
const SYNC_IGNORE_EXTS = ['.psd', '.ai', '.xd', '.sketch', '.fig', '.pdf', '.mp4', '.mov', '.zip', '.rar', '.tar', '.gz', '.7z'];

const shouldIgnorePath = (relPath: string) => {
    const parts = relPath.split('/').filter(Boolean);
    if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
    const fileName = parts[parts.length - 1] || '';
    if (fileName.startsWith('._')) return true;
    if (SYNC_IGNORE_FILES.includes(fileName)) return true;
    if (SYNC_IGNORE_EXTS.some(ext => fileName.toLowerCase().endsWith(ext))) return true;
    return false;
};

const makeWellFormed = (str: string): string => {
    if (typeof (str as any).toWellFormed === 'function') return (str as any).toWellFormed();
    return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '$1\uFFFD');
};

export const sanitizeProjectFiles = (rawFiles: Record<string, string>): Record<string, string> => {
    if (!rawFiles || typeof rawFiles !== 'object') return {};
    const cleanMap: Record<string, string> = {};
    const validPaths: string[] = [];

    Object.keys(rawFiles).forEach((path) => {
        const normalizedPath = '/' + path.replace(/^\/+/, '').replace(/\/+/g, '/');
        if (shouldIgnorePath(normalizedPath)) return;
        cleanMap[normalizedPath] = rawFiles[path];
        validPaths.push(normalizedPath);
    });

    if (validPaths.length === 0) return {};

    const rootSegments = new Set(validPaths.map((p) => p.split('/').filter(Boolean)[0]));
    let prefixToStrip = '';
    if (rootSegments.size === 1) {
        const singleFolder = Array.from(rootSegments)[0];
        const allHaveSubpaths = validPaths.every((p) => {
            const parts = p.split('/').filter(Boolean);
            return parts.length > 1 && parts[0] === singleFolder;
        });
        if (allHaveSubpaths) {
            prefixToStrip = `/${singleFolder}`;
        }
    }

    const finalMap: Record<string, string> = {};
    Object.keys(cleanMap).forEach((path) => {
        let newPath = path;
        if (prefixToStrip && newPath.startsWith(prefixToStrip)) {
            newPath = newPath.slice(prefixToStrip.length);
        }
        newPath = '/' + newPath.replace(/^\/+/, '').replace(/\/+/g, '/');
        finalMap[newPath] = cleanMap[path];
    });

    return finalMap;
};

// ════════════════════════════════════════════════════════════════════════════
// 🧠 DYNAMIC AST & FILESYSTEM RESOLVER HELPERS
// ════════════════════════════════════════════════════════════════════════════
const getRelativePath = (fromFile: string, toFile: string): string => {
    const fromParts = fromFile.split('/').filter(Boolean).slice(0, -1);
    const toParts = toFile.split('/').filter(Boolean);

    while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
        fromParts.shift();
        toParts.shift();
    }

    const up = fromParts.map(() => '..');
    const rel = [...up, ...toParts].join('/');
    return rel.startsWith('.') ? rel : `./${rel}`;
};

const discoverPackageDependencies = (files: Record<string, string>): Record<string, string> => {
    const detected: Record<string, string> = {};
    const importRegex = /(?:import|from|require)\s*\(?['"]([^'"\.\/][^'"]*)['"]\)?/g;

    Object.entries(files).forEach(([path, code]) => {
        if (path.includes('.config.') || path.includes('eslint') || path.includes('tailwind') || path.includes('postcss') || path.endsWith('.d.ts')) return;
        if (!/\.(jsx?|tsx?|mjs)$/i.test(path)) return;

        let match;
        while ((match = importRegex.exec(code)) !== null) {
            let pkg = match[1];
            if (pkg.startsWith('@')) {
                pkg = pkg.split('/').slice(0, 2).join('/');
            } else {
                pkg = pkg.split('/')[0];
            }
            if (pkg && !['fs', 'path', 'crypto', 'http', 'events', 'react', 'react-dom'].includes(pkg)) {
                detected[pkg] = '*';
            }
        }
    });

    return detected;
};

const repairRelativeImports = (files: Record<string, string>): void => {
    const fileKeys = Object.keys(files);

    fileKeys.forEach((filePath) => {
        if (!/\.(jsx?|tsx?|html|css)$/i.test(filePath)) return;
        let code = files[filePath];
        const importRegex = /(import\s+(?:[\s\S]*?\s+from\s+)?['"]|src=["'])(\.\/[^'"]+|\.\.\/[^'"]+)(['"])/g;

        const updatedCode = code.replace(importRegex, (fullMatch, prefix, relPath, suffix) => {
            const currentDirParts = filePath.split('/').filter(Boolean).slice(0, -1);
            const relParts = relPath.split('/');
            const resolvedParts = [...currentDirParts];

            for (const part of relParts) {
                if (part === '.') continue;
                if (part === '..') resolvedParts.pop();
                else resolvedParts.push(part);
            }

            const targetPath = '/' + resolvedParts.filter(Boolean).join('/');
            if (files[targetPath]) return fullMatch;

            const targetBasename = relPath.split('/').pop() || '';
            const matchOnDisk = fileKeys.find(k => k.endsWith('/' + targetBasename) || k === '/' + targetBasename);

            if (matchOnDisk) {
                const correctedRelPath = getRelativePath(filePath, matchOnDisk);
                return `${prefix}${correctedRelPath}${suffix}`;
            }

            return fullMatch;
        });

        files[filePath] = updatedCode;
    });
};

const repairHtmlEntryPoint = (files: Record<string, string>): void => {
    const htmlKey = Object.keys(files).find(p => p.toLowerCase().endsWith('/index.html') || p.toLowerCase() === '/index.html');
    if (!htmlKey || !files[htmlKey]) return;

    let html = files[htmlKey];
    const scriptSrcMatch = html.match(/<script[^>]+src=["']([^"']+)["']/i);

    if (scriptSrcMatch) {
        const rawSrc = scriptSrcMatch[1];
        const normalizedSrc = '/' + rawSrc.replace(/^\/+/, '');

        if (!files[normalizedSrc]) {
            const candidates = Object.keys(files).filter(p => /\.(jsx?|tsx?)$/i.test(p));
            const bestMatch = candidates.find(p => {
                const code = files[p] || '';
                return code.includes('createRoot') || code.includes('ReactDOM') || code.includes('render(');
            }) || candidates.find(p => p.includes('main') || p.includes('index')) || candidates[0];

            if (bestMatch) {
                const relSrc = getRelativePath(htmlKey, bestMatch);
                files[htmlKey] = html.replace(rawSrc, relSrc);
            }
        }
    }
};

const createSafeSnapshot = (
    files: Record<string, string>,
    consentMap: Record<string, 'saved' | 'local'> = {},
    onDropped?: (path: string) => void
) => {
    const safeFiles: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
        if (shouldIgnorePath(path)) continue;
        if (isSensitivePath(path) && consentMap[path] !== 'saved') continue;
        if (content.length > 500000) {
            console.warn(`[IDE SNAPSHOT] File ${path} is too large. Excluding from auto-save.`);
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

export const safeParseSnapshot = (raw: string): SandboxFileMap | null => {
    try {
        const parsed = JSON.parse(raw);
        return isValidSnapshot(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

export const parseAndRepairLearnerSnapshot = (raw: any, blockTemplate?: string): SandboxFileMap | null => {
    if (!raw) return null;

    if (typeof raw === 'string' && raw.trim().length > 0) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parseAndRepairLearnerSnapshot(parsed, blockTemplate);
            }
        } catch {
            const isHtml = raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('</body>');
            const fileName = isHtml ? '/index.html' : '/index.js';
            return { [fileName]: raw };
        }
    }

    if (typeof raw === 'object' && !Array.isArray(raw)) {
        if (raw.snapshot) return parseAndRepairLearnerSnapshot(raw.snapshot, blockTemplate);
        if (raw.codeData) return parseAndRepairLearnerSnapshot(raw.codeData, blockTemplate);

        const safeFiles: SandboxFileMap = {};
        let hasFiles = false;

        const ignoreKeys = ['lastSavedAt', 'storagePath', 'dependencies', 'snapshot', 'codeData', 'immediate'];

        for (const [key, value] of Object.entries(raw)) {
            if (ignoreKeys.includes(key)) continue;

            if (typeof key === 'string' && typeof value === 'string') {
                const cleanKey = key.startsWith('/') ? key : `/${key}`;
                safeFiles[cleanKey] = value;
                hasFiles = true;
            }
        }

        if (hasFiles) return safeFiles;

        if (typeof raw.code === 'string' && raw.code.trim().length > 0) {
            const fileName = (blockTemplate === 'html' || raw.code.includes('<html') || raw.code.includes('<!DOCTYPE')) ? '/index.html' : '/index.js';
            return { [fileName]: raw.code };
        }
    }

    return null;
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
                if (typeof content === 'string') {
                    if (content.startsWith('__mlab_base64__')) {
                        const binStr = atob(content.substring(15));
                        const arr = new Uint8Array(binStr.length);
                        for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
                        fileContent = arr;
                    } else {
                        fileContent = makeWellFormed(content);
                    }
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

const getEffectiveTemplate = (files: Record<string, string>, fallback: string | undefined): string => {
    const explicit = fallback?.toLowerCase();

    if (explicit === 'javascript' || explicit === 'html' || explicit === 'vanilla') return 'vanilla';
    if (explicit === 'typescript' || explicit === 'vanilla-ts') return 'vanilla-ts';
    if (explicit === 'node') return 'node';
    if (explicit === 'vite-react' || explicit === 'create-react-app' || explicit === 'react') return 'vite-react';
    if (explicit === 'python') return 'vanilla';
    if (explicit === 'sql') return 'vanilla';

    const fileNames = Object.keys(files);
    const hasReactFile = fileNames.some(p => p.endsWith('.jsx') || p.endsWith('.tsx'));
    return hasReactFile ? 'vite-react' : 'vanilla';
};

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

// ════════════════════════════════════════════════════════════════════════════
// 🚀 DYNAMIC PROJECT PROCESSOR & AUTOMATIC VITE CONFIG GENERATION
// ════════════════════════════════════════════════════════════════════════════
const processProjectData = (
    rawFiles: Record<string, string>,
    targetPort: number,
    templateType: string,
    blockId: string
): Record<string, string> => {
    const out = sanitizeProjectFiles(rawFiles);

    repairRelativeImports(out);
    repairHtmlEntryPoint(out);

    // 🚀 SMART REACT FIX: Force-inject `import React` to prevent "React is not defined" in learner code
    Object.keys(out).forEach(filePath => {
        if (/\.(jsx|tsx)$/i.test(filePath)) {
            const content = out[filePath];
            if (!content.includes("from 'react'") && !content.includes('from "react"')) {
                out[filePath] = `import React from 'react';\n${content}`;
            }
        }
    });

    // SMART GHOST PURGE: If a /src app structure exists, purge confusing root-level duplicates
    const hasSrcApp = Object.keys(out).some(p => p.startsWith('/src/App.') || p.startsWith('/src/main.') || p.startsWith('/src/index.'));
    if (hasSrcApp) {
        const rootGhosts = ['/App.js', '/App.jsx', '/App.ts', '/App.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx', '/styles.css', '/style.css'];
        rootGhosts.forEach(g => {
            if (out[g]) delete out[g];
        });
    }

    const discoveredDeps = discoverPackageDependencies(out);

    if (!out['/package.json']) {
        out['/package.json'] = JSON.stringify({ name: "mlab-workspace-project", type: "module" }, null, 2);
    }

    try {
        const pkg = JSON.parse(out['/package.json']);
        pkg.type = pkg.type || "module";
        pkg.dependencies = pkg.dependencies || {};
        pkg.devDependencies = pkg.devDependencies || {};
        pkg.scripts = pkg.scripts || {};

        Object.keys(discoveredDeps).forEach(dep => {
            if (!pkg.dependencies[dep] && !pkg.devDependencies[dep]) {
                pkg.dependencies[dep] = "*";
            }
        });

        if (!pkg.scripts.dev && !pkg.scripts.start) {
            const isNode = templateType === 'node';
            if (isNode) {
                pkg.scripts.dev = `node index.js`;
            } else {
                pkg.scripts.dev = `vite --port ${targetPort}`;
                pkg.devDependencies['vite'] = pkg.devDependencies['vite'] || "^4.5.3";
            }
        } else if (pkg.scripts.dev && pkg.scripts.dev.includes('vite') && !pkg.scripts.dev.includes('--port')) {
            pkg.scripts.dev = `${pkg.scripts.dev} --port ${targetPort}`;
        }

        const hasVite = pkg.devDependencies['vite'] || pkg.dependencies['vite'] || out['/vite.config.js'] || out['/vite.config.ts'];
        const hasReact = pkg.dependencies['react'] || pkg.devDependencies['react'] || templateType.includes('react') || discoveredDeps['react'] || Object.keys(out).some(p => /\.(jsx|tsx)$/i.test(p));

        if (hasVite && hasReact) {
            pkg.dependencies['react'] = pkg.dependencies['react'] || "*";
            pkg.dependencies['react-dom'] = pkg.dependencies['react-dom'] || "*";
            pkg.devDependencies['@vitejs/plugin-react'] = pkg.devDependencies['@vitejs/plugin-react'] || "^4.2.1";
        }

        delete pkg.engines;
        delete pkg.packageManager;
        out['/package.json'] = JSON.stringify(pkg, null, 2);
    } catch (e) {
        /* Ignore malformed package.json */
    }

    const hasExistingConfig = Object.keys(out).some(p =>
        p.includes('.config.') || p.endsWith('rc') || p.endsWith('rc.js') || p.endsWith('rc.json')
    );

    if (!hasExistingConfig && (out['/package.json']?.includes('vite'))) {
        const hasReact = out['/package.json']?.includes('react');
        if (hasReact) {
            out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  esbuild: {\n    jsx: 'automatic'\n  },\n  server: {\n    port: ${targetPort},\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
        } else {
            out['/vite.config.js'] = `import { defineConfig } from 'vite';\n\nexport default defineConfig({\n  server: {\n    port: ${targetPort},\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
        }
    }

    const consoleInterceptor = `\n<script>\n  (function() {\n    const orig = { ...console };\n    ['log', 'warn', 'error', 'info'].forEach(m => {\n      console[m] = (...args) => {\n        orig[m](...args);\n        try { window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*'); } catch(e) {}\n      };\n    });\n    window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m: 'error', p: e.message }, '*'));\n  })();\n</script>\n`;

    const htmlKey = Object.keys(out).find(p => p.toLowerCase().endsWith('/index.html') || p.toLowerCase() === '/index.html');
    if (htmlKey && out[htmlKey]) {
        let html = out[htmlKey];

        // 🚀 SMART HTML FIX: If the user uploaded a broken index.html (like just an SVG), wrap it so Vite still boots
        if (!html.includes('</body>') && !html.includes('</html>')) {
            html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>App</title>\n</head>\n<body>\n  <div id="root">\n${html}\n  </div>\n</body>\n</html>`;
        }

        if (!html.includes("source: 'preview-console'")) {
            out[htmlKey] = html.includes('<head>')
                ? html.replace('<head>', `<head>${consoleInterceptor}`)
                : `${consoleInterceptor}${html}`;
        } else {
            out[htmlKey] = html;
        }
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

const SandpackFileActions: React.FC<{
    readOnly: boolean,
    canonicalKeysRef: React.MutableRefObject<Set<string>>,
    wcInstance: WebContainer | null,
    blockId: string,
    onSensitiveFileDetected?: (path: string, content: string) => void
}> = ({ readOnly, canonicalKeysRef, wcInstance, blockId, onSensitiveFileDetected }) => {
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

            const defaultContent = "// New file\n";
            if (typeof sandpack.addFile === 'function') sandpack.addFile(path, defaultContent);
            else sandpack.updateFile(path, defaultContent);
            if (typeof sandpack.setActiveFile === 'function') sandpack.setActiveFile(path);
            canonicalKeysRef.current.add(path);

            if (isSensitivePath(path)) {
                onSensitiveFileDetected?.(path, defaultContent);
            }

            if (wcInstance) {
                try {
                    const parts = path.split('/').filter(Boolean);
                    if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
                    await wcInstance.fs.writeFile(`${WORK_DIR}${path}`, defaultContent);
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

                if (isSensitivePath(newPath)) {
                    onSensitiveFileDetected?.(newPath, content);
                }

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

const WebContainerSyncBridge: React.FC<{
    wcInstance: WebContainer | null,
    blockId: string,
    readOnly: boolean,
    canonicalKeysRef: React.MutableRefObject<Set<string>>,
    onSensitiveFileDetected?: (path: string, content: string) => void
}> = ({ wcInstance, blockId, readOnly, canonicalKeysRef, onSensitiveFileDetected }) => {
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
                    if (typeof code === 'string') {
                        if (code.startsWith('__mlab_base64__')) {
                            const binStr = atob(code.substring(15));
                            const arr = new Uint8Array(binStr.length);
                            for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
                            outCode = arr;
                        } else {
                            outCode = makeWellFormed(code);
                        }
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
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [sandpack.files, wcInstance, blockId, readOnly]);

    useEffect(() => {
        if (!wcInstance || readOnly) return;
        let mounted = true;
        let inFlight = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let watcher: { close?: () => void } | null = null;

        const walk = async (dir: string, relBase: string, acc: Record<string, string>, seen: Set<string>) => {
            let entries: any[];
            try {
                entries = await wcInstance.fs.readdir(dir, { withFileTypes: true } as any);
            } catch { return; }

            for (const entry of entries) {
                const name = typeof entry === 'string' ? entry : entry.name;
                const isDir = typeof entry === 'string' ? false : entry.isDirectory?.();
                const relPath = `${relBase}/${name}`;
                if (shouldIgnorePath(relPath)) continue;

                seen.add(relPath);

                if (isDir) {
                    await walk(`${dir}/${name}`, relPath, acc, seen);
                } else {
                    const isBinaryFile = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z'].some(ext => name.toLowerCase().endsWith(ext));

                    try {
                        if (isBinaryFile) {
                            const buffer = await wcInstance.fs.readFile(`${dir}/${name}`);
                            const chunkSize = 0x8000;
                            const chunks = [];
                            for (let i = 0; i < buffer.length; i += chunkSize) {
                                chunks.push(String.fromCharCode.apply(null, Array.from(buffer.subarray(i, i + chunkSize))));
                            }
                            acc[relPath] = `__mlab_base64__${btoa(chunks.join(''))}`;
                        } else {
                            const content = await wcInstance.fs.readFile(`${dir}/${name}`, 'utf-8');
                            acc[relPath] = content;
                        }
                    } catch { }
                }
            }
        };

        const syncFromDisk = async () => {
            if (isWritingRef.current || inFlight) return;
            inFlight = true;
            try {
                const diskFiles: Record<string, string> = {};
                const seenPaths = new Set<string>();
                await walk(`/${blockId}`, '', diskFiles, seenPaths);

                for (const [relPath, content] of Object.entries(diskFiles)) {
                    if (!mounted) break;
                    const currentCode = sandpack.files[relPath]?.code;
                    if (content !== currentCode && content !== lastCodeRef.current[relPath]) {
                        lastCodeRef.current[relPath] = content;
                        canonicalKeysRef.current.add(relPath);

                        if (isSensitivePath(relPath)) {
                            onSensitiveFileDetected?.(relPath, content);
                        }

                        if (sandpack.files[relPath] !== undefined) {
                            sandpack.updateFile(relPath, content);
                        } else if (typeof sandpack.addFile === 'function') {
                            sandpack.addFile(relPath, content);
                        }
                    }
                }

                // 🚀 ZERO-GHOST DELETION SYNC
                for (const sandpackPath of Object.keys(sandpack.files)) {
                    const cleanPath = sandpackPath.startsWith('/') ? sandpackPath : `/${sandpackPath}`;
                    if (!seenPaths.has(cleanPath) && !shouldIgnorePath(cleanPath)) {
                        delete lastCodeRef.current[cleanPath];
                        canonicalKeysRef.current.delete(cleanPath);
                        if (typeof sandpack.deleteFile === 'function') {
                            sandpack.deleteFile(cleanPath);
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
    }, [wcInstance, blockId, sandpack, canonicalKeysRef, onSensitiveFileDetected, readOnly]);

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
        }, 400);

        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [sandpack.files, readOnly, onChange]);
    return null;
};

let globalNpmMutex: Promise<void> = Promise.resolve();

export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false, portalTarget }) => {
    const toast = useToast();
    const [isMaximized, setIsMaximized] = useState(false);
    const [pendingZipFile, setPendingZipFile] = useState<Blob | null>(null);

    const onChangeRef = useRef(onChange);

    const [showGithubModal, setShowGithubModal] = useState(false);
    const [githubUrl, setGithubUrl] = useState('');
    const [isFetchingGithub, setIsFetchingGithub] = useState(false);

    // SENSITIVE (.ENV) FILE CONSENT QUEUE
    const [pendingEnvQueue, setPendingEnvQueue] = useState<Array<{ path: string; content: string }>>([]);
    const envConsentRef = useRef<Record<string, 'saved' | 'local'>>({});

    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

    const safeBlockId = useMemo(() => sanitizeBlockId(block?.id), [block?.id]);

    const queueEnvConsent = useCallback((path: string, content: string) => {
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        if (!isSensitivePath(cleanPath)) return;

        if (envConsentRef.current[cleanPath]) return;

        const storedConsent = localStorage.getItem(envConsentKey(safeBlockId, cleanPath)) as 'saved' | 'local' | null;
        if (storedConsent === 'saved' || storedConsent === 'local') {
            envConsentRef.current[cleanPath] = storedConsent;
            return;
        }

        setPendingEnvQueue(prev => {
            if (prev.some(item => item.path === cleanPath)) return prev;
            return [...prev, { path: cleanPath, content }];
        });
    }, [safeBlockId]);

    const resolveEnvConsent = useCallback((choice: 'saved' | 'local') => {
        if (pendingEnvQueue.length === 0) return;
        const currentItem = pendingEnvQueue[0];
        const { path, content } = currentItem;

        envConsentRef.current[path] = choice;

        try {
            localStorage.setItem(envConsentKey(safeBlockId, path), choice);
            if (choice === 'local') {
                localStorage.setItem(envContentKey(safeBlockId, path), content);
            } else {
                localStorage.removeItem(envContentKey(safeBlockId, path));
            }
        } catch (e) {
            console.warn("localStorage quota or access error:", e);
        }

        setPendingEnvQueue(prev => prev.slice(1));
        flushSaveRef.current(true);
    }, [pendingEnvQueue, safeBlockId]);

    const assignedPort = useMemo(() => {
        let hash = 0;
        const str = safeBlockId;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return 5000 + (Math.abs(hash) % 1000);
    }, [safeBlockId]);

    const snapshotKey = useMemo(() => {
        const s = learnerAns?.snapshot;
        if (!s) return '';
        return typeof s === 'string' ? s : JSON.stringify(s);
    }, [learnerAns?.snapshot]);

    const getInitialConfig = useCallback(() => {
        const parsedFiles = parseAndRepairLearnerSnapshot(learnerAns?.snapshot || learnerAns, block?.template);
        const rawFilesToLoad = (parsedFiles && Object.keys(parsedFiles).length > 0) ? parsedFiles : { ...(block?.initialFiles || {}) };

        const filesToLoad = sanitizeProjectFiles(rawFilesToLoad);

        // Splice in local-only .env files from localStorage
        const localEnvFiles = loadLocalOnlyEnvFiles(safeBlockId);
        Object.entries(localEnvFiles).forEach(([path, content]) => {
            filesToLoad[path] = content;
            envConsentRef.current[path] = 'local';
        });

        const tpl = getEffectiveTemplate(filesToLoad, block?.template);

        return {
            files: processProjectData(filesToLoad, assignedPort, tpl, safeBlockId),
            template: tpl
        };
    }, [learnerAns, block?.initialFiles, block?.template, assignedPort, safeBlockId]);

    const initialConfig = useMemo(() => getInitialConfig(), [getInitialConfig]);

    const [lockedFiles, setLockedFiles] = useState(() => initialConfig.files);
    const [template, setTemplate] = useState<any>(() => initialConfig.template);

    const latestFrontendFilesRef = useRef<Record<string, string>>(initialConfig.files);

    const [runId, setRunId] = useState(Date.now().toString());

    // MEASURED PROJECT LOAD SEQUENCE
    useEffect(() => {
        let cancelled = false;

        const loadProject = async () => {
            const parsedFiles = parseAndRepairLearnerSnapshot(learnerAns?.snapshot || learnerAns, block?.template);
            const hasValidSnapshot = parsedFiles && Object.keys(parsedFiles).length > 0;

            if (hasValidSnapshot) {
                const currentSerialized = createSafeSnapshot(latestFrontendFilesRef.current, envConsentRef.current);
                const incomingSerialized = JSON.stringify(parsedFiles);

                if (currentSerialized === incomingSerialized || incomingSerialized === lastSavedSnapshotRef.current) {
                    return;
                }
            }

            let rawFilesToLoad: Record<string, string> = hasValidSnapshot ? parsedFiles! : { ...(block?.initialFiles || {}) };

            if (!hasValidSnapshot && Object.keys(rawFilesToLoad).length === 0 && block?.initialFilesStoragePath) {
                try {
                    rawFilesToLoad = await measurePerformance(
                        'starter_code_storage_fetch',
                        async () => {
                            const storage = getStorage();
                            const jsonRef = fbStorageRef(storage, block.initialFilesStoragePath);
                            const buffer = await getBytes(jsonRef);
                            const jsonStr = new TextDecoder().decode(buffer);
                            return JSON.parse(jsonStr);
                        },
                        { storagePath: block.initialFilesStoragePath || '', blockId: safeBlockId }
                    );
                } catch (err: any) {
                    console.error("Failed to load offloaded starter code from Storage:", err);
                    reportSandboxCrash('StarterCodeFetchError', err.message || 'Failed to fetch offloaded starter code', err.stack, { storagePath: block.initialFilesStoragePath });
                }
            }

            if (cancelled) return;

            const filesToLoad = sanitizeProjectFiles(rawFilesToLoad);

            // Splice in local-only .env files from localStorage
            const localEnvFiles = loadLocalOnlyEnvFiles(safeBlockId);
            Object.entries(localEnvFiles).forEach(([path, content]) => {
                filesToLoad[path] = content;
                envConsentRef.current[path] = 'local';
            });

            const tpl = getEffectiveTemplate(filesToLoad, block?.template);
            const processed = processProjectData(filesToLoad, assignedPort, tpl, safeBlockId);

            console.log(`✅ [IDE LOAD] Syncing files into Sandpack. Total files: ${Object.keys(processed).length}`);

            setLockedFiles(processed);
            setTemplate(resolveSandpackTemplate(tpl));
            canonicalKeysRef.current = new Set(Object.keys(processed).map(p => p.startsWith('/') ? p : '/' + p));
            latestFrontendFilesRef.current = processed;
        };

        loadProject();

        return () => { cancelled = true; };
    }, [snapshotKey, block?.initialFiles, block?.initialFilesStoragePath, block?.template, assignedPort, safeBlockId]);

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
    const lockedFilesRef = useRef(lockedFiles);
    useEffect(() => { lockedFilesRef.current = lockedFiles; }, [lockedFiles]);

    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedSnapshotRef = useRef<string>('');
    const warnedDroppedFilesRef = useRef<Set<string>>(new Set());

    // MEASURED AUTO-SAVE DISPATCH WITH SENSITIVE FILE FILTER
    const flushSave = useCallback((isImmediate = false) => {
        if (!onChangeRef.current || readOnly) return;

        const filteredSnapshot: Record<string, string> = {};
        for (const [path, content] of Object.entries(latestFrontendFilesRef.current)) {
            filteredSnapshot[path] = content;

            if (isSensitivePath(path) && envConsentRef.current[path] === 'local') {
                try {
                    localStorage.setItem(envContentKey(safeBlockId, path), content);
                } catch { }
            }
        }

        if (Object.keys(filteredSnapshot).length === 0) {
            console.warn("⚠️ [IDE AUTO-SAVE SKIPPED] File map is empty. Refusing to write to Firebase.");
            return;
        }

        const serialized = createSafeSnapshot(filteredSnapshot, envConsentRef.current, (path) => {
            if (!warnedDroppedFilesRef.current.has(path)) {
                warnedDroppedFilesRef.current.add(path);
                toast?.error(`"${path}" is too large to save (max 500KB) and was left out of your saved project.`);
            }
        });

        const unchanged = !isImmediate && serialized === lastSavedSnapshotRef.current;
        if (unchanged) return;

        let dependencies = {};
        if (filteredSnapshot['/package.json']) {
            try { dependencies = JSON.parse(filteredSnapshot['/package.json']).dependencies || {}; } catch { }
        }

        const pendingSnapshot = serialized;

        measurePerformance(
            'ide_autosave_commit',
            async () => {
                const result = onChangeRef.current!({ snapshot: serialized, dependencies, immediate: isImmediate });
                if (result && typeof (result as any).then === 'function') {
                    await (result as Promise<void>);
                }
            },
            { blockId: safeBlockId, fileCount: String(Object.keys(filteredSnapshot).length) }
        ).then(() => {
            lastSavedSnapshotRef.current = pendingSnapshot;
        }).catch((err: any) => {
            console.error('❌ [IDE AUTO-SAVE ERROR] Save rejected:', err);
            reportSandboxCrash('AutoSaveError', err.message || 'Firestore auto-save rejected', err.stack, { blockId: block?.id });
            toast?.error('Failed to save your latest changes. Retrying shortly…');
        });

    }, [block?.id, safeBlockId, readOnly, toast]);

    const scheduleSave = useCallback(() => {
        if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = setTimeout(() => {
            flushSaveRef.current(false);
            saveDebounceRef.current = null;
        }, 1500);
    }, []);

    const handleFilesChange = useCallback((answerPayload: { snapshot: string }) => {
        if (readOnly) return;
        const files = safeParseSnapshot(answerPayload.snapshot);
        if (!files || Object.keys(files).length === 0) return;

        latestFrontendFilesRef.current = files;
        scheduleSave();
    }, [scheduleSave, readOnly]);

    const flushSaveRef = useRef(flushSave);
    useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            flushSaveRef.current(true);
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
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
        const intervalId = setInterval(() => flushSaveRef.current(false), 30000);
        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        const handleMessage = (e: MessageEvent) => {
            if (previewOriginRef.current && e.origin !== previewOriginRef.current) return;
            if (e.data?.source === 'preview-console' && e.data?.blockId === safeBlockId && debugXtermRef.current) {
                let prefix = '\x1b[34m[LOG]\x1b[0m';
                if (e.data.m === 'warn') prefix = '\x1b[33m[WARN]\x1b[0m';
                if (e.data.m === 'error') {
                    prefix = '\x1b[31m[ERROR]\x1b[0m';
                    reportSandboxCrash('PreviewRuntimeError', String(e.data.p), undefined, { blockId: safeBlockId });
                }
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

    // WEBCONTAINER BOOT SEQUENCE
    useEffect(() => {
        if (!hasBeenVisible) return;

        let mounted = true;
        const streamController = new AbortController();

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
        let serverReadyUnsub: (() => void) | null = null;

        const boot = async () => {
            const WORK_DIR = `/${safeBlockId}`;

            try {
                const wc = await measurePerformance(
                    'webcontainer_boot_time',
                    async () => {
                        const instance = await getWebContainer();
                        if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } devProcessRef.current = null; }
                        if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } shellProcessRef.current = null; }
                        try { await instance.fs.rm(WORK_DIR, { recursive: true, force: true }); } catch { }

                        const bootTemplate = template;
                        const tree = convertToTree(processProjectData(lockedFilesRef.current, assignedPort, bootTemplate, safeBlockId));
                        await instance.mount({ [safeBlockId]: { directory: tree } });

                        return instance;
                    },
                    { blockId: safeBlockId, template: template || 'vanilla' }
                );

                if (!mounted) return;

                setWcInstance(wc);
                wcInstanceRef.current = wc;
                setWcReady(true);

                debugTerm.writeln('\x1b[1;32m>> SYSTEM ONLINE - MOUNTING FILESYSTEM\x1b[0m');

                await wc.fs.mkdir(`${WORK_DIR}/.bin`, { recursive: true });
                await wc.fs.writeFile(`${WORK_DIR}/.bin/git`, GIT_SHIM_SCRIPT);

                debugTerm.writeln('\x1b[1;33m>> Queuing npm install...\x1b[0m');

                await measurePerformance(
                    'npm_install_time',
                    async () => {
                        await new Promise<void>(resolve => {
                            globalNpmMutex = globalNpmMutex.then(async () => {
                                if (!mounted) return resolve();
                                let installProcess: any = null;
                                try {
                                    debugTerm.writeln('\x1b[1;33m>> Running npm install...\x1b[0m');
                                    // 🚀 USE --legacy-peer-deps AND --force TO BYPASS ERESOLVE / ETARGET PEER ERRORS
                                    installProcess = await wc.spawn('npm', ['install', '--no-package-lock', '--legacy-peer-deps', '--force'], { cwd: WORK_DIR });

                                    installProcess.output.pipeTo(new WritableStream({
                                        write: data => { if (mounted) debugTerm.write(data); }
                                    }), { signal: streamController.signal }).catch(() => { });

                                    const exitCode = await Promise.race([
                                        installProcess.exit,
                                        new Promise<number>((_, reject) => setTimeout(() => reject(new Error('npm install timed out after 5 minutes')), 300000))
                                    ]);

                                    if (exitCode !== 0) {
                                        debugTerm.writeln(`\r\n\x1b[1;33m>> Warning: npm install exited with code ${exitCode}. Attempting to start dev server anyway...\x1b[0m`);
                                    }
                                } catch (err: any) {
                                    if (mounted) debugTerm.writeln(`\x1b[1;31m>> NPM Error: ${err.message || err}\x1b[0m`);
                                    reportSandboxCrash('NpmInstallError', err.message || 'npm install failed', err.stack, { blockId: safeBlockId });
                                    try { installProcess?.kill(); } catch { }
                                }
                                resolve();
                            });
                        });
                    },
                    { blockId: safeBlockId }
                );

                if (!mounted) return;

                debugTerm.writeln('\n\x1b[1;36m>> Booting local runtime server...\x1b[0m');
                const devProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: WORK_DIR });
                devProcessRef.current = devProcess;

                devProcess.output.pipeTo(new WritableStream({
                    write: data => { if (mounted) debugTerm.write(data); }
                }), { signal: streamController.signal }).catch(() => { });

                // 🚀 GRACEFUL ERROR HANDLING IF DEV SERVER EXITS EARLY
                devProcess.exit.then((code) => {
                    if (mounted && code !== 0 && !previewUrl) {
                        setStatusText("Server Error (Check Shell)");
                        debugTerm.writeln(`\r\n\x1b[1;31m>> Dev server exited with code ${code}. Check the Shell tab to debug.\x1b[0m`);
                    }
                });

                const shellProcess = await wc.spawn('jsh', { terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 15 }, cwd: WORK_DIR });
                shellProcessRef.current = shellProcess;

                shellProcess.output.pipeTo(new WritableStream({
                    write: data => { if (mounted) shellTerm.write(data); }
                }), { signal: streamController.signal }).catch(() => { });

                const inputWriter = shellProcess.input.getWriter();
                await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH"\nclear\n').catch(() => { });
                shellInputListener = shellTerm.onData(data => {
                    if (mounted) inputWriter.write(data).catch(() => { });
                });

                serverReadyUnsub = wc.on('server-ready', (port, url) => {
                    console.log(`🚀 [IDE WEBCONTAINER] server-ready event received on port ${port}: ${url}`);
                    if (!mounted) return;

                    try { previewOriginRef.current = new URL(url).origin; } catch { }
                    setPreviewUrl(url);
                    setStatusText("Online");
                    setIframeKey(k => k + 1);
                    debugTerm.writeln(`\n\x1b[1;32m>> Preview running on port ${port}\x1b[0m\n`);
                });

            } catch (err: any) {
                if (mounted) {
                    console.error("❌ [IDE WEBCONTAINER ERROR]", err);
                    debugTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
                    reportSandboxCrash('WebContainerBootError', err.message || 'WebContainer boot failed', err.stack, { blockId: safeBlockId });
                    setStatusText("Boot Failed");
                    setBootFailed(true);
                }
            }
        };

        setBootFailed(false);
        boot();
        const handleUnload = () => {
            streamController.abort();
            if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
            if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            mounted = false;
            streamController.abort();
            window.removeEventListener('beforeunload', handleUnload);

            if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
            if (shellResizeObserverRef.current) shellResizeObserverRef.current.disconnect();
            if (shellInputListener) shellInputListener.dispose();
            if (serverReadyUnsub) serverReadyUnsub();

            debugTerm.dispose();
            shellTerm.dispose();

            if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } }
            if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } }

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

    // MEASURED ZIP EXTRACTION & IMPORT (WITH HARD STATE PURGE)
    const processZipBlob = async (blob: Blob) => {
        try {
            await measurePerformance(
                'zip_import_time',
                async () => {
                    const zip = new JSZip();
                    const contents = await zip.loadAsync(blob);

                    // HARD-RESET ACTIVE STATE REFERENCES
                    canonicalKeysRef.current.clear();
                    latestFrontendFilesRef.current = {};
                    lastSavedSnapshotRef.current = '';

                    const allPaths = Object.keys(contents.files).filter(p => {
                        const fileName = p.split('/').pop() || '';
                        if (contents.files[p].dir) return false;
                        if (p.includes('__MACOSX') || p.includes('node_modules/') || p.includes('.git/')) return false;
                        if (fileName.startsWith('._') || fileName === '.DS_Store' || fileName === 'Thumbs.db') return false;
                        return true;
                    });

                    const isBinaryFile = (path: string) => ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z'].some(ext => path.toLowerCase().endsWith(ext));

                    const extractedMap: Record<string, string> = {};
                    for (const path of allPaths) {
                        const cleanPath = '/' + path.replace(/^\/+/, '').replace(/\/+/g, '/');
                        if (isBinaryFile(cleanPath)) {
                            extractedMap[cleanPath] = `__mlab_base64__${await contents.files[path].async('base64')}`;
                        } else {
                            const textContent = await contents.files[path].async('string');
                            extractedMap[cleanPath] = textContent;

                            if (isSensitivePath(cleanPath)) {
                                queueEnvConsent(cleanPath, textContent);
                            }
                        }
                    }

                    const newFiles = sanitizeProjectFiles(extractedMap);
                    const tempTpl = getEffectiveTemplate(newFiles, block?.template);
                    const cleanFiles = processProjectData(newFiles, assignedPort, tempTpl, block.id);

                    setTemplate(resolveSandpackTemplate(tempTpl));
                    setLockedFiles(cleanFiles);
                    canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => '/' + p.replace(/^\/+/, '')));

                    latestFrontendFilesRef.current = cleanFiles;
                    setRunId(Date.now().toString());

                    flushSaveRef.current(true);
                    toast?.success("Project Imported Successfully!");
                },
                { blockId: safeBlockId }
            );
        } catch (err: any) {
            console.error("Failed to process ZIP blob:", err);
            reportSandboxCrash('ZipImportError', err.message || 'Failed to extract or process ZIP file', err.stack);
            toast?.error("Failed to process ZIP file. Please ensure it is a valid compressed archive.");
        }
    };

    const confirmZipImport = async () => {
        if (!pendingZipFile) return;
        await processZipBlob(pendingZipFile);
        setPendingZipFile(null);
    };

    // MEASURED GITHUB REPO IMPORT
    const handleGithubImport = async () => {
        if (!githubUrl.trim()) return;
        try {
            setIsFetchingGithub(true);

            await measurePerformance(
                'github_import_time',
                async () => {
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
                },
                { githubUrl, blockId: safeBlockId }
            );
        } catch (err: any) {
            reportSandboxCrash('GithubImportError', err.message || 'Failed to pull GitHub repository', err.stack, { githubUrl });
            toast?.error(err.message || "Failed to import from GitHub.");
        } finally {
            setIsFetchingGithub(false);
        }
    };

    // MEASURED ZIP EXPORT / DOWNLOAD
    const handleDownloadZip = async () => {
        try {
            await measurePerformance(
                'zip_export_time',
                async () => {
                    const zip = new JSZip();
                    const filesToZip = Object.keys(latestFrontendFilesRef.current).length > 0 ? latestFrontendFilesRef.current : lockedFiles;

                    Object.entries(filesToZip).forEach(([path, content]) => {
                        if (isSensitivePath(path) && envConsentRef.current[path] === 'local') return;

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
                },
                { blockId: safeBlockId }
            );
        } catch (err: any) {
            reportSandboxCrash('ZipExportError', err.message || 'Failed to package ZIP for download', err.stack, { blockId: block.id });
            toast?.error("Failed to generate ZIP download.");
        }
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
                                    <SandpackFileActions
                                        readOnly={readOnly}
                                        canonicalKeysRef={canonicalKeysRef}
                                        wcInstance={wcInstance}
                                        blockId={block.id}
                                        onSensitiveFileDetected={queueEnvConsent}
                                    />
                                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
                                        <div style={{ width: '160px', borderRight: '1px solid #334155', flexShrink: 0, overflowY: 'auto', overflowX: 'hidden' }}><SandpackFileExplorer style={{ height: '100%' }} /></div>
                                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}><SandpackCodeEditor showTabs closableTabs style={{ height: '100%' }} readOnly={readOnly} /></div>
                                    </div>
                                </div>
                            </SandpackLayout>
                            {!readOnly && wcReady && (
                                <WebContainerSyncBridge
                                    wcInstance={wcInstance}
                                    blockId={block.id}
                                    canonicalKeysRef={canonicalKeysRef}
                                    onSensitiveFileDetected={queueEnvConsent}
                                    readOnly={readOnly}
                                />
                            )}
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

            {/* SENSITIVE FILE (.ENV) CONSENT MODAL */}
            {pendingEnvQueue.length > 0 && createPortal(
                <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(15, 23, 42, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-fade-in" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <div style={{ background: '#fef3c7', padding: '8px', borderRadius: '6px' }}>
                                <ShieldAlert size={22} color="#d97706" />
                            </div>
                            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Sensitive File Detected
                            </h3>
                        </div>

                        <p style={{ color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '1rem' }}>
                            You created or imported <strong style={{ color: '#38bdf8' }}>"{pendingEnvQueue[0].path}"</strong>, which may contain sensitive API keys or credentials.
                        </p>

                        <div style={{ background: '#0f172a', padding: '12px', border: '1px solid #334155', borderRadius: '6px', marginBottom: '1.25rem', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 }}>
                            <div style={{ color: '#f8fafc', fontWeight: 'bold', marginBottom: '4px' }}>How should this file be saved?</div>
                            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                <li><strong style={{ color: '#38bdf8' }}>Save to Database:</strong> Keeps file in Firestore. Required if assessors need to view your environment configuration.</li>
                                <li><strong style={{ color: '#e2e8f0' }}>Keep Local Only:</strong> Saved in this browser's LocalStorage only. Will survive reloads on this device, but won't upload secrets to database backups.</li>
                            </ul>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => resolveEnvConsent('local')}
                                style={{ padding: '8px 16px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', borderRadius: '4px' }}
                            >
                                Keep Local Only
                            </button>
                            <button
                                onClick={() => resolveEnvConsent('saved')}
                                style={{ padding: '8px 16px', background: '#38bdf8', color: '#0f172a', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', borderRadius: '4px' }}
                            >
                                Save to Database
                            </button>
                        </div>
                    </div>
                </div>,
                portalTarget || document.body
            )}

            {/* GITHUB IMPORT MODAL */}
            {showGithubModal && createPortal(
                <div className="lfm-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.8)', zIndex: 9999999, pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-fade-in" style={{ background: '#1e293b', padding: '24px', borderRadius: '8px', width: '100%', maxWidth: '420px', border: '1px solid #334155', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
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
                portalTarget || document.body
            )}

            {/* CUSTOM ZIP OVERWRITE CONFIRMATION */}
            {pendingZipFile && createPortal(
                <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-fade-in" style={{ background: 'white', borderRadius: '8px', width: '100%', maxWidth: '420px', borderTop: '5px solid #d97706', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' }}>

                        <div style={{ padding: '24px 24px 16px 24px', textAlign: 'center', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                            <div style={{ display: 'inline-flex', padding: '12px', background: 'white', border: '1px solid #d97706', borderRadius: '4px', marginBottom: '12px' }}>
                                <AlertTriangle size={28} color="#d97706" />
                            </div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#d97706', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                WARNING
                            </div>
                        </div>

                        <div style={{ padding: '24px', textAlign: 'center' }}>
                            <h3 style={{ margin: '0 0 12px 0', color: '#0f172a', fontSize: '1.2rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Overwrite Existing Code?
                            </h3>
                            <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
                                Importing this ZIP file will completely replace your current project files. This action cannot be undone. Do you want to proceed?
                            </p>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                <button onClick={() => setPendingZipFile(null)} style={{ flex: 1, padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Cancel
                                </button>
                                <button onClick={confirmZipImport} style={{ flex: 1, padding: '10px 16px', background: '#d97706', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Yes, Import
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                portalTarget || document.body
            )}
        </div>
    );
};

export default CodeSandboxPlayer;


// // src/components/common/CodeSandboxPlayer/CodeSandboxPlayer.tsx

// import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// import {
//     Code, Maximize, Minimize, CheckCircle, Play, Loader2, Plus, X, Trash2, Pencil,
//     FilePlus, Download, Github, FolderArchive, RefreshCw, AlertTriangle, ScrollText, SquareTerminal
// } from 'lucide-react';
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
// import { Terminal } from 'xterm';
// import { FitAddon } from 'xterm-addon-fit';
// import 'xterm/css/xterm.css';
// import { getWebContainer } from './webcontainerManager';
// import type { FileSystemTree, WebContainer, WebContainerProcess } from '@webcontainer/api';
// import { createPortal } from 'react-dom';
// import { getStorage, ref as fbStorageRef, getBytes } from 'firebase/storage';

// export interface SandboxFileMap {
//     [path: string]: string;
// }

// export interface SandboxBlock {
//     id: string;
//     title?: string;
//     template?: string;
//     question?: string;
//     initialFiles?: SandboxFileMap;
//     initialFilesStoragePath?: string;
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
//     portalTarget?: HTMLElement;
// }

// const sanitizeBlockId = (id: string | undefined): string => {
//     const clean = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
//     return clean || 'mlab-default';
// };

// const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache', '.npm-cache', '__MACOSX'];
// const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store', 'Thumbs.db'];
// const SYNC_IGNORE_EXTS = ['.psd', '.ai', '.xd', '.sketch', '.fig', '.pdf', '.mp4', '.mov', '.zip', '.rar', '.tar', '.gz', '.7z'];

// const shouldIgnorePath = (relPath: string) => {
//     const parts = relPath.split('/').filter(Boolean);
//     if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
//     const fileName = parts[parts.length - 1] || '';
//     if (fileName.startsWith('._')) return true;
//     if (SYNC_IGNORE_FILES.includes(fileName)) return true;
//     if (fileName.endsWith('.log')) return true;
//     if (SYNC_IGNORE_EXTS.some(ext => fileName.toLowerCase().endsWith(ext))) return true;
//     return false;
// };

// const makeWellFormed = (str: string): string => {
//     if (typeof (str as any).toWellFormed === 'function') return (str as any).toWellFormed();
//     return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '$1\uFFFD');
// };

// export const sanitizeProjectFiles = (rawFiles: Record<string, string>): Record<string, string> => {
//     if (!rawFiles || typeof rawFiles !== 'object') return {};

//     const cleanMap: Record<string, string> = {};
//     const validPaths: string[] = [];

//     Object.keys(rawFiles).forEach((path) => {
//         const normalizedPath = path.startsWith('/') ? path : `/${path}`;
//         if (shouldIgnorePath(normalizedPath)) return;

//         cleanMap[normalizedPath] = rawFiles[path];
//         validPaths.push(normalizedPath);
//     });

//     if (validPaths.length === 0) return {};

//     const rootSegments = new Set(
//         validPaths.map((p) => p.split('/').filter(Boolean)[0])
//     );

//     let prefixToStrip = '';
//     if (rootSegments.size === 1) {
//         const singleFolder = Array.from(rootSegments)[0];
//         const allHaveSubpaths = validPaths.every((p) => {
//             const parts = p.split('/').filter(Boolean);
//             return parts.length > 1 && parts[0] === singleFolder;
//         });

//         if (allHaveSubpaths) {
//             prefixToStrip = `/${singleFolder}`;
//         }
//     }

//     const finalMap: Record<string, string> = {};
//     Object.keys(cleanMap).forEach((path) => {
//         let newPath = path;
//         if (prefixToStrip && newPath.startsWith(prefixToStrip)) {
//             newPath = newPath.slice(prefixToStrip.length);
//         }
//         if (!newPath.startsWith('/')) {
//             newPath = `/${newPath}`;
//         }
//         finalMap[newPath] = cleanMap[path];
//     });

//     return finalMap;
// };

// const createSafeSnapshot = (files: Record<string, string>, onDropped?: (path: string) => void) => {
//     const safeFiles: Record<string, string> = {};
//     for (const [path, content] of Object.entries(files)) {
//         if (shouldIgnorePath(path)) continue;
//         if (content.length > 500000) {
//             console.warn(`[IDE SNAPSHOT] File ${path} is too large. Excluding from auto-save.`);
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

// export const safeParseSnapshot = (raw: string): SandboxFileMap | null => {
//     try {
//         const parsed = JSON.parse(raw);
//         return isValidSnapshot(parsed) ? parsed : null;
//     } catch {
//         return null;
//     }
// };

// // 🚀 REPAIR ENGINE FOR EXISTING/LEGACY LEARNER ASSESSMENTS
// export const parseAndRepairLearnerSnapshot = (raw: any, blockTemplate?: string): SandboxFileMap | null => {
//     if (!raw) return null;

//     if (typeof raw === 'string' && raw.trim().length > 0) {
//         try {
//             const parsed = JSON.parse(raw);
//             if (parsed && typeof parsed === 'object') {
//                 return parseAndRepairLearnerSnapshot(parsed, blockTemplate);
//             }
//         } catch {
//             const isHtml = raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('</body>');
//             const fileName = isHtml ? '/index.html' : '/index.js';
//             return { [fileName]: raw };
//         }
//     }

//     if (typeof raw === 'object' && !Array.isArray(raw)) {
//         if (raw.snapshot) return parseAndRepairLearnerSnapshot(raw.snapshot, blockTemplate);
//         if (raw.codeData) return parseAndRepairLearnerSnapshot(raw.codeData, blockTemplate);

//         const safeFiles: SandboxFileMap = {};
//         let hasFiles = false;

//         // 🚀 CRITICAL FIX: Exclude metadata keys from being parsed as literal files!
//         const ignoreKeys = ['lastSavedAt', 'storagePath', 'dependencies', 'snapshot', 'codeData', 'immediate'];

//         for (const [key, value] of Object.entries(raw)) {
//             if (ignoreKeys.includes(key)) continue;

//             if (typeof key === 'string' && typeof value === 'string') {
//                 // Ensure it's formatted as a path
//                 const cleanKey = key.startsWith('/') ? key : `/${key}`;
//                 safeFiles[cleanKey] = value;
//                 hasFiles = true;
//             }
//         }

//         if (hasFiles) return safeFiles;

//         if (typeof raw.code === 'string' && raw.code.trim().length > 0) {
//             const fileName = (blockTemplate === 'html' || raw.code.includes('<html') || raw.code.includes('<!DOCTYPE')) ? '/index.html' : '/index.js';
//             return { [fileName]: raw.code };
//         }
//     }

//     return null;
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
//                 if (typeof content === 'string') {
//                     if (content.startsWith('__mlab_base64__')) {
//                         const binStr = atob(content.substring(15));
//                         const arr = new Uint8Array(binStr.length);
//                         for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
//                         fileContent = arr;
//                     } else {
//                         fileContent = makeWellFormed(content);
//                     }
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

// const getEffectiveTemplate = (files: Record<string, string>, fallback: string | undefined): string => {
//     const explicit = fallback?.toLowerCase();

//     if (explicit === 'javascript' || explicit === 'html' || explicit === 'vanilla') return 'vanilla';
//     if (explicit === 'typescript' || explicit === 'vanilla-ts') return 'vanilla-ts';
//     if (explicit === 'node') return 'node';
//     if (explicit === 'vite-react' || explicit === 'create-react-app' || explicit === 'react') return 'vite-react';
//     if (explicit === 'python') return 'vanilla';
//     if (explicit === 'sql') return 'vanilla';

//     const fileNames = Object.keys(files);
//     const hasReactFile = fileNames.some(p => p.endsWith('.jsx') || p.endsWith('.tsx'));
//     return hasReactFile ? 'vite-react' : 'vanilla';
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
//     return templateMap[dbTemplateKey] || dbTemplateKey;
// };

// const processProjectData = (rawFiles: Record<string, string>, targetPort: number, templateType: string, blockId: string) => {
//     const out = sanitizeProjectFiles(rawFiles);
//     const isReact = templateType === 'vite-react' || templateType === 'create-react-app' || templateType === 'vite-react-ts';
//     const isNode = templateType === 'node';
//     const isVanilla = !isReact && !isNode;

//     const hasUserFiles = Object.keys(out).some(p => !['/package.json', '/vite.config.js', '/vite.config.ts'].includes(p));

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
//             pkg.scripts.dev = `vite --port ${targetPort}`;
//             pkg.devDependencies['vite'] = pkg.devDependencies['vite'] || "^4.5.3";
//         }

//         if (isVanilla) {
//             delete pkg.dependencies['react'];
//             delete pkg.dependencies['react-dom'];
//             delete pkg.devDependencies['@vitejs/plugin-react'];
//         }

//         delete pkg.engines;
//         delete pkg.packageManager;
//         out['/package.json'] = JSON.stringify(pkg, null, 2);
//     } catch (e) { }

//     if (isReact) {
//         if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
//             out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    port: ${targetPort},\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
//         }

//         if (!hasUserFiles) {
//             const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
//             const ext = isTSProject ? 'tsx' : 'jsx';

//             if (!out[`/src/App.${ext}`]) out[`/src/App.${ext}`] = 'export default function App() {\n  return <h1>Vite + React Canvas Online!</h1>;\n}';
//             if (!out[`/src/main.${ext}`]) {
//                 out[`/src/main.${ext}`] = `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.${ext}";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);`;
//             }
//             if (!out['/src/index.css']) out['/src/index.css'] = `body { font-family: sans-serif; padding: 2rem; }`;
//         }

//         if (out['/App.js'] && !out['/src/App.jsx']) out['/src/App.jsx'] = out['/App.js'];
//         ['/index.js', '/index.jsx', '/index.ts', '/index.tsx', '/App.js', '/App.tsx'].forEach(g => delete out[g]);

//     } else if (isVanilla) {
//         const reactGhosts = [
//             '/App.jsx', '/App.tsx', '/App.js',
//             '/src/App.jsx', '/src/App.tsx', '/src/App.js',
//             '/src/main.jsx', '/src/main.tsx', '/src/main.js',
//             '/src/index.css', '/vite.config.js', '/vite.config.ts'
//         ];
//         reactGhosts.forEach(g => delete out[g]);

//         if (out['/index.js'] && out['/index.js'].includes('Hello Vanilla!')) {
//             delete out['/index.js'];
//         }
//         if (out['/index.html'] && out['/index.html'].includes('Vanilla App') && out['/index.html'].includes('<div id="app"></div>')) {
//             delete out['/index.html'];
//         }

//         if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
//             out['/vite.config.js'] = `import { defineConfig } from 'vite';\n\nexport default defineConfig({\n  server: {\n    port: ${targetPort},\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
//         }

//         if (!out['/index.html']) {
//             const fallbackHtml = Object.keys(out).find(p => p.endsWith('.html') && p !== '/index.html');

//             if (fallbackHtml) {
//                 out['/index.html'] = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=${fallbackHtml}" /></head><body>Redirecting to ${fallbackHtml}...</body></html>`;
//             } else {
//                 out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>Vanilla App</title>\n</head>\n<body>\n  <div id="app"></div>\n  <script type="module" src="/index.js"></script>\n</body>\n</html>`;
//                 if (!out['/index.js']) out['/index.js'] = `document.getElementById('app').innerHTML = '<h1>Hello Vanilla!</h1>';`;
//             }
//         }
//     }

//     const consoleInterceptor = `\n<script>\n  (function() {\n    const orig = { ...console };\n    ['log', 'warn', 'error', 'info'].forEach(m => {\n      console[m] = (...args) => {\n        orig[m](...args);\n        try { window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*'); } catch(e) {}\n      };\n    });\n    window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m: 'error', p: e.message }, '*'));\n  })();\n</script>\n`;

//     let htmlKey = out['/index.html'] ? '/index.html' : out['/public/index.html'] ? '/public/index.html' : null;
//     if (!htmlKey) htmlKey = Object.keys(out).find(p => p.endsWith('/index.html')) || null;

//     if (htmlKey && out[htmlKey]) {
//         let html = out[htmlKey];
//         if (!html.includes("source: 'preview-console'") && !html.includes("http-equiv=\"refresh\"")) {
//             if (html.includes('<head>')) {
//                 html = html.replace('<head>', `<head>${consoleInterceptor}`);
//             } else if (html.includes('<html>')) {
//                 html = html.replace('<html>', `<html><head>${consoleInterceptor}</head>`);
//             } else {
//                 html = `${consoleInterceptor}${html}`;
//             }
//         }
//         out[htmlKey] = html;
//     } else if (isReact && !hasUserFiles && !out['/index.html']) {
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
//                     if (typeof code === 'string') {
//                         if (code.startsWith('__mlab_base64__')) {
//                             const binStr = atob(code.substring(15));
//                             const arr = new Uint8Array(binStr.length);
//                             for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
//                             outCode = arr;
//                         } else {
//                             outCode = makeWellFormed(code);
//                         }
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
//         }, 500);
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
//                     const isBinaryFile = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z'].some(ext => name.toLowerCase().endsWith(ext));
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
//     const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

//     useEffect(() => {
//         if (readOnly) return;

//         if (debounceRef.current) clearTimeout(debounceRef.current);
//         debounceRef.current = setTimeout(() => {
//             const currentFiles: Record<string, string> = {};
//             for (const [path, fileObj] of Object.entries(sandpack.files)) {
//                 const cleanPath = path.startsWith('/') ? path : `/${path}`;
//                 if (fileObj && !fileObj.hidden && typeof fileObj.code === 'string') {
//                     currentFiles[cleanPath] = fileObj.code;
//                 }
//             }

//             const pkgJson = currentFiles['/package.json'];
//             let dependencies = {};
//             if (pkgJson) {
//                 try { dependencies = JSON.parse(pkgJson).dependencies || {}; } catch (e) { }
//             }

//             onChange({ snapshot: createSafeSnapshot(currentFiles), dependencies, immediate: false });
//         }, 400);

//         return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
//     }, [sandpack.files, readOnly, onChange]);
//     return null;
// };

// let globalNpmMutex: Promise<void> = Promise.resolve();

// export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false, portalTarget }) => {
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

//     const snapshotKey = useMemo(() => {
//         const s = learnerAns?.snapshot;
//         if (!s) return '';
//         return typeof s === 'string' ? s : JSON.stringify(s);
//     }, [learnerAns?.snapshot]);

//     const getInitialConfig = useCallback(() => {
//         const parsedFiles = parseAndRepairLearnerSnapshot(learnerAns?.snapshot || learnerAns, block?.template);
//         const rawFilesToLoad = (parsedFiles && Object.keys(parsedFiles).length > 0) ? parsedFiles : { ...(block?.initialFiles || {}) };

//         const filesToLoad = sanitizeProjectFiles(rawFilesToLoad);
//         const tpl = getEffectiveTemplate(filesToLoad, block?.template);

//         return {
//             files: processProjectData(filesToLoad, assignedPort, tpl, safeBlockId),
//             template: tpl
//         };
//     }, [learnerAns, block?.initialFiles, block?.template, assignedPort, safeBlockId]);

//     const initialConfig = useMemo(() => getInitialConfig(), [getInitialConfig]);

//     const [lockedFiles, setLockedFiles] = useState(() => initialConfig.files);
//     const [template, setTemplate] = useState<any>(() => initialConfig.template);

//     const latestFrontendFilesRef = useRef<Record<string, string>>(initialConfig.files);

//     const [runId, setRunId] = useState(Date.now().toString());

//     useEffect(() => {
//         let cancelled = false;

//         const loadProject = async () => {
//             const parsedFiles = parseAndRepairLearnerSnapshot(learnerAns?.snapshot || learnerAns, block?.template);
//             const hasValidSnapshot = parsedFiles && Object.keys(parsedFiles).length > 0;

//             if (hasValidSnapshot) {
//                 const currentSerialized = createSafeSnapshot(latestFrontendFilesRef.current);
//                 const incomingSerialized = JSON.stringify(parsedFiles);

//                 if (currentSerialized === incomingSerialized || incomingSerialized === lastSavedSnapshotRef.current) {
//                     return;
//                 }
//             }

//             let rawFilesToLoad: Record<string, string> = hasValidSnapshot ? parsedFiles! : { ...(block?.initialFiles || {}) };

//             if (!hasValidSnapshot && Object.keys(rawFilesToLoad).length === 0 && block?.initialFilesStoragePath) {
//                 try {
//                     const storage = getStorage();
//                     const jsonRef = fbStorageRef(storage, block.initialFilesStoragePath);
//                     const buffer = await getBytes(jsonRef);
//                     const jsonStr = new TextDecoder().decode(buffer);
//                     rawFilesToLoad = JSON.parse(jsonStr);
//                 } catch (err) {
//                     console.error("Failed to load offloaded starter code from Storage:", err);
//                 }
//             }

//             if (cancelled) return;

//             const filesToLoad = sanitizeProjectFiles(rawFilesToLoad);
//             const tpl = getEffectiveTemplate(filesToLoad, block?.template);
//             const processed = processProjectData(filesToLoad, assignedPort, tpl, safeBlockId);

//             console.log(`✅ [IDE LOAD] Syncing files into Sandpack. Total files: ${Object.keys(processed).length}`);

//             setLockedFiles(processed);
//             setTemplate(resolveSandpackTemplate(tpl));
//             canonicalKeysRef.current = new Set(Object.keys(processed).map(p => p.startsWith('/') ? p : '/' + p));
//             latestFrontendFilesRef.current = processed;
//         };

//         loadProject();

//         return () => { cancelled = true; };
//     }, [snapshotKey, block?.initialFiles, block?.initialFilesStoragePath, block?.template, assignedPort, safeBlockId]);

//     const [previewUrl, setPreviewUrl] = useState<string>('');
//     const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
//     const [statusText, setStatusText] = useState("Booting OS...");
//     const [wcReady, setWcReady] = useState(false);
//     const [iframeKey, setIframeKey] = useState(0);
//     const [bootFailed, setBootFailed] = useState(false);
//     const previewOriginRef = useRef<string>('');

//     const wcInstanceRef = useRef<WebContainer | null>(null);

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

//         if (Object.keys(filteredSnapshot).length === 0) {
//             console.warn("⚠️ [IDE AUTO-SAVE SKIPPED] File map is empty. Refusing to write to Firebase.");
//             return;
//         }

//         const serialized = createSafeSnapshot(filteredSnapshot, (path) => {
//             if (!warnedDroppedFilesRef.current.has(path)) {
//                 warnedDroppedFilesRef.current.add(path);
//                 toast?.error(`"${path}" is too large to save (max 500KB) and was left out of your saved project.`);
//             }
//         });

//         const unchanged = !isImmediate && serialized === lastSavedSnapshotRef.current;
//         if (unchanged) return;

//         let dependencies = {};
//         if (filteredSnapshot['/package.json']) {
//             try { dependencies = JSON.parse(filteredSnapshot['/package.json']).dependencies || {}; } catch { }
//         }

//         console.log(`💾 [IDE AUTO-SAVE TRIGGERED] Dispatching snapshot for block [${block?.id}] to parent component...`, {
//             isImmediate,
//             fileCount: Object.keys(filteredSnapshot).length,
//             filePaths: Object.keys(filteredSnapshot)
//         });

//         const pendingSnapshot = serialized;
//         const result = onChangeRef.current({ snapshot: serialized, dependencies, immediate: isImmediate });
//         if (result && typeof (result as any).then === 'function') {
//             (result as Promise<void>)
//                 .then(() => {
//                     lastSavedSnapshotRef.current = pendingSnapshot;
//                     console.log(`✅ [IDE AUTO-SAVE CONFIRMED] Code changes persisted for block [${block?.id}]`);
//                 })
//                 .catch((err) => {
//                     console.error('❌ [IDE AUTO-SAVE ERROR] Save rejected:', err);
//                     toast?.error('Failed to save your latest changes. Retrying shortly…');
//                 });
//         } else {
//             lastSavedSnapshotRef.current = pendingSnapshot;
//         }
//     }, [block?.id, readOnly, toast]);

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
//         if (!files || Object.keys(files).length === 0) return;

//         latestFrontendFilesRef.current = files;
//         scheduleSave();
//     }, [scheduleSave, readOnly]);

//     const flushSaveRef = useRef(flushSave);
//     useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

//     useEffect(() => {
//         const handleBeforeUnload = () => {
//             flushSaveRef.current(true);
//         };
//         const handleVisibilityChange = () => {
//             if (document.visibilityState === 'hidden') {
//                 flushSaveRef.current(true);
//             }
//         };

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
//         const intervalId = setInterval(() => flushSaveRef.current(false), 30000);
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
//         const streamController = new AbortController();

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
//         let serverReadyUnsub: (() => void) | null = null;

//         const boot = async () => {
//             const WORK_DIR = `/${safeBlockId}`;

//             try {
//                 console.log(`🚀 [IDE WEBCONTAINER] Booting WebContainer instance for block [${safeBlockId}]...`);
//                 const wc = await getWebContainer();
//                 if (!mounted) return;

//                 setWcInstance(wc);
//                 wcInstanceRef.current = wc;

//                 if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } devProcessRef.current = null; }
//                 if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } shellProcessRef.current = null; }
//                 try { await wc.fs.rm(WORK_DIR, { recursive: true, force: true }); } catch { }

//                 debugTerm.writeln('\x1b[1;32m>> SYSTEM ONLINE - MOUNTING FILESYSTEM\x1b[0m');
//                 const bootTemplate = template;
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
//                             }), { signal: streamController.signal }).catch(() => { });

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
//                 }), { signal: streamController.signal }).catch(() => { });

//                 const shellProcess = await wc.spawn('jsh', { terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 15 }, cwd: WORK_DIR });
//                 shellProcessRef.current = shellProcess;

//                 shellProcess.output.pipeTo(new WritableStream({
//                     write: data => { if (mounted) shellTerm.write(data); }
//                 }), { signal: streamController.signal }).catch(() => { });

//                 const inputWriter = shellProcess.input.getWriter();
//                 await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH"\nclear\n').catch(() => { });
//                 shellInputListener = shellTerm.onData(data => {
//                     if (mounted) inputWriter.write(data).catch(() => { });
//                 });

//                 serverReadyUnsub = wc.on('server-ready', (port, url) => {
//                     console.log(`🚀 [IDE WEBCONTAINER] server-ready event received on port ${port}: ${url}`);
//                     if (!mounted) return;

//                     try { previewOriginRef.current = new URL(url).origin; } catch { }
//                     setPreviewUrl(url);
//                     setStatusText("Online");
//                     setIframeKey(k => k + 1);
//                     debugTerm.writeln(`\n\x1b[1;32m>> Preview running on port ${port}\x1b[0m\n`);
//                 });

//             } catch (err: any) {
//                 if (mounted) {
//                     console.error("❌ [IDE WEBCONTAINER ERROR]", err);
//                     debugTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
//                     setStatusText("Boot Failed");
//                     setBootFailed(true);
//                 }
//             }
//         };

//         setBootFailed(false);
//         boot();
//         const handleUnload = () => {
//             streamController.abort();
//             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
//             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }
//         };
//         window.addEventListener('beforeunload', handleUnload);

//         return () => {
//             mounted = false;
//             streamController.abort();
//             window.removeEventListener('beforeunload', handleUnload);

//             if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
//             if (shellResizeObserverRef.current) shellResizeObserverRef.current.disconnect();
//             if (shellInputListener) shellInputListener.dispose();
//             if (serverReadyUnsub) serverReadyUnsub();

//             debugTerm.dispose();
//             shellTerm.dispose();

//             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } }
//             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } }

//             setWcInstance(null);
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

//         const allPaths = Object.keys(contents.files).filter(p => {
//             const fileName = p.split('/').pop() || '';
//             if (contents.files[p].dir) return false;
//             if (p.includes('__MACOSX') || p.includes('node_modules/') || p.includes('.git/')) return false;
//             if (fileName.startsWith('._') || fileName === '.DS_Store' || fileName === 'Thumbs.db') return false;
//             return true;
//         });

//         const expectedTemplate = (block?.template || 'javascript').toLowerCase();
//         const isVanillaExpected = ['javascript', 'html', 'vanilla'].includes(expectedTemplate);

//         let hasReactFiles = false;
//         for (const p of allPaths) {
//             if (p.endsWith('.jsx') || p.endsWith('.tsx')) hasReactFiles = true;
//             if (p.endsWith('package.json')) {
//                 try {
//                     const pkgStr = await contents.files[p].async('string');
//                     if (pkgStr.includes('"react"')) hasReactFiles = true;
//                 } catch (e) { }
//             }
//         }

//         if (isVanillaExpected && hasReactFiles) {
//             toast?.error("Upload Blocked: This assignment requires a pure Vanilla JavaScript project. React projects are not allowed here.");
//             return;
//         }

//         const isBinaryFile = (path: string) => ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z'].some(ext => path.toLowerCase().endsWith(ext));

//         const extractedMap: Record<string, string> = {};
//         for (const path of allPaths) {
//             if (isBinaryFile(path)) {
//                 extractedMap[`/${path}`] = `__mlab_base64__${await contents.files[path].async('base64')}`;
//             } else {
//                 extractedMap[`/${path}`] = await contents.files[path].async('string');
//             }
//         }

//         const newFiles = sanitizeProjectFiles(extractedMap);

//         const tempTpl = getEffectiveTemplate(newFiles, block?.template);
//         const cleanFiles = processProjectData(newFiles, assignedPort, tempTpl, block.id);

//         setTemplate(resolveSandpackTemplate(tempTpl));
//         setLockedFiles(cleanFiles);
//         canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));

//         latestFrontendFilesRef.current = cleanFiles;
//         setRunId(Date.now().toString());

//         flushSaveRef.current(true);
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

//             {/* GITHUB IMPORT MODAL - Explicitly handles its own portalTarget with pointEvents: 'auto' */}
//             {showGithubModal && createPortal(
//                 <div className="lfm-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.8)', zIndex: 9999999, pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                     <div className="animate-fade-in" style={{ background: '#1e293b', padding: '24px', borderRadius: '8px', width: '100%', maxWidth: '420px', border: '1px solid #334155', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
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
//                 </div>,
//                 portalTarget || document.body
//             )}

//             {/* CUSTOM ZIP OVERWRITE CONFIRMATION - Bypasses external StatusModal for guaranteed Fullscreen Pointer control */}
//             {pendingZipFile && createPortal(
//                 <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                     <div className="animate-fade-in" style={{ background: 'white', borderRadius: '8px', width: '100%', maxWidth: '420px', borderTop: '5px solid #d97706', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' }}>

//                         <div style={{ padding: '24px 24px 16px 24px', textAlign: 'center', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
//                             <div style={{ display: 'inline-flex', padding: '12px', background: 'white', border: '1px solid #d97706', borderRadius: '4px', marginBottom: '12px' }}>
//                                 <AlertTriangle size={28} color="#d97706" />
//                             </div>
//                             <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#d97706', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
//                                 WARNING
//                             </div>
//                         </div>

//                         <div style={{ padding: '24px', textAlign: 'center' }}>
//                             <h3 style={{ margin: '0 0 12px 0', color: '#0f172a', fontSize: '1.2rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                 Overwrite Existing Code?
//                             </h3>
//                             <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
//                                 Importing this ZIP file will completely replace your current project files. This action cannot be undone. Do you want to proceed?
//                             </p>

//                             <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
//                                 <button onClick={() => setPendingZipFile(null)} style={{ flex: 1, padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                     Cancel
//                                 </button>
//                                 <button onClick={confirmZipImport} style={{ flex: 1, padding: '10px 16px', background: '#d97706', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                     Yes, Import
//                                 </button>
//                             </div>
//                         </div>
//                     </div>
//                 </div>,
//                 portalTarget || document.body
//             )}
//         </div>
//     );
// };

// export default CodeSandboxPlayer;


// // // src/components/common/CodeSandboxPlayer/CodeSandboxPlayer.tsx

// // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // import {
// //     Code, Maximize, Minimize, CheckCircle, Play, Loader2, Plus, X, Trash2, Pencil,
// //     FilePlus, Download, Github, FolderArchive, RefreshCw, AlertTriangle, ScrollText, SquareTerminal
// // } from 'lucide-react';
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
// // import { Terminal } from 'xterm';
// // import { FitAddon } from 'xterm-addon-fit';
// // import 'xterm/css/xterm.css';
// // import { getWebContainer } from './webcontainerManager';
// // import type { FileSystemTree, WebContainer, WebContainerProcess } from '@webcontainer/api';
// // import { createPortal } from 'react-dom';
// // import { getStorage, ref as fbStorageRef, getBytes } from 'firebase/storage';

// // export interface SandboxFileMap {
// //     [path: string]: string;
// // }

// // export interface SandboxBlock {
// //     id: string;
// //     title?: string;
// //     template?: string;
// //     question?: string;
// //     initialFiles?: SandboxFileMap;
// //     initialFilesStoragePath?: string;
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
// //     portalTarget?: HTMLElement;
// // }

// // const sanitizeBlockId = (id: string | undefined): string => {
// //     const clean = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
// //     return clean || 'mlab-default';
// // };

// // const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache', '.npm-cache', '__MACOSX'];
// // const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store', 'Thumbs.db'];
// // const SYNC_IGNORE_EXTS = ['.psd', '.ai', '.xd', '.sketch', '.fig', '.pdf', '.mp4', '.mov', '.zip', '.rar', '.tar', '.gz', '.7z'];

// // const shouldIgnorePath = (relPath: string) => {
// //     const parts = relPath.split('/').filter(Boolean);
// //     if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
// //     const fileName = parts[parts.length - 1] || '';
// //     if (fileName.startsWith('._')) return true;
// //     if (SYNC_IGNORE_FILES.includes(fileName)) return true;
// //     if (fileName.endsWith('.log')) return true;
// //     if (SYNC_IGNORE_EXTS.some(ext => fileName.toLowerCase().endsWith(ext))) return true;
// //     return false;
// // };

// // const makeWellFormed = (str: string): string => {
// //     if (typeof (str as any).toWellFormed === 'function') return (str as any).toWellFormed();
// //     return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '$1\uFFFD');
// // };

// // export const sanitizeProjectFiles = (rawFiles: Record<string, string>): Record<string, string> => {
// //     if (!rawFiles || typeof rawFiles !== 'object') return {};

// //     const cleanMap: Record<string, string> = {};
// //     const validPaths: string[] = [];

// //     Object.keys(rawFiles).forEach((path) => {
// //         const normalizedPath = path.startsWith('/') ? path : `/${path}`;
// //         if (shouldIgnorePath(normalizedPath)) return;

// //         cleanMap[normalizedPath] = rawFiles[path];
// //         validPaths.push(normalizedPath);
// //     });

// //     if (validPaths.length === 0) return {};

// //     const rootSegments = new Set(
// //         validPaths.map((p) => p.split('/').filter(Boolean)[0])
// //     );

// //     let prefixToStrip = '';
// //     if (rootSegments.size === 1) {
// //         const singleFolder = Array.from(rootSegments)[0];
// //         const allHaveSubpaths = validPaths.every((p) => {
// //             const parts = p.split('/').filter(Boolean);
// //             return parts.length > 1 && parts[0] === singleFolder;
// //         });

// //         if (allHaveSubpaths) {
// //             prefixToStrip = `/${singleFolder}`;
// //         }
// //     }

// //     const finalMap: Record<string, string> = {};
// //     Object.keys(cleanMap).forEach((path) => {
// //         let newPath = path;
// //         if (prefixToStrip && newPath.startsWith(prefixToStrip)) {
// //             newPath = newPath.slice(prefixToStrip.length);
// //         }
// //         if (!newPath.startsWith('/')) {
// //             newPath = `/${newPath}`;
// //         }
// //         finalMap[newPath] = cleanMap[path];
// //     });

// //     return finalMap;
// // };

// // const createSafeSnapshot = (files: Record<string, string>, onDropped?: (path: string) => void) => {
// //     const safeFiles: Record<string, string> = {};
// //     for (const [path, content] of Object.entries(files)) {
// //         if (shouldIgnorePath(path)) continue;
// //         if (content.length > 500000) {
// //             console.warn(`[IDE SNAPSHOT] File ${path} is too large. Excluding from auto-save.`);
// //             onDropped?.(path);
// //             continue;
// //         }
// //         safeFiles[path] = content;
// //     }
// //     return JSON.stringify(safeFiles);
// // };

// // const isValidSnapshot = (obj: unknown): obj is SandboxFileMap => {
// //     if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
// //     return Object.entries(obj as Record<string, unknown>).every(
// //         ([path, content]) => typeof path === 'string' && path.length < 500 && typeof content === 'string'
// //     );
// // };

// // export const safeParseSnapshot = (raw: string): SandboxFileMap | null => {
// //     try {
// //         const parsed = JSON.parse(raw);
// //         return isValidSnapshot(parsed) ? parsed : null;
// //     } catch {
// //         return null;
// //     }
// // };

// // // 🚀 REPAIR ENGINE FOR EXISTING/LEGACY LEARNER ASSESSMENTS
// // export const parseAndRepairLearnerSnapshot = (raw: any, blockTemplate?: string): SandboxFileMap | null => {
// //     if (!raw) return null;

// //     if (typeof raw === 'string' && raw.trim().length > 0) {
// //         try {
// //             const parsed = JSON.parse(raw);
// //             if (parsed && typeof parsed === 'object') {
// //                 return parseAndRepairLearnerSnapshot(parsed, blockTemplate);
// //             }
// //         } catch {
// //             const isHtml = raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('</body>');
// //             const fileName = isHtml ? '/index.html' : '/index.js';
// //             return { [fileName]: raw };
// //         }
// //     }

// //     if (typeof raw === 'object' && !Array.isArray(raw)) {
// //         if (raw.snapshot) return parseAndRepairLearnerSnapshot(raw.snapshot, blockTemplate);
// //         if (raw.codeData) return parseAndRepairLearnerSnapshot(raw.codeData, blockTemplate);

// //         const safeFiles: SandboxFileMap = {};
// //         let hasFiles = false;

// //         // 🚀 CRITICAL FIX: Exclude metadata keys from being parsed as literal files!
// //         const ignoreKeys = ['lastSavedAt', 'storagePath', 'dependencies', 'snapshot', 'codeData', 'immediate'];

// //         for (const [key, value] of Object.entries(raw)) {
// //             if (ignoreKeys.includes(key)) continue;

// //             if (typeof key === 'string' && typeof value === 'string') {
// //                 // Ensure it's formatted as a path
// //                 const cleanKey = key.startsWith('/') ? key : `/${key}`;
// //                 safeFiles[cleanKey] = value;
// //                 hasFiles = true;
// //             }
// //         }

// //         if (hasFiles) return safeFiles;

// //         if (typeof raw.code === 'string' && raw.code.trim().length > 0) {
// //             const fileName = (blockTemplate === 'html' || raw.code.includes('<html') || raw.code.includes('<!DOCTYPE')) ? '/index.html' : '/index.js';
// //             return { [fileName]: raw.code };
// //         }
// //     }

// //     return null;
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
// //                 if (typeof content === 'string') {
// //                     if (content.startsWith('__mlab_base64__')) {
// //                         const binStr = atob(content.substring(15));
// //                         const arr = new Uint8Array(binStr.length);
// //                         for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// //                         fileContent = arr;
// //                     } else {
// //                         fileContent = makeWellFormed(content);
// //                     }
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

// // const getEffectiveTemplate = (files: Record<string, string>, fallback: string | undefined): string => {
// //     const explicit = fallback?.toLowerCase();

// //     if (explicit === 'javascript' || explicit === 'html' || explicit === 'vanilla') return 'vanilla';
// //     if (explicit === 'typescript' || explicit === 'vanilla-ts') return 'vanilla-ts';
// //     if (explicit === 'node') return 'node';
// //     if (explicit === 'vite-react' || explicit === 'create-react-app' || explicit === 'react') return 'vite-react';
// //     if (explicit === 'python') return 'vanilla';
// //     if (explicit === 'sql') return 'vanilla';

// //     const fileNames = Object.keys(files);
// //     const hasReactFile = fileNames.some(p => p.endsWith('.jsx') || p.endsWith('.tsx'));
// //     return hasReactFile ? 'vite-react' : 'vanilla';
// // };

// // const resolveSandpackTemplate = (dbTemplateKey?: string): any => {
// //     if (!dbTemplateKey) return "vanilla";
// //     const templateMap: Record<string, string> = {
// //         "javascript": "vanilla",
// //         "html": "vanilla",
// //         "typescript": "vanilla-ts",
// //         "create-react-app": "react",
// //         "vite-react": "vite-react",
// //         "vite-react-ts": "vite-react-ts",
// //         "node": "node",
// //         "python": "vanilla",
// //         "sql": "vanilla",
// //     };
// //     return templateMap[dbTemplateKey] || dbTemplateKey;
// // };

// // const processProjectData = (rawFiles: Record<string, string>, targetPort: number, templateType: string, blockId: string) => {
// //     const out = sanitizeProjectFiles(rawFiles);
// //     const isReact = templateType === 'vite-react' || templateType === 'create-react-app' || templateType === 'vite-react-ts';
// //     const isNode = templateType === 'node';
// //     const isVanilla = !isReact && !isNode;

// //     const hasUserFiles = Object.keys(out).some(p => !['/package.json', '/vite.config.js', '/vite.config.ts'].includes(p));

// //     if (!out['/package.json']) {
// //         out['/package.json'] = JSON.stringify({ name: "mlab-workspace-project", type: "module" }, null, 2);
// //     }

// //     try {
// //         const pkg = JSON.parse(out['/package.json']);
// //         pkg.type = pkg.type || "module";
// //         pkg.dependencies = pkg.dependencies || {};
// //         pkg.devDependencies = pkg.devDependencies || {};
// //         pkg.scripts = pkg.scripts || {};

// //         if (isNode) {
// //             pkg.scripts.dev = pkg.scripts.dev || `node index.js`;
// //         } else {
// //             pkg.scripts.dev = `vite --port ${targetPort}`;
// //             pkg.devDependencies['vite'] = pkg.devDependencies['vite'] || "^4.5.3";
// //         }

// //         if (isVanilla) {
// //             delete pkg.dependencies['react'];
// //             delete pkg.dependencies['react-dom'];
// //             delete pkg.devDependencies['@vitejs/plugin-react'];
// //         }

// //         delete pkg.engines;
// //         delete pkg.packageManager;
// //         out['/package.json'] = JSON.stringify(pkg, null, 2);
// //     } catch (e) { }

// //     if (isReact) {
// //         if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
// //             out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    port: ${targetPort},\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
// //         }

// //         if (!hasUserFiles) {
// //             const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
// //             const ext = isTSProject ? 'tsx' : 'jsx';

// //             if (!out[`/src/App.${ext}`]) out[`/src/App.${ext}`] = 'export default function App() {\n  return <h1>Vite + React Canvas Online!</h1>;\n}';
// //             if (!out[`/src/main.${ext}`]) {
// //                 out[`/src/main.${ext}`] = `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.${ext}";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);`;
// //             }
// //             if (!out['/src/index.css']) out['/src/index.css'] = `body { font-family: sans-serif; padding: 2rem; }`;
// //         }

// //         if (out['/App.js'] && !out['/src/App.jsx']) out['/src/App.jsx'] = out['/App.js'];
// //         ['/index.js', '/index.jsx', '/index.ts', '/index.tsx', '/App.js', '/App.tsx'].forEach(g => delete out[g]);

// //     } else if (isVanilla) {
// //         const reactGhosts = [
// //             '/App.jsx', '/App.tsx', '/App.js',
// //             '/src/App.jsx', '/src/App.tsx', '/src/App.js',
// //             '/src/main.jsx', '/src/main.tsx', '/src/main.js',
// //             '/src/index.css', '/vite.config.js', '/vite.config.ts'
// //         ];
// //         reactGhosts.forEach(g => delete out[g]);

// //         if (out['/index.js'] && out['/index.js'].includes('Hello Vanilla!')) {
// //             delete out['/index.js'];
// //         }
// //         if (out['/index.html'] && out['/index.html'].includes('Vanilla App') && out['/index.html'].includes('<div id="app"></div>')) {
// //             delete out['/index.html'];
// //         }

// //         if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
// //             out['/vite.config.js'] = `import { defineConfig } from 'vite';\n\nexport default defineConfig({\n  server: {\n    port: ${targetPort},\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
// //         }

// //         if (!out['/index.html']) {
// //             const fallbackHtml = Object.keys(out).find(p => p.endsWith('.html') && p !== '/index.html');

// //             if (fallbackHtml) {
// //                 out['/index.html'] = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=${fallbackHtml}" /></head><body>Redirecting to ${fallbackHtml}...</body></html>`;
// //             } else {
// //                 out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>Vanilla App</title>\n</head>\n<body>\n  <div id="app"></div>\n  <script type="module" src="/index.js"></script>\n</body>\n</html>`;
// //                 if (!out['/index.js']) out['/index.js'] = `document.getElementById('app').innerHTML = '<h1>Hello Vanilla!</h1>';`;
// //             }
// //         }
// //     }

// //     const consoleInterceptor = `\n<script>\n  (function() {\n    const orig = { ...console };\n    ['log', 'warn', 'error', 'info'].forEach(m => {\n      console[m] = (...args) => {\n        orig[m](...args);\n        try { window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*'); } catch(e) {}\n      };\n    });\n    window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m: 'error', p: e.message }, '*'));\n  })();\n</script>\n`;

// //     let htmlKey = out['/index.html'] ? '/index.html' : out['/public/index.html'] ? '/public/index.html' : null;
// //     if (!htmlKey) htmlKey = Object.keys(out).find(p => p.endsWith('/index.html')) || null;

// //     if (htmlKey && out[htmlKey]) {
// //         let html = out[htmlKey];
// //         if (!html.includes("source: 'preview-console'") && !html.includes("http-equiv=\"refresh\"")) {
// //             if (html.includes('<head>')) {
// //                 html = html.replace('<head>', `<head>${consoleInterceptor}`);
// //             } else if (html.includes('<html>')) {
// //                 html = html.replace('<html>', `<html><head>${consoleInterceptor}</head>`);
// //             } else {
// //                 html = `${consoleInterceptor}${html}`;
// //             }
// //         }
// //         out[htmlKey] = html;
// //     } else if (isReact && !hasUserFiles && !out['/index.html']) {
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
// //                     if (typeof code === 'string') {
// //                         if (code.startsWith('__mlab_base64__')) {
// //                             const binStr = atob(code.substring(15));
// //                             const arr = new Uint8Array(binStr.length);
// //                             for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// //                             outCode = arr;
// //                         } else {
// //                             outCode = makeWellFormed(code);
// //                         }
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
// //         }, 500);
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
// //                     const isBinaryFile = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z'].some(ext => name.toLowerCase().endsWith(ext));
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
// //     const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// //     useEffect(() => {
// //         if (readOnly) return;

// //         if (debounceRef.current) clearTimeout(debounceRef.current);
// //         debounceRef.current = setTimeout(() => {
// //             const currentFiles: Record<string, string> = {};
// //             for (const [path, fileObj] of Object.entries(sandpack.files)) {
// //                 const cleanPath = path.startsWith('/') ? path : `/${path}`;
// //                 if (fileObj && !fileObj.hidden && typeof fileObj.code === 'string') {
// //                     currentFiles[cleanPath] = fileObj.code;
// //                 }
// //             }

// //             const pkgJson = currentFiles['/package.json'];
// //             let dependencies = {};
// //             if (pkgJson) {
// //                 try { dependencies = JSON.parse(pkgJson).dependencies || {}; } catch (e) { }
// //             }

// //             onChange({ snapshot: createSafeSnapshot(currentFiles), dependencies, immediate: false });
// //         }, 400);

// //         return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
// //     }, [sandpack.files, readOnly, onChange]);
// //     return null;
// // };

// // let globalNpmMutex: Promise<void> = Promise.resolve();

// // export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false, portalTarget }) => {
// //     const toast = useToast();
// //     const [isMaximized, setIsMaximized] = useState(false);
// //     const [pendingZipFile, setPendingZipFile] = useState<Blob | null>(null);

// //     const onChangeRef = useRef(onChange);

// //     const [showGithubModal, setShowGithubModal] = useState(false);
// //     const [githubUrl, setGithubUrl] = useState('');
// //     const [isFetchingGithub, setIsFetchingGithub] = useState(false);

// //     useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

// //     const safeBlockId = useMemo(() => sanitizeBlockId(block?.id), [block?.id]);

// //     const assignedPort = useMemo(() => {
// //         let hash = 0;
// //         const str = safeBlockId;
// //         for (let i = 0; i < str.length; i++) {
// //             hash = str.charCodeAt(i) + ((hash << 5) - hash);
// //         }
// //         return 5000 + (Math.abs(hash) % 1000);
// //     }, [safeBlockId]);

// //     const snapshotKey = useMemo(() => {
// //         const s = learnerAns?.snapshot;
// //         if (!s) return '';
// //         return typeof s === 'string' ? s : JSON.stringify(s);
// //     }, [learnerAns?.snapshot]);

// //     const getInitialConfig = useCallback(() => {
// //         const parsedFiles = parseAndRepairLearnerSnapshot(learnerAns?.snapshot || learnerAns, block?.template);
// //         const rawFilesToLoad = (parsedFiles && Object.keys(parsedFiles).length > 0) ? parsedFiles : { ...(block?.initialFiles || {}) };

// //         const filesToLoad = sanitizeProjectFiles(rawFilesToLoad);
// //         const tpl = getEffectiveTemplate(filesToLoad, block?.template);

// //         return {
// //             files: processProjectData(filesToLoad, assignedPort, tpl, safeBlockId),
// //             template: tpl
// //         };
// //     }, [learnerAns, block?.initialFiles, block?.template, assignedPort, safeBlockId]);

// //     const initialConfig = useMemo(() => getInitialConfig(), [getInitialConfig]);

// //     const [lockedFiles, setLockedFiles] = useState(() => initialConfig.files);
// //     const [template, setTemplate] = useState<any>(() => initialConfig.template);

// //     const latestFrontendFilesRef = useRef<Record<string, string>>(initialConfig.files);

// //     const [runId, setRunId] = useState(Date.now().toString());

// //     useEffect(() => {
// //         let cancelled = false;

// //         const loadProject = async () => {
// //             const parsedFiles = parseAndRepairLearnerSnapshot(learnerAns?.snapshot || learnerAns, block?.template);
// //             const hasValidSnapshot = parsedFiles && Object.keys(parsedFiles).length > 0;

// //             if (hasValidSnapshot) {
// //                 const currentSerialized = createSafeSnapshot(latestFrontendFilesRef.current);
// //                 const incomingSerialized = JSON.stringify(parsedFiles);

// //                 if (currentSerialized === incomingSerialized || incomingSerialized === lastSavedSnapshotRef.current) {
// //                     return;
// //                 }
// //             }

// //             let rawFilesToLoad: Record<string, string> = hasValidSnapshot ? parsedFiles! : { ...(block?.initialFiles || {}) };

// //             if (!hasValidSnapshot && Object.keys(rawFilesToLoad).length === 0 && block?.initialFilesStoragePath) {
// //                 try {
// //                     const storage = getStorage();
// //                     const jsonRef = fbStorageRef(storage, block.initialFilesStoragePath);
// //                     const buffer = await getBytes(jsonRef);
// //                     const jsonStr = new TextDecoder().decode(buffer);
// //                     rawFilesToLoad = JSON.parse(jsonStr);
// //                 } catch (err) {
// //                     console.error("Failed to load offloaded starter code from Storage:", err);
// //                 }
// //             }

// //             if (cancelled) return;

// //             const filesToLoad = sanitizeProjectFiles(rawFilesToLoad);
// //             const tpl = getEffectiveTemplate(filesToLoad, block?.template);
// //             const processed = processProjectData(filesToLoad, assignedPort, tpl, safeBlockId);

// //             console.log(`✅ [IDE LOAD] Syncing files into Sandpack. Total files: ${Object.keys(processed).length}`);

// //             setLockedFiles(processed);
// //             setTemplate(resolveSandpackTemplate(tpl));
// //             canonicalKeysRef.current = new Set(Object.keys(processed).map(p => p.startsWith('/') ? p : '/' + p));
// //             latestFrontendFilesRef.current = processed;
// //         };

// //         loadProject();

// //         return () => { cancelled = true; };
// //     }, [snapshotKey, block?.initialFiles, block?.initialFilesStoragePath, block?.template, assignedPort, safeBlockId]);

// //     const [previewUrl, setPreviewUrl] = useState<string>('');
// //     const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
// //     const [statusText, setStatusText] = useState("Booting OS...");
// //     const [wcReady, setWcReady] = useState(false);
// //     const [iframeKey, setIframeKey] = useState(0);
// //     const [bootFailed, setBootFailed] = useState(false);
// //     const previewOriginRef = useRef<string>('');

// //     const wcInstanceRef = useRef<WebContainer | null>(null);

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

// //         if (Object.keys(filteredSnapshot).length === 0) {
// //             console.warn("⚠️ [IDE AUTO-SAVE SKIPPED] File map is empty. Refusing to write to Firebase.");
// //             return;
// //         }

// //         const serialized = createSafeSnapshot(filteredSnapshot, (path) => {
// //             if (!warnedDroppedFilesRef.current.has(path)) {
// //                 warnedDroppedFilesRef.current.add(path);
// //                 toast?.error(`"${path}" is too large to save (max 500KB) and was left out of your saved project.`);
// //             }
// //         });

// //         const unchanged = !isImmediate && serialized === lastSavedSnapshotRef.current;
// //         if (unchanged) return;

// //         let dependencies = {};
// //         if (filteredSnapshot['/package.json']) {
// //             try { dependencies = JSON.parse(filteredSnapshot['/package.json']).dependencies || {}; } catch { }
// //         }

// //         console.log(`💾 [IDE AUTO-SAVE TRIGGERED] Dispatching snapshot for block [${block?.id}] to parent component...`, {
// //             isImmediate,
// //             fileCount: Object.keys(filteredSnapshot).length,
// //             filePaths: Object.keys(filteredSnapshot)
// //         });

// //         const pendingSnapshot = serialized;
// //         const result = onChangeRef.current({ snapshot: serialized, dependencies, immediate: isImmediate });
// //         if (result && typeof (result as any).then === 'function') {
// //             (result as Promise<void>)
// //                 .then(() => {
// //                     lastSavedSnapshotRef.current = pendingSnapshot;
// //                     console.log(`✅ [IDE AUTO-SAVE CONFIRMED] Code changes persisted for block [${block?.id}]`);
// //                 })
// //                 .catch((err) => {
// //                     console.error('❌ [IDE AUTO-SAVE ERROR] Save rejected:', err);
// //                     toast?.error('Failed to save your latest changes. Retrying shortly…');
// //                 });
// //         } else {
// //             lastSavedSnapshotRef.current = pendingSnapshot;
// //         }
// //     }, [block?.id, readOnly, toast]);

// //     const scheduleSave = useCallback(() => {
// //         if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// //         saveDebounceRef.current = setTimeout(() => {
// //             flushSaveRef.current(false);
// //             saveDebounceRef.current = null;
// //         }, 1500);
// //     }, []);

// //     const handleFilesChange = useCallback((answerPayload: { snapshot: string }) => {
// //         if (readOnly) return;
// //         const files = safeParseSnapshot(answerPayload.snapshot);
// //         if (!files || Object.keys(files).length === 0) return;

// //         latestFrontendFilesRef.current = files;
// //         scheduleSave();
// //     }, [scheduleSave, readOnly]);

// //     const flushSaveRef = useRef(flushSave);
// //     useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

// //     useEffect(() => {
// //         const handleBeforeUnload = () => {
// //             flushSaveRef.current(true);
// //         };
// //         const handleVisibilityChange = () => {
// //             if (document.visibilityState === 'hidden') {
// //                 flushSaveRef.current(true);
// //             }
// //         };

// //         window.addEventListener('beforeunload', handleBeforeUnload);
// //         document.addEventListener('visibilitychange', handleVisibilityChange);
// //         return () => {
// //             window.removeEventListener('beforeunload', handleBeforeUnload);
// //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// //         };
// //     }, []);

// //     useEffect(() => {
// //         return () => {
// //             if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// //             flushSaveRef.current(true);
// //         };
// //     }, []);

// //     useEffect(() => {
// //         const intervalId = setInterval(() => flushSaveRef.current(false), 30000);
// //         return () => clearInterval(intervalId);
// //     }, []);

// //     useEffect(() => {
// //         const handleMessage = (e: MessageEvent) => {
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
// //         if (!hasBeenVisible) return;

// //         let mounted = true;
// //         const streamController = new AbortController();

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
// //         let serverReadyUnsub: (() => void) | null = null;

// //         const boot = async () => {
// //             const WORK_DIR = `/${safeBlockId}`;

// //             try {
// //                 console.log(`🚀 [IDE WEBCONTAINER] Booting WebContainer instance for block [${safeBlockId}]...`);
// //                 const wc = await getWebContainer();
// //                 if (!mounted) return;

// //                 setWcInstance(wc);
// //                 wcInstanceRef.current = wc;

// //                 if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } devProcessRef.current = null; }
// //                 if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } shellProcessRef.current = null; }
// //                 try { await wc.fs.rm(WORK_DIR, { recursive: true, force: true }); } catch { }

// //                 debugTerm.writeln('\x1b[1;32m>> SYSTEM ONLINE - MOUNTING FILESYSTEM\x1b[0m');
// //                 const bootTemplate = template;
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

// //                             installProcess.output.pipeTo(new WritableStream({
// //                                 write: data => { if (mounted) debugTerm.write(data); }
// //                             }), { signal: streamController.signal }).catch(() => { });

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
// //                 }), { signal: streamController.signal }).catch(() => { });

// //                 const shellProcess = await wc.spawn('jsh', { terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 15 }, cwd: WORK_DIR });
// //                 shellProcessRef.current = shellProcess;

// //                 shellProcess.output.pipeTo(new WritableStream({
// //                     write: data => { if (mounted) shellTerm.write(data); }
// //                 }), { signal: streamController.signal }).catch(() => { });

// //                 const inputWriter = shellProcess.input.getWriter();
// //                 await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH"\nclear\n').catch(() => { });
// //                 shellInputListener = shellTerm.onData(data => {
// //                     if (mounted) inputWriter.write(data).catch(() => { });
// //                 });

// //                 serverReadyUnsub = wc.on('server-ready', (port, url) => {
// //                     console.log(`🚀 [IDE WEBCONTAINER] server-ready event received on port ${port}: ${url}`);
// //                     if (!mounted) return;

// //                     try { previewOriginRef.current = new URL(url).origin; } catch { }
// //                     setPreviewUrl(url);
// //                     setStatusText("Online");
// //                     setIframeKey(k => k + 1);
// //                     debugTerm.writeln(`\n\x1b[1;32m>> Preview running on port ${port}\x1b[0m\n`);
// //                 });

// //             } catch (err: any) {
// //                 if (mounted) {
// //                     console.error("❌ [IDE WEBCONTAINER ERROR]", err);
// //                     debugTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
// //                     setStatusText("Boot Failed");
// //                     setBootFailed(true);
// //                 }
// //             }
// //         };

// //         setBootFailed(false);
// //         boot();
// //         const handleUnload = () => {
// //             streamController.abort();
// //             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
// //             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }
// //         };
// //         window.addEventListener('beforeunload', handleUnload);

// //         return () => {
// //             mounted = false;
// //             streamController.abort();
// //             window.removeEventListener('beforeunload', handleUnload);

// //             if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
// //             if (shellResizeObserverRef.current) shellResizeObserverRef.current.disconnect();
// //             if (shellInputListener) shellInputListener.dispose();
// //             if (serverReadyUnsub) serverReadyUnsub();

// //             debugTerm.dispose();
// //             shellTerm.dispose();

// //             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } }
// //             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } }

// //             setWcInstance(null);
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

// //     useEffect(() => {
// //         if (isMaximized) {
// //             document.documentElement.style.overflow = 'hidden';
// //             document.body.style.overflow = 'hidden';

// //             let el = containerRef.current?.parentElement;
// //             while (el && el !== document.body) {
// //                 el.style.setProperty('overflow', 'hidden', 'important');
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
// //         setPendingZipFile(file);
// //         e.target.value = '';
// //     };

// //     const processZipBlob = async (blob: Blob) => {
// //         const zip = new JSZip();
// //         const contents = await zip.loadAsync(blob);

// //         const allPaths = Object.keys(contents.files).filter(p => {
// //             const fileName = p.split('/').pop() || '';
// //             if (contents.files[p].dir) return false;
// //             if (p.includes('__MACOSX') || p.includes('node_modules/') || p.includes('.git/')) return false;
// //             if (fileName.startsWith('._') || fileName === '.DS_Store' || fileName === 'Thumbs.db') return false;
// //             return true;
// //         });

// //         const expectedTemplate = (block?.template || 'javascript').toLowerCase();
// //         const isVanillaExpected = ['javascript', 'html', 'vanilla'].includes(expectedTemplate);

// //         let hasReactFiles = false;
// //         for (const p of allPaths) {
// //             if (p.endsWith('.jsx') || p.endsWith('.tsx')) hasReactFiles = true;
// //             if (p.endsWith('package.json')) {
// //                 try {
// //                     const pkgStr = await contents.files[p].async('string');
// //                     if (pkgStr.includes('"react"')) hasReactFiles = true;
// //                 } catch (e) { }
// //             }
// //         }

// //         if (isVanillaExpected && hasReactFiles) {
// //             toast?.error("Upload Blocked: This assignment requires a pure Vanilla JavaScript project. React projects are not allowed here.");
// //             return;
// //         }

// //         const isBinaryFile = (path: string) => ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z'].some(ext => path.toLowerCase().endsWith(ext));

// //         const extractedMap: Record<string, string> = {};
// //         for (const path of allPaths) {
// //             if (isBinaryFile(path)) {
// //                 extractedMap[`/${path}`] = `__mlab_base64__${await contents.files[path].async('base64')}`;
// //             } else {
// //                 extractedMap[`/${path}`] = await contents.files[path].async('string');
// //             }
// //         }

// //         const newFiles = sanitizeProjectFiles(extractedMap);

// //         const tempTpl = getEffectiveTemplate(newFiles, block?.template);
// //         const cleanFiles = processProjectData(newFiles, assignedPort, tempTpl, block.id);

// //         setTemplate(resolveSandpackTemplate(tempTpl));
// //         setLockedFiles(cleanFiles);
// //         canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));

// //         latestFrontendFilesRef.current = cleanFiles;
// //         setRunId(Date.now().toString());

// //         flushSaveRef.current(true);
// //         toast?.success("Project Imported Successfully!");
// //     };

// //     const confirmZipImport = async () => {
// //         if (!pendingZipFile) return;
// //         await processZipBlob(pendingZipFile);
// //         setPendingZipFile(null);
// //     };

// //     const handleGithubImport = async () => {
// //         if (!githubUrl.trim()) return;
// //         try {
// //             setIsFetchingGithub(true);

// //             const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
// //             if (!match) throw new Error("Invalid GitHub URL. Must be a valid repo link.");

// //             const user = match[1];
// //             const repo = match[2].replace('.git', '');

// //             const response = await fetch(`https://api.github.com/repos/${user}/${repo}/zipball`);
// //             if (!response.ok) throw new Error("Could not fetch repo. Ensure it is public.");

// //             const blob = await response.blob();

// //             setShowGithubModal(false);
// //             setGithubUrl('');
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
// //                         <SandpackProvider key={runId} template={resolveSandpackTemplate(template)} files={lockedFiles} theme="dark">
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

// //             {/* GITHUB IMPORT MODAL - Explicitly handles its own portalTarget with pointEvents: 'auto' */}
// //             {showGithubModal && createPortal(
// //                 <div className="lfm-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.8)', zIndex: 9999999, pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //                     <div className="animate-fade-in" style={{ background: '#1e293b', padding: '24px', borderRadius: '8px', width: '100%', maxWidth: '420px', border: '1px solid #334155', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
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
// //                 </div>,
// //                 portalTarget || document.body
// //             )}

// //             {/* CUSTOM ZIP OVERWRITE CONFIRMATION - Bypasses external StatusModal for guaranteed Fullscreen Pointer control */}
// //             {pendingZipFile && createPortal(
// //                 <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //                     <div className="animate-fade-in" style={{ background: 'white', borderRadius: '8px', width: '100%', maxWidth: '420px', borderTop: '5px solid #d97706', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' }}>

// //                         <div style={{ padding: '24px 24px 16px 24px', textAlign: 'center', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
// //                             <div style={{ display: 'inline-flex', padding: '12px', background: 'white', border: '1px solid #d97706', borderRadius: '4px', marginBottom: '12px' }}>
// //                                 <AlertTriangle size={28} color="#d97706" />
// //                             </div>
// //                             <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#d97706', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
// //                                 WARNING
// //                             </div>
// //                         </div>

// //                         <div style={{ padding: '24px', textAlign: 'center' }}>
// //                             <h3 style={{ margin: '0 0 12px 0', color: '#0f172a', fontSize: '1.2rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                 Overwrite Existing Code?
// //                             </h3>
// //                             <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
// //                                 Importing this ZIP file will completely replace your current project files. This action cannot be undone. Do you want to proceed?
// //                             </p>

// //                             <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
// //                                 <button onClick={() => setPendingZipFile(null)} style={{ flex: 1, padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                     Cancel
// //                                 </button>
// //                                 <button onClick={confirmZipImport} style={{ flex: 1, padding: '10px 16px', background: '#d97706', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                     Yes, Import
// //                                 </button>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 </div>,
// //                 portalTarget || document.body
// //             )}
// //         </div>
// //     );
// // };

// // export default CodeSandboxPlayer;



// // // // src/components/common/CodeSandboxPlayer/CodeSandboxPlayer.tsx

// // // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // // import {
// // //     Code, Maximize, Minimize, CheckCircle, Play, Loader2, Plus, X, Trash2, Pencil,
// // //     FilePlus, Download, Github, FolderArchive, RefreshCw, AlertTriangle, ScrollText, SquareTerminal
// // // } from 'lucide-react';
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
// // // import type { FileSystemTree, WebContainer, WebContainerProcess } from '@webcontainer/api';
// // // import { createPortal } from 'react-dom';
// // // import { getStorage, ref as fbStorageRef, getBytes } from 'firebase/storage';

// // // export interface SandboxFileMap {
// // //     [path: string]: string;
// // // }

// // // export interface SandboxBlock {
// // //     id: string;
// // //     title?: string;
// // //     template?: string;
// // //     question?: string;
// // //     initialFiles?: SandboxFileMap;
// // //     initialFilesStoragePath?: string;
// // // }

// // // export interface SandboxAnswerPayload {
// // //     snapshot?: string | SandboxFileMap;
// // //     dependencies?: Record<string, string>;
// // //     immediate?: boolean;
// // // }

// // // export interface CodeSandboxPlayerProps {
// // //     block: SandboxBlock;
// // //     learnerAns: SandboxAnswerPayload | null | undefined;
// // //     onChange?: (answer: SandboxAnswerPayload) => void | Promise<void>;
// // //     readOnly?: boolean;
// // // }

// // // const sanitizeBlockId = (id: string | undefined): string => {
// // //     const clean = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
// // //     return clean || 'mlab-default';
// // // };

// // // const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache', '.npm-cache', '__MACOSX'];
// // // const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store', 'Thumbs.db'];
// // // const SYNC_IGNORE_EXTS = ['.psd', '.ai', '.xd', '.sketch', '.fig', '.pdf', '.mp4', '.mov', '.zip', '.rar', '.tar', '.gz', '.7z'];

// // // const shouldIgnorePath = (relPath: string) => {
// // //     const parts = relPath.split('/').filter(Boolean);
// // //     if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
// // //     const fileName = parts[parts.length - 1] || '';
// // //     if (fileName.startsWith('._')) return true;
// // //     if (SYNC_IGNORE_FILES.includes(fileName)) return true;
// // //     if (fileName.endsWith('.log')) return true;
// // //     if (SYNC_IGNORE_EXTS.some(ext => fileName.toLowerCase().endsWith(ext))) return true;
// // //     return false;
// // // };

// // // const makeWellFormed = (str: string): string => {
// // //     if (typeof (str as any).toWellFormed === 'function') return (str as any).toWellFormed();
// // //     return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '$1\uFFFD');
// // // };

// // // export const sanitizeProjectFiles = (rawFiles: Record<string, string>): Record<string, string> => {
// // //     if (!rawFiles || typeof rawFiles !== 'object') return {};

// // //     const cleanMap: Record<string, string> = {};
// // //     const validPaths: string[] = [];

// // //     Object.keys(rawFiles).forEach((path) => {
// // //         const normalizedPath = path.startsWith('/') ? path : `/${path}`;
// // //         if (shouldIgnorePath(normalizedPath)) return;

// // //         cleanMap[normalizedPath] = rawFiles[path];
// // //         validPaths.push(normalizedPath);
// // //     });

// // //     if (validPaths.length === 0) return {};

// // //     const rootSegments = new Set(
// // //         validPaths.map((p) => p.split('/').filter(Boolean)[0])
// // //     );

// // //     let prefixToStrip = '';
// // //     if (rootSegments.size === 1) {
// // //         const singleFolder = Array.from(rootSegments)[0];
// // //         const allHaveSubpaths = validPaths.every((p) => {
// // //             const parts = p.split('/').filter(Boolean);
// // //             return parts.length > 1 && parts[0] === singleFolder;
// // //         });

// // //         if (allHaveSubpaths) {
// // //             prefixToStrip = `/${singleFolder}`;
// // //         }
// // //     }

// // //     const finalMap: Record<string, string> = {};
// // //     Object.keys(cleanMap).forEach((path) => {
// // //         let newPath = path;
// // //         if (prefixToStrip && newPath.startsWith(prefixToStrip)) {
// // //             newPath = newPath.slice(prefixToStrip.length);
// // //         }
// // //         if (!newPath.startsWith('/')) {
// // //             newPath = `/${newPath}`;
// // //         }
// // //         finalMap[newPath] = cleanMap[path];
// // //     });

// // //     return finalMap;
// // // };

// // // const createSafeSnapshot = (files: Record<string, string>, onDropped?: (path: string) => void) => {
// // //     const safeFiles: Record<string, string> = {};
// // //     for (const [path, content] of Object.entries(files)) {
// // //         if (shouldIgnorePath(path)) continue;
// // //         if (content.length > 500000) {
// // //             console.warn(`[IDE SNAPSHOT] File ${path} is too large. Excluding from auto-save.`);
// // //             onDropped?.(path);
// // //             continue;
// // //         }
// // //         safeFiles[path] = content;
// // //     }
// // //     return JSON.stringify(safeFiles);
// // // };

// // // const isValidSnapshot = (obj: unknown): obj is SandboxFileMap => {
// // //     if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
// // //     return Object.entries(obj as Record<string, unknown>).every(
// // //         ([path, content]) => typeof path === 'string' && path.length < 500 && typeof content === 'string'
// // //     );
// // // };

// // // export const safeParseSnapshot = (raw: string): SandboxFileMap | null => {
// // //     try {
// // //         const parsed = JSON.parse(raw);
// // //         return isValidSnapshot(parsed) ? parsed : null;
// // //     } catch {
// // //         return null;
// // //     }
// // // };

// // // // 🚀 REPAIR ENGINE FOR EXISTING/LEGACY LEARNER ASSESSMENTS
// // // export const parseAndRepairLearnerSnapshot = (raw: any, blockTemplate?: string): SandboxFileMap | null => {
// // //     if (!raw) return null;

// // //     if (typeof raw === 'string' && raw.trim().length > 0) {
// // //         try {
// // //             const parsed = JSON.parse(raw);
// // //             if (parsed && typeof parsed === 'object') {
// // //                 return parseAndRepairLearnerSnapshot(parsed, blockTemplate);
// // //             }
// // //         } catch {
// // //             const isHtml = raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('</body>');
// // //             const fileName = isHtml ? '/index.html' : '/index.js';
// // //             return { [fileName]: raw };
// // //         }
// // //     }

// // //     if (typeof raw === 'object' && !Array.isArray(raw)) {
// // //         if (raw.snapshot) return parseAndRepairLearnerSnapshot(raw.snapshot, blockTemplate);
// // //         if (raw.codeData) return parseAndRepairLearnerSnapshot(raw.codeData, blockTemplate);

// // //         const safeFiles: SandboxFileMap = {};
// // //         let hasFiles = false;

// // //         // 🚀 CRITICAL FIX: Exclude metadata keys from being parsed as literal files!
// // //         const ignoreKeys = ['lastSavedAt', 'storagePath', 'dependencies', 'snapshot', 'codeData', 'immediate'];

// // //         for (const [key, value] of Object.entries(raw)) {
// // //             if (ignoreKeys.includes(key)) continue;

// // //             if (typeof key === 'string' && typeof value === 'string') {
// // //                 // Ensure it's formatted as a path
// // //                 const cleanKey = key.startsWith('/') ? key : `/${key}`;
// // //                 safeFiles[cleanKey] = value;
// // //                 hasFiles = true;
// // //             }
// // //         }

// // //         if (hasFiles) return safeFiles;

// // //         if (typeof raw.code === 'string' && raw.code.trim().length > 0) {
// // //             const fileName = (blockTemplate === 'html' || raw.code.includes('<html') || raw.code.includes('<!DOCTYPE')) ? '/index.html' : '/index.js';
// // //             return { [fileName]: raw.code };
// // //         }
// // //     }

// // //     return null;
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
// // //                 if (typeof content === 'string') {
// // //                     if (content.startsWith('__mlab_base64__')) {
// // //                         const binStr = atob(content.substring(15));
// // //                         const arr = new Uint8Array(binStr.length);
// // //                         for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// // //                         fileContent = arr;
// // //                     } else {
// // //                         fileContent = makeWellFormed(content);
// // //                     }
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

// // // const getEffectiveTemplate = (files: Record<string, string>, fallback: string | undefined): string => {
// // //     const explicit = fallback?.toLowerCase();

// // //     if (explicit === 'javascript' || explicit === 'html' || explicit === 'vanilla') return 'vanilla';
// // //     if (explicit === 'typescript' || explicit === 'vanilla-ts') return 'vanilla-ts';
// // //     if (explicit === 'node') return 'node';
// // //     if (explicit === 'vite-react' || explicit === 'create-react-app' || explicit === 'react') return 'vite-react';
// // //     if (explicit === 'python') return 'vanilla';
// // //     if (explicit === 'sql') return 'vanilla';

// // //     const fileNames = Object.keys(files);
// // //     const hasReactFile = fileNames.some(p => p.endsWith('.jsx') || p.endsWith('.tsx'));
// // //     return hasReactFile ? 'vite-react' : 'vanilla';
// // // };

// // // const resolveSandpackTemplate = (dbTemplateKey?: string): any => {
// // //     if (!dbTemplateKey) return "vanilla";
// // //     const templateMap: Record<string, string> = {
// // //         "javascript": "vanilla",
// // //         "html": "vanilla",
// // //         "typescript": "vanilla-ts",
// // //         "create-react-app": "react",
// // //         "vite-react": "vite-react",
// // //         "vite-react-ts": "vite-react-ts",
// // //         "node": "node",
// // //         "python": "vanilla",
// // //         "sql": "vanilla",
// // //     };
// // //     return templateMap[dbTemplateKey] || dbTemplateKey;
// // // };

// // // const processProjectData = (rawFiles: Record<string, string>, targetPort: number, templateType: string, blockId: string) => {
// // //     const out = sanitizeProjectFiles(rawFiles);
// // //     const isReact = templateType === 'vite-react' || templateType === 'create-react-app' || templateType === 'vite-react-ts';
// // //     const isNode = templateType === 'node';
// // //     const isVanilla = !isReact && !isNode;

// // //     const hasUserFiles = Object.keys(out).some(p => !['/package.json', '/vite.config.js', '/vite.config.ts'].includes(p));

// // //     if (!out['/package.json']) {
// // //         out['/package.json'] = JSON.stringify({ name: "mlab-workspace-project", type: "module" }, null, 2);
// // //     }

// // //     try {
// // //         const pkg = JSON.parse(out['/package.json']);
// // //         pkg.type = pkg.type || "module";
// // //         pkg.dependencies = pkg.dependencies || {};
// // //         pkg.devDependencies = pkg.devDependencies || {};
// // //         pkg.scripts = pkg.scripts || {};

// // //         if (isNode) {
// // //             pkg.scripts.dev = pkg.scripts.dev || `node index.js`;
// // //         } else {
// // //             pkg.scripts.dev = `vite --port ${targetPort}`;
// // //             pkg.devDependencies['vite'] = pkg.devDependencies['vite'] || "^4.5.3";
// // //         }

// // //         if (isVanilla) {
// // //             delete pkg.dependencies['react'];
// // //             delete pkg.dependencies['react-dom'];
// // //             delete pkg.devDependencies['@vitejs/plugin-react'];
// // //         }

// // //         delete pkg.engines;
// // //         delete pkg.packageManager;
// // //         out['/package.json'] = JSON.stringify(pkg, null, 2);
// // //     } catch (e) { }

// // //     if (isReact) {
// // //         if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
// // //             out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    port: ${targetPort},\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
// // //         }

// // //         if (!hasUserFiles) {
// // //             const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
// // //             const ext = isTSProject ? 'tsx' : 'jsx';

// // //             if (!out[`/src/App.${ext}`]) out[`/src/App.${ext}`] = 'export default function App() {\n  return <h1>Vite + React Canvas Online!</h1>;\n}';
// // //             if (!out[`/src/main.${ext}`]) {
// // //                 out[`/src/main.${ext}`] = `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.${ext}";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);`;
// // //             }
// // //             if (!out['/src/index.css']) out['/src/index.css'] = `body { font-family: sans-serif; padding: 2rem; }`;
// // //         }

// // //         if (out['/App.js'] && !out['/src/App.jsx']) out['/src/App.jsx'] = out['/App.js'];
// // //         ['/index.js', '/index.jsx', '/index.ts', '/index.tsx', '/App.js', '/App.tsx'].forEach(g => delete out[g]);

// // //     } else if (isVanilla) {
// // //         const reactGhosts = [
// // //             '/App.jsx', '/App.tsx', '/App.js',
// // //             '/src/App.jsx', '/src/App.tsx', '/src/App.js',
// // //             '/src/main.jsx', '/src/main.tsx', '/src/main.js',
// // //             '/src/index.css', '/vite.config.js', '/vite.config.ts'
// // //         ];
// // //         reactGhosts.forEach(g => delete out[g]);

// // //         if (out['/index.js'] && out['/index.js'].includes('Hello Vanilla!')) {
// // //             delete out['/index.js'];
// // //         }
// // //         if (out['/index.html'] && out['/index.html'].includes('Vanilla App') && out['/index.html'].includes('<div id="app"></div>')) {
// // //             delete out['/index.html'];
// // //         }

// // //         if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
// // //             out['/vite.config.js'] = `import { defineConfig } from 'vite';\n\nexport default defineConfig({\n  server: {\n    port: ${targetPort},\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
// // //         }

// // //         if (!out['/index.html']) {
// // //             const fallbackHtml = Object.keys(out).find(p => p.endsWith('.html') && p !== '/index.html');

// // //             if (fallbackHtml) {
// // //                 out['/index.html'] = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=${fallbackHtml}" /></head><body>Redirecting to ${fallbackHtml}...</body></html>`;
// // //             } else {
// // //                 out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>Vanilla App</title>\n</head>\n<body>\n  <div id="app"></div>\n  <script type="module" src="/index.js"></script>\n</body>\n</html>`;
// // //                 if (!out['/index.js']) out['/index.js'] = `document.getElementById('app').innerHTML = '<h1>Hello Vanilla!</h1>';`;
// // //             }
// // //         }
// // //     }

// // //     const consoleInterceptor = `\n<script>\n  (function() {\n    const orig = { ...console };\n    ['log', 'warn', 'error', 'info'].forEach(m => {\n      console[m] = (...args) => {\n        orig[m](...args);\n        try { window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*'); } catch(e) {}\n      };\n    });\n    window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m: 'error', p: e.message }, '*'));\n  })();\n</script>\n`;

// // //     let htmlKey = out['/index.html'] ? '/index.html' : out['/public/index.html'] ? '/public/index.html' : null;
// // //     if (!htmlKey) htmlKey = Object.keys(out).find(p => p.endsWith('/index.html')) || null;

// // //     if (htmlKey && out[htmlKey]) {
// // //         let html = out[htmlKey];
// // //         if (!html.includes("source: 'preview-console'") && !html.includes("http-equiv=\"refresh\"")) {
// // //             if (html.includes('<head>')) {
// // //                 html = html.replace('<head>', `<head>${consoleInterceptor}`);
// // //             } else if (html.includes('<html>')) {
// // //                 html = html.replace('<html>', `<html><head>${consoleInterceptor}</head>`);
// // //             } else {
// // //                 html = `${consoleInterceptor}${html}`;
// // //             }
// // //         }
// // //         out[htmlKey] = html;
// // //     } else if (isReact && !hasUserFiles && !out['/index.html']) {
// // //         const entryPoint = templateType === 'vite-react' ? '/src/main' : '/src/index';
// // //         const ext = out['/src/App.tsx'] ? 'tsx' : 'jsx';
// // //         out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>${consoleInterceptor}</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="${entryPoint}.${ext}"></script>\n</body>\n</html>`;
// // //     }

// // //     return out;
// // // };

// // // const GIT_SHIM_SCRIPT = `#!/usr/bin/env node
// // // console.log("\\n\\x1b[1;33m⚠️  Git is not natively supported in this browser environment.\\x1b[0m");
// // // console.log("\\x1b[1;36mHOW TO MANAGE YOUR CODE:\\x1b[0m");
// // // console.log("  • \\x1b[1;34mClone/Pull:\\x1b[0m Use \\x1b[1;32mnpx degit <github-username>/<repo>\\x1b[0m to download templates.");
// // // console.log("  • \\x1b[1;34mSave/Push:\\x1b[0m Your code is actively auto-saving to the platform.");
// // // console.log("  • \\x1b[1;34mExport:\\x1b[0m Click \\x1b[1;32mDownload ZIP\\x1b[0m in the toolbar above to get your files locally.\\n");
// // // `;

// // // const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', transition: 'color 0.2s' };
// // // const FILE_ACTIONS_BAR_STYLE: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#252526', padding: '6px 16px', borderBottom: '1px solid #333', flexShrink: 0, minHeight: '36px' };

// // // const SandpackFileActions: React.FC<{ readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>>, wcInstance: WebContainer | null, blockId: string }> = ({ readOnly, canonicalKeysRef, wcInstance, blockId }) => {
// // //     const { sandpack } = useSandpack();

// // //     const [action, setAction] = useState<'idle' | 'add' | 'rename'>('idle');
// // //     const [inputValue, setInputValue] = useState('');

// // //     if (readOnly) return null;

// // //     const handleAction = async () => {
// // //         if (!inputValue.trim()) { setAction('idle'); return; }
// // //         const WORK_DIR = `/${blockId}`;

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
// // //                     if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
// // //                     await wcInstance.fs.writeFile(`${WORK_DIR}${path}`, "// New file\n");
// // //                 } catch { }
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
// // //                         if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
// // //                         await wcInstance.fs.writeFile(`${WORK_DIR}${newPath}`, content);
// // //                         await wcInstance.fs.rm(`${WORK_DIR}${oldPath}`);
// // //                     } catch { }
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
// // //             if (wcInstance) { try { await wcInstance.fs.rm(`/${blockId}${path}`); } catch { } }
// // //         }
// // //     };

// // //     return (
// // //         <div style={FILE_ACTIONS_BAR_STYLE}>
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
// // //                     <input autoFocus value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAction(); if (e.key === 'Escape') setAction('idle'); }} onBlur={() => { if (inputValue.trim() && inputValue !== sandpack.activeFile) handleAction(); else setAction('idle'); }} style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: `1px solid ${action === 'add' ? '#10b981' : '#eab308'}`, outline: 'none', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', minWidth: 0 }} />
// // //                 </div>
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // const WebContainerSyncBridge: React.FC<{ wcInstance: WebContainer | null, blockId: string, readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>> }> = ({ wcInstance, blockId, readOnly, canonicalKeysRef }) => {
// // //     const { sandpack } = useSandpack();
// // //     const lastCodeRef = useRef<Record<string, string>>({});
// // //     const isWritingRef = useRef<boolean>(false);

// // //     if (Object.keys(lastCodeRef.current).length === 0) {
// // //         Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // //             lastCodeRef.current[path] = fileObj.code;
// // //         });
// // //     }

// // //     useEffect(() => {
// // //         if (!wcInstance || readOnly) return;
// // //         const timeoutId = setTimeout(() => {
// // //             Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // //                 const code = fileObj.code;
// // //                 if (code !== undefined && lastCodeRef.current[path] !== code) {
// // //                     lastCodeRef.current[path] = code;
// // //                     let outCode: string | Uint8Array = code;
// // //                     if (typeof code === 'string') {
// // //                         if (code.startsWith('__mlab_base64__')) {
// // //                             const binStr = atob(code.substring(15));
// // //                             const arr = new Uint8Array(binStr.length);
// // //                             for (let j = 0; j < binStr.length; j++) arr[j] = binStr.charCodeAt(j);
// // //                             outCode = arr;
// // //                         } else {
// // //                             outCode = makeWellFormed(code);
// // //                         }
// // //                     }
// // //                     const WORK_DIR = `/${blockId}`;
// // //                     const fullPath = `${WORK_DIR}${path.startsWith('/') ? path : `/${path}`}`;
// // //                     const relativeParts = path.split('/').filter(Boolean);

// // //                     isWritingRef.current = true;
// // //                     if (relativeParts.length > 1) {
// // //                         wcInstance.fs.mkdir(`${WORK_DIR}/` + relativeParts.slice(0, -1).join('/'), { recursive: true })
// // //                             .then(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }))
// // //                             .catch(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }));
// // //                     } else {
// // //                         wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// // //                     }
// // //                 }
// // //             });
// // //         }, 500);
// // //         return () => clearTimeout(timeoutId);
// // //     }, [sandpack.files, wcInstance, blockId, readOnly]);

// // //     useEffect(() => {
// // //         if (!wcInstance || readOnly) return;
// // //         let mounted = true;
// // //         let inFlight = false;
// // //         let intervalId: ReturnType<typeof setInterval> | null = null;
// // //         let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// // //         let watcher: { close?: () => void } | null = null;

// // //         const walk = async (dir: string, relBase: string, acc: Record<string, string>) => {
// // //             let entries: any[];
// // //             try {
// // //                 entries = await wcInstance.fs.readdir(dir, { withFileTypes: true } as any);
// // //             } catch { return; }

// // //             for (const entry of entries) {
// // //                 const name = typeof entry === 'string' ? entry : entry.name;
// // //                 const isDir = typeof entry === 'string' ? false : entry.isDirectory?.();
// // //                 const relPath = `${relBase}/${name}`;
// // //                 if (shouldIgnorePath(relPath)) continue;

// // //                 if (isDir) {
// // //                     await walk(`${dir}/${name}`, relPath, acc);
// // //                 } else {
// // //                     const isBinaryFile = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z'].some(ext => name.toLowerCase().endsWith(ext));
// // //                     if (isBinaryFile) continue;

// // //                     try {
// // //                         const content = await wcInstance.fs.readFile(`${dir}/${name}`, 'utf-8');
// // //                         acc[relPath] = content;
// // //                     } catch { }
// // //                 }
// // //             }
// // //         };

// // //         const syncFromDisk = async () => {
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
// // //             } catch { }
// // //             inFlight = false;
// // //         };

// // //         const setup = async () => {
// // //             try {
// // //                 const w = (wcInstance.fs as any).watch?.(`/${blockId}`, { recursive: true }, () => {
// // //                     if (debounceTimer) clearTimeout(debounceTimer);
// // //                     debounceTimer = setTimeout(syncFromDisk, 400);
// // //                 });
// // //                 if (w && typeof w.close === 'function') {
// // //                     watcher = w;
// // //                 } else {
// // //                     throw new Error('fs.watch unavailable');
// // //                 }
// // //             } catch {
// // //                 intervalId = setInterval(syncFromDisk, 2500);
// // //             }
// // //         };
// // //         setup();

// // //         return () => {
// // //             mounted = false;
// // //             if (intervalId) clearInterval(intervalId);
// // //             if (debounceTimer) clearTimeout(debounceTimer);
// // //             if (watcher?.close) { try { watcher.close(); } catch { } }
// // //         };
// // //     }, [wcInstance, blockId, sandpack, canonicalKeysRef, readOnly]);

// // //     return null;
// // // };

// // // const StateHarvester: React.FC<{ readOnly: boolean, onChange: (answer: { snapshot: string; dependencies: Record<string, string>; immediate: boolean }) => void }> = ({ readOnly, onChange }) => {
// // //     const { sandpack } = useSandpack();
// // //     const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// // //     useEffect(() => {
// // //         if (readOnly) return;

// // //         if (debounceRef.current) clearTimeout(debounceRef.current);
// // //         debounceRef.current = setTimeout(() => {
// // //             const currentFiles: Record<string, string> = {};
// // //             for (const [path, fileObj] of Object.entries(sandpack.files)) {
// // //                 const cleanPath = path.startsWith('/') ? path : `/${path}`;
// // //                 if (fileObj && !fileObj.hidden && typeof fileObj.code === 'string') {
// // //                     currentFiles[cleanPath] = fileObj.code;
// // //                 }
// // //             }

// // //             const pkgJson = currentFiles['/package.json'];
// // //             let dependencies = {};
// // //             if (pkgJson) {
// // //                 try { dependencies = JSON.parse(pkgJson).dependencies || {}; } catch (e) { }
// // //             }

// // //             onChange({ snapshot: createSafeSnapshot(currentFiles), dependencies, immediate: false });
// // //         }, 400);

// // //         return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
// // //     }, [sandpack.files, readOnly, onChange]);
// // //     return null;
// // // };

// // // let globalNpmMutex: Promise<void> = Promise.resolve();

// // // export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false }) => {
// // //     const toast = useToast();
// // //     const [isMaximized, setIsMaximized] = useState(false);
// // //     const [pendingZipFile, setPendingZipFile] = useState<Blob | null>(null);

// // //     const onChangeRef = useRef(onChange);

// // //     const [showGithubModal, setShowGithubModal] = useState(false);
// // //     const [githubUrl, setGithubUrl] = useState('');
// // //     const [isFetchingGithub, setIsFetchingGithub] = useState(false);

// // //     useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

// // //     const safeBlockId = useMemo(() => sanitizeBlockId(block?.id), [block?.id]);

// // //     const assignedPort = useMemo(() => {
// // //         let hash = 0;
// // //         const str = safeBlockId;
// // //         for (let i = 0; i < str.length; i++) {
// // //             hash = str.charCodeAt(i) + ((hash << 5) - hash);
// // //         }
// // //         return 5000 + (Math.abs(hash) % 1000);
// // //     }, [safeBlockId]);

// // //     const snapshotKey = useMemo(() => {
// // //         const s = learnerAns?.snapshot;
// // //         if (!s) return '';
// // //         return typeof s === 'string' ? s : JSON.stringify(s);
// // //     }, [learnerAns?.snapshot]);

// // //     const getInitialConfig = useCallback(() => {
// // //         const parsedFiles = parseAndRepairLearnerSnapshot(learnerAns?.snapshot || learnerAns, block?.template);
// // //         const rawFilesToLoad = (parsedFiles && Object.keys(parsedFiles).length > 0) ? parsedFiles : { ...(block?.initialFiles || {}) };

// // //         const filesToLoad = sanitizeProjectFiles(rawFilesToLoad);
// // //         const tpl = getEffectiveTemplate(filesToLoad, block?.template);

// // //         return {
// // //             files: processProjectData(filesToLoad, assignedPort, tpl, safeBlockId),
// // //             template: tpl
// // //         };
// // //     }, [learnerAns, block?.initialFiles, block?.template, assignedPort, safeBlockId]);

// // //     const initialConfig = useMemo(() => getInitialConfig(), [getInitialConfig]);

// // //     const [lockedFiles, setLockedFiles] = useState(() => initialConfig.files);
// // //     const [template, setTemplate] = useState<any>(() => initialConfig.template);

// // //     const latestFrontendFilesRef = useRef<Record<string, string>>(initialConfig.files);

// // //     const [runId, setRunId] = useState(Date.now().toString());

// // //     useEffect(() => {
// // //         let cancelled = false;

// // //         const loadProject = async () => {
// // //             const parsedFiles = parseAndRepairLearnerSnapshot(learnerAns?.snapshot || learnerAns, block?.template);
// // //             const hasValidSnapshot = parsedFiles && Object.keys(parsedFiles).length > 0;

// // //             if (hasValidSnapshot) {
// // //                 const currentSerialized = createSafeSnapshot(latestFrontendFilesRef.current);
// // //                 const incomingSerialized = JSON.stringify(parsedFiles);

// // //                 if (currentSerialized === incomingSerialized || incomingSerialized === lastSavedSnapshotRef.current) {
// // //                     return;
// // //                 }
// // //             }

// // //             let rawFilesToLoad: Record<string, string> = hasValidSnapshot ? parsedFiles! : { ...(block?.initialFiles || {}) };

// // //             if (!hasValidSnapshot && Object.keys(rawFilesToLoad).length === 0 && block?.initialFilesStoragePath) {
// // //                 try {
// // //                     const storage = getStorage();
// // //                     const jsonRef = fbStorageRef(storage, block.initialFilesStoragePath);
// // //                     const buffer = await getBytes(jsonRef);
// // //                     const jsonStr = new TextDecoder().decode(buffer);
// // //                     rawFilesToLoad = JSON.parse(jsonStr);
// // //                 } catch (err) {
// // //                     console.error("Failed to load offloaded starter code from Storage:", err);
// // //                 }
// // //             }

// // //             if (cancelled) return;

// // //             const filesToLoad = sanitizeProjectFiles(rawFilesToLoad);
// // //             const tpl = getEffectiveTemplate(filesToLoad, block?.template);
// // //             const processed = processProjectData(filesToLoad, assignedPort, tpl, safeBlockId);

// // //             console.log(`✅ [IDE LOAD] Syncing files into Sandpack. Total files: ${Object.keys(processed).length}`);

// // //             setLockedFiles(processed);
// // //             setTemplate(resolveSandpackTemplate(tpl));
// // //             canonicalKeysRef.current = new Set(Object.keys(processed).map(p => p.startsWith('/') ? p : '/' + p));
// // //             latestFrontendFilesRef.current = processed;
// // //         };

// // //         loadProject();

// // //         return () => { cancelled = true; };
// // //     }, [snapshotKey, block?.initialFiles, block?.initialFilesStoragePath, block?.template, assignedPort, safeBlockId]);

// // //     const [previewUrl, setPreviewUrl] = useState<string>('');
// // //     const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
// // //     const [statusText, setStatusText] = useState("Booting OS...");
// // //     const [wcReady, setWcReady] = useState(false);
// // //     const [iframeKey, setIframeKey] = useState(0);
// // //     const [bootFailed, setBootFailed] = useState(false);
// // //     const previewOriginRef = useRef<string>('');

// // //     const wcInstanceRef = useRef<WebContainer | null>(null);

// // //     const [activeTerminalTab, setActiveTerminalTab] = useState<'logs' | 'shell'>('logs');

// // //     const debugTerminalRef = useRef<HTMLDivElement>(null);
// // //     const shellTerminalRef = useRef<HTMLDivElement>(null);
// // //     const debugXtermRef = useRef<Terminal | null>(null);
// // //     const shellXtermRef = useRef<Terminal | null>(null);
// // //     const debugFitRef = useRef<FitAddon | null>(null);
// // //     const shellFitRef = useRef<FitAddon | null>(null);
// // //     const devProcessRef = useRef<WebContainerProcess | null>(null);
// // //     const shellProcessRef = useRef<WebContainerProcess | null>(null);
// // //     const resizeObserverRef = useRef<ResizeObserver | null>(null);
// // //     const shellResizeObserverRef = useRef<ResizeObserver | null>(null);

// // //     const canonicalKeysRef = useRef<Set<string>>(new Set(Object.keys(lockedFiles).map(p => p.startsWith('/') ? p : '/' + p)));
// // //     const lockedFilesRef = useRef(lockedFiles);
// // //     useEffect(() => { lockedFilesRef.current = lockedFiles; }, [lockedFiles]);

// // //     const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// // //     const lastSavedSnapshotRef = useRef<string>('');
// // //     const warnedDroppedFilesRef = useRef<Set<string>>(new Set());

// // //     const flushSave = useCallback((isImmediate = false) => {
// // //         if (!onChangeRef.current || readOnly) return;

// // //         const filteredSnapshot: Record<string, string> = {};
// // //         for (const [path, content] of Object.entries(latestFrontendFilesRef.current)) {
// // //             filteredSnapshot[path] = content;
// // //         }

// // //         if (Object.keys(filteredSnapshot).length === 0) {
// // //             console.warn("⚠️ [IDE AUTO-SAVE SKIPPED] File map is empty. Refusing to write to Firebase.");
// // //             return;
// // //         }

// // //         const serialized = createSafeSnapshot(filteredSnapshot, (path) => {
// // //             if (!warnedDroppedFilesRef.current.has(path)) {
// // //                 warnedDroppedFilesRef.current.add(path);
// // //                 toast?.error(`"${path}" is too large to save (max 500KB) and was left out of your saved project.`);
// // //             }
// // //         });

// // //         const unchanged = !isImmediate && serialized === lastSavedSnapshotRef.current;
// // //         if (unchanged) return;

// // //         let dependencies = {};
// // //         if (filteredSnapshot['/package.json']) {
// // //             try { dependencies = JSON.parse(filteredSnapshot['/package.json']).dependencies || {}; } catch { }
// // //         }

// // //         console.log(`💾 [IDE AUTO-SAVE TRIGGERED] Dispatching snapshot for block [${block?.id}] to parent component...`, {
// // //             isImmediate,
// // //             fileCount: Object.keys(filteredSnapshot).length,
// // //             filePaths: Object.keys(filteredSnapshot)
// // //         });

// // //         const pendingSnapshot = serialized;
// // //         const result = onChangeRef.current({ snapshot: serialized, dependencies, immediate: isImmediate });
// // //         if (result && typeof (result as any).then === 'function') {
// // //             (result as Promise<void>)
// // //                 .then(() => {
// // //                     lastSavedSnapshotRef.current = pendingSnapshot;
// // //                     console.log(`✅ [IDE AUTO-SAVE CONFIRMED] Code changes persisted for block [${block?.id}]`);
// // //                 })
// // //                 .catch((err) => {
// // //                     console.error('❌ [IDE AUTO-SAVE ERROR] Save rejected:', err);
// // //                     toast?.error('Failed to save your latest changes. Retrying shortly…');
// // //                 });
// // //         } else {
// // //             lastSavedSnapshotRef.current = pendingSnapshot;
// // //         }
// // //     }, [block?.id, readOnly, toast]);

// // //     const scheduleSave = useCallback(() => {
// // //         if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// // //         saveDebounceRef.current = setTimeout(() => {
// // //             flushSaveRef.current(false);
// // //             saveDebounceRef.current = null;
// // //         }, 1500);
// // //     }, []);

// // //     const handleFilesChange = useCallback((answerPayload: { snapshot: string }) => {
// // //         if (readOnly) return;
// // //         const files = safeParseSnapshot(answerPayload.snapshot);
// // //         if (!files || Object.keys(files).length === 0) return;

// // //         latestFrontendFilesRef.current = files;
// // //         scheduleSave();
// // //     }, [scheduleSave, readOnly]);

// // //     const flushSaveRef = useRef(flushSave);
// // //     useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

// // //     useEffect(() => {
// // //         const handleBeforeUnload = () => {
// // //             flushSaveRef.current(true);
// // //         };
// // //         const handleVisibilityChange = () => {
// // //             if (document.visibilityState === 'hidden') {
// // //                 flushSaveRef.current(true);
// // //             }
// // //         };

// // //         window.addEventListener('beforeunload', handleBeforeUnload);
// // //         document.addEventListener('visibilitychange', handleVisibilityChange);
// // //         return () => {
// // //             window.removeEventListener('beforeunload', handleBeforeUnload);
// // //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// // //         };
// // //     }, []);

// // //     useEffect(() => {
// // //         return () => {
// // //             if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// // //             flushSaveRef.current(true);
// // //         };
// // //     }, []);

// // //     useEffect(() => {
// // //         const intervalId = setInterval(() => flushSaveRef.current(false), 30000);
// // //         return () => clearInterval(intervalId);
// // //     }, []);

// // //     useEffect(() => {
// // //         const handleMessage = (e: MessageEvent) => {
// // //             if (previewOriginRef.current && e.origin !== previewOriginRef.current) return;
// // //             if (e.data?.source === 'preview-console' && e.data?.blockId === safeBlockId && debugXtermRef.current) {
// // //                 let prefix = '\x1b[34m[LOG]\x1b[0m';
// // //                 if (e.data.m === 'warn') prefix = '\x1b[33m[WARN]\x1b[0m';
// // //                 if (e.data.m === 'error') prefix = '\x1b[31m[ERROR]\x1b[0m';
// // //                 if (e.data.m === 'info') prefix = '\x1b[36m[INFO]\x1b[0m';
// // //                 debugXtermRef.current.writeln(`${prefix} ${String(e.data.p).slice(0, 2000)}`);
// // //             }
// // //         };
// // //         window.addEventListener('message', handleMessage);
// // //         return () => window.removeEventListener('message', handleMessage);
// // //     }, [safeBlockId]);

// // //     const containerRef = useRef<HTMLDivElement>(null);
// // //     const [hasBeenVisible, setHasBeenVisible] = useState(false);

// // //     useEffect(() => {
// // //         if (hasBeenVisible || !containerRef.current) return;
// // //         const observer = new IntersectionObserver((entries) => {
// // //             if (entries[0]?.isIntersecting) {
// // //                 setHasBeenVisible(true);
// // //                 observer.disconnect();
// // //             }
// // //         }, { threshold: 0.1 });
// // //         observer.observe(containerRef.current);
// // //         return () => observer.disconnect();
// // //     }, [hasBeenVisible]);

// // //     useEffect(() => {
// // //         if (!hasBeenVisible) return;

// // //         let mounted = true;
// // //         const streamController = new AbortController();

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
// // //             shellResizeObserverRef.current = new ResizeObserver(() => {
// // //                 if (mounted && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0) {
// // //                     try { shellFit.fit(); if (shellProcessRef.current) shellProcessRef.current.resize({ cols: shellTerm.cols, rows: shellTerm.rows }); } catch (e) { }
// // //                 }
// // //             });
// // //             shellResizeObserverRef.current.observe(shellTerminalRef.current);
// // //         }

// // //         let shellInputListener: { dispose: () => void } | null = null;
// // //         let serverReadyUnsub: (() => void) | null = null;

// // //         const boot = async () => {
// // //             const WORK_DIR = `/${safeBlockId}`;

// // //             try {
// // //                 console.log(`🚀 [IDE WEBCONTAINER] Booting WebContainer instance for block [${safeBlockId}]...`);
// // //                 const wc = await getWebContainer();
// // //                 if (!mounted) return;

// // //                 setWcInstance(wc);
// // //                 wcInstanceRef.current = wc;

// // //                 if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } devProcessRef.current = null; }
// // //                 if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } shellProcessRef.current = null; }
// // //                 try { await wc.fs.rm(WORK_DIR, { recursive: true, force: true }); } catch { }

// // //                 debugTerm.writeln('\x1b[1;32m>> SYSTEM ONLINE - MOUNTING FILESYSTEM\x1b[0m');
// // //                 const bootTemplate = template;
// // //                 const tree = convertToTree(processProjectData(lockedFilesRef.current, assignedPort, bootTemplate, safeBlockId));

// // //                 await wc.mount({ [safeBlockId]: { directory: tree } });

// // //                 if (mounted) setWcReady(true);

// // //                 await wc.fs.mkdir(`${WORK_DIR}/.bin`, { recursive: true });
// // //                 await wc.fs.writeFile(`${WORK_DIR}/.bin/git`, GIT_SHIM_SCRIPT);

// // //                 debugTerm.writeln('\x1b[1;33m>> Queuing npm install...\x1b[0m');
// // //                 let installFailed = false;
// // //                 await new Promise<void>(resolve => {
// // //                     globalNpmMutex = globalNpmMutex.then(async () => {
// // //                         if (!mounted) return resolve();
// // //                         let installProcess: any = null;
// // //                         try {
// // //                             debugTerm.writeln('\x1b[1;33m>> Running npm install...\x1b[0m');
// // //                             installProcess = await wc.spawn('npm', ['install', '--no-package-lock'], { cwd: WORK_DIR });

// // //                             installProcess.output.pipeTo(new WritableStream({
// // //                                 write: data => { if (mounted) debugTerm.write(data); }
// // //                             }), { signal: streamController.signal }).catch(() => { });

// // //                             const exitCode = await Promise.race([
// // //                                 installProcess.exit,
// // //                                 new Promise<number>((_, reject) => setTimeout(() => reject(new Error('npm install timed out after 5 minutes')), 300000))
// // //                             ]);
// // //                             if (exitCode !== 0) throw new Error("Installation process aborted.");
// // //                         } catch (err: any) {
// // //                             installFailed = true;
// // //                             if (mounted) debugTerm.writeln(`\x1b[1;31m>> NPM Error: ${err.message || err}\x1b[0m`);
// // //                             try { installProcess?.kill(); } catch { }
// // //                         }
// // //                         resolve();
// // //                     });
// // //                 });

// // //                 if (!mounted) return;
// // //                 if (installFailed) {
// // //                     setStatusText("Boot Failed");
// // //                     setBootFailed(true);
// // //                     return;
// // //                 }

// // //                 debugTerm.writeln('\n\x1b[1;36m>> Booting local Vite telemetry server...\x1b[0m');
// // //                 const devProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: WORK_DIR });
// // //                 devProcessRef.current = devProcess;

// // //                 devProcess.output.pipeTo(new WritableStream({
// // //                     write: data => { if (mounted) debugTerm.write(data); }
// // //                 }), { signal: streamController.signal }).catch(() => { });

// // //                 const shellProcess = await wc.spawn('jsh', { terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 15 }, cwd: WORK_DIR });
// // //                 shellProcessRef.current = shellProcess;

// // //                 shellProcess.output.pipeTo(new WritableStream({
// // //                     write: data => { if (mounted) shellTerm.write(data); }
// // //                 }), { signal: streamController.signal }).catch(() => { });

// // //                 const inputWriter = shellProcess.input.getWriter();
// // //                 await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH"\nclear\n').catch(() => { });
// // //                 shellInputListener = shellTerm.onData(data => {
// // //                     if (mounted) inputWriter.write(data).catch(() => { });
// // //                 });

// // //                 serverReadyUnsub = wc.on('server-ready', (port, url) => {
// // //                     console.log(`🚀 [IDE WEBCONTAINER] server-ready event received on port ${port}: ${url}`);
// // //                     if (!mounted) return;

// // //                     try { previewOriginRef.current = new URL(url).origin; } catch { }
// // //                     setPreviewUrl(url);
// // //                     setStatusText("Online");
// // //                     setIframeKey(k => k + 1);
// // //                     debugTerm.writeln(`\n\x1b[1;32m>> Preview running on port ${port}\x1b[0m\n`);
// // //                 });

// // //             } catch (err: any) {
// // //                 if (mounted) {
// // //                     console.error("❌ [IDE WEBCONTAINER ERROR]", err);
// // //                     debugTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
// // //                     setStatusText("Boot Failed");
// // //                     setBootFailed(true);
// // //                 }
// // //             }
// // //         };

// // //         setBootFailed(false);
// // //         boot();
// // //         const handleUnload = () => {
// // //             streamController.abort();
// // //             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
// // //             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }
// // //         };
// // //         window.addEventListener('beforeunload', handleUnload);

// // //         return () => {
// // //             mounted = false;
// // //             streamController.abort();
// // //             window.removeEventListener('beforeunload', handleUnload);

// // //             if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
// // //             if (shellResizeObserverRef.current) shellResizeObserverRef.current.disconnect();
// // //             if (shellInputListener) shellInputListener.dispose();
// // //             if (serverReadyUnsub) serverReadyUnsub();

// // //             debugTerm.dispose();
// // //             shellTerm.dispose();

// // //             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } }
// // //             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } }

// // //             setWcInstance(null);
// // //         };

// // //     }, [runId, template, assignedPort, safeBlockId, hasBeenVisible]);

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

// // //     useEffect(() => {
// // //         const timeoutId = setTimeout(() => {
// // //             try {
// // //                 if (debugXtermRef.current?.element && debugTerminalRef.current && debugTerminalRef.current.clientWidth > 0 && debugFitRef.current) {
// // //                     debugFitRef.current.fit();
// // //                 }
// // //                 if (shellXtermRef.current?.element && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0 && shellFitRef.current) {
// // //                     shellFitRef.current.fit();
// // //                     if (shellProcessRef.current) {
// // //                         shellProcessRef.current.resize({ cols: shellXtermRef.current.cols, rows: shellXtermRef.current.rows });
// // //                     }
// // //                 }
// // //             } catch (e) { }
// // //         }, 250);
// // //         return () => clearTimeout(timeoutId);
// // //     }, [isMaximized, activeTerminalTab]);

// // //     useEffect(() => {
// // //         if (isMaximized) {
// // //             document.documentElement.style.overflow = 'hidden';
// // //             document.body.style.overflow = 'hidden';

// // //             let el = containerRef.current?.parentElement;
// // //             while (el && el !== document.body) {
// // //                 el.style.setProperty('overflow', 'hidden', 'important');
// // //                 el.style.setProperty('transform', 'none', 'important');
// // //                 el.style.setProperty('filter', 'none', 'important');
// // //                 el.style.setProperty('perspective', 'none', 'important');
// // //                 el = el.parentElement;
// // //             }
// // //         } else {
// // //             document.documentElement.style.overflow = '';
// // //             document.body.style.overflow = '';

// // //             let el = containerRef.current?.parentElement;
// // //             while (el && el !== document.body) {
// // //                 el.style.removeProperty('overflow');
// // //                 el.style.removeProperty('transform');
// // //                 el.style.removeProperty('filter');
// // //                 el.style.removeProperty('perspective');
// // //                 el = el.parentElement;
// // //             }
// // //         }
// // //     }, [isMaximized]);

// // //     const containerStyle: React.CSSProperties = useMemo(() => isMaximized ? {
// // //         position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999, border: 'none', borderRadius: 0, overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column', margin: 0, padding: 0, boxSizing: 'border-box'
// // //     } : {
// // //         position: 'relative', width: '100%', height: '750px', marginTop: '1rem', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// // //     }, [isMaximized]);

// // //     const terminalTabBtnStyle = useCallback((active: boolean): React.CSSProperties => ({
// // //         background: active ? '#334155' : 'transparent', border: 'none', color: active ? '#fff' : '#94a3b8',
// // //         cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold'
// // //     }), []);

// // //     const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         const file = e.target.files?.[0];
// // //         if (!file) return;
// // //         setPendingZipFile(file);
// // //         e.target.value = '';
// // //     };

// // //     const processZipBlob = async (blob: Blob) => {
// // //         const zip = new JSZip();
// // //         const contents = await zip.loadAsync(blob);

// // //         const allPaths = Object.keys(contents.files).filter(p => {
// // //             const fileName = p.split('/').pop() || '';
// // //             if (contents.files[p].dir) return false;
// // //             if (p.includes('__MACOSX') || p.includes('node_modules/') || p.includes('.git/')) return false;
// // //             if (fileName.startsWith('._') || fileName === '.DS_Store' || fileName === 'Thumbs.db') return false;
// // //             return true;
// // //         });

// // //         const expectedTemplate = (block?.template || 'javascript').toLowerCase();
// // //         const isVanillaExpected = ['javascript', 'html', 'vanilla'].includes(expectedTemplate);

// // //         let hasReactFiles = false;
// // //         for (const p of allPaths) {
// // //             if (p.endsWith('.jsx') || p.endsWith('.tsx')) hasReactFiles = true;
// // //             if (p.endsWith('package.json')) {
// // //                 try {
// // //                     const pkgStr = await contents.files[p].async('string');
// // //                     if (pkgStr.includes('"react"')) hasReactFiles = true;
// // //                 } catch (e) { }
// // //             }
// // //         }

// // //         if (isVanillaExpected && hasReactFiles) {
// // //             toast?.error("Upload Blocked: This assignment requires a pure Vanilla JavaScript project. React projects are not allowed here.");
// // //             return;
// // //         }

// // //         const isBinaryFile = (path: string) => ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z'].some(ext => path.toLowerCase().endsWith(ext));

// // //         const extractedMap: Record<string, string> = {};
// // //         for (const path of allPaths) {
// // //             if (isBinaryFile(path)) {
// // //                 extractedMap[`/${path}`] = `__mlab_base64__${await contents.files[path].async('base64')}`;
// // //             } else {
// // //                 extractedMap[`/${path}`] = await contents.files[path].async('string');
// // //             }
// // //         }

// // //         const newFiles = sanitizeProjectFiles(extractedMap);

// // //         const tempTpl = getEffectiveTemplate(newFiles, block?.template);
// // //         const cleanFiles = processProjectData(newFiles, assignedPort, tempTpl, block.id);

// // //         setTemplate(resolveSandpackTemplate(tempTpl));
// // //         setLockedFiles(cleanFiles);
// // //         canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));

// // //         latestFrontendFilesRef.current = cleanFiles;
// // //         setRunId(Date.now().toString());

// // //         flushSaveRef.current(true);
// // //         toast?.success("Project Imported Successfully!");
// // //     };

// // //     const confirmZipImport = async () => {
// // //         if (!pendingZipFile) return;
// // //         await processZipBlob(pendingZipFile);
// // //         setPendingZipFile(null);
// // //     };

// // //     const handleGithubImport = async () => {
// // //         if (!githubUrl.trim()) return;
// // //         try {
// // //             setIsFetchingGithub(true);

// // //             const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
// // //             if (!match) throw new Error("Invalid GitHub URL. Must be a valid repo link.");

// // //             const user = match[1];
// // //             const repo = match[2].replace('.git', '');

// // //             const response = await fetch(`https://api.github.com/repos/${user}/${repo}/zipball`);
// // //             if (!response.ok) throw new Error("Could not fetch repo. Ensure it is public.");

// // //             const blob = await response.blob();

// // //             setShowGithubModal(false);
// // //             setGithubUrl('');
// // //             setPendingZipFile(blob);
// // //         } catch (err: any) {
// // //             toast?.error(err.message || "Failed to import from GitHub.");
// // //         } finally {
// // //             setIsFetchingGithub(false);
// // //         }
// // //     };

// // //     const handleDownloadZip = async () => {
// // //         const zip = new JSZip();
// // //         const filesToZip = Object.keys(latestFrontendFilesRef.current).length > 0 ? latestFrontendFilesRef.current : lockedFiles;

// // //         Object.entries(filesToZip).forEach(([path, content]) => {
// // //             if (canonicalKeysRef.current.has(path)) {
// // //                 const cleanPath = path.startsWith('/') ? path.substring(1) : path;
// // //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) zip.file(cleanPath, content.substring(15), { base64: true });
// // //                 else zip.file(cleanPath, content as string);
// // //             }
// // //         });
// // //         const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
// // //         const a = document.createElement('a'); a.href = url; a.download = `codetribe_project_${block.id}.zip`; a.click();
// // //         URL.revokeObjectURL(url);
// // //         toast?.success("Project Downloaded Successfully!");
// // //     };

// // //     return (
// // //         <div ref={containerRef} style={containerStyle}>
// // //             <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #334155', flexShrink: 0 }}>
// // //                 <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                     <Code size={14} color="#3b82f6" /> {block.title || 'Live IDE'}
// // //                     {readOnly && <span style={{ background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>GRADING MODE (LOCKED)</span>}
// // //                 </span>
// // //                 <div style={{ display: 'flex', gap: '8px' }}>
// // //                     {!readOnly && (
// // //                         <>
// // //                             <label style={{ background: '#3b82f6', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                 <FolderArchive size={14} /> Import ZIP<input type="file" accept=".zip" hidden onChange={handleFileSelect} />
// // //                             </label>
// // //                             <button onClick={() => setShowGithubModal(true)} style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// // //                                 <Github size={14} /> GitHub
// // //                             </button>
// // //                         </>
// // //                     )}
// // //                     <button onClick={handleDownloadZip} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><Download size={14} /> <span className="ap-hide-mobile">ZIP</span></button>
// // //                     <button onClick={() => setIframeKey(k => k + 1)} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><RefreshCw size={14} /> Reload Preview</button>
// // //                     <button onClick={() => setIsMaximized(!isMaximized)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>{isMaximized ? <Minimize size={14} /> : <Maximize size={14} />} {isMaximized ? 'Exit' : 'Fullscreen'}</button>
// // //                 </div>
// // //             </div>

// // //             <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
// // //                 <Group direction="horizontal" style={{ width: '100%', height: '100%' }}>
// // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
// // //                         <style>{`.sp-layout, .sp-wrapper { height: 100% !important; max-height: 100% !important; min-height: 0 !important; min-width: 0 !important; } [data-panel-group], [data-panel] { height: 100% !important; }`}</style>
// // //                         <SandpackProvider key={runId} template={resolveSandpackTemplate(template)} files={lockedFiles} theme="dark">
// // //                             <SandpackLayout style={{ flex: 1, height: '100%', border: 'none', borderRadius: 0, overflow: 'hidden', minHeight: 0 }}>
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', minWidth: 0 }}>
// // //                                     <SandpackFileActions readOnly={readOnly} canonicalKeysRef={canonicalKeysRef} wcInstance={wcInstance} blockId={block.id} />
// // //                                     <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
// // //                                         <div style={{ width: '160px', borderRight: '1px solid #334155', flexShrink: 0, overflowY: 'auto', overflowX: 'hidden' }}><SandpackFileExplorer style={{ height: '100%' }} /></div>
// // //                                         <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}><SandpackCodeEditor showTabs closableTabs style={{ height: '100%' }} readOnly={readOnly} /></div>
// // //                                     </div>
// // //                                 </div>
// // //                             </SandpackLayout>
// // //                             {!readOnly && wcReady && <WebContainerSyncBridge wcInstance={wcInstance} blockId={block.id} canonicalKeysRef={canonicalKeysRef} readOnly={readOnly} />}
// // //                             {!readOnly && <StateHarvester readOnly={readOnly} onChange={handleFilesChange} />}
// // //                         </SandpackProvider>
// // //                     </Panel>
// // //                     <Separator style={{ width: '4px', background: '#334155', cursor: 'col-resize' }} />
// // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', overflow: 'hidden' }}>
// // //                         <div style={{ height: `${previewHeight}px`, position: 'relative', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
// // //                             {previewUrl ? <iframe key={iframeKey} src={`${previewUrl}${previewUrl.includes('?') ? '&' : '?'}t=${iframeKey}`} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" /> : (
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', gap: '10px' }}>
// // //                                     {bootFailed ? <AlertTriangle size={24} color="#ef4444" /> : <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />}
// // //                                     <span style={{ fontSize: '0.85rem' }}>{statusText}</span>
// // //                                     {bootFailed && (
// // //                                         <button onClick={() => { setBootFailed(false); setRunId(Date.now().toString()); }} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                             <RefreshCw size={13} /> Retry
// // //                                         </button>
// // //                                     )}
// // //                                 </div>
// // //                             )}
// // //                             {isDragging && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />}
// // //                         </div>
// // //                         <div onMouseDown={handleResizerMouseDown} style={{ height: '4px', background: '#334155', cursor: 'row-resize', flexShrink: 0 }} />
// // //                         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
// // //                             <div style={{ padding: '4px 8px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
// // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'logs')} onClick={() => setActiveTerminalTab('logs')}><ScrollText size={12} /> Logs</button>
// // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'shell')} onClick={() => setActiveTerminalTab('shell')}><SquareTerminal size={12} /> Shell</button>
// // //                             </div>
// // //                             <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
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

// // //             {showGithubModal && createPortal(
// // //                 <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //                     <div style={{ background: '#1e293b', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
// // //                         <h3 style={{ color: '#fff', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><Github size={20} /> Import from GitHub</h3>
// // //                         <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '15px' }}>Enter the URL of a public GitHub repository. This will completely overwrite your current code.</p>

// // //                         <input
// // //                             type="text"
// // //                             placeholder="https://github.com/user/repo"
// // //                             value={githubUrl}
// // //                             onChange={(e) => setGithubUrl(e.target.value)}
// // //                             style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', marginBottom: '20px', fontSize: '0.9rem', outline: 'none' }}
// // //                         />

// // //                         <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
// // //                             <button onClick={() => setShowGithubModal(false)} disabled={isFetchingGithub} style={{ padding: '8px 16px', background: 'transparent', color: '#cbd5e1', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
// // //                             <button onClick={handleGithubImport} disabled={isFetchingGithub || !githubUrl} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', opacity: (isFetchingGithub || !githubUrl) ? 0.5 : 1 }}>
// // //                                 {isFetchingGithub ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
// // //                                 {isFetchingGithub ? 'Pulling...' : 'Import Repo'}
// // //                             </button>
// // //                         </div>
// // //                     </div>
// // //                 </div>,
// // //                 document.body
// // //             )}

// // //             {pendingZipFile && createPortal(
// // //                 <StatusModal
// // //                     type="warning"
// // //                     title="Overwrite Existing Code?"
// // //                     message="Importing this ZIP file will completely replace your current project files. This action cannot be undone. Do you want to proceed?"
// // //                     confirmText="Yes, Import"
// // //                     onClose={confirmZipImport}
// // //                     onCancel={() => setPendingZipFile(null)}
// // //                 />,
// // //                 document.body
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // export default CodeSandboxPlayer;


// // // // // src/components/common/CodeSandboxPlayer/CodeSandboxPlayer.tsx

// // // // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // // // import {
// // // //     Code, Maximize, Minimize, CheckCircle, Play, Loader2, Plus, X, Trash2, Pencil,
// // // //     FilePlus, Download, Github, FolderArchive, RefreshCw, AlertTriangle, ScrollText, SquareTerminal
// // // // } from 'lucide-react';
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
// // // // import type { FileSystemTree, WebContainer, WebContainerProcess } from '@webcontainer/api';
// // // // import { createPortal } from 'react-dom';
// // // // import { getStorage, ref as fbStorageRef, getBytes, getDownloadURL } from 'firebase/storage';

// // // // export interface SandboxFileMap {
// // // //     [path: string]: string;
// // // // }

// // // // export interface SandboxBlock {
// // // //     id: string;
// // // //     title?: string;
// // // //     template?: string;
// // // //     question?: string;
// // // //     initialFiles?: SandboxFileMap;
// // // //     initialFilesStoragePath?: string;
// // // // }

// // // // export interface SandboxAnswerPayload {
// // // //     snapshot?: string | SandboxFileMap;
// // // //     dependencies?: Record<string, string>;
// // // //     immediate?: boolean;
// // // // }

// // // // export interface CodeSandboxPlayerProps {
// // // //     block: SandboxBlock;
// // // //     learnerAns: SandboxAnswerPayload | null | undefined;
// // // //     onChange?: (answer: SandboxAnswerPayload) => void | Promise<void>;
// // // //     readOnly?: boolean;
// // // // }

// // // // const sanitizeBlockId = (id: string | undefined): string => {
// // // //     const clean = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
// // // //     return clean || 'mlab-default';
// // // // };

// // // // const SYNC_IGNORE_SEGMENTS = ['node_modules', '.git', 'dist', '.bin', '.vite', '.cache', '.npm-cache', '__MACOSX'];
// // // // const SYNC_IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store', 'Thumbs.db'];

// // // // const shouldIgnorePath = (relPath: string) => {
// // // //     const parts = relPath.split('/').filter(Boolean);
// // // //     if (parts.some(p => SYNC_IGNORE_SEGMENTS.includes(p))) return true;
// // // //     const fileName = parts[parts.length - 1] || '';
// // // //     if (fileName.startsWith('._')) return true;
// // // //     if (SYNC_IGNORE_FILES.includes(fileName)) return true;
// // // //     if (fileName.endsWith('.log')) return true;
// // // //     return false;
// // // // };

// // // // // 🚀 RUNTIME SANITIZER: STRIPS MACOS JUNK AND FLATTENS TOP-LEVEL WRAPPER DIRECTORIES
// // // // export const sanitizeProjectFiles = (rawFiles: Record<string, string>): Record<string, string> => {
// // // //     if (!rawFiles || typeof rawFiles !== 'object') return {};

// // // //     const cleanMap: Record<string, string> = {};
// // // //     const validPaths: string[] = [];

// // // //     // 1. Filter out junk & metadata
// // // //     Object.keys(rawFiles).forEach((path) => {
// // // //         const normalizedPath = path.startsWith('/') ? path : `/${path}`;
// // // //         if (shouldIgnorePath(normalizedPath)) return;

// // // //         cleanMap[normalizedPath] = rawFiles[path];
// // // //         validPaths.push(normalizedPath);
// // // //     });

// // // //     if (validPaths.length === 0) return {};

// // // //     // 2. Check for single top-level wrapper directory
// // // //     const rootSegments = new Set(
// // // //         validPaths.map((p) => p.split('/').filter(Boolean)[0])
// // // //     );

// // // //     let prefixToStrip = '';
// // // //     if (rootSegments.size === 1) {
// // // //         const singleFolder = Array.from(rootSegments)[0];
// // // //         const allHaveSubpaths = validPaths.every((p) => {
// // // //             const parts = p.split('/').filter(Boolean);
// // // //             return parts.length > 1 && parts[0] === singleFolder;
// // // //         });

// // // //         if (allHaveSubpaths) {
// // // //             prefixToStrip = `/${singleFolder}`;
// // // //         }
// // // //     }

// // // //     // 3. Re-key files so index.html lands at "/index.html"
// // // //     const finalMap: Record<string, string> = {};
// // // //     Object.keys(cleanMap).forEach((path) => {
// // // //         let newPath = path;
// // // //         if (prefixToStrip && newPath.startsWith(prefixToStrip)) {
// // // //             newPath = newPath.slice(prefixToStrip.length);
// // // //         }
// // // //         if (!newPath.startsWith('/')) {
// // // //             newPath = `/${newPath}`;
// // // //         }
// // // //         finalMap[newPath] = cleanMap[path];
// // // //     });

// // // //     return finalMap;
// // // // };

// // // // const createSafeSnapshot = (files: Record<string, string>, onDropped?: (path: string) => void) => {
// // // //     const safeFiles: Record<string, string> = {};
// // // //     for (const [path, content] of Object.entries(files)) {
// // // //         if (shouldIgnorePath(path)) continue;
// // // //         if (content.length > 500000) {
// // // //             console.warn(`[IDE SNAPSHOT] File ${path} is too large. Excluding from auto-save.`);
// // // //             onDropped?.(path);
// // // //             continue;
// // // //         }
// // // //         safeFiles[path] = content;
// // // //     }
// // // //     return JSON.stringify(safeFiles);
// // // // };

// // // // const isValidSnapshot = (obj: unknown): obj is SandboxFileMap => {
// // // //     if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
// // // //     return Object.entries(obj as Record<string, unknown>).every(
// // // //         ([path, content]) => typeof path === 'string' && path.length < 500 && typeof content === 'string'
// // // //     );
// // // // };

// // // // // 🚀 SAFE PARSER DECLARED BEFORE ANY INVOCATIONS TO PREVENT REFERENCEERRORS
// // // // export const safeParseSnapshot = (raw: string): SandboxFileMap | null => {
// // // //     try {
// // // //         const parsed = JSON.parse(raw);
// // // //         return isValidSnapshot(parsed) ? parsed : null;
// // // //     } catch {
// // // //         return null;
// // // //     }
// // // // };

// // // // // 🚀 REPAIR ENGINE FOR EXISTING/LEGACY LEARNER ASSESSMENTS
// // // // export const parseAndRepairLearnerSnapshot = (raw: any, blockTemplate?: string): SandboxFileMap | null => {
// // // //     if (!raw) return null;

// // // //     // Case 1: Payload is an object
// // // //     if (typeof raw === 'object' && !Array.isArray(raw)) {
// // // //         if (raw.snapshot) return parseAndRepairLearnerSnapshot(raw.snapshot, blockTemplate);
// // // //         if (raw.codeData) return parseAndRepairLearnerSnapshot(raw.codeData, blockTemplate);

// // // //         if (isValidSnapshot(raw) && Object.keys(raw).length > 0) {
// // // //             return raw;
// // // //         }

// // // //         if (typeof raw.code === 'string' && raw.code.trim().length > 0) {
// // // //             const fileName = (blockTemplate === 'html' || raw.code.includes('<html') || raw.code.includes('<!DOCTYPE')) ? '/index.html' : '/index.js';
// // // //             return { [fileName]: raw.code };
// // // //         }
// // // //     }

// // // //     // Case 2: Payload is a string
// // // //     if (typeof raw === 'string' && raw.trim().length > 0) {
// // // //         const parsed = safeParseSnapshot(raw);
// // // //         if (parsed && Object.keys(parsed).length > 0) {
// // // //             return parsed;
// // // //         }
// // // //         const isHtml = raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('</body>');
// // // //         const fileName = isHtml ? '/index.html' : '/index.js';
// // // //         return { [fileName]: raw };
// // // //     }

// // // //     return null;
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

// // // // // 🚀 STRICT TEMPLATE ENFORCER: TRUSTS THE BUILDER'S INTENT, PREVENTS FALSE REACT DETECTION
// // // // const getEffectiveTemplate = (files: Record<string, string>, fallback: string | undefined): string => {
// // // //     const explicit = fallback?.toLowerCase();

// // // //     // 1. Strict Override: If the Assessment Builder explicitly assigned a template, trust it.
// // // //     if (explicit === 'javascript' || explicit === 'html' || explicit === 'vanilla') return 'vanilla';
// // // //     if (explicit === 'typescript' || explicit === 'vanilla-ts') return 'vanilla-ts';
// // // //     if (explicit === 'node') return 'node';
// // // //     if (explicit === 'vite-react' || explicit === 'create-react-app' || explicit === 'react') return 'vite-react';
// // // //     if (explicit === 'python') return 'vanilla';
// // // //     if (explicit === 'sql') return 'vanilla';

// // // //     // 2. Fallback Detection (Only if template is missing/corrupted)
// // // //     const fileNames = Object.keys(files);
// // // //     const hasReactFile = fileNames.some(p => p.endsWith('.jsx') || p.endsWith('.tsx'));
// // // //     return hasReactFile ? 'vite-react' : 'vanilla';
// // // // };

// // // // const resolveSandpackTemplate = (dbTemplateKey?: string): any => {
// // // //     if (!dbTemplateKey) return "vanilla";
// // // //     const templateMap: Record<string, string> = {
// // // //         "javascript": "vanilla",
// // // //         "html": "vanilla",
// // // //         "typescript": "vanilla-ts",
// // // //         "create-react-app": "react",
// // // //         "vite-react": "vite-react",
// // // //         "vite-react-ts": "vite-react-ts",
// // // //         "node": "node",
// // // //         "python": "vanilla",
// // // //         "sql": "vanilla",
// // // //     };
// // // //     return templateMap[dbTemplateKey] || dbTemplateKey;
// // // // };

// // // // // 🚀 CLEAN PROJECT PROCESSOR: STRIPS INJECTED REACT GHOSTS FROM HTML/CSS/JS PROJECTS
// // // // const processProjectData = (rawFiles: Record<string, string>, targetPort: number, templateType: string, blockId: string) => {
// // // //     const out = sanitizeProjectFiles(rawFiles);
// // // //     const isReact = templateType === 'vite-react' || templateType === 'create-react-app' || templateType === 'vite-react-ts';
// // // //     const isNode = templateType === 'node';
// // // //     const isVanilla = !isReact && !isNode;

// // // //     if (!out['/package.json']) {
// // // //         out['/package.json'] = JSON.stringify({ name: "mlab-workspace-project", type: "module" }, null, 2);
// // // //     }

// // // //     try {
// // // //         const pkg = JSON.parse(out['/package.json']);
// // // //         pkg.type = pkg.type || "module";
// // // //         pkg.dependencies = pkg.dependencies || {};
// // // //         pkg.devDependencies = pkg.devDependencies || {};
// // // //         pkg.scripts = pkg.scripts || {};

// // // //         if (isNode) {
// // // //             pkg.scripts.dev = pkg.scripts.dev || `node index.js`;
// // // //         } else {
// // // //             pkg.scripts.dev = `vite --port ${targetPort}`;
// // // //             pkg.devDependencies['vite'] = pkg.devDependencies['vite'] || "^4.5.3";
// // // //         }

// // // //         if (isVanilla) {
// // // //             // 🚀 REPAIR: Strip out React dependencies that got injected by previous bugs
// // // //             delete pkg.dependencies['react'];
// // // //             delete pkg.dependencies['react-dom'];
// // // //             delete pkg.devDependencies['@vitejs/plugin-react'];
// // // //         }

// // // //         delete pkg.engines;
// // // //         delete pkg.packageManager;
// // // //         out['/package.json'] = JSON.stringify(pkg, null, 2);
// // // //     } catch (e) { }

// // // //     if (isReact) {
// // // //         if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
// // // //             out['/vite.config.js'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    port: ${targetPort},\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
// // // //         }

// // // //         const isTSProject = Object.keys(out).some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
// // // //         const ext = isTSProject ? 'tsx' : 'jsx';

// // // //         if (out[`/App.${ext}`] && !out[`/src/App.${ext}`]) {
// // // //             out[`/src/App.${ext}`] = out[`/App.${ext}`];
// // // //         }
// // // //         if (out[`/App.js`] && !out[`/src/App.jsx`]) {
// // // //             out[`/src/App.jsx`] = out[`/App.js`];
// // // //         }

// // // //         const ghosts = ['/index.js', '/index.jsx', '/index.ts', '/index.tsx', '/src/index.js', '/src/index.jsx', '/src/index.ts', '/src/index.tsx', '/App.js', '/App.jsx', '/App.ts', '/App.tsx'];
// // // //         ghosts.forEach(g => delete out[g]);

// // // //         const actualExt = out['/src/App.tsx'] ? 'tsx' : 'jsx';

// // // //         if (!out['/src/App.jsx'] && !out['/src/App.tsx']) {
// // // //             out[`/src/App.${actualExt}`] = 'export default function App() {\n  return <h1>Vite + React Canvas Online!</h1>;\n}';
// // // //         }

// // // //         out[`/App.${actualExt}`] = `export { default } from "./src/App.${actualExt}";\n`;

// // // //         if (!out['/src/main.jsx'] && !out['/src/main.tsx']) {
// // // //             out[`/src/main.${actualExt}`] = `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "../App.${actualExt}";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);`;
// // // //         }

// // // //         if (!out['/src/index.css']) out['/src/index.css'] = `body { font-family: sans-serif; padding: 2rem; }`;

// // // //     } else if (isVanilla) {

// // // //         // 🚀 VANILLA HTML/CSS/JS REPAIR: AGGRESSIVELY STRIP REACT GHOST FILES
// // // //         const reactGhosts = [
// // // //             '/App.jsx', '/App.tsx', '/App.js',
// // // //             '/src/App.jsx', '/src/App.tsx', '/src/App.js',
// // // //             '/src/main.jsx', '/src/main.tsx', '/src/main.js',
// // // //             '/src/index.css', '/vite.config.js', '/vite.config.ts'
// // // //         ];

// // // //         reactGhosts.forEach(g => {
// // // //             if (out[g] !== undefined) {
// // // //                 const code = out[g];
// // // //                 // Only delete if it matches our exact injected boilerplate strings to prevent deleting learner's actual work
// // // //                 if (
// // // //                     code.includes('Vite + React Canvas Online!') ||
// // // //                     code.includes('export { default }') ||
// // // //                     code.includes('import React') ||
// // // //                     code.includes('ReactDOM.createRoot') ||
// // // //                     code.includes('font-family: sans-serif; padding: 2rem;') ||
// // // //                     code.includes('@vitejs/plugin-react')
// // // //                 ) {
// // // //                     delete out[g];
// // // //                     console.log(`🧹 [IDE REPAIR] Stripped corrupted React ghost file from Vanilla project: ${g}`);
// // // //                 }
// // // //             }
// // // //         });

// // // //         if (!out['/vite.config.js'] && !out['/vite.config.ts']) {
// // // //             out['/vite.config.js'] = `import { defineConfig } from 'vite';\n\nexport default defineConfig({\n  server: {\n    port: ${targetPort},\n    hmr: {\n      clientPort: 443\n    }\n  }\n});\n`;
// // // //         }
// // // //         if (!out['/index.html']) {
// // // //             out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>Vanilla App</title>\n</head>\n<body>\n  <div id="app"></div>\n  <script type="module" src="/index.js"></script>\n</body>\n</html>`;
// // // //         }
// // // //         if (!out['/index.js']) {
// // // //             out['/index.js'] = `document.getElementById('app').innerHTML = '<h1>Hello Vanilla!</h1>';`;
// // // //         }
// // // //     }

// // // //     const consoleInterceptor = `\n<script>\n  (function() {\n    const orig = { ...console };\n    ['log', 'warn', 'error', 'info'].forEach(m => {\n      console[m] = (...args) => {\n        orig[m](...args);\n        try { window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m, p: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*'); } catch(e) {}\n      };\n    });\n    window.addEventListener('error', e => window.parent.postMessage({ source: 'preview-console', blockId: '${blockId}', m: 'error', p: e.message }, '*'));\n  })();\n</script>\n`;

// // // //     let htmlKey = out['/index.html'] ? '/index.html' : out['/public/index.html'] ? '/public/index.html' : null;

// // // //     if (htmlKey) {
// // // //         let html = out[htmlKey];
// // // //         if (!html.includes("source: 'preview-console'")) {
// // // //             if (html.includes('<head>')) {
// // // //                 html = html.replace('<head>', `<head>${consoleInterceptor}`);
// // // //             } else if (html.includes('<html>')) {
// // // //                 html = html.replace('<html>', `<html><head>${consoleInterceptor}</head>`);
// // // //             } else {
// // // //                 html = `${consoleInterceptor}${html}`;
// // // //             }
// // // //         }
// // // //         out[htmlKey] = html;
// // // //     } else if (isReact) {
// // // //         const entryPoint = templateType === 'vite-react' ? '/src/main' : '/src/index';
// // // //         const ext = out['/src/App.tsx'] ? 'tsx' : 'jsx';
// // // //         out['/index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>${consoleInterceptor}</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="${entryPoint}.${ext}"></script>\n</body>\n</html>`;
// // // //     }

// // // //     return out;
// // // // };

// // // // const GIT_SHIM_SCRIPT = `#!/usr/bin/env node
// // // // console.log("\\n\\x1b[1;33m⚠️  Git is not natively supported in this browser environment.\\x1b[0m");
// // // // console.log("\\x1b[1;36mHOW TO MANAGE YOUR CODE:\\x1b[0m");
// // // // console.log("  • \\x1b[1;34mClone/Pull:\\x1b[0m Use \\x1b[1;32mnpx degit <github-username>/<repo>\\x1b[0m to download templates.");
// // // // console.log("  • \\x1b[1;34mSave/Push:\\x1b[0m Your code is actively auto-saving to the platform.");
// // // // console.log("  • \\x1b[1;34mExport:\\x1b[0m Click \\x1b[1;32mDownload ZIP\\x1b[0m in the toolbar above to get your files locally.\\n");
// // // // `;

// // // // const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', transition: 'color 0.2s' };
// // // // const FILE_ACTIONS_BAR_STYLE: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#252526', padding: '6px 16px', borderBottom: '1px solid #333', flexShrink: 0, minHeight: '36px' };

// // // // const SandpackFileActions: React.FC<{ readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>>, wcInstance: WebContainer | null, blockId: string }> = ({ readOnly, canonicalKeysRef, wcInstance, blockId }) => {
// // // //     const { sandpack } = useSandpack();

// // // //     const [action, setAction] = useState<'idle' | 'add' | 'rename'>('idle');
// // // //     const [inputValue, setInputValue] = useState('');

// // // //     if (readOnly) return null;

// // // //     const handleAction = async () => {
// // // //         if (!inputValue.trim()) { setAction('idle'); return; }
// // // //         const WORK_DIR = `/${blockId}`;

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
// // // //                     if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
// // // //                     await wcInstance.fs.writeFile(`${WORK_DIR}${path}`, "// New file\n");
// // // //                 } catch { }
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
// // // //                         if (parts.length > 1) await wcInstance.fs.mkdir(`${WORK_DIR}/` + parts.slice(0, -1).join('/'), { recursive: true });
// // // //                         await wcInstance.fs.writeFile(`${WORK_DIR}${newPath}`, content);
// // // //                         await wcInstance.fs.rm(`${WORK_DIR}${oldPath}`);
// // // //                     } catch { }
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
// // // //             if (wcInstance) { try { await wcInstance.fs.rm(`/${blockId}${path}`); } catch { } }
// // // //         }
// // // //     };

// // // //     return (
// // // //         <div style={FILE_ACTIONS_BAR_STYLE}>
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
// // // //                     <input autoFocus value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAction(); if (e.key === 'Escape') setAction('idle'); }} onBlur={() => { if (inputValue.trim() && inputValue !== sandpack.activeFile) handleAction(); else setAction('idle'); }} style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: `1px solid ${action === 'add' ? '#10b981' : '#eab308'}`, outline: 'none', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', minWidth: 0 }} />
// // // //                 </div>
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };

// // // // const WebContainerSyncBridge: React.FC<{ wcInstance: WebContainer | null, blockId: string, readOnly: boolean, canonicalKeysRef: React.MutableRefObject<Set<string>> }> = ({ wcInstance, blockId, readOnly, canonicalKeysRef }) => {
// // // //     const { sandpack } = useSandpack();
// // // //     const lastCodeRef = useRef<Record<string, string>>({});
// // // //     const isWritingRef = useRef<boolean>(false);

// // // //     if (Object.keys(lastCodeRef.current).length === 0) {
// // // //         Object.entries(sandpack.files).forEach(([path, fileObj]) => {
// // // //             lastCodeRef.current[path] = fileObj.code;
// // // //         });
// // // //     }

// // // //     useEffect(() => {
// // // //         if (!wcInstance || readOnly) return;
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
// // // //                     const WORK_DIR = `/${blockId}`;
// // // //                     const fullPath = `${WORK_DIR}${path.startsWith('/') ? path : `/${path}`}`;
// // // //                     const relativeParts = path.split('/').filter(Boolean);

// // // //                     isWritingRef.current = true;
// // // //                     if (relativeParts.length > 1) {
// // // //                         wcInstance.fs.mkdir(`${WORK_DIR}/` + relativeParts.slice(0, -1).join('/'), { recursive: true })
// // // //                             .then(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }))
// // // //                             .catch(() => wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; }));
// // // //                     } else {
// // // //                         wcInstance.fs.writeFile(fullPath, outCode).finally(() => { isWritingRef.current = false; });
// // // //                     }
// // // //                 }
// // // //             });
// // // //         }, 500);
// // // //         return () => clearTimeout(timeoutId);
// // // //     }, [sandpack.files, wcInstance, blockId, readOnly]);

// // // //     useEffect(() => {
// // // //         if (!wcInstance || readOnly) return;
// // // //         let mounted = true;
// // // //         let inFlight = false;
// // // //         let intervalId: ReturnType<typeof setInterval> | null = null;
// // // //         let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// // // //         let watcher: { close?: () => void } | null = null;

// // // //         const walk = async (dir: string, relBase: string, acc: Record<string, string>) => {
// // // //             let entries: any[];
// // // //             try {
// // // //                 entries = await wcInstance.fs.readdir(dir, { withFileTypes: true } as any);
// // // //             } catch { return; }

// // // //             for (const entry of entries) {
// // // //                 const name = typeof entry === 'string' ? entry : entry.name;
// // // //                 const isDir = typeof entry === 'string' ? false : entry.isDirectory?.();
// // // //                 const relPath = `${relBase}/${name}`;
// // // //                 if (shouldIgnorePath(relPath)) continue;

// // // //                 if (isDir) {
// // // //                     await walk(`${dir}/${name}`, relPath, acc);
// // // //                 } else {
// // // //                     const isBinaryFile = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm', '.svg'].some(ext => name.toLowerCase().endsWith(ext));
// // // //                     if (isBinaryFile) continue;

// // // //                     try {
// // // //                         const content = await wcInstance.fs.readFile(`${dir}/${name}`, 'utf-8');
// // // //                         acc[relPath] = content;
// // // //                     } catch { }
// // // //                 }
// // // //             }
// // // //         };

// // // //         const syncFromDisk = async () => {
// // // //             if (isWritingRef.current || inFlight) return;
// // // //             inFlight = true;
// // // //             try {
// // // //                 const diskFiles: Record<string, string> = {};
// // // //                 await walk(`/${blockId}`, '', diskFiles);

// // // //                 for (const [relPath, content] of Object.entries(diskFiles)) {
// // // //                     if (!mounted) break;
// // // //                     const currentCode = sandpack.files[relPath]?.code;
// // // //                     if (content !== currentCode && content !== lastCodeRef.current[relPath]) {
// // // //                         lastCodeRef.current[relPath] = content;
// // // //                         canonicalKeysRef.current.add(relPath);
// // // //                         if (sandpack.files[relPath] !== undefined) {
// // // //                             sandpack.updateFile(relPath, content);
// // // //                         } else if (typeof sandpack.addFile === 'function') {
// // // //                             sandpack.addFile(relPath, content);
// // // //                         }
// // // //                     }
// // // //                 }
// // // //             } catch { }
// // // //             inFlight = false;
// // // //         };

// // // //         const setup = async () => {
// // // //             try {
// // // //                 const w = (wcInstance.fs as any).watch?.(`/${blockId}`, { recursive: true }, () => {
// // // //                     if (debounceTimer) clearTimeout(debounceTimer);
// // // //                     debounceTimer = setTimeout(syncFromDisk, 400);
// // // //                 });
// // // //                 if (w && typeof w.close === 'function') {
// // // //                     watcher = w;
// // // //                 } else {
// // // //                     throw new Error('fs.watch unavailable');
// // // //                 }
// // // //             } catch {
// // // //                 intervalId = setInterval(syncFromDisk, 2500);
// // // //             }
// // // //         };
// // // //         setup();

// // // //         return () => {
// // // //             mounted = false;
// // // //             if (intervalId) clearInterval(intervalId);
// // // //             if (debounceTimer) clearTimeout(debounceTimer);
// // // //             if (watcher?.close) { try { watcher.close(); } catch { } }
// // // //         };
// // // //     }, [wcInstance, blockId, sandpack, canonicalKeysRef, readOnly]);

// // // //     return null;
// // // // };

// // // // const StateHarvester: React.FC<{ readOnly: boolean, onChange: (answer: { snapshot: string; dependencies: Record<string, string>; immediate: boolean }) => void }> = ({ readOnly, onChange }) => {
// // // //     const { sandpack } = useSandpack();
// // // //     const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// // // //     useEffect(() => {
// // // //         if (readOnly) return;

// // // //         if (debounceRef.current) clearTimeout(debounceRef.current);
// // // //         debounceRef.current = setTimeout(() => {
// // // //             const currentFiles: Record<string, string> = {};
// // // //             for (const [path, fileObj] of Object.entries(sandpack.files)) {
// // // //                 const cleanPath = path.startsWith('/') ? path : `/${path}`;
// // // //                 if (fileObj && !fileObj.hidden && typeof fileObj.code === 'string') {
// // // //                     currentFiles[cleanPath] = fileObj.code;
// // // //                 }
// // // //             }

// // // //             const pkgJson = currentFiles['/package.json'];
// // // //             let dependencies = {};
// // // //             if (pkgJson) {
// // // //                 try { dependencies = JSON.parse(pkgJson).dependencies || {}; } catch (e) { }
// // // //             }

// // // //             onChange({ snapshot: createSafeSnapshot(currentFiles), dependencies, immediate: false });
// // // //         }, 400);

// // // //         return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
// // // //     }, [sandpack.files, readOnly, onChange]);
// // // //     return null;
// // // // };

// // // // let globalNpmMutex: Promise<void> = Promise.resolve();

// // // // export const CodeSandboxPlayer: React.FC<CodeSandboxPlayerProps> = ({ block, learnerAns, onChange, readOnly = false }) => {
// // // //     const toast = useToast();
// // // //     const [isMaximized, setIsMaximized] = useState(false);
// // // //     const [pendingZipFile, setPendingZipFile] = useState<Blob | null>(null);

// // // //     const onChangeRef = useRef(onChange);

// // // //     const [showGithubModal, setShowGithubModal] = useState(false);
// // // //     const [githubUrl, setGithubUrl] = useState('');
// // // //     const [isFetchingGithub, setIsFetchingGithub] = useState(false);

// // // //     useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

// // // //     const safeBlockId = useMemo(() => sanitizeBlockId(block?.id), [block?.id]);

// // // //     const assignedPort = useMemo(() => {
// // // //         let hash = 0;
// // // //         const str = safeBlockId;
// // // //         for (let i = 0; i < str.length; i++) {
// // // //             hash = str.charCodeAt(i) + ((hash << 5) - hash);
// // // //         }
// // // //         return 5000 + (Math.abs(hash) % 1000);
// // // //     }, [safeBlockId]);

// // // //     const snapshotKey = useMemo(() => {
// // // //         const s = learnerAns?.snapshot;
// // // //         if (!s) return '';
// // // //         return typeof s === 'string' ? s : JSON.stringify(s);
// // // //     }, [learnerAns?.snapshot]);

// // // //     const getInitialConfig = useCallback(() => {
// // // //         const parsedFiles = parseAndRepairLearnerSnapshot(learnerAns?.snapshot || learnerAns, block?.template);
// // // //         const rawFilesToLoad = (parsedFiles && Object.keys(parsedFiles).length > 0) ? parsedFiles : { ...(block?.initialFiles || {}) };

// // // //         const filesToLoad = sanitizeProjectFiles(rawFilesToLoad);
// // // //         const tpl = getEffectiveTemplate(filesToLoad, block?.template);

// // // //         return {
// // // //             files: processProjectData(filesToLoad, assignedPort, tpl, safeBlockId),
// // // //             template: tpl
// // // //         };
// // // //     }, [learnerAns, block?.initialFiles, block?.template, assignedPort, safeBlockId]);

// // // //     const initialConfig = useMemo(() => getInitialConfig(), [getInitialConfig]);

// // // //     const [lockedFiles, setLockedFiles] = useState(() => initialConfig.files);
// // // //     const [template, setTemplate] = useState<any>(() => initialConfig.template);

// // // //     const latestFrontendFilesRef = useRef<Record<string, string>>(initialConfig.files);

// // // //     const [runId, setRunId] = useState(Date.now().toString());

// // // //     useEffect(() => {
// // // //         let cancelled = false;

// // // //         const loadProject = async () => {
// // // //             const parsedFiles = parseAndRepairLearnerSnapshot(learnerAns?.snapshot || learnerAns, block?.template);
// // // //             const hasValidSnapshot = parsedFiles && Object.keys(parsedFiles).length > 0;

// // // //             if (hasValidSnapshot) {
// // // //                 const currentSerialized = createSafeSnapshot(latestFrontendFilesRef.current);
// // // //                 const incomingSerialized = JSON.stringify(parsedFiles);

// // // //                 if (currentSerialized === incomingSerialized || incomingSerialized === lastSavedSnapshotRef.current) {
// // // //                     return;
// // // //                 }
// // // //             }

// // // //             let rawFilesToLoad: Record<string, string> = hasValidSnapshot ? parsedFiles! : { ...(block?.initialFiles || {}) };

// // // //             if (!hasValidSnapshot && Object.keys(rawFilesToLoad).length === 0 && block?.initialFilesStoragePath) {
// // // //                 try {
// // // //                     const storage = getStorage();
// // // //                     const jsonRef = fbStorageRef(storage, block.initialFilesStoragePath);
// // // //                     const buffer = await getBytes(jsonRef);
// // // //                     const jsonStr = new TextDecoder().decode(buffer);
// // // //                     rawFilesToLoad = JSON.parse(jsonStr);
// // // //                 } catch (err) {
// // // //                     console.error("Failed to load offloaded starter code from Storage:", err);
// // // //                 }
// // // //             }

// // // //             if (cancelled) return;

// // // //             const filesToLoad = sanitizeProjectFiles(rawFilesToLoad);
// // // //             const tpl = getEffectiveTemplate(filesToLoad, block?.template);
// // // //             const processed = processProjectData(filesToLoad, assignedPort, tpl, safeBlockId);

// // // //             console.log(`✅ [IDE LOAD] Syncing files into Sandpack. Total files: ${Object.keys(processed).length}`);

// // // //             setLockedFiles(processed);
// // // //             setTemplate(resolveSandpackTemplate(tpl));
// // // //             canonicalKeysRef.current = new Set(Object.keys(processed).map(p => p.startsWith('/') ? p : '/' + p));
// // // //             latestFrontendFilesRef.current = processed;
// // // //         };

// // // //         loadProject();

// // // //         return () => { cancelled = true; };
// // // //     }, [snapshotKey, block?.initialFiles, block?.initialFilesStoragePath, block?.template, assignedPort, safeBlockId]);

// // // //     const [previewUrl, setPreviewUrl] = useState<string>('');
// // // //     const [wcInstance, setWcInstance] = useState<WebContainer | null>(null);
// // // //     const [statusText, setStatusText] = useState("Booting OS...");
// // // //     const [wcReady, setWcReady] = useState(false);
// // // //     const [iframeKey, setIframeKey] = useState(0);
// // // //     const [bootFailed, setBootFailed] = useState(false);
// // // //     const previewOriginRef = useRef<string>('');

// // // //     const wcInstanceRef = useRef<WebContainer | null>(null);

// // // //     const [activeTerminalTab, setActiveTerminalTab] = useState<'logs' | 'shell'>('logs');

// // // //     const debugTerminalRef = useRef<HTMLDivElement>(null);
// // // //     const shellTerminalRef = useRef<HTMLDivElement>(null);
// // // //     const debugXtermRef = useRef<Terminal | null>(null);
// // // //     const shellXtermRef = useRef<Terminal | null>(null);
// // // //     const debugFitRef = useRef<FitAddon | null>(null);
// // // //     const shellFitRef = useRef<FitAddon | null>(null);
// // // //     const devProcessRef = useRef<WebContainerProcess | null>(null);
// // // //     const shellProcessRef = useRef<WebContainerProcess | null>(null);
// // // //     const resizeObserverRef = useRef<ResizeObserver | null>(null);
// // // //     const shellResizeObserverRef = useRef<ResizeObserver | null>(null);

// // // //     const canonicalKeysRef = useRef<Set<string>>(new Set(Object.keys(lockedFiles).map(p => p.startsWith('/') ? p : '/' + p)));
// // // //     const lockedFilesRef = useRef(lockedFiles);
// // // //     useEffect(() => { lockedFilesRef.current = lockedFiles; }, [lockedFiles]);

// // // //     const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// // // //     const lastSavedSnapshotRef = useRef<string>('');
// // // //     const warnedDroppedFilesRef = useRef<Set<string>>(new Set());

// // // //     const flushSave = useCallback((isImmediate = false) => {
// // // //         if (!onChangeRef.current || readOnly) return;

// // // //         const filteredSnapshot: Record<string, string> = {};
// // // //         for (const [path, content] of Object.entries(latestFrontendFilesRef.current)) {
// // // //             filteredSnapshot[path] = content;
// // // //         }

// // // //         if (Object.keys(filteredSnapshot).length === 0) {
// // // //             console.warn("⚠️ [IDE AUTO-SAVE SKIPPED] File map is empty. Refusing to write to Firebase.");
// // // //             return;
// // // //         }

// // // //         const serialized = createSafeSnapshot(filteredSnapshot, (path) => {
// // // //             if (!warnedDroppedFilesRef.current.has(path)) {
// // // //                 warnedDroppedFilesRef.current.add(path);
// // // //                 toast?.error(`"${path}" is too large to save (max 500KB) and was left out of your saved project.`);
// // // //             }
// // // //         });

// // // //         const unchanged = !isImmediate && serialized === lastSavedSnapshotRef.current;
// // // //         if (unchanged) return;

// // // //         let dependencies = {};
// // // //         if (filteredSnapshot['/package.json']) {
// // // //             try { dependencies = JSON.parse(filteredSnapshot['/package.json']).dependencies || {}; } catch { }
// // // //         }

// // // //         console.log(`💾 [IDE AUTO-SAVE TRIGGERED] Dispatching snapshot for block [${block?.id}] to parent component...`, {
// // // //             isImmediate,
// // // //             fileCount: Object.keys(filteredSnapshot).length,
// // // //             filePaths: Object.keys(filteredSnapshot)
// // // //         });

// // // //         const pendingSnapshot = serialized;
// // // //         const result = onChangeRef.current({ snapshot: serialized, dependencies, immediate: isImmediate });
// // // //         if (result && typeof (result as any).then === 'function') {
// // // //             (result as Promise<void>)
// // // //                 .then(() => {
// // // //                     lastSavedSnapshotRef.current = pendingSnapshot;
// // // //                     console.log(`✅ [IDE AUTO-SAVE CONFIRMED] Code changes persisted for block [${block?.id}]`);
// // // //                 })
// // // //                 .catch((err) => {
// // // //                     console.error('❌ [IDE AUTO-SAVE ERROR] Save rejected:', err);
// // // //                     toast?.error('Failed to save your latest changes. Retrying shortly…');
// // // //                 });
// // // //         } else {
// // // //             lastSavedSnapshotRef.current = pendingSnapshot;
// // // //         }
// // // //     }, [block?.id, readOnly, toast]);

// // // //     const scheduleSave = useCallback(() => {
// // // //         if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// // // //         saveDebounceRef.current = setTimeout(() => {
// // // //             flushSaveRef.current(false);
// // // //             saveDebounceRef.current = null;
// // // //         }, 1500);
// // // //     }, []);

// // // //     const handleFilesChange = useCallback((answerPayload: { snapshot: string }) => {
// // // //         if (readOnly) return;
// // // //         const files = safeParseSnapshot(answerPayload.snapshot);
// // // //         if (!files || Object.keys(files).length === 0) return;

// // // //         latestFrontendFilesRef.current = files;
// // // //         scheduleSave();
// // // //     }, [scheduleSave, readOnly]);

// // // //     const flushSaveRef = useRef(flushSave);
// // // //     useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

// // // //     useEffect(() => {
// // // //         const handleBeforeUnload = () => {
// // // //             flushSaveRef.current(true);
// // // //         };
// // // //         const handleVisibilityChange = () => {
// // // //             if (document.visibilityState === 'hidden') {
// // // //                 flushSaveRef.current(true);
// // // //             }
// // // //         };

// // // //         window.addEventListener('beforeunload', handleBeforeUnload);
// // // //         document.addEventListener('visibilitychange', handleVisibilityChange);
// // // //         return () => {
// // // //             window.removeEventListener('beforeunload', handleBeforeUnload);
// // // //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// // // //         };
// // // //     }, []);

// // // //     useEffect(() => {
// // // //         return () => {
// // // //             if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
// // // //             flushSaveRef.current(true);
// // // //         };
// // // //     }, []);

// // // //     useEffect(() => {
// // // //         const intervalId = setInterval(() => flushSaveRef.current(false), 30000);
// // // //         return () => clearInterval(intervalId);
// // // //     }, []);

// // // //     useEffect(() => {
// // // //         const handleMessage = (e: MessageEvent) => {
// // // //             if (previewOriginRef.current && e.origin !== previewOriginRef.current) return;
// // // //             if (e.data?.source === 'preview-console' && e.data?.blockId === safeBlockId && debugXtermRef.current) {
// // // //                 let prefix = '\x1b[34m[LOG]\x1b[0m';
// // // //                 if (e.data.m === 'warn') prefix = '\x1b[33m[WARN]\x1b[0m';
// // // //                 if (e.data.m === 'error') prefix = '\x1b[31m[ERROR]\x1b[0m';
// // // //                 if (e.data.m === 'info') prefix = '\x1b[36m[INFO]\x1b[0m';
// // // //                 debugXtermRef.current.writeln(`${prefix} ${String(e.data.p).slice(0, 2000)}`);
// // // //             }
// // // //         };
// // // //         window.addEventListener('message', handleMessage);
// // // //         return () => window.removeEventListener('message', handleMessage);
// // // //     }, [safeBlockId]);

// // // //     const containerRef = useRef<HTMLDivElement>(null);
// // // //     const [hasBeenVisible, setHasBeenVisible] = useState(false);

// // // //     useEffect(() => {
// // // //         if (hasBeenVisible || !containerRef.current) return;
// // // //         const observer = new IntersectionObserver((entries) => {
// // // //             if (entries[0]?.isIntersecting) {
// // // //                 setHasBeenVisible(true);
// // // //                 observer.disconnect();
// // // //             }
// // // //         }, { threshold: 0.1 });
// // // //         observer.observe(containerRef.current);
// // // //         return () => observer.disconnect();
// // // //     }, [hasBeenVisible]);

// // // //     useEffect(() => {
// // // //         if (!hasBeenVisible) return;

// // // //         let mounted = true;
// // // //         const streamController = new AbortController();

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
// // // //             shellResizeObserverRef.current = new ResizeObserver(() => {
// // // //                 if (mounted && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0) {
// // // //                     try { shellFit.fit(); if (shellProcessRef.current) shellProcessRef.current.resize({ cols: shellTerm.cols, rows: shellTerm.rows }); } catch (e) { }
// // // //                 }
// // // //             });
// // // //             shellResizeObserverRef.current.observe(shellTerminalRef.current);
// // // //         }

// // // //         let shellInputListener: { dispose: () => void } | null = null;
// // // //         let serverReadyUnsub: (() => void) | null = null;

// // // //         const boot = async () => {
// // // //             const WORK_DIR = `/${safeBlockId}`;

// // // //             try {
// // // //                 console.log(`🚀 [IDE WEBCONTAINER] Booting WebContainer instance for block [${safeBlockId}]...`);
// // // //                 const wc = await getWebContainer();
// // // //                 if (!mounted) return;

// // // //                 setWcInstance(wc);
// // // //                 wcInstanceRef.current = wc;

// // // //                 if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } devProcessRef.current = null; }
// // // //                 if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } shellProcessRef.current = null; }
// // // //                 try { await wc.fs.rm(WORK_DIR, { recursive: true, force: true }); } catch { }

// // // //                 debugTerm.writeln('\x1b[1;32m>> SYSTEM ONLINE - MOUNTING FILESYSTEM\x1b[0m');
// // // //                 const bootTemplate = template;
// // // //                 const tree = convertToTree(processProjectData(lockedFilesRef.current, assignedPort, bootTemplate, safeBlockId));

// // // //                 await wc.mount({ [safeBlockId]: { directory: tree } });

// // // //                 if (mounted) setWcReady(true);

// // // //                 await wc.fs.mkdir(`${WORK_DIR}/.bin`, { recursive: true });
// // // //                 await wc.fs.writeFile(`${WORK_DIR}/.bin/git`, GIT_SHIM_SCRIPT);

// // // //                 debugTerm.writeln('\x1b[1;33m>> Queuing npm install...\x1b[0m');
// // // //                 let installFailed = false;
// // // //                 await new Promise<void>(resolve => {
// // // //                     globalNpmMutex = globalNpmMutex.then(async () => {
// // // //                         if (!mounted) return resolve();
// // // //                         let installProcess: any = null;
// // // //                         try {
// // // //                             debugTerm.writeln('\x1b[1;33m>> Running npm install...\x1b[0m');
// // // //                             installProcess = await wc.spawn('npm', ['install', '--no-package-lock'], { cwd: WORK_DIR });

// // // //                             installProcess.output.pipeTo(new WritableStream({
// // // //                                 write: data => { if (mounted) debugTerm.write(data); }
// // // //                             }), { signal: streamController.signal }).catch(() => { });

// // // //                             const exitCode = await Promise.race([
// // // //                                 installProcess.exit,
// // // //                                 new Promise<number>((_, reject) => setTimeout(() => reject(new Error('npm install timed out after 5 minutes')), 300000))
// // // //                             ]);
// // // //                             if (exitCode !== 0) throw new Error("Installation process aborted.");
// // // //                         } catch (err: any) {
// // // //                             installFailed = true;
// // // //                             if (mounted) debugTerm.writeln(`\x1b[1;31m>> NPM Error: ${err.message || err}\x1b[0m`);
// // // //                             try { installProcess?.kill(); } catch { }
// // // //                         }
// // // //                         resolve();
// // // //                     });
// // // //                 });

// // // //                 if (!mounted) return;
// // // //                 if (installFailed) {
// // // //                     setStatusText("Boot Failed");
// // // //                     setBootFailed(true);
// // // //                     return;
// // // //                 }

// // // //                 debugTerm.writeln('\n\x1b[1;36m>> Booting local Vite telemetry server...\x1b[0m');
// // // //                 const devProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: WORK_DIR });
// // // //                 devProcessRef.current = devProcess;

// // // //                 devProcess.output.pipeTo(new WritableStream({
// // // //                     write: data => { if (mounted) debugTerm.write(data); }
// // // //                 }), { signal: streamController.signal }).catch(() => { });

// // // //                 const shellProcess = await wc.spawn('jsh', { terminal: { cols: shellTerm.cols || 80, rows: shellTerm.rows || 15 }, cwd: WORK_DIR });
// // // //                 shellProcessRef.current = shellProcess;

// // // //                 shellProcess.output.pipeTo(new WritableStream({
// // // //                     write: data => { if (mounted) shellTerm.write(data); }
// // // //                 }), { signal: streamController.signal }).catch(() => { });

// // // //                 const inputWriter = shellProcess.input.getWriter();
// // // //                 await inputWriter.write('chmod +x .bin/git && export PATH="$PWD/.bin:$PATH"\nclear\n').catch(() => { });
// // // //                 shellInputListener = shellTerm.onData(data => {
// // // //                     if (mounted) inputWriter.write(data).catch(() => { });
// // // //                 });

// // // //                 // 🚀 DYNAMIC PORT ACCEPTOR: ACCEPTS WHICHEVER PORT WEBCONTAINER ASSIGNS (BYPASSES "UNABLE TO CONNECT TO PORT X" ERRORS)
// // // //                 serverReadyUnsub = wc.on('server-ready', (port, url) => {
// // // //                     console.log(`🚀 [IDE WEBCONTAINER] server-ready event received on port ${port}: ${url}`);
// // // //                     if (!mounted) return;

// // // //                     try { previewOriginRef.current = new URL(url).origin; } catch { }
// // // //                     setPreviewUrl(url);
// // // //                     setStatusText("Online");
// // // //                     setIframeKey(k => k + 1);
// // // //                     debugTerm.writeln(`\n\x1b[1;32m>> Preview running on port ${port}\x1b[0m\n`);
// // // //                 });

// // // //             } catch (err: any) {
// // // //                 if (mounted) {
// // // //                     console.error("❌ [IDE WEBCONTAINER ERROR]", err);
// // // //                     debugTerm.writeln(`\r\n\x1b[1;31m>> FATAL ERROR: ${err.message}\x1b[0m`);
// // // //                     setStatusText("Boot Failed");
// // // //                     setBootFailed(true);
// // // //                 }
// // // //             }
// // // //         };

// // // //         setBootFailed(false);
// // // //         boot();
// // // //         const handleUnload = () => {
// // // //             streamController.abort();
// // // //             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch (e) { } }
// // // //             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch (e) { } }
// // // //         };
// // // //         window.addEventListener('beforeunload', handleUnload);

// // // //         return () => {
// // // //             mounted = false;
// // // //             streamController.abort();
// // // //             window.removeEventListener('beforeunload', handleUnload);

// // // //             if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
// // // //             if (shellResizeObserverRef.current) shellResizeObserverRef.current.disconnect();
// // // //             if (shellInputListener) shellInputListener.dispose();
// // // //             if (serverReadyUnsub) serverReadyUnsub();

// // // //             debugTerm.dispose();
// // // //             shellTerm.dispose();

// // // //             if (devProcessRef.current) { try { devProcessRef.current.kill(); } catch { } }
// // // //             if (shellProcessRef.current) { try { shellProcessRef.current.kill(); } catch { } }

// // // //             setWcInstance(null);
// // // //         };

// // // //     }, [runId, template, assignedPort, safeBlockId, hasBeenVisible]);

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

// // // //     useEffect(() => {
// // // //         const timeoutId = setTimeout(() => {
// // // //             try {
// // // //                 if (debugXtermRef.current?.element && debugTerminalRef.current && debugTerminalRef.current.clientWidth > 0 && debugFitRef.current) {
// // // //                     debugFitRef.current.fit();
// // // //                 }
// // // //                 if (shellXtermRef.current?.element && shellTerminalRef.current && shellTerminalRef.current.clientWidth > 0 && shellFitRef.current) {
// // // //                     shellFitRef.current.fit();
// // // //                     if (shellProcessRef.current) {
// // // //                         shellProcessRef.current.resize({ cols: shellXtermRef.current.cols, rows: shellXtermRef.current.rows });
// // // //                     }
// // // //                 }
// // // //             } catch (e) { }
// // // //         }, 250);
// // // //         return () => clearTimeout(timeoutId);
// // // //     }, [isMaximized, activeTerminalTab]);

// // // //     useEffect(() => {
// // // //         if (isMaximized) {
// // // //             document.documentElement.style.overflow = 'hidden';
// // // //             document.body.style.overflow = 'hidden';

// // // //             let el = containerRef.current?.parentElement;
// // // //             while (el && el !== document.body) {
// // // //                 el.style.setProperty('overflow', 'hidden', 'important');
// // // //                 el.style.setProperty('transform', 'none', 'important');
// // // //                 el.style.setProperty('filter', 'none', 'important');
// // // //                 el.style.setProperty('perspective', 'none', 'important');
// // // //                 el = el.parentElement;
// // // //             }
// // // //         } else {
// // // //             document.documentElement.style.overflow = '';
// // // //             document.body.style.overflow = '';

// // // //             let el = containerRef.current?.parentElement;
// // // //             while (el && el !== document.body) {
// // // //                 el.style.removeProperty('overflow');
// // // //                 el.style.removeProperty('transform');
// // // //                 el.style.removeProperty('filter');
// // // //                 el.style.removeProperty('perspective');
// // // //                 el = el.parentElement;
// // // //             }
// // // //         }
// // // //     }, [isMaximized]);

// // // //     const containerStyle: React.CSSProperties = useMemo(() => isMaximized ? {
// // // //         position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999, border: 'none', borderRadius: 0, overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column', margin: 0, padding: 0, boxSizing: 'border-box'
// // // //     } : {
// // // //         position: 'relative', width: '100%', height: '750px', marginTop: '1rem', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column'
// // // //     }, [isMaximized]);

// // // //     const terminalTabBtnStyle = useCallback((active: boolean): React.CSSProperties => ({
// // // //         background: active ? '#334155' : 'transparent', border: 'none', color: active ? '#fff' : '#94a3b8',
// // // //         cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold'
// // // //     }), []);

// // // //     const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
// // // //         const file = e.target.files?.[0];
// // // //         if (!file) return;
// // // //         setPendingZipFile(file);
// // // //         e.target.value = '';
// // // //     };

// // // //     const processZipBlob = async (blob: Blob) => {
// // // //         const zip = new JSZip();
// // // //         const contents = await zip.loadAsync(blob);

// // // //         const allPaths = Object.keys(contents.files).filter(p => {
// // // //             const fileName = p.split('/').pop() || '';
// // // //             if (contents.files[p].dir) return false;
// // // //             if (p.includes('__MACOSX') || p.includes('node_modules/') || p.includes('.git/')) return false;
// // // //             if (fileName.startsWith('._') || fileName === '.DS_Store' || fileName === 'Thumbs.db') return false;
// // // //             return true;
// // // //         });

// // // //         const expectedTemplate = (block?.template || 'javascript').toLowerCase();
// // // //         const isVanillaExpected = ['javascript', 'html', 'vanilla'].includes(expectedTemplate);

// // // //         let hasReactFiles = false;
// // // //         for (const p of allPaths) {
// // // //             if (p.endsWith('.jsx') || p.endsWith('.tsx')) hasReactFiles = true;
// // // //             if (p.endsWith('package.json')) {
// // // //                 try {
// // // //                     const pkgStr = await contents.files[p].async('string');
// // // //                     if (pkgStr.includes('"react"')) hasReactFiles = true;
// // // //                 } catch (e) { }
// // // //             }
// // // //         }

// // // //         if (isVanillaExpected && hasReactFiles) {
// // // //             toast?.error("Upload Blocked: This assignment requires a pure Vanilla JavaScript project. React projects are not allowed here.");
// // // //             return;
// // // //         }

// // // //         const isBinaryFile = (path: string) => ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.wasm', '.svg'].some(ext => path.toLowerCase().endsWith(ext));

// // // //         const extractedMap: Record<string, string> = {};
// // // //         for (const path of allPaths) {
// // // //             if (isBinaryFile(path)) {
// // // //                 extractedMap[`/${path}`] = `__mlab_base64__${await contents.files[path].async('base64')}`;
// // // //             } else {
// // // //                 extractedMap[`/${path}`] = await contents.files[path].async('string');
// // // //             }
// // // //         }

// // // //         const newFiles = sanitizeProjectFiles(extractedMap);

// // // //         const tempTpl = getEffectiveTemplate(newFiles, block?.template);
// // // //         const cleanFiles = processProjectData(newFiles, assignedPort, tempTpl, block.id);

// // // //         setTemplate(resolveSandpackTemplate(tempTpl));
// // // //         setLockedFiles(cleanFiles);
// // // //         canonicalKeysRef.current = new Set(Object.keys(cleanFiles).map(p => p.startsWith('/') ? p : '/' + p));

// // // //         latestFrontendFilesRef.current = cleanFiles;
// // // //         setRunId(Date.now().toString());

// // // //         flushSaveRef.current(true);
// // // //         toast?.success("Project Imported Successfully!");
// // // //     };

// // // //     const confirmZipImport = async () => {
// // // //         if (!pendingZipFile) return;
// // // //         await processZipBlob(pendingZipFile);
// // // //         setPendingZipFile(null);
// // // //     };

// // // //     const handleGithubImport = async () => {
// // // //         if (!githubUrl.trim()) return;
// // // //         try {
// // // //             setIsFetchingGithub(true);

// // // //             const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
// // // //             if (!match) throw new Error("Invalid GitHub URL. Must be a valid repo link.");

// // // //             const user = match[1];
// // // //             const repo = match[2].replace('.git', '');

// // // //             const response = await fetch(`https://api.github.com/repos/${user}/${repo}/zipball`);
// // // //             if (!response.ok) throw new Error("Could not fetch repo. Ensure it is public.");

// // // //             const blob = await response.blob();

// // // //             setShowGithubModal(false);
// // // //             setGithubUrl('');
// // // //             setPendingZipFile(blob);
// // // //         } catch (err: any) {
// // // //             toast?.error(err.message || "Failed to import from GitHub.");
// // // //         } finally {
// // // //             setIsFetchingGithub(false);
// // // //         }
// // // //     };

// // // //     const handleDownloadZip = async () => {
// // // //         const zip = new JSZip();
// // // //         const filesToZip = Object.keys(latestFrontendFilesRef.current).length > 0 ? latestFrontendFilesRef.current : lockedFiles;

// // // //         Object.entries(filesToZip).forEach(([path, content]) => {
// // // //             if (canonicalKeysRef.current.has(path)) {
// // // //                 const cleanPath = path.startsWith('/') ? path.substring(1) : path;
// // // //                 if (typeof content === 'string' && content.startsWith('__mlab_base64__')) zip.file(cleanPath, content.substring(15), { base64: true });
// // // //                 else zip.file(cleanPath, content as string);
// // // //             }
// // // //         });
// // // //         const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
// // // //         const a = document.createElement('a'); a.href = url; a.download = `codetribe_project_${block.id}.zip`; a.click();
// // // //         URL.revokeObjectURL(url);
// // // //         toast?.success("Project Downloaded Successfully!");
// // // //     };

// // // //     return (
// // // //         <div ref={containerRef} style={containerStyle}>
// // // //             <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #334155', flexShrink: 0 }}>
// // // //                 <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                     <Code size={14} color="#3b82f6" /> {block.title || 'Live IDE'}
// // // //                     {readOnly && <span style={{ background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>GRADING MODE (LOCKED)</span>}
// // // //                 </span>
// // // //                 <div style={{ display: 'flex', gap: '8px' }}>
// // // //                     {!readOnly && (
// // // //                         <>
// // // //                             <label style={{ background: '#3b82f6', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                                 <FolderArchive size={14} /> Import ZIP<input type="file" accept=".zip" hidden onChange={handleFileSelect} />
// // // //                             </label>
// // // //                             <button onClick={() => setShowGithubModal(true)} style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// // // //                                 <Github size={14} /> GitHub
// // // //                             </button>
// // // //                         </>
// // // //                     )}
// // // //                     <button onClick={handleDownloadZip} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><Download size={14} /> <span className="ap-hide-mobile">ZIP</span></button>
// // // //                     <button onClick={() => setIframeKey(k => k + 1)} style={{ background: '#334155', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}><RefreshCw size={14} /> Reload Preview</button>
// // // //                     <button onClick={() => setIsMaximized(!isMaximized)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>{isMaximized ? <Minimize size={14} /> : <Maximize size={14} />} {isMaximized ? 'Exit' : 'Fullscreen'}</button>
// // // //                 </div>
// // // //             </div>

// // // //             <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
// // // //                 <Group direction="horizontal" style={{ width: '100%', height: '100%' }}>
// // // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
// // // //                         <style>{`.sp-layout, .sp-wrapper { height: 100% !important; max-height: 100% !important; min-height: 0 !important; min-width: 0 !important; } [data-panel-group], [data-panel] { height: 100% !important; }`}</style>
// // // //                         <SandpackProvider key={runId} template={resolveSandpackTemplate(template)} files={lockedFiles} theme="dark">
// // // //                             <SandpackLayout style={{ flex: 1, height: '100%', border: 'none', borderRadius: 0, overflow: 'hidden', minHeight: 0 }}>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', minWidth: 0 }}>
// // // //                                     <SandpackFileActions readOnly={readOnly} canonicalKeysRef={canonicalKeysRef} wcInstance={wcInstance} blockId={block.id} />
// // // //                                     <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
// // // //                                         <div style={{ width: '160px', borderRight: '1px solid #334155', flexShrink: 0, overflowY: 'auto', overflowX: 'hidden' }}><SandpackFileExplorer style={{ height: '100%' }} /></div>
// // // //                                         <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}><SandpackCodeEditor showTabs closableTabs style={{ height: '100%' }} readOnly={readOnly} /></div>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </SandpackLayout>
// // // //                             {!readOnly && wcReady && <WebContainerSyncBridge wcInstance={wcInstance} blockId={block.id} canonicalKeysRef={canonicalKeysRef} readOnly={readOnly} />}
// // // //                             {!readOnly && <StateHarvester readOnly={readOnly} onChange={handleFilesChange} />}
// // // //                         </SandpackProvider>
// // // //                     </Panel>
// // // //                     <Separator style={{ width: '4px', background: '#334155', cursor: 'col-resize' }} />
// // // //                     <Panel defaultSize={50} minSize={20} style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', overflow: 'hidden' }}>
// // // //                         <div style={{ height: `${previewHeight}px`, position: 'relative', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
// // // //                             {previewUrl ? <iframe key={iframeKey} src={`${previewUrl}${previewUrl.includes('?') ? '&' : '?'}t=${iframeKey}`} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" /> : (
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', gap: '10px' }}>
// // // //                                     {bootFailed ? <AlertTriangle size={24} color="#ef4444" /> : <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />}
// // // //                                     <span style={{ fontSize: '0.85rem' }}>{statusText}</span>
// // // //                                     {bootFailed && (
// // // //                                         <button onClick={() => { setBootFailed(false); setRunId(Date.now().toString()); }} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                                             <RefreshCw size={13} /> Retry
// // // //                                         </button>
// // // //                                     )}
// // // //                                 </div>
// // // //                             )}
// // // //                             {isDragging && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />}
// // // //                         </div>
// // // //                         <div onMouseDown={handleResizerMouseDown} style={{ height: '4px', background: '#334155', cursor: 'row-resize', flexShrink: 0 }} />
// // // //                         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
// // // //                             <div style={{ padding: '4px 8px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
// // // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'logs')} onClick={() => setActiveTerminalTab('logs')}><ScrollText size={12} /> Logs</button>
// // // //                                 <button style={terminalTabBtnStyle(activeTerminalTab === 'shell')} onClick={() => setActiveTerminalTab('shell')}><SquareTerminal size={12} /> Shell</button>
// // // //                             </div>
// // // //                             <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
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

// // // //             {showGithubModal && createPortal(
// // // //                 <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // // //                     <div style={{ background: '#1e293b', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
// // // //                         <h3 style={{ color: '#fff', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><Github size={20} /> Import from GitHub</h3>
// // // //                         <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '15px' }}>Enter the URL of a public GitHub repository. This will completely overwrite your current code.</p>

// // // //                         <input
// // // //                             type="text"
// // // //                             placeholder="https://github.com/user/repo"
// // // //                             value={githubUrl}
// // // //                             onChange={(e) => setGithubUrl(e.target.value)}
// // // //                             style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', marginBottom: '20px', fontSize: '0.9rem', outline: 'none' }}
// // // //                         />

// // // //                         <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
// // // //                             <button onClick={() => setShowGithubModal(false)} disabled={isFetchingGithub} style={{ padding: '8px 16px', background: 'transparent', color: '#cbd5e1', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
// // // //                             <button onClick={handleGithubImport} disabled={isFetchingGithub || !githubUrl} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', opacity: (isFetchingGithub || !githubUrl) ? 0.5 : 1 }}>
// // // //                                 {isFetchingGithub ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
// // // //                                 {isFetchingGithub ? 'Pulling...' : 'Import Repo'}
// // // //                             </button>
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>,
// // // //                 document.body
// // // //             )}

// // // //             {pendingZipFile && createPortal(
// // // //                 <StatusModal
// // // //                     type="warning"
// // // //                     title="Overwrite Existing Code?"
// // // //                     message="Importing this ZIP file will completely replace your current project files. This action cannot be undone. Do you want to proceed?"
// // // //                     confirmText="Yes, Import"
// // // //                     onClose={confirmZipImport}
// // // //                     onCancel={() => setPendingZipFile(null)}
// // // //                 />,
// // // //                 document.body
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };

// // // // export default CodeSandboxPlayer;
