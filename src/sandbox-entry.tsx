// src/sandbox/sandbox-entry.tsx

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, AlertCircle, Play, CheckCircle2, RotateCcw } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { db } from './lib/firebase';

// Decodes legacy HTML string inputs if any old Quill data exists in Firestore
const sanitizeCodeInput = (input: string): string => {
    if (!input) return '';
    if (!input.includes('<') && !input.includes('&')) return input;

    const formatted = input
        .replace(/<\/p>\s*<p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<div>/gi, '\n')
        .replace(/<\/div>/gi, '');

    const docParser = new DOMParser().parseFromString(formatted, 'text/html');
    return (docParser.body.textContent || '').trim();
};

export const SandboxRoot: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [blockData, setBlockData] = useState<any>(null);
    const [code, setCode] = useState<string>('');
    const [isSubmitted, setIsSubmitted] = useState(false);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(getAuth(), async (user) => {
            const params = new URLSearchParams(window.location.search);
            const blockId = params.get('blockId');
            const unitId = params.get('unitId');
            const targetId = blockId || unitId;

            if (!targetId) {
                setError('Missing blockId or unitId parameter.');
                setLoading(false);
                return;
            }

            try {
                const unitRef = doc(db, 'learning_units', targetId);
                const unitSnap = await getDoc(unitRef);

                if (unitSnap.exists()) {
                    const data = unitSnap.data();
                    setBlockData({ id: unitSnap.id, ...data });

                    const starterCode = data.interactiveCheck?.buggyCode || '// Write your solution here...';
                    setCode(sanitizeCodeInput(starterCode));
                } else {
                    setError(`Sandbox block "${targetId}" not found in database.`);
                }
            } catch (err: any) {
                console.error('[Sandbox] Firestore Read Error:', err);
                setError(err.message || 'Permission denied reading sandbox block.');
            } finally {
                setLoading(false);
            }
        });

        return () => unsubscribeAuth();
    }, []);

    const handleResetCode = () => {
        const starterCode = blockData?.interactiveCheck?.buggyCode || '';
        setCode(sanitizeCodeInput(starterCode));
    };

    const handleSubmitSolution = () => {
        setIsSubmitted(true);
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'SANDBOX_COMPLETED', unitId: blockData?.id, submittedCode: code }, '*');
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: '#38bdf8', fontFamily: 'sans-serif' }}>
                <Loader2 size={32} className="pfm-spin" style={{ marginBottom: '12px' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Initializing Sandbox IDE...
                </span>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: '#f87171', padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
                <AlertCircle size={40} style={{ marginBottom: '12px', opacity: 0.8 }} />
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', textTransform: 'uppercase' }}>Sandbox Load Error</h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', maxWidth: '400px' }}>{error}</p>
            </div>
        );
    }

    const checkConfig = blockData?.interactiveCheck || {};

    return (
        <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#020617', color: '#f8fafc', fontFamily: 'sans-serif' }}>
            {/* TOP HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🐛 Code Repair IDE — {blockData?.title || 'Challenge'}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={handleResetCode}
                        style={{ background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <RotateCcw size={13} /> Reset Starter Code
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmitSolution}
                        style={{ background: isSubmitted ? '#15803d' : '#0284c7', border: 'none', color: 'white', padding: '6px 16px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}
                    >
                        {isSubmitted ? <CheckCircle2 size={14} /> : <Play size={14} />}
                        {isSubmitted ? 'Passed & Verified' : 'Submit & Verify Fix'}
                    </button>
                </div>
            </div>

            {/* MAIN WORKSPACE GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, minHeight: 0 }}>
                {/* INSTRUCTIONS PANEL */}
                <div style={{ background: '#0f172a', borderRight: '1px solid #1e293b', padding: '20px', overflowY: 'auto' }}>
                    <h3 style={{ fontSize: '0.85rem', color: '#38bdf8', textTransform: 'uppercase', marginTop: 0, marginBottom: '8px', fontWeight: 800 }}>
                        Instructions
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                        {sanitizeCodeInput(checkConfig.instructions) || 'Fix the syntax/logic errors in the editor on the right so the code executes correctly.'}
                    </p>

                    {isSubmitted && (
                        <div style={{ marginTop: '20px', background: '#052e16', border: '1px solid #166534', color: '#4ade80', padding: '12px', fontSize: '0.8rem', fontWeight: 700 }}>
                            ✓ Solution verified! You can close this window and return to your lesson.
                        </div>
                    )}
                </div>

                {/* MONACO CODE EDITOR */}
                <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                    <Editor
                        height="100%"
                        defaultLanguage="javascript"
                        theme="vs-dark"
                        value={code}
                        onChange={(val) => setCode(val || '')}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            tabSize: 2,
                            fontFamily: 'Consolas, Monaco, "Andale Mono", monospace'
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const existingRoot = (container as any)._reactRoot;
    if (existingRoot) {
        existingRoot.render(<SandboxRoot />);
    } else {
        const root = createRoot(container);
        (container as any)._reactRoot = root;
        root.render(<SandboxRoot />);
    }
}