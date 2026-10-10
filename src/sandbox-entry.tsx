// src/sandbox/sandbox-entry.tsx

import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, AlertCircle, Play, CheckCircle2, RotateCcw, XCircle, Timer, History, RefreshCw } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { db } from './lib/firebase';
import type { QuizAttemptDoc } from './pages/LearnerPortal/LearnerContentHub/types';

const sanitizeCodeInput = (input: string): string => {
    if (!input) return '';
    if (!input.includes('<') && !input.includes('&')) return input.trim();

    const formatted = input
        .replace(/<\/p>\s*<p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<div>/gi, '\n')
        .replace(/<\/div>/gi, '');

    const docParser = new DOMParser().parseFromString(formatted, 'text/html');
    return (docParser.body.textContent || '').trim();
};

const normalizeCode = (input: string = ''): string => {
    return input
        .replace(/\s+/g, ' ')
        .replace(/;\s*/g, ';')
        .replace(/\s*(<|>|\(\vert{}\)|{|})\s*/g, '$1')
        .trim();
};

// export interface QuizAttemptDoc {
//     id: string;
//     userId: string;
//     unitId: string;
//     containerId?: string;
//     checkType?: string;
//     passed: boolean;
//     submittedCodeOrAnswer?: string;
//     submittedAnswer?: string;
//     transcript?: string;
//     audioUrl?: string;
//     recordingUrl?: string;
//     failureReason?: string | null;
//     feedback?: string | null;
//     aiFeedback?: string | null;
//     feedbackHtml?: string | null;
//     overallFeedback?: string | null;
//     score?: number;
//     facilitatorFeedback?: string;
//     gradedBy?: string;
//     gradedAt?: { toDate?: () => Date; seconds?: number } | string | any;
//     needsReview?: boolean;
//     attemptNumber: number;
//     attemptedAt?: { toDate?: () => Date; seconds?: number } | string | any;
// }

export const SandboxRoot: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [authChecking, setAuthChecking] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [blockData, setBlockData] = useState<any>(null);
    const [code, setCode] = useState<string>('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [evalError, setEvalError] = useState<string | null>(null);

    // ATTEMPT & FAILURE PERSISTENCE STATE
    const [attemptCount, setAttemptCount] = useState<number>(0);
    const [hasFailedPreviousAttempt, setHasFailedPreviousAttempt] = useState(false);

    // IDE MOUNT & TIMER STATE
    const [isEditorReady, setIsEditorReady] = useState(false);
    const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
    const [isTimeExpired, setIsTimeExpired] = useState(false);

    // REF TO ALWAYS ACCESS LATEST CODE INSIDE TIMER INTERVAL
    const codeRef = useRef<string>(code);
    useEffect(() => {
        codeRef.current = code;
    }, [code]);

    // LISTEN FOR AUTH SESSION
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(getAuth(), (user) => {
            setCurrentUser(user);
            setAuthChecking(false);
        });
        return () => unsubscribeAuth();
    }, []);

    // FETCH UNIT DATA & ATTEMPT HISTORY ON MOUNT
    useEffect(() => {
        if (authChecking) return;

        if (!currentUser) {
            setError('Authentication required. Please log in to access the sandbox IDE.');
            setLoading(false);
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const blockId = params.get('blockId');
        const unitId = params.get('unitId');
        const timerParam = params.get('timer');
        const targetId = blockId || unitId;

        if (!targetId) {
            setError('Missing blockId or unitId parameter.');
            setLoading(false);
            return;
        }

        const fetchSandboxData = async () => {
            try {
                const unitRef = doc(db, 'learning_units', targetId);
                const unitSnap = await getDoc(unitRef);

                if (unitSnap.exists()) {
                    const data = unitSnap.data();
                    setBlockData({ id: unitSnap.id, ...data });

                    const starterCode = data.interactiveCheck?.buggyCode || '// Write your solution here...';
                    const cleanStarter = sanitizeCodeInput(starterCode);

                    const urlSecs = timerParam ? parseInt(timerParam, 10) : 0;
                    const fsSecs = Number(data.interactiveCheck?.timeLimitSeconds) || 0;
                    const totalSecs = urlSecs > 0 ? urlSecs : fsSecs;

                    // Query all attempts to evaluate persistence across page reloads
                    try {
                        const attemptsQ = query(
                            collection(db, 'learner_quiz_attempts'),
                            where('userId', '==', currentUser.uid),
                            where('unitId', '==', unitSnap.id)
                        );
                        const attemptsSnap = await getDocs(attemptsQ);
                        const attemptsList = attemptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as QuizAttemptDoc));
                        attemptsList.sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));

                        setAttemptCount(attemptsList.length);

                        const latestAttempt = attemptsList[attemptsList.length - 1];

                        // IF LATEST ATTEMPT FAILED & LESSON IS NOT CLEARED -> LOCK EDITOR & PERSIST FAILURE RESULT
                        if (latestAttempt && !latestAttempt.passed) {
                            setHasFailedPreviousAttempt(true);
                            setIsTimeExpired(true); // Lock Monaco Editor into Read-Only
                            setCode(latestAttempt.submittedCodeOrAnswer || cleanStarter);
                            codeRef.current = latestAttempt.submittedCodeOrAnswer || cleanStarter;
                            setEvalError(latestAttempt.failureReason || "Previous attempt failed evaluation.");
                            setTimerRemaining(0);
                        } else if (latestAttempt && latestAttempt.passed) {
                            setIsSubmitted(true);
                            setCode(latestAttempt.submittedCodeOrAnswer || cleanStarter);
                            codeRef.current = latestAttempt.submittedCodeOrAnswer || cleanStarter;
                        } else {
                            setCode(cleanStarter);
                            codeRef.current = cleanStarter;
                            if (totalSecs > 0) setTimerRemaining(totalSecs);
                        }

                    } catch (e) {
                        console.warn('[Sandbox] Quiz attempts query notice:', e);
                        setCode(cleanStarter);
                        codeRef.current = cleanStarter;
                        if (totalSecs > 0) setTimerRemaining(totalSecs);
                    }
                } else {
                    setError(`Sandbox block "${targetId}" not found in database.`);
                }
            } catch (err: any) {
                console.error('[Sandbox] Firestore Read Error:', err);
                setError(err.message || 'Permission denied reading sandbox block.');
            } finally {
                setLoading(false);
            }
        };

        fetchSandboxData();
    }, [authChecking, currentUser]);

    // LOG ATTEMPT AUDIT RECORD TO FIRESTORE
    const logAttemptToFirestore = async (passed: boolean, submittedCodeText: string, reason: string | null) => {
        if (!currentUser || !blockData?.id) return;

        const nextAttemptNum = attemptCount + 1;
        setAttemptCount(nextAttemptNum);

        try {
            await addDoc(collection(db, 'learner_quiz_attempts'), {
                userId: currentUser.uid,
                unitId: blockData.id,
                containerId: blockData.containerId || '',
                checkType: 'spot_the_bug',
                passed: passed,
                submittedCodeOrAnswer: submittedCodeText,
                failureReason: reason || null,
                attemptNumber: nextAttemptNum,
                attemptedAt: serverTimestamp()
            });
        } catch (err) {
            console.warn('[SandboxAttemptLog] Notice: Attempt doc write suppressed:', err);
        }
    };

    // SHARED EVALUATION FUNCTION (USED BY MANUAL SUBMIT & AUTO-SUBMIT AT 0:00)
    const runVerification = async (codeToTest: string, isTimeoutTrigger: boolean = false) => {
        setEvalError(null);

        const checkConfig = blockData?.interactiveCheck || {};
        const expectedSolution = sanitizeCodeInput(checkConfig.solutionCode || '');
        const buggyStarter = sanitizeCodeInput(checkConfig.buggyCode || '');

        const cleanUserCode = normalizeCode(codeToTest);
        const cleanSolutionCode = normalizeCode(expectedSolution);
        const cleanBuggyCode = normalizeCode(buggyStarter);

        if (cleanUserCode === cleanBuggyCode) {
            const failReason = isTimeoutTrigger
                ? "Time Expired: Code remained unmodified from starter template."
                : "You haven't modified the buggy starter code yet.";

            setIsSubmitted(false);
            setHasFailedPreviousAttempt(true);
            setEvalError(failReason);
            await logAttemptToFirestore(false, codeToTest, failReason);
            return false;
        }

        let passesValidation = false;
        if (cleanSolutionCode) {
            passesValidation = cleanUserCode === cleanSolutionCode;
        } else {
            passesValidation = (cleanUserCode.includes('<>') && cleanUserCode.includes('</>')) ||
                (cleanUserCode.includes('<React.Fragment>') && cleanUserCode.includes('</React.Fragment>'));
        }

        if (passesValidation) {
            setIsSubmitted(true);
            setHasFailedPreviousAttempt(false);
            setEvalError(null);

            await logAttemptToFirestore(true, codeToTest, null);

            if (window.opener && !window.opener.closed) {
                window.opener.postMessage({
                    type: 'SANDBOX_COMPLETED',
                    unitId: blockData?.id,
                    submittedCode: codeToTest
                }, '*');
            }
            return true;
        } else {
            const failReason = isTimeoutTrigger
                ? "Time Expired: Your code at 0:00 failed verification tests."
                : "Verification failed: Code contains syntax errors or unhandled adjacent JSX elements.";

            setIsSubmitted(false);
            setHasFailedPreviousAttempt(true);
            setEvalError(failReason);
            await logAttemptToFirestore(false, codeToTest, failReason);
            return false;
        }
    };

    // COUNTDOWN TIMER EFFECT — WAITS UNTIL MONACO MOUNTS & DOES NOT RUN IF FAILED PREVIOUSLY
    useEffect(() => {
        if (!isEditorReady || hasFailedPreviousAttempt || timerRemaining === null || timerRemaining <= 0 || isSubmitted) return;

        const interval = setInterval(() => {
            setTimerRemaining(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(interval);
                    setIsTimeExpired(true);
                    runVerification(codeRef.current, true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isEditorReady, hasFailedPreviousAttempt, timerRemaining, isSubmitted, blockData]);

    // EXPLICIT RETAKE / RETRY ACTION BUTTON
    const handleRetakeQuiz = () => {
        const starterCode = blockData?.interactiveCheck?.buggyCode || '';
        const cleanStarter = sanitizeCodeInput(starterCode);
        setCode(cleanStarter);
        codeRef.current = cleanStarter;

        setIsSubmitted(false);
        setHasFailedPreviousAttempt(false);
        setEvalError(null);
        setIsTimeExpired(false);

        // Reset and start timer for fresh attempt
        const params = new URLSearchParams(window.location.search);
        const timerParam = params.get('timer');
        const urlSecs = timerParam ? parseInt(timerParam, 10) : 0;
        const fsSecs = Number(blockData?.interactiveCheck?.timeLimitSeconds) || 0;
        const totalSecs = urlSecs > 0 ? urlSecs : fsSecs;

        if (totalSecs > 0) {
            setTimerRemaining(totalSecs);
        } else {
            setTimerRemaining(null);
        }
    };

    const handleResetCode = () => {
        if (hasFailedPreviousAttempt) {
            handleRetakeQuiz();
            return;
        }
        const starterCode = blockData?.interactiveCheck?.buggyCode || '';
        const cleanStarter = sanitizeCodeInput(starterCode);
        setCode(cleanStarter);
        codeRef.current = cleanStarter;
        setIsSubmitted(false);
        setEvalError(null);
        setIsTimeExpired(false);

        const totalSecs = Number(blockData?.interactiveCheck?.timeLimitSeconds) || 0;
        if (totalSecs > 0) {
            setTimerRemaining(totalSecs);
        }
    };

    const handleSubmitSolution = () => {
        if (isTimeExpired || hasFailedPreviousAttempt) return;
        runVerification(code, false);
    };

    if (loading || authChecking) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: '#38bdf8', fontFamily: 'sans-serif' }}>
                <Loader2 size={32} className="pfm-spin" style={{ marginBottom: '12px' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {authChecking ? 'Verifying Session...' : 'Initializing Sandbox IDE...'}
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
    const isTimerUrgent = timerRemaining !== null && timerRemaining <= 30;

    return (
        <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#020617', color: '#f8fafc', fontFamily: 'sans-serif' }}>
            {/* TOP HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🐛 Code Repair IDE — {blockData?.title || 'Challenge'}
                    </div>

                    {/* ATTEMPT COUNTER BADGE */}
                    <span style={{
                        fontSize: '0.72rem',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        color: '#94a3b8',
                        padding: '3px 8px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        textTransform: 'uppercase'
                    }}>
                        <History size={12} /> Attempt #{attemptCount + (hasFailedPreviousAttempt || isSubmitted || evalError ? 0 : 1)}
                    </span>

                    {/* COUNTDOWN TIMER BADGE */}
                    {timerRemaining !== null && (
                        <span style={{
                            fontSize: '0.75rem',
                            background: (isTimeExpired || hasFailedPreviousAttempt) ? (isSubmitted ? '#052e16' : '#7f1d1d') : isTimerUrgent ? '#7f1d1d' : '#78350f',
                            border: `1px solid ${(isTimeExpired || hasFailedPreviousAttempt) ? (isSubmitted ? '#166534' : '#f87171') : isTimerUrgent ? '#f87171' : '#f59e0b'}`,
                            color: (isTimeExpired || hasFailedPreviousAttempt) ? (isSubmitted ? '#4ade80' : '#fca5a5') : isTimerUrgent ? '#fca5a5' : '#fcd34d',
                            padding: '3px 10px',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            textTransform: 'uppercase'
                        }}>
                            <Timer size={13} />
                            {!isEditorReady
                                ? 'READYING TIMER...'
                                : (isTimeExpired || hasFailedPreviousAttempt)
                                    ? (isSubmitted ? 'PASSED & VERIFIED' : 'FAILED / TIMEOUT')
                                    : `${Math.floor(timerRemaining / 60)}:${String(timerRemaining % 60).padStart(2, '0')}`}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={handleResetCode}
                        style={{ background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <RotateCcw size={13} /> Reset Starter Code
                    </button>

                    {hasFailedPreviousAttempt ? (
                        <button
                            type="button"
                            onClick={handleRetakeQuiz}
                            style={{ background: '#7c3aed', border: 'none', color: 'white', padding: '6px 16px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}
                        >
                            <RefreshCw size={14} /> Retake Assessment
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSubmitSolution}
                            disabled={isTimeExpired || isSubmitted}
                            style={{
                                background: isSubmitted ? '#15803d' : isTimeExpired ? '#334155' : '#0284c7',
                                border: 'none',
                                color: 'white',
                                padding: '6px 16px',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                cursor: (isTimeExpired || isSubmitted) ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                textTransform: 'uppercase',
                                opacity: (isTimeExpired || isSubmitted) ? 0.8 : 1
                            }}
                        >
                            {isSubmitted ? <CheckCircle2 size={14} /> : <Play size={14} />}
                            {isSubmitted ? 'Passed & Verified' : 'Submit & Verify Fix'}
                        </button>
                    )}
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

                    {/* EVALUATION FEEDBACK & PERSISTED FAILURE NOTICE */}
                    {(evalError || hasFailedPreviousAttempt) && !isSubmitted && (
                        <div style={{ marginTop: '20px', background: '#450a0a', border: '1px solid #991b1b', color: '#fca5a5', padding: '14px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontWeight: 800 }}>
                                <XCircle size={16} style={{ flexShrink: 0 }} />
                                <span>Previous Attempt #{attemptCount} Failed</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', lineHeight: 1.4, color: '#fecdd3' }}>
                                {evalError || "Your code did not pass verification."} Editor inputs are locked. Please click below to start a new attempt.
                            </div>

                            <button
                                type="button"
                                onClick={handleRetakeQuiz}
                                style={{ marginTop: '8px', background: '#7c3aed', color: 'white', border: 'none', padding: '8px 14px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', alignSelf: 'flex-start' }}
                            >
                                <RefreshCw size={13} /> Retake Assessment
                            </button>
                        </div>
                    )}

                    {isSubmitted && (
                        <div style={{ marginTop: '20px', background: '#052e16', border: '1px solid #166534', color: '#4ade80', padding: '12px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                            <div>Solution verified! You can close this window and return to your lesson.</div>
                        </div>
                    )}
                </div>

                {/* MONACO CODE EDITOR (READ-ONLY WHEN FAILED OR PASSED) */}
                <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                    <Editor
                        height="100%"
                        defaultLanguage="javascript"
                        theme="vs-dark"
                        value={code}
                        onMount={() => setIsEditorReady(true)}
                        onChange={(val) => {
                            if (!isTimeExpired && !hasFailedPreviousAttempt && !isSubmitted) {
                                setCode(val || '');
                                if (evalError) setEvalError(null);
                            }
                        }}
                        options={{
                            readOnly: isTimeExpired || hasFailedPreviousAttempt || isSubmitted,
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