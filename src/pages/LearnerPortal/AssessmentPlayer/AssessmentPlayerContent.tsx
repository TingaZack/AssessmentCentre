// src/components/views/AssessmentPlayer/AssessmentPlayerContent.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    ArrowLeft, Save, CheckCircle, Info, AlertCircle, Clock,
    BookOpen, Scale, UserCheck, Timer, AlertTriangle,
    ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
    RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
    Menu, FileArchive, Loader2, Sigma
} from 'lucide-react';
import { ToastContainer } from '../../../components/common/Toast/Toast';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import './AssessmentPlayer.css';
import { createPortal } from 'react-dom';
import { UploadProgress } from '../../../components/common/UploadProgress';
import { UrlPreview } from '../../../components/common/UrlPreview';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { FilePreview } from '../../FacilitatorDashboard/SubmissionReview/SubmissionReview/SubmissionReviewPreviews';
import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';
import { getFunctions, httpsCallable } from 'firebase/functions';

// 🚀 Math Support Configuration
import katex from "katex";
import "katex/dist/katex.min.css";
import "mathlive";

(window as any).katex = katex;

const cleanRichText = (html?: string) => html ? html.replace(/&nbsp;/g, ' ') : '';
const extractPlainText = (htmlString?: string) => {
    if (!htmlString) return '';
    const tmp = document.createElement("DIV");
    tmp.innerHTML = htmlString;
    return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
};
const getSafeDate = (ds: string) => {
    if (!ds) return 'recently';
    const d = new Date(ds);
    return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const formatTime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
};

// 🚀 Quill configuration updated with formula tools
const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['formula'], ['clean']] };
const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet', 'formula'];

const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
            <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
            <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
        </svg>
    );
};

const CollapsibleEvidenceWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [needsCollapse, setNeedsCollapse] = useState(false);
    useEffect(() => { if (contentRef.current) setNeedsCollapse(contentRef.current.scrollHeight > 160); }, [children]);
    const showFold = needsCollapse && !isExpanded;
    return (
        <div style={{ position: 'relative', marginTop: '8px' }}>
            <div ref={contentRef} style={{ maxHeight: isExpanded ? 'none' : '160px', overflow: 'hidden', transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <div style={{ padding: '12px' }}>{children}</div>
                {showFold && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(to top, #f8fafc, transparent)', pointerEvents: 'none' }} />}
            </div>
            {needsCollapse && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
                    <button type="button" onClick={() => setIsExpanded(!isExpanded)} style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#4f46e5', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
                        {isExpanded ? 'Collapse Evidence View ↑' : 'Expand Evidence View ↓'}
                    </button>
                </div>
            )}
        </div>
    );
};

const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    useEffect(() => { const s = document.createElement('style'); s.innerHTML = 'body,html{overflow:hidden!important}'; document.head.appendChild(s); return () => { document.head.removeChild(s); }; }, []);
    return createPortal(
        <div className="ap-modal">
            <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
                <div className="ap-modal-header ap-modal-header--danger">
                    <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
                    <div><h2 className="ap-modal-title">Lodge Formal Appeal</h2><p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p></div>
                </div>
                <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
                    <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
                    <div className="ap-form-group">
                        <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
                        <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
                    </div>
                    <div className="ap-modal-footer">
                        <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
                        <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

// 🚀 Auto-Render Math Component to translate static strings and hide dollar signs
const MathRenderedContent: React.FC<{ html?: string; className?: string; style?: React.CSSProperties }> = ({ html, className, style }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const uniqueClass = useMemo(() => `math-render-${Math.random().toString(36).slice(2, 7)}`, []);

    useEffect(() => {
        if (!containerRef.current || !html) return;

        // @ts-ignore
        import('katex/dist/contrib/auto-render.mjs').then((module) => {
            if (containerRef.current) {
                module.default(containerRef.current, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true }
                    ],
                    throwOnError: false
                });
            }
        }).catch(err => console.error("Failed to load KaTeX auto-render:", err));
    }, [html]);

    return (
        <div style={{ display: 'inline-block', width: style?.width }}>
            {style?.color && (
                <style>{`.${uniqueClass}, .${uniqueClass} * { color: ${style.color} !important; }`}</style>
            )}
            <div
                ref={containerRef}
                className={`quill-read-only-content ${uniqueClass} ${className || ''}`}
                style={style}
                dangerouslySetInnerHTML={{ __html: cleanRichText(html) }}
            />
        </div>
    );
};

// 🚀 RE-ENGINEERED: Safely binds React state to MathLive with your precise undo-friendly placeholder fix
const MathpadEditor: React.FC<{ value: string; onChange: (val: string) => void; readOnly: boolean }> = ({ value, onChange, readOnly }) => {
    const mfRef = useRef<any>(null);
    const lastBroadcastRef = useRef('');

    // Strips out legacy HTML wrappers from database if block was previously written text
    const cleanValue = useMemo(() => {
        let v = value || '';
        if (v.includes('<p>') || v.includes('&nbsp;')) {
            v = v.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
        }
        return v;
    }, [value]);

    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;
        if (cleanValue !== mf.value && cleanValue !== lastBroadcastRef.current) {
            mf.value = cleanValue;
        }
        mf.readOnly = readOnly;
    }, [cleanValue, readOnly]);

    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;
        const handleInput = () => {
            lastBroadcastRef.current = mf.value;
            onChange(mf.value);
        };
        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [onChange]);

    // 🚀 FIXED ARCHITECTURE: Single-hook beforeinput loop with your custom navigation template rules
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;

        const triggerNewline = () => {
            const hasMultilineEnv = mf.value.includes('\\begin{aligned}') ||
                mf.value.includes('\\begin{matrix}') ||
                mf.value.includes('\\begin{array}') ||
                mf.value.includes('\\begin{cases}') ||
                mf.value.includes('\\begin{gathered}');
            if (hasMultilineEnv) {
                // Instantly opens up a clean row using native engine indexing
                mf.executeCommand('addRowAfter');
            } else {
                // 🚀 Your Fix: Capture selection via #0, strip out #?, and force structural end focus
                mf.executeCommand(['insert', '\\begin{aligned}#0\\\\\\end{aligned}']);
                mf.executeCommand('moveToMathfieldEnd');
            }
        };

        const handleBeforeInput = (e: any) => {
            if (e.inputType === 'insertLineBreak') {
                e.preventDefault();
                triggerNewline();
            }
        };

        mf.addEventListener('beforeinput', handleBeforeInput);
        return () => mf.removeEventListener('beforeinput', handleBeforeInput);
    }, [readOnly]);

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            {/* Clean style reset to strip native structural bounding boxes if environments overlap */}
            <style>{`
                math-field::part(container) .ML__matrix,
                math-field::part(container) .ML__array,
                math-field::part(container) .ML__aligned,
                math-field::part(container) .ML__matrix-row {
                    border: none !important;
                    outline: none !important;
                }
            `}</style>

            {React.createElement('math-field', {
                ref: mfRef,
                style: {
                    width: '100%', fontSize: '1.4rem', padding: '12px',
                    border: '1px solid #fbcfe8', borderRadius: '0 0 6px 6px',
                    borderTop: 'none', background: readOnly ? '#f8fafc' : '#fff',
                    outline: 'none', color: '#0f172a', display: 'block',
                    minHeight: '140px', height: 'auto'
                }
            })}
        </div>
    );
};

export interface AssessmentPlayerContentProps {
    user: any;
    assessment: any;
    submission: any;
    answers: Record<string, any>;
    learnerProfile: any;
    learnerEnrollment: any;
    assessorProfile: any;
    moderatorProfile: any;
    facilitatorProfile: any;
    employers: any[];
    staff: any[];
    moduleLogs: any[];
    approvedLogs: any[];
    logsLoading: boolean;
    saving: boolean;
    setSaving: (v: boolean) => void;
    uploadProgress: Record<string, number>;
    setUploadProgress: (fn: (prev: any) => any) => void;
    activeTabs: Record<string, string>;
    setActiveTabs: (tabs: Record<string, string>) => void;
    timeLeft: number | null;
    isGloballyLocked: boolean;
    isAwaitingSignoff: boolean;
    isPracticalModule: boolean;
    isWorkplaceModule: boolean;
    isRemediation: boolean;
    isAppealUpheld: boolean;
    isFacDone: boolean;
    isAssDone: boolean;
    isModDone: boolean;
    isSubmitted: boolean;
    isMissed: boolean;
    showGate: boolean;
    showLeaveWarning: boolean;
    setShowLeaveWarning: (v: boolean) => void;
    showSubmitConfirm: boolean;
    setShowSubmitConfirm: (v: boolean) => void;
    showAppealModal: boolean;
    setShowAppealModal: (v: boolean) => void;
    declarationChecked: boolean;
    setDeclarationChecked: (v: boolean) => void;
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (v: boolean) => void;
    willBeProctored: boolean;
    savedFacRole: string | null;
    grandTotalAwarded: number;
    grandTotalMax: number;
    grandTotalPct: number;
    sectionTotals: Record<string, { total: number; awarded: number }>;
    outcome: { label: string; color: string; subtext: string; score?: number; percentage?: number; isCompetent: boolean } | null;
    safeNavigateBack: () => void;
    handleAnswerChange: (blockId: string, value: any) => void;
    handleTaskAnswerChange: (blockId: string, field: string, value: any) => void;
    handleNestedAnswerChange: (blockId: string, nestedKey: string, field: string, value: any) => void;
    handleFileUpload: (file: File, blockId: string, nestedKey?: string) => void;
    triggerSubmitConfirm: () => void;
    executeSubmit: () => void;
    executeAppeal: (reason: string) => void;
    preventCopyPasteAndDrop: (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent) => void;
    getBlockGrading: (blockId: string) => any;
    isBlockVerified: (blockId: string) => boolean;
    getSecureNow: () => number;
    toast: any;

    // 🚀 Sandbox Snapshot props
    saveCodeSnapshot: (blockId: string, snapshot: string | Record<string, string> | undefined, dependencies?: Record<string, string>, immediate?: boolean) => void;
    codeSnapshots: Record<string, any>;
}

export const AssessmentPlayerContent: React.FC<AssessmentPlayerContentProps> = (props) => {
    const {
        user, assessment, submission, answers, learnerProfile, learnerEnrollment, assessorProfile,
        moderatorProfile, facilitatorProfile, employers, staff, approvedLogs, logsLoading, saving,
        uploadProgress, setUploadProgress, activeTabs, setActiveTabs, timeLeft, isGloballyLocked,
        isAwaitingSignoff, isPracticalModule, isWorkplaceModule, isFacDone, isAssDone, isModDone,
        isSubmitted, showLeaveWarning, setShowLeaveWarning, showSubmitConfirm, setShowSubmitConfirm,
        showAppealModal, setShowAppealModal, declarationChecked, setDeclarationChecked, isMobileMenuOpen,
        setIsMobileMenuOpen, willBeProctored, savedFacRole, grandTotalAwarded, grandTotalMax,
        grandTotalPct, sectionTotals, outcome, safeNavigateBack, handleAnswerChange, handleTaskAnswerChange,
        handleNestedAnswerChange, handleFileUpload, saveCodeSnapshot, codeSnapshots, triggerSubmitConfirm, executeSubmit, executeAppeal,
        preventCopyPasteAndDrop, getBlockGrading, isBlockVerified, toast
    } = props;

    const [isFetchingSnapshots, setIsFetchingSnapshots] = useState(true);
    const [resolvedSnapshots, setResolvedSnapshots] = useState<Record<string, any>>({});

    const answersRef = useRef(answers);
    useEffect(() => { answersRef.current = answers; }, [answers]);

    const codeBlockStorageSignature = useMemo(() => {
        if (!assessment?.blocks) return '';
        return assessment.blocks
            .filter((b: any) => b.type === 'code_sandbox')
            .map((b: any) => `${b.id}:${answers[b.id]?.storagePath || ''}`)
            .join('|');
    }, [assessment?.blocks, answers]);

    useEffect(() => {
        let cancelled = false;

        const fetchSnapshots = async () => {
            if (!submission?.id || !assessment?.blocks) {
                if (!cancelled) setIsFetchingSnapshots(false);
                return;
            }

            const codeBlocks = assessment.blocks.filter((b: any) => b.type === 'code_sandbox');
            if (codeBlocks.length === 0) {
                if (!cancelled) setIsFetchingSnapshots(false);
                return;
            }

            const newSnaps: Record<string, any> = {};
            const functions = getFunctions();
            const getFn = httpsCallable(functions, 'getCodeSnapshot');
            const currentAnswers = answersRef.current;

            await Promise.all(codeBlocks.map(async (block: any) => {
                const entry = currentAnswers[block.id];
                if (entry?.storagePath) {
                    try {
                        const res = await getFn({ submissionId: submission.id, blockId: block.id });
                        newSnaps[block.id] = (res.data as any).files;
                    } catch (err) {
                        console.error(`Failed to load snapshot for ${block.id}:`, err);
                    }
                } else if (entry?.snapshot) {
                    newSnaps[block.id] = entry.snapshot;
                }
            }));

            if (!cancelled) {
                setResolvedSnapshots(prev => ({ ...prev, ...newSnaps }));
                setIsFetchingSnapshots(false);
            }
        };
        fetchSnapshots();
        return () => { cancelled = true; };
    }, [submission?.id, codeBlockStorageSignature]);

    const MAX_FILE_SIZE_MB = 10;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    const handleFileValidationAndUpload = (e: React.ChangeEvent<HTMLInputElement>, blockId: string, nestedKey?: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_FILE_SIZE_BYTES) {
            toast.error(`File "${file.name}" is too large. Maximum size allowed is ${MAX_FILE_SIZE_MB}MB.`);
            e.target.value = ''; return;
        }
        handleFileUpload(file, blockId, nestedKey);
    };

    const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
        if (block.type === 'section') {
            acc.push({ type: 'section', label: block.title, id: block.id });
        } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad'].includes(block.type)) {
            const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
            acc.push({ type: 'q', label: cleanLabel, id: block.id });
        }
        return acc;
    }, []) || [];

    const displayStatus = submission.status.replace('_', ' ');

    const canEditTask = !isGloballyLocked;
    const canEditChecklist = !isGloballyLocked || isAwaitingSignoff;
    const canEditLogbook = !isGloballyLocked;
    const canEditWorkplace = !isGloballyLocked || isAwaitingSignoff;
    const canEditCode = !isGloballyLocked;

    const renderBlockImage = (block: any) => {
        if (!block.imageUrl) return null;
        return (
            <div style={{ margin: '1rem 0', textAlign: 'center' }}>
                <img src={block.imageUrl} alt={block.imageCaption || "Assessment attachment"} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }} />
                {block.imageCaption && <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>{block.imageCaption}</p>}
            </div>
        );
    };

    let qNum = 0;

    return (
        <ProctoringWrapper assessmentId={assessment.id} learnerId={submission.authUid} isProctored={willBeProctored}>
            <div className="ap-player ap-animate">
                <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
                {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

                {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={safeNavigateBack} onCancel={() => setShowLeaveWarning(false)} />}
                {showSubmitConfirm && <ConfirmModal title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"} message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."} confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"} cancelText="Go Back" onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}
                {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

                <div className="ap-player-topbar no-print">
                    <div className="ap-player-topbar__left">
                        <button className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
                        <button className="ap-player-topbar__back" onClick={safeNavigateBack}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
                        <div className="ap-player-topbar__separator ap-hide-mobile" />
                        <h1 className="ap-player-topbar__title">
                            <MathRenderedContent html={assessment.title} style={{ color: '#ffffff', display: 'inline-block' }} />
                            {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
                        </h1>
                    </div>
                    <div className="ap-player-topbar__right">
                        {assessment?.isOpenBook && assessment?.referenceManualUrl && <button className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}><FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span></button>}
                        {isGloballyLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
                        {!isGloballyLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
                        {isGloballyLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}><Timer size={14} /> {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken</div>}
                        {!isGloballyLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
                        <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
                        <span className={`ap-status-badge${isGloballyLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
                    </div>
                </div>

                <div className={`ap-player-body${isGloballyLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
                    <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
                        <button className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
                        <div className="ap-sidebar__meta-block">
                            <div className="ap-sidebar__meta-title">
                                <MathRenderedContent html={assessment.title} style={{ color: '#ffffff', display: 'inline-block' }} />
                            </div>
                            {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
                            <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
                            {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
                            {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
                        </div>

                        {!isWorkplaceModule && isFacDone && (
                            <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
                                <div className="ap-score-card__stripe" aria-hidden="true" />
                                <div className="ap-score-card__state">{isModDone ? <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</> : <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>}</div>
                                <div className="ap-score-card__body">
                                    <div className="ap-score-card__ring-wrap">
                                        <ProgressRing progress={grandTotalPct} size={72} strokeWidth={5} color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'} />
                                        <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>{grandTotalPct}%</span>
                                    </div>
                                    <div className="ap-score-card__divider" aria-hidden="true" />
                                    <div className="ap-score-card__fraction">
                                        <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
                                        <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
                                        <span className="ap-score-card__pass-note">Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)</span>
                                    </div>
                                </div>
                                {isModDone && outcome && <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>{outcome.isCompetent ? <><CheckCircle size={13} /> Competent (C)</> : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}</div>}
                            </div>
                        )}

                        {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
                            <>
                                <div className="ap-sidebar__label">Status Tracking</div>
                                <div className="ap-sidebar__status-box">
                                    {isAssDone && outcome ? (
                                        <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
                                            <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
                                            {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
                                            {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
                                            <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
                                        </div>
                                    ) : (
                                        <div className="ap-sidebar__awaiting">
                                            <Clock size={20} color="rgba(255,255,255,0.25)" />
                                            <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
                                            <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
                                        </div>
                                    )}
                                    {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
                                    {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
                                    {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

                                    <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? (savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator') : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div></div>
                                    <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
                                    <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>
                                </div>
                            </>
                        )}

                        <div className="ap-sidebar__label">Workbook Contents</div>
                        <div className="ap-sidebar__nav">
                            {navItems.map((item: any) =>
                                item.type === 'section'
                                    ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
                                    : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
                            )}
                        </div>
                    </nav>

                    <div className="ap-player-content print-pane">
                        <div className="ap-blocks">
                            {assessment.blocks?.map((block: any) => {

                                if (block.type === 'section') {
                                    const totals = sectionTotals[block.id];
                                    return (
                                        <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
                                            <span>{block.title}</span>
                                            {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
                                            {block.content && <MathRenderedContent html={block.content} className="ap-block-section__content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} />}
                                            {renderBlockImage(block)}
                                        </div>
                                    );
                                }

                                if (block.type === 'info') return (
                                    <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
                                        <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
                                        <MathRenderedContent html={block.content} className="ap-block-info__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} />
                                        {renderBlockImage(block)}
                                    </div>
                                );

                                if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad'].includes(block.type)) {
                                    qNum++;
                                    const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
                                    const learnerAns = answers[block.id];
                                    let inkColor = '#64748b';
                                    if (isModDone) inkColor = 'var(--mlab-green)';
                                    else if (isAssDone) inkColor = 'var(--mlab-red)';
                                    else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

                                    const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
                                    const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

                                    const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'code_sandbox' ? 'ap-block-type-chip--code' : block.type === 'mathpad' ? 'ap-block-type-chip--math' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
                                    const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : block.type === 'code_sandbox' ? 'IDE' : block.type === 'mathpad' ? 'MATH' : `Q${qNum}.`;

                                    const isSectionVerified = isBlockVerified(block.id);
                                    const isUploadLocked = isAwaitingSignoff ? false : (isGloballyLocked || isSectionVerified);

                                    return (
                                        <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isUploadLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
                                            <div className="ap-block-question__header">
                                                <div className="ap-block-question__text-wrap">
                                                    <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                                        <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

                                                        {block.type === 'qcto_workplace' ? (
                                                            <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} />
                                                        ) : block.type === 'code_sandbox' ? (
                                                            <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
                                                                {block.title && <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>{block.title}</h3>}
                                                                {block.question && <MathRenderedContent html={block.question} style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap', color: '#334155' }} />}
                                                            </div>
                                                        ) : block.question ? (
                                                            <MathRenderedContent html={block.question} style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} />
                                                        ) : block.title ? (
                                                            <MathRenderedContent html={block.title} style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} />
                                                        ) : null}
                                                    </span>
                                                    <div className="ap-grade-indicators">
                                                        {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
                                                        {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
                                                        {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
                                                    </div>
                                                </div>
                                                <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
                                            </div>

                                            <div className="ap-block-question__body">
                                                {renderBlockImage(block)}

                                                {/* MCQ */}
                                                {block.type === 'mcq' && (
                                                    <div className="ap-mcq-options">
                                                        {block.options?.map((opt: string, i: number) => {
                                                            const selected = learnerAns === i;
                                                            return (
                                                                <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isUploadLocked || !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
                                                                    <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isUploadLocked || !canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
                                                                    <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
                                                                    <span className="ap-mcq-label__text">{opt}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* TEXT */}
                                                {block.type === 'text' && (
                                                    <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
                                                        {isGloballyLocked && !isAwaitingSignoff ? (
                                                            <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
                                                        ) : (
                                                            <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
                                                        )}
                                                    </div>
                                                )}

                                                {/* 🚀 MATHPAD */}
                                                {block.type === 'mathpad' && (
                                                    <div onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
                                                        <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', padding: '8px 12px', borderRadius: '6px 6px 0 0', borderBottom: 'none', color: '#be185d', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                                                            <Sigma size={14} /> Mathematical Workspace (Click inside to open Virtual Keyboard)
                                                        </div>
                                                        <MathpadEditor
                                                            value={learnerAns || ''}
                                                            onChange={(val) => handleAnswerChange(block.id, val)}
                                                            readOnly={isUploadLocked || !canEditTask}
                                                        />
                                                    </div>
                                                )}

                                                {/* TASK */}
                                                {block.type === 'task' && (() => {
                                                    const taskTabs = [{ id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text }, { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl }, { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url }, { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl }, { id: 'code', icon: <Code size={13} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code }].filter(t => t.allowed);
                                                    const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
                                                    const progress = uploadProgress[block.id];
                                                    return (
                                                        <div className="ap-evidence-container">
                                                            {!isSectionVerified && !isGloballyLocked && <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}><Info size={14} /> You may attach your evidence now. This section will lock automatically once your Facilitator/Mentor verifies it.</div>}
                                                            {isSectionVerified && !isGloballyLocked && !isAwaitingSignoff && <div className="ap-checklist__lock-notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}><Lock size={14} color="#166534" />Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.</div>}
                                                            <div className="ap-tab-bar no-print">{taskTabs.map(t => <button key={t.id} className={`ap-tab${activeTabId === t.id ? ' ap-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={11} className="ap-tab__done" />}</button>)}</div>
                                                            <div className="ap-tab-panel">
                                                                {activeTabId === 'text' && <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns?.text) || '<em>No answer provided.</em>' }} /> : <ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" />}</div>}
                                                                {activeTabId === 'audio' && (learnerAns?.audioUrl ? <audio controls src={learnerAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{isUploadLocked || !canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
                                                                {activeTabId === 'url' && <div>{!isUploadLocked && canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{learnerAns?.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={learnerAns.url} /> : <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}</div>}
                                                                {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : learnerAns?.uploadUrl ? <FilePreview url={learnerAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : <div className="ap-upload-empty">{isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes || 'Any'}, Max {MAX_FILE_SIZE_MB}MB)</p><input type="file" onChange={e => handleFileValidationAndUpload(e, block.id)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} /></>}</div>)}
                                                                {activeTabId === 'code' && <textarea className="ap-code-textarea" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="Paste your code here…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* CHECKLIST */}
                                                {block.type === 'checklist' && (
                                                    <div className="ap-checklist">
                                                        <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item.</p>
                                                        {block.criteria?.map((crit: string, i: number) => {
                                                            const res = criteriaResults?.[i] || {};
                                                            return (
                                                                <div key={i} className="ap-checklist__item">
                                                                    <p className="ap-checklist__item-title">{i + 1}. {crit}</p>
                                                                    <div className="ap-checklist__assessor-row">
                                                                        {res.status ? (
                                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                                <div><span className={`ap-checklist__status-chip ${res.status === 'C' ? 'ap-checklist__status-chip--c' : 'ap-checklist__status-chip--nyc'}`}>{savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')}</span></div>
                                                                                {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
                                                                            </div>
                                                                        ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* LOGBOOK */}
                                                {block.type === 'logbook' && (
                                                    <div className="ap-logbook">
                                                        <MathRenderedContent html={block.content} className="ap-logbook__desc" />
                                                        <table className="ap-logbook__table">
                                                            <thead className="ap-logbook__thead"><tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{!isUploadLocked && canEditLogbook && <th style={{ width: '40px' }}></th>}</tr></thead>
                                                            <tbody>
                                                                {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
                                                                    <tr key={i} className="ap-logbook__tbody">
                                                                        <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td ap-logbook__task-cell"><div className={`ap-quill-wrapper ap-quill-wrapper--logbook${isUploadLocked || !canEditLogbook ? ' locked' : ''}`}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} /> : <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={isUploadLocked || !canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />}</div></td>
                                                                        <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
                                                                        {!isUploadLocked && canEditLogbook && <td className="ap-logbook__td"><button className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
                                                                    </tr>
                                                                ))}
                                                                {!isUploadLocked && canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}

                                                {/* QCTO WORKPLACE */}
                                                {block.type === 'qcto_workplace' && (
                                                    <div className="ap-workplace">
                                                        <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }} />
                                                        {block.workActivities?.map((wa: any) => {
                                                            const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
                                                            return (
                                                                <div key={wa.id} className="ap-workplace__activity">
                                                                    <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>
                                                                    <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
                                                                        <input type="checkbox" disabled={isUploadLocked || !canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
                                                                        <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
                                                                    </label>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* LIVE IDE SANDBOX */}
                                                {block.type === 'code_sandbox' && (
                                                    isFetchingSnapshots ? (
                                                        <div className="ap-spinner-container" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                                            <Loader2 size={24} className="ap-spin" style={{ margin: '0 auto 10px auto' }} />
                                                            <p>Loading code environment...</p>
                                                        </div>
                                                    ) : (
                                                        <CodeSandboxPlayer
                                                            block={block}
                                                            learnerAns={{
                                                                ...(learnerAns || {}),
                                                                snapshot: resolvedSnapshots[block.id] || codeSnapshots[block.id] || learnerAns?.snapshot
                                                            }}
                                                            readOnly={isUploadLocked || !canEditCode}
                                                            onChange={(val) => saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
                                                        />
                                                    )
                                                )}

                                                {/* Per-question feedback */}
                                                {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
                                                {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
                                                {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })}
                        </div>

                        {/* FOOTER */}
                        {isAwaitingSignoff ? (
                            <div className="ap-footer ap-footer--signoff no-print">
                                <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
                                <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
                                <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
                                    <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
                                    <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
                                </label>
                                <div className="ap-footer-actions">
                                    <button className="ap-btn ap-btn--amber" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}><Save size={14} /> Acknowledge & Submit for Grading</button>
                                </div>
                            </div>
                        ) : !isGloballyLocked ? (
                            <div className="ap-footer no-print">
                                <h3 className="ap-footer__title">Final Submission</h3>
                                <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
                                <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
                                    <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
                                    <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
                                </label>
                                <div className="ap-footer-actions">
                                    <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}</span>
                                    <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}><Save size={14} /> Submit for Grading</button>
                                </div>
                            </div>
                        ) : (
                            <div className="ap-footer ap-footer--locked no-print">
                                <div className="ap-footer--locked__icon-wrap">
                                    {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
                                </div>
                                <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
                                <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. It is currently under review by our faculty.</p>
                                <button className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={safeNavigateBack}><ArrowLeft size={14} /> Return to Portfolio</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </ProctoringWrapper>
    );
};

export default AssessmentPlayerContent;


// import React, { useState, useMemo, useEffect, useRef } from 'react';
// import {
//     ArrowLeft, Save, CheckCircle, Info, AlertCircle, Clock,
//     BookOpen, Scale, UserCheck, Timer, AlertTriangle,
//     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
//     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
//     Menu, FileArchive, Loader2
// } from 'lucide-react';
// import { ToastContainer } from '../../../components/common/Toast/Toast';
// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';
// import './AssessmentPlayer.css';
// import { createPortal } from 'react-dom';
// import { UploadProgress } from '../../../components/common/UploadProgress';
// import { UrlPreview } from '../../../components/common/UrlPreview';
// import { ConfirmModal } from '../../../components/common/ConfirmModal';
// import { FilePreview } from '../../FacilitatorDashboard/SubmissionReview/SubmissionReview/SubmissionReviewPreviews';
// import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
// import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';

// import { getFunctions, httpsCallable } from 'firebase/functions';

// const cleanRichText = (html?: string) => html ? html.replace(/&nbsp;/g, ' ') : '';
// const extractPlainText = (htmlString?: string) => {
//     if (!htmlString) return '';
//     const tmp = document.createElement("DIV");
//     tmp.innerHTML = htmlString;
//     return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
// };
// const getSafeDate = (ds: string) => {
//     if (!ds) return 'recently';
//     const d = new Date(ds);
//     return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// };
// const formatTime = (s: number) => {
//     const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
//     return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
// };

// const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] };
// const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
//     const radius = (size - strokeWidth) / 2;
//     const circumference = 2 * Math.PI * radius;
//     const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;
//     return (
//         <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
//             <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
//             <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
//         </svg>
//     );
// };

// const CollapsibleEvidenceWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
//     const [isExpanded, setIsExpanded] = useState(false);
//     const contentRef = useRef<HTMLDivElement>(null);
//     const [needsCollapse, setNeedsCollapse] = useState(false);
//     useEffect(() => { if (contentRef.current) setNeedsCollapse(contentRef.current.scrollHeight > 160); }, [children]);
//     const showFold = needsCollapse && !isExpanded;
//     return (
//         <div style={{ position: 'relative', marginTop: '8px' }}>
//             <div ref={contentRef} style={{ maxHeight: isExpanded ? 'none' : '160px', overflow: 'hidden', transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
//                 <div style={{ padding: '12px' }}>{children}</div>
//                 {showFold && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(to top, #f8fafc, transparent)', pointerEvents: 'none' }} />}
//             </div>
//             {needsCollapse && (
//                 <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
//                     <button type="button" onClick={() => setIsExpanded(!isExpanded)} style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#4f46e5', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
//                         {isExpanded ? 'Collapse Evidence View ↑' : 'Expand Evidence View ↓'}
//                     </button>
//                 </div>
//             )}
//         </div>
//     );
// };

// const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
//     const [reason, setReason] = useState('');
//     useEffect(() => { const s = document.createElement('style'); s.innerHTML = 'body,html{overflow:hidden!important}'; document.head.appendChild(s); return () => { document.head.removeChild(s); }; }, []);
//     return createPortal(
//         <div className="ap-modal">
//             <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
//                 <div className="ap-modal-header ap-modal-header--danger">
//                     <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
//                     <div><h2 className="ap-modal-title">Lodge Formal Appeal</h2><p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p></div>
//                 </div>
//                 <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
//                     <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
//                     <div className="ap-form-group">
//                         <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
//                         <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
//                     </div>
//                     <div className="ap-modal-footer">
//                         <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
//                         <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
//                     </div>
//                 </form>
//             </div>
//         </div>,
//         document.body
//     );
// };

// export interface AssessmentPlayerContentProps {
//     user: any;
//     assessment: any;
//     submission: any;
//     answers: Record<string, any>;
//     learnerProfile: any;
//     learnerEnrollment: any;
//     assessorProfile: any;
//     moderatorProfile: any;
//     facilitatorProfile: any;
//     employers: any[];
//     staff: any[];
//     moduleLogs: any[];
//     approvedLogs: any[];
//     logsLoading: boolean;
//     saving: boolean;
//     setSaving: (v: boolean) => void;
//     uploadProgress: Record<string, number>;
//     setUploadProgress: (fn: (prev: any) => any) => void;
//     activeTabs: Record<string, string>;
//     setActiveTabs: (tabs: Record<string, string>) => void;
//     timeLeft: number | null;
//     isGloballyLocked: boolean;
//     isAwaitingSignoff: boolean;
//     isPracticalModule: boolean;
//     isWorkplaceModule: boolean;
//     isRemediation: boolean;
//     isAppealUpheld: boolean;
//     isFacDone: boolean;
//     isAssDone: boolean;
//     isModDone: boolean;
//     isSubmitted: boolean;
//     isMissed: boolean;
//     showGate: boolean;
//     showLeaveWarning: boolean;
//     setShowLeaveWarning: (v: boolean) => void;
//     showSubmitConfirm: boolean;
//     setShowSubmitConfirm: (v: boolean) => void;
//     showAppealModal: boolean;
//     setShowAppealModal: (v: boolean) => void;
//     declarationChecked: boolean;
//     setDeclarationChecked: (v: boolean) => void;
//     isMobileMenuOpen: boolean;
//     setIsMobileMenuOpen: (v: boolean) => void;
//     willBeProctored: boolean;
//     savedFacRole: string | null;
//     grandTotalAwarded: number;
//     grandTotalMax: number;
//     grandTotalPct: number;
//     sectionTotals: Record<string, { total: number; awarded: number }>;
//     outcome: { label: string; color: string; subtext: string; score?: number; percentage?: number; isCompetent: boolean } | null;
//     safeNavigateBack: () => void;
//     handleAnswerChange: (blockId: string, value: any) => void;
//     handleTaskAnswerChange: (blockId: string, field: string, value: any) => void;
//     handleNestedAnswerChange: (blockId: string, nestedKey: string, field: string, value: any) => void;
//     handleFileUpload: (file: File, blockId: string, nestedKey?: string) => void;
//     triggerSubmitConfirm: () => void;
//     executeSubmit: () => void;
//     executeAppeal: (reason: string) => void;
//     preventCopyPasteAndDrop: (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent) => void;
//     getBlockGrading: (blockId: string) => any;
//     isBlockVerified: (blockId: string) => boolean;
//     getSecureNow: () => number;
//     toast: any;

//     // 🚀 CLOUD STORAGE PROPS
//     saveCodeSnapshot: (blockId: string, files: Record<string, string>, dependencies?: Record<string, string>, immediate?: boolean) => void;
//     codeSnapshots: Record<string, any>;
// }

// export const AssessmentPlayerContent: React.FC<AssessmentPlayerContentProps> = (props) => {
//     const {
//         user, assessment, submission, answers, learnerProfile, learnerEnrollment, assessorProfile,
//         moderatorProfile, facilitatorProfile, employers, staff, approvedLogs, logsLoading, saving,
//         uploadProgress, setUploadProgress, activeTabs, setActiveTabs, timeLeft, isGloballyLocked,
//         isAwaitingSignoff, isPracticalModule, isWorkplaceModule, isFacDone, isAssDone, isModDone,
//         isSubmitted, showLeaveWarning, setShowLeaveWarning, showSubmitConfirm, setShowSubmitConfirm,
//         showAppealModal, setShowAppealModal, declarationChecked, setDeclarationChecked, isMobileMenuOpen,
//         setIsMobileMenuOpen, willBeProctored, savedFacRole, grandTotalAwarded, grandTotalMax,
//         grandTotalPct, sectionTotals, outcome, safeNavigateBack, handleAnswerChange, handleTaskAnswerChange,
//         handleNestedAnswerChange, handleFileUpload, saveCodeSnapshot, codeSnapshots, triggerSubmitConfirm, executeSubmit, executeAppeal,
//         preventCopyPasteAndDrop, getBlockGrading, isBlockVerified, toast
//     } = props;

//     // 🚀 THE FIX: Store the fetched snapshots in actual state!
//     const [isFetchingSnapshots, setIsFetchingSnapshots] = useState(true);
//     const [resolvedSnapshots, setResolvedSnapshots] = useState<Record<string, any>>({});

//     // 🚀 THE FIX: Use a ref so the effect always has the latest answers without causing an infinite re-render loop
//     const answersRef = useRef(answers);
//     useEffect(() => { answersRef.current = answers; }, [answers]);

//     // 🚀 THE FIX: Only trigger the fetch effect if the storage path itself actually changes
//     const codeBlockStorageSignature = useMemo(() => {
//         if (!assessment?.blocks) return '';
//         return assessment.blocks
//             .filter((b: any) => b.type === 'code_sandbox')
//             .map((b: any) => `${b.id}:${answers[b.id]?.storagePath || ''}`)
//             .join('|');
//     }, [assessment?.blocks, answers]);

//     useEffect(() => {
//         let cancelled = false;

//         const fetchSnapshots = async () => {
//             if (!submission?.id || !assessment?.blocks) {
//                 if (!cancelled) setIsFetchingSnapshots(false);
//                 return;
//             }

//             const codeBlocks = assessment.blocks.filter((b: any) => b.type === 'code_sandbox');
//             if (codeBlocks.length === 0) {
//                 if (!cancelled) setIsFetchingSnapshots(false);
//                 return;
//             }

//             const newSnaps: Record<string, any> = {};
//             const functions = getFunctions();
//             const getFn = httpsCallable(functions, 'getCodeSnapshot');
//             const currentAnswers = answersRef.current;

//             await Promise.all(codeBlocks.map(async (block: any) => {
//                 const entry = currentAnswers[block.id];
//                 if (entry?.storagePath) {
//                     try {
//                         const res = await getFn({ submissionId: submission.id, blockId: block.id });
//                         newSnaps[block.id] = (res.data as any).files;
//                     } catch (err) {
//                         console.error(`Failed to load snapshot for ${block.id}:`, err);
//                     }
//                 } else if (entry?.snapshot) {
//                     newSnaps[block.id] = entry.snapshot;
//                 }
//             }));

//             if (!cancelled) {
//                 setResolvedSnapshots(prev => ({ ...prev, ...newSnaps }));
//                 setIsFetchingSnapshots(false);
//             }
//         };
//         fetchSnapshots();
//         return () => { cancelled = true; };
//     }, [submission?.id, codeBlockStorageSignature]);

//     const MAX_FILE_SIZE_MB = 10;
//     const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

//     const handleFileValidationAndUpload = (e: React.ChangeEvent<HTMLInputElement>, blockId: string, nestedKey?: string) => {
//         const file = e.target.files?.[0];
//         if (!file) return;
//         if (file.size > MAX_FILE_SIZE_BYTES) {
//             toast.error(`File "${file.name}" is too large. Maximum size allowed is ${MAX_FILE_SIZE_MB}MB.`);
//             e.target.value = ''; return;
//         }
//         handleFileUpload(file, blockId, nestedKey);
//     };

//     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
//         if (block.type === 'section') {
//             acc.push({ type: 'section', label: block.title, id: block.id });
//         } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox'].includes(block.type)) {
//             const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
//             acc.push({ type: 'q', label: cleanLabel, id: block.id });
//         }
//         return acc;
//     }, []) || [];

//     const displayStatus = submission.status.replace('_', ' ');

//     const canEditTask = !isGloballyLocked;
//     const canEditChecklist = !isGloballyLocked || isAwaitingSignoff;
//     const canEditLogbook = !isGloballyLocked;
//     const canEditWorkplace = !isGloballyLocked || isAwaitingSignoff;
//     const canEditCode = !isGloballyLocked;

//     const renderBlockImage = (block: any) => {
//         if (!block.imageUrl) return null;
//         return (
//             <div style={{ margin: '1rem 0', textAlign: 'center' }}>
//                 <img src={block.imageUrl} alt={block.imageCaption || "Assessment attachment"} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }} />
//                 {block.imageCaption && <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>{block.imageCaption}</p>}
//             </div>
//         );
//     };

//     let qNum = 0;

//     return (
//         <ProctoringWrapper assessmentId={assessment.id} learnerId={submission.authUid} isProctored={willBeProctored}>
//             <div className="ap-player ap-animate">
//                 <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
//                 {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

//                 {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={safeNavigateBack} onCancel={() => setShowLeaveWarning(false)} />}
//                 {showSubmitConfirm && <ConfirmModal title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"} message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."} confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"} cancelText="Go Back" onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}
//                 {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

//                 <div className="ap-player-topbar no-print">
//                     <div className="ap-player-topbar__left">
//                         <button className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
//                         <button className="ap-player-topbar__back" onClick={safeNavigateBack}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
//                         <div className="ap-player-topbar__separator ap-hide-mobile" />
//                         <h1 className="ap-player-topbar__title">
//                             {assessment.title}
//                             {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
//                         </h1>
//                     </div>
//                     <div className="ap-player-topbar__right">
//                         {assessment?.isOpenBook && assessment?.referenceManualUrl && <button className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}><FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span></button>}
//                         {isGloballyLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
//                         {!isGloballyLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
//                         {isGloballyLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}><Timer size={14} /> {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken</div>}
//                         {!isGloballyLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
//                         <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
//                         <span className={`ap-status-badge${isGloballyLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
//                     </div>
//                 </div>

//                 <div className={`ap-player-body${isGloballyLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
//                     <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
//                         <button className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
//                         <div className="ap-sidebar__meta-block">
//                             <div className="ap-sidebar__meta-title">{assessment.title}</div>
//                             {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
//                             <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
//                             {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
//                             {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
//                         </div>

//                         {!isWorkplaceModule && isFacDone && (
//                             <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
//                                 <div className="ap-score-card__stripe" aria-hidden="true" />
//                                 <div className="ap-score-card__state">{isModDone ? <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</> : <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>}</div>
//                                 <div className="ap-score-card__body">
//                                     <div className="ap-score-card__ring-wrap">
//                                         <ProgressRing progress={grandTotalPct} size={72} strokeWidth={5} color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'} />
//                                         <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>{grandTotalPct}%</span>
//                                     </div>
//                                     <div className="ap-score-card__divider" aria-hidden="true" />
//                                     <div className="ap-score-card__fraction">
//                                         <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
//                                         <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
//                                         <span className="ap-score-card__pass-note">Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)</span>
//                                     </div>
//                                 </div>
//                                 {isModDone && outcome && <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>{outcome.isCompetent ? <><CheckCircle size={13} /> Competent (C)</> : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}</div>}
//                             </div>
//                         )}

//                         {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
//                             <>
//                                 <div className="ap-sidebar__label">Status Tracking</div>
//                                 <div className="ap-sidebar__status-box">
//                                     {isAssDone && outcome ? (
//                                         <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
//                                             <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
//                                             {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
//                                             {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
//                                             <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
//                                         </div>
//                                     ) : (
//                                         <div className="ap-sidebar__awaiting">
//                                             <Clock size={20} color="rgba(255,255,255,0.25)" />
//                                             <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
//                                             <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
//                                         </div>
//                                     )}
//                                     {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
//                                     {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
//                                     {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

//                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? (savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator') : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div></div>
//                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
//                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>
//                                 </div>
//                             </>
//                         )}

//                         <div className="ap-sidebar__label">Workbook Contents</div>
//                         <div className="ap-sidebar__nav">
//                             {navItems.map((item: any) =>
//                                 item.type === 'section'
//                                     ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
//                                     : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
//                             )}
//                         </div>
//                     </nav>

//                     <div className="ap-player-content print-pane">
//                         <div className="ap-blocks">
//                             {assessment.blocks?.map((block: any) => {

//                                 if (block.type === 'section') {
//                                     const totals = sectionTotals[block.id];
//                                     return (
//                                         <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
//                                             <span>{block.title}</span>
//                                             {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
//                                             {block.content && <div className="quill-read-only-content ap-block-section__content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />}
//                                             {renderBlockImage(block)}
//                                         </div>
//                                     );
//                                 }

//                                 if (block.type === 'info') return (
//                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
//                                         <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
//                                         <div className="quill-read-only-content ap-block-info__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
//                                         {renderBlockImage(block)}
//                                     </div>
//                                 );

//                                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox'].includes(block.type)) {
//                                     qNum++;
//                                     const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
//                                     const learnerAns = answers[block.id];
//                                     let inkColor = '#64748b';
//                                     if (isModDone) inkColor = 'var(--mlab-green)';
//                                     else if (isAssDone) inkColor = 'var(--mlab-red)';
//                                     else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

//                                     const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
//                                     const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

//                                     const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'code_sandbox' ? 'ap-block-type-chip--code' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
//                                     const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : block.type === 'code_sandbox' ? 'IDE' : `Q${qNum}.`;

//                                     const isSectionVerified = isBlockVerified(block.id);
//                                     const isUploadLocked = isAwaitingSignoff ? false : (isGloballyLocked || isSectionVerified);

//                                     return (
//                                         <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isUploadLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
//                                             <div className="ap-block-question__header">
//                                                 <div className="ap-block-question__text-wrap">
//                                                     <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
//                                                         <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

//                                                         {block.type === 'qcto_workplace' ? (
//                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
//                                                         ) : block.type === 'code_sandbox' ? (
//                                                             <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
//                                                                 {block.title && <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>{block.title}</h3>}
//                                                                 {block.question && <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap', color: '#334155' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />}
//                                                             </div>
//                                                         ) : block.question ? (
//                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
//                                                         ) : block.title ? (
//                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title) }} />
//                                                         ) : null}
//                                                     </span>
//                                                     <div className="ap-grade-indicators">
//                                                         {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
//                                                         {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
//                                                         {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
//                                                     </div>
//                                                 </div>
//                                                 <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
//                                             </div>

//                                             <div className="ap-block-question__body">
//                                                 {renderBlockImage(block)}

//                                                 {/* MCQ */}
//                                                 {block.type === 'mcq' && (
//                                                     <div className="ap-mcq-options">
//                                                         {block.options?.map((opt: string, i: number) => {
//                                                             const selected = learnerAns === i;
//                                                             return (
//                                                                 <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isUploadLocked || !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
//                                                                     <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isUploadLocked || !canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
//                                                                     <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
//                                                                     <span className="ap-mcq-label__text">{opt}</span>
//                                                                 </label>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 {/* TEXT */}
//                                                 {block.type === 'text' && (
//                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
//                                                         {isGloballyLocked && !isAwaitingSignoff ? (
//                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
//                                                         ) : (
//                                                             <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
//                                                         )}
//                                                     </div>
//                                                 )}

//                                                 {/* TASK */}
//                                                 {block.type === 'task' && (() => {
//                                                     const taskTabs = [{ id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text }, { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl }, { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url }, { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl }, { id: 'code', icon: <Code size={13} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code }].filter(t => t.allowed);
//                                                     const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
//                                                     const progress = uploadProgress[block.id];
//                                                     return (
//                                                         <div className="ap-evidence-container">
//                                                             {!isSectionVerified && !isGloballyLocked && <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}><Info size={14} /> You may attach your evidence now. This section will lock automatically once your Facilitator/Mentor verifies it.</div>}
//                                                             {isSectionVerified && !isGloballyLocked && !isAwaitingSignoff && <div className="ap-checklist__lock-notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}><Lock size={14} color="#166534" />Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.</div>}
//                                                             <div className="ap-tab-bar no-print">{taskTabs.map(t => <button key={t.id} className={`ap-tab${activeTabId === t.id ? ' ap-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={11} className="ap-tab__done" />}</button>)}</div>
//                                                             <div className="ap-tab-panel">
//                                                                 {activeTabId === 'text' && <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns?.text) || '<em>No answer provided.</em>' }} /> : <ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" />}</div>}
//                                                                 {activeTabId === 'audio' && (learnerAns?.audioUrl ? <audio controls src={learnerAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{isUploadLocked || !canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
//                                                                 {activeTabId === 'url' && <div>{!isUploadLocked && canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{learnerAns?.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={learnerAns.url} /> : <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}</div>}
//                                                                 {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : learnerAns?.uploadUrl ? <FilePreview url={learnerAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : <div className="ap-upload-empty">{isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes || 'Any'}, Max {MAX_FILE_SIZE_MB}MB)</p><input type="file" onChange={e => handleFileValidationAndUpload(e, block.id)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} /></>}</div>)}
//                                                                 {activeTabId === 'code' && <textarea className="ap-code-textarea" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="Paste your code here…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
//                                                             </div>
//                                                         </div>
//                                                     );
//                                                 })()}

//                                                 {/* CHECKLIST */}
//                                                 {block.type === 'checklist' && (
//                                                     <div className="ap-checklist">
//                                                         <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item.</p>
//                                                         {block.criteria?.map((crit: string, i: number) => {
//                                                             const res = criteriaResults?.[i] || {};
//                                                             return (
//                                                                 <div key={i} className="ap-checklist__item">
//                                                                     <p className="ap-checklist__item-title">{i + 1}. {crit}</p>
//                                                                     <div className="ap-checklist__assessor-row">
//                                                                         {res.status ? (
//                                                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                                                                 <div><span className={`ap-checklist__status-chip ${res.status === 'C' ? 'ap-checklist__status-chip--c' : 'ap-checklist__status-chip--nyc'}`}>{savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')}</span></div>
//                                                                                 {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
//                                                                             </div>
//                                                                         ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
//                                                                     </div>
//                                                                 </div>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 {/* LOGBOOK */}
//                                                 {block.type === 'logbook' && (
//                                                     <div className="ap-logbook">
//                                                         <div className="quill-read-only-content ap-logbook__desc" dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
//                                                         <table className="ap-logbook__table">
//                                                             <thead className="ap-logbook__thead"><tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{!isUploadLocked && canEditLogbook && <th style={{ width: '40px' }}></th>}</tr></thead>
//                                                             <tbody>
//                                                                 {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
//                                                                     <tr key={i} className="ap-logbook__tbody">
//                                                                         <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                         <td className="ap-logbook__td ap-logbook__task-cell"><div className={`ap-quill-wrapper ap-quill-wrapper--logbook${isUploadLocked || !canEditLogbook ? ' locked' : ''}`}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} /> : <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={isUploadLocked || !canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />}</div></td>
//                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                         <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
//                                                                         {!isUploadLocked && canEditLogbook && <td className="ap-logbook__td"><button className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
//                                                                     </tr>
//                                                                 ))}
//                                                                 {!isUploadLocked && canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
//                                                             </tbody>
//                                                         </table>
//                                                     </div>
//                                                 )}

//                                                 {/* QCTO WORKPLACE */}
//                                                 {block.type === 'qcto_workplace' && (
//                                                     <div className="ap-workplace">
//                                                         <div className="quill-read-only-content" style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
//                                                         {block.workActivities?.map((wa: any) => {
//                                                             const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
//                                                             return (
//                                                                 <div key={wa.id} className="ap-workplace__activity">
//                                                                     <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>
//                                                                     <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
//                                                                         <input type="checkbox" disabled={isUploadLocked || !canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
//                                                                         <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
//                                                                     </label>
//                                                                 </div>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 {/* 🚀 LIVE IDE SANDBOX: Uses resolvedSnapshots to ensure data is actually injected! */}
//                                                 {block.type === 'code_sandbox' && (
//                                                     isFetchingSnapshots ? (
//                                                         <div className="ap-spinner-container" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
//                                                             <Loader2 size={24} className="ap-spin" style={{ margin: '0 auto 10px auto' }} />
//                                                             <p>Loading code environment...</p>
//                                                         </div>
//                                                     ) : (
//                                                         <CodeSandboxPlayer
//                                                             block={block}
//                                                             learnerAns={{
//                                                                 ...(learnerAns || {}),
//                                                                 snapshot: resolvedSnapshots[block.id] || codeSnapshots[block.id] || learnerAns?.snapshot
//                                                             }}
//                                                             readOnly={isUploadLocked || !canEditCode}
//                                                             onChange={(val) => saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
//                                                         />
//                                                     )
//                                                 )}

//                                                 {/* Per-question feedback */}
//                                                 {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
//                                                 {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
//                                                 {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
//                                             </div>
//                                         </div>
//                                     );
//                                 }
//                                 return null;
//                             })}
//                         </div>

//                         {/* FOOTER */}
//                         {isAwaitingSignoff ? (
//                             <div className="ap-footer ap-footer--signoff no-print">
//                                 <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
//                                 <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
//                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
//                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
//                                     <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
//                                 </label>
//                                 <div className="ap-footer-actions">
//                                     <button className="ap-btn ap-btn--amber" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}><Save size={14} /> Acknowledge & Submit for Grading</button>
//                                 </div>
//                             </div>
//                         ) : !isGloballyLocked ? (
//                             <div className="ap-footer no-print">
//                                 <h3 className="ap-footer__title">Final Submission</h3>
//                                 <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
//                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
//                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
//                                     <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
//                                 </label>
//                                 <div className="ap-footer-actions">
//                                     <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}</span>
//                                     <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}><Save size={14} /> Submit for Grading</button>
//                                 </div>
//                             </div>
//                         ) : (
//                             <div className="ap-footer ap-footer--locked no-print">
//                                 <div className="ap-footer--locked__icon-wrap">
//                                     {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
//                                 </div>
//                                 <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
//                                 <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. It is currently under review by our faculty.</p>
//                                 <button className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={safeNavigateBack}><ArrowLeft size={14} /> Return to Portfolio</button>
//                             </div>
//                         )}
//                     </div>
//                 </div>
//             </div>
//         </ProctoringWrapper>
//     );
// };

// export default AssessmentPlayerContent;


// // import React, { useState, useMemo, useEffect, useRef } from 'react';
// // import {
// //     ArrowLeft, Save, CheckCircle, Info, AlertCircle, Clock,
// //     BookOpen, Scale, UserCheck, Timer, AlertTriangle,
// //     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
// //     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
// //     Menu, FileArchive, Loader2
// // } from 'lucide-react';
// // import { ToastContainer } from '../../../components/common/Toast/Toast';
// // import ReactQuill from 'react-quill-new';
// // import 'react-quill-new/dist/quill.snow.css';
// // import './AssessmentPlayer.css';
// // import { createPortal } from 'react-dom';
// // import { UploadProgress } from '../../../components/common/UploadProgress';
// // import { UrlPreview } from '../../../components/common/UrlPreview';
// // import { ConfirmModal } from '../../../components/common/ConfirmModal';
// // import { FilePreview } from '../../FacilitatorDashboard/SubmissionReview/SubmissionReview/SubmissionReviewPreviews';
// // import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
// // import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';

// // import { getFunctions, httpsCallable } from 'firebase/functions';

// // const cleanRichText = (html?: string) => html ? html.replace(/&nbsp;/g, ' ') : '';
// // const extractPlainText = (htmlString?: string) => {
// //     if (!htmlString) return '';
// //     const tmp = document.createElement("DIV");
// //     tmp.innerHTML = htmlString;
// //     return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
// // };
// // const getSafeDate = (ds: string) => {
// //     if (!ds) return 'recently';
// //     const d = new Date(ds);
// //     return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// // };
// // const formatTime = (s: number) => {
// //     const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
// //     return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
// // };

// // const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] };
// // const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// // const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
// //     const radius = (size - strokeWidth) / 2;
// //     const circumference = 2 * Math.PI * radius;
// //     const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;
// //     return (
// //         <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
// //             <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
// //             <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
// //         </svg>
// //     );
// // };

// // const CollapsibleEvidenceWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
// //     const [isExpanded, setIsExpanded] = useState(false);
// //     const contentRef = useRef<HTMLDivElement>(null);
// //     const [needsCollapse, setNeedsCollapse] = useState(false);
// //     useEffect(() => { if (contentRef.current) setNeedsCollapse(contentRef.current.scrollHeight > 160); }, [children]);
// //     const showFold = needsCollapse && !isExpanded;
// //     return (
// //         <div style={{ position: 'relative', marginTop: '8px' }}>
// //             <div ref={contentRef} style={{ maxHeight: isExpanded ? 'none' : '160px', overflow: 'hidden', transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
// //                 <div style={{ padding: '12px' }}>{children}</div>
// //                 {showFold && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(to top, #f8fafc, transparent)', pointerEvents: 'none' }} />}
// //             </div>
// //             {needsCollapse && (
// //                 <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
// //                     <button type="button" onClick={() => setIsExpanded(!isExpanded)} style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#4f46e5', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
// //                         {isExpanded ? 'Collapse Evidence View ↑' : 'Expand Evidence View ↓'}
// //                     </button>
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };

// // const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
// //     const [reason, setReason] = useState('');
// //     useEffect(() => { const s = document.createElement('style'); s.innerHTML = 'body,html{overflow:hidden!important}'; document.head.appendChild(s); return () => { document.head.removeChild(s); }; }, []);
// //     return createPortal(
// //         <div className="ap-modal">
// //             <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
// //                 <div className="ap-modal-header ap-modal-header--danger">
// //                     <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
// //                     <div><h2 className="ap-modal-title">Lodge Formal Appeal</h2><p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p></div>
// //                 </div>
// //                 <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
// //                     <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
// //                     <div className="ap-form-group">
// //                         <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
// //                         <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
// //                     </div>
// //                     <div className="ap-modal-footer">
// //                         <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
// //                         <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };

// // export interface AssessmentPlayerContentProps {
// //     user: any;
// //     assessment: any;
// //     submission: any;
// //     answers: Record<string, any>;
// //     learnerProfile: any;
// //     learnerEnrollment: any;
// //     assessorProfile: any;
// //     moderatorProfile: any;
// //     facilitatorProfile: any;
// //     employers: any[];
// //     staff: any[];
// //     moduleLogs: any[];
// //     approvedLogs: any[];
// //     logsLoading: boolean;
// //     saving: boolean;
// //     setSaving: (v: boolean) => void;
// //     uploadProgress: Record<string, number>;
// //     setUploadProgress: (fn: (prev: any) => any) => void;
// //     activeTabs: Record<string, string>;
// //     setActiveTabs: (tabs: Record<string, string>) => void;
// //     timeLeft: number | null;
// //     isGloballyLocked: boolean;
// //     isAwaitingSignoff: boolean;
// //     isPracticalModule: boolean;
// //     isWorkplaceModule: boolean;
// //     isRemediation: boolean;
// //     isAppealUpheld: boolean;
// //     isFacDone: boolean;
// //     isAssDone: boolean;
// //     isModDone: boolean;
// //     isSubmitted: boolean;
// //     isMissed: boolean;
// //     showGate: boolean;
// //     showLeaveWarning: boolean;
// //     setShowLeaveWarning: (v: boolean) => void;
// //     showSubmitConfirm: boolean;
// //     setShowSubmitConfirm: (v: boolean) => void;
// //     showAppealModal: boolean;
// //     setShowAppealModal: (v: boolean) => void;
// //     declarationChecked: boolean;
// //     setDeclarationChecked: (v: boolean) => void;
// //     isMobileMenuOpen: boolean;
// //     setIsMobileMenuOpen: (v: boolean) => void;
// //     willBeProctored: boolean;
// //     savedFacRole: string | null;
// //     grandTotalAwarded: number;
// //     grandTotalMax: number;
// //     grandTotalPct: number;
// //     sectionTotals: Record<string, { total: number; awarded: number }>;
// //     outcome: { label: string; color: string; subtext: string; score?: number; percentage?: number; isCompetent: boolean } | null;
// //     safeNavigateBack: () => void;
// //     handleAnswerChange: (blockId: string, value: any) => void;
// //     handleTaskAnswerChange: (blockId: string, field: string, value: any) => void;
// //     handleNestedAnswerChange: (blockId: string, nestedKey: string, field: string, value: any) => void;
// //     handleFileUpload: (file: File, blockId: string, nestedKey?: string) => void;
// //     triggerSubmitConfirm: () => void;
// //     executeSubmit: () => void;
// //     executeAppeal: (reason: string) => void;
// //     preventCopyPasteAndDrop: (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent) => void;
// //     getBlockGrading: (blockId: string) => any;
// //     isBlockVerified: (blockId: string) => boolean;
// //     getSecureNow: () => number;
// //     toast: any;

// //     // 🚀 NEW CLOUD STORAGE PROPS ADDED HERE
// //     saveCodeSnapshot: (blockId: string, files: Record<string, string>, dependencies?: Record<string, string>, immediate?: boolean) => void;
// //     codeSnapshots: Record<string, any>;
// // }

// // export const AssessmentPlayerContent: React.FC<AssessmentPlayerContentProps> = (props) => {
// //     const {
// //         user, assessment, submission, answers, learnerProfile, learnerEnrollment, assessorProfile,
// //         moderatorProfile, facilitatorProfile, employers, staff, approvedLogs, logsLoading, saving,
// //         uploadProgress, setUploadProgress, activeTabs, setActiveTabs, timeLeft, isGloballyLocked,
// //         isAwaitingSignoff, isPracticalModule, isWorkplaceModule, isFacDone, isAssDone, isModDone,
// //         isSubmitted, showLeaveWarning, setShowLeaveWarning, showSubmitConfirm, setShowSubmitConfirm,
// //         showAppealModal, setShowAppealModal, declarationChecked, setDeclarationChecked, isMobileMenuOpen,
// //         setIsMobileMenuOpen, willBeProctored, savedFacRole, grandTotalAwarded, grandTotalMax,
// //         grandTotalPct, sectionTotals, outcome, safeNavigateBack, handleAnswerChange, handleTaskAnswerChange,
// //         handleNestedAnswerChange, handleFileUpload, saveCodeSnapshot, codeSnapshots, triggerSubmitConfirm, executeSubmit, executeAppeal,
// //         preventCopyPasteAndDrop, getBlockGrading, isBlockVerified, toast
// //     } = props;

// //     const [isFetchingSnapshots, setIsFetchingSnapshots] = useState(true);

// //     useEffect(() => {
// //         const fetchSnapshots = async () => {
// //             if (!submission?.id || !assessment?.blocks) {
// //                 setIsFetchingSnapshots(false);
// //                 return;
// //             }

// //             const codeBlocks = assessment.blocks.filter((b: any) => b.type === 'code_sandbox');
// //             if (codeBlocks.length === 0) {
// //                 setIsFetchingSnapshots(false);
// //                 return;
// //             }

// //             const newSnaps: Record<string, any> = {};
// //             const functions = getFunctions();
// //             const getFn = httpsCallable(functions, 'getCodeSnapshot');

// //             await Promise.all(codeBlocks.map(async (block: any) => {
// //                 const entry = answers[block.id];
// //                 if (entry?.storagePath) {
// //                     try {
// //                         const res = await getFn({ submissionId: submission.id, blockId: block.id });
// //                         newSnaps[block.id] = (res.data as any).files;
// //                     } catch (err) {
// //                         console.error(`Failed to load snapshot for ${block.id}:`, err);
// //                     }
// //                 } else if (entry?.snapshot) {
// //                     newSnaps[block.id] = entry.snapshot;
// //                 }
// //             }));

// //             setIsFetchingSnapshots(false);
// //         };
// //         fetchSnapshots();
// //     }, [submission?.id, assessment?.blocks]);

// //     const MAX_FILE_SIZE_MB = 10;
// //     const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// //     const handleFileValidationAndUpload = (e: React.ChangeEvent<HTMLInputElement>, blockId: string, nestedKey?: string) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;
// //         if (file.size > MAX_FILE_SIZE_BYTES) {
// //             toast.error(`File "${file.name}" is too large. Maximum size allowed is ${MAX_FILE_SIZE_MB}MB.`);
// //             e.target.value = ''; return;
// //         }
// //         handleFileUpload(file, blockId, nestedKey);
// //     };

// //     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
// //         if (block.type === 'section') {
// //             acc.push({ type: 'section', label: block.title, id: block.id });
// //         } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox'].includes(block.type)) {
// //             const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
// //             acc.push({ type: 'q', label: cleanLabel, id: block.id });
// //         }
// //         return acc;
// //     }, []) || [];

// //     const displayStatus = submission.status.replace('_', ' ');

// //     const canEditTask = !isGloballyLocked;
// //     const canEditChecklist = !isGloballyLocked || isAwaitingSignoff;
// //     const canEditLogbook = !isGloballyLocked;
// //     const canEditWorkplace = !isGloballyLocked || isAwaitingSignoff;
// //     const canEditCode = !isGloballyLocked;

// //     const renderBlockImage = (block: any) => {
// //         if (!block.imageUrl) return null;
// //         return (
// //             <div style={{ margin: '1rem 0', textAlign: 'center' }}>
// //                 <img src={block.imageUrl} alt={block.imageCaption || "Assessment attachment"} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }} />
// //                 {block.imageCaption && <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>{block.imageCaption}</p>}
// //             </div>
// //         );
// //     };

// //     let qNum = 0;

// //     return (
// //         <ProctoringWrapper assessmentId={assessment.id} learnerId={submission.authUid} isProctored={willBeProctored}>
// //             <div className="ap-player ap-animate">
// //                 <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// //                 {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

// //                 {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={safeNavigateBack} onCancel={() => setShowLeaveWarning(false)} />}
// //                 {showSubmitConfirm && <ConfirmModal title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"} message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."} confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"} cancelText="Go Back" onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}
// //                 {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

// //                 <div className="ap-player-topbar no-print">
// //                     <div className="ap-player-topbar__left">
// //                         <button className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
// //                         <button className="ap-player-topbar__back" onClick={safeNavigateBack}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
// //                         <div className="ap-player-topbar__separator ap-hide-mobile" />
// //                         <h1 className="ap-player-topbar__title">
// //                             {assessment.title}
// //                             {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
// //                         </h1>
// //                     </div>
// //                     <div className="ap-player-topbar__right">
// //                         {assessment?.isOpenBook && assessment?.referenceManualUrl && <button className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}><FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span></button>}
// //                         {isGloballyLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
// //                         {!isGloballyLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
// //                         {isGloballyLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}><Timer size={14} /> {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken</div>}
// //                         {!isGloballyLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
// //                         <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
// //                         <span className={`ap-status-badge${isGloballyLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
// //                     </div>
// //                 </div>

// //                 <div className={`ap-player-body${isGloballyLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
// //                     <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
// //                         <button className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
// //                         <div className="ap-sidebar__meta-block">
// //                             <div className="ap-sidebar__meta-title">{assessment.title}</div>
// //                             {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
// //                             <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
// //                             {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
// //                             {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
// //                         </div>

// //                         {!isWorkplaceModule && isFacDone && (
// //                             <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
// //                                 <div className="ap-score-card__stripe" aria-hidden="true" />
// //                                 <div className="ap-score-card__state">{isModDone ? <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</> : <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>}</div>
// //                                 <div className="ap-score-card__body">
// //                                     <div className="ap-score-card__ring-wrap">
// //                                         <ProgressRing progress={grandTotalPct} size={72} strokeWidth={5} color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'} />
// //                                         <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>{grandTotalPct}%</span>
// //                                     </div>
// //                                     <div className="ap-score-card__divider" aria-hidden="true" />
// //                                     <div className="ap-score-card__fraction">
// //                                         <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
// //                                         <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
// //                                         <span className="ap-score-card__pass-note">Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)</span>
// //                                     </div>
// //                                 </div>
// //                                 {isModDone && outcome && <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>{outcome.isCompetent ? <><CheckCircle size={13} /> Competent (C)</> : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}</div>}
// //                             </div>
// //                         )}

// //                         {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
// //                             <>
// //                                 <div className="ap-sidebar__label">Status Tracking</div>
// //                                 <div className="ap-sidebar__status-box">
// //                                     {isAssDone && outcome ? (
// //                                         <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
// //                                             <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
// //                                             {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
// //                                             {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
// //                                             <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
// //                                         </div>
// //                                     ) : (
// //                                         <div className="ap-sidebar__awaiting">
// //                                             <Clock size={20} color="rgba(255,255,255,0.25)" />
// //                                             <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
// //                                             <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
// //                                         </div>
// //                                     )}
// //                                     {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
// //                                     {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
// //                                     {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

// //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? (savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator') : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div></div>
// //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
// //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>
// //                                 </div>
// //                             </>
// //                         )}

// //                         <div className="ap-sidebar__label">Workbook Contents</div>
// //                         <div className="ap-sidebar__nav">
// //                             {navItems.map((item: any) =>
// //                                 item.type === 'section'
// //                                     ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
// //                                     : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
// //                             )}
// //                         </div>
// //                     </nav>

// //                     <div className="ap-player-content print-pane">
// //                         <div className="ap-blocks">
// //                             {assessment.blocks?.map((block: any) => {

// //                                 if (block.type === 'section') {
// //                                     const totals = sectionTotals[block.id];
// //                                     return (
// //                                         <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
// //                                             <span>{block.title}</span>
// //                                             {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
// //                                             {block.content && <div className="quill-read-only-content ap-block-section__content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />}
// //                                             {renderBlockImage(block)}
// //                                         </div>
// //                                     );
// //                                 }

// //                                 if (block.type === 'info') return (
// //                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
// //                                         <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
// //                                         <div className="quill-read-only-content ap-block-info__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
// //                                         {renderBlockImage(block)}
// //                                     </div>
// //                                 );

// //                                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox'].includes(block.type)) {
// //                                     qNum++;
// //                                     const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
// //                                     const learnerAns = answers[block.id];
// //                                     let inkColor = '#64748b';
// //                                     if (isModDone) inkColor = 'var(--mlab-green)';
// //                                     else if (isAssDone) inkColor = 'var(--mlab-red)';
// //                                     else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

// //                                     const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
// //                                     const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

// //                                     const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'code_sandbox' ? 'ap-block-type-chip--code' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
// //                                     const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : block.type === 'code_sandbox' ? 'IDE' : `Q${qNum}.`;

// //                                     const isSectionVerified = isBlockVerified(block.id);
// //                                     const isUploadLocked = isAwaitingSignoff ? false : (isGloballyLocked || isSectionVerified);

// //                                     return (
// //                                         <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isUploadLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
// //                                             <div className="ap-block-question__header">
// //                                                 <div className="ap-block-question__text-wrap">
// //                                                     <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
// //                                                         <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

// //                                                         {block.type === 'qcto_workplace' ? (
// //                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
// //                                                         ) : block.type === 'code_sandbox' ? (
// //                                                             <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
// //                                                                 {block.title && <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>{block.title}</h3>}
// //                                                                 {block.question && <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap', color: '#334155' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />}
// //                                                             </div>
// //                                                         ) : block.question ? (
// //                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
// //                                                         ) : block.title ? (
// //                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title) }} />
// //                                                         ) : null}
// //                                                     </span>
// //                                                     <div className="ap-grade-indicators">
// //                                                         {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
// //                                                         {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
// //                                                         {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
// //                                                     </div>
// //                                                 </div>
// //                                                 <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
// //                                             </div>

// //                                             <div className="ap-block-question__body">
// //                                                 {renderBlockImage(block)}

// //                                                 {/* MCQ */}
// //                                                 {block.type === 'mcq' && (
// //                                                     <div className="ap-mcq-options">
// //                                                         {block.options?.map((opt: string, i: number) => {
// //                                                             const selected = learnerAns === i;
// //                                                             return (
// //                                                                 <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isUploadLocked || !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
// //                                                                     <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isUploadLocked || !canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
// //                                                                     <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
// //                                                                     <span className="ap-mcq-label__text">{opt}</span>
// //                                                                 </label>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* TEXT */}
// //                                                 {block.type === 'text' && (
// //                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// //                                                         {isGloballyLocked && !isAwaitingSignoff ? (
// //                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
// //                                                         ) : (
// //                                                             <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
// //                                                         )}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* TASK */}
// //                                                 {block.type === 'task' && (() => {
// //                                                     const taskTabs = [{ id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text }, { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl }, { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url }, { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl }, { id: 'code', icon: <Code size={13} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code }].filter(t => t.allowed);
// //                                                     const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
// //                                                     const progress = uploadProgress[block.id];
// //                                                     return (
// //                                                         <div className="ap-evidence-container">
// //                                                             {!isSectionVerified && !isGloballyLocked && <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}><Info size={14} /> You may attach your evidence now. This section will lock automatically once your Facilitator/Mentor verifies it.</div>}
// //                                                             {isSectionVerified && !isGloballyLocked && !isAwaitingSignoff && <div className="ap-checklist__lock-notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}><Lock size={14} color="#166534" />Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.</div>}
// //                                                             <div className="ap-tab-bar no-print">{taskTabs.map(t => <button key={t.id} className={`ap-tab${activeTabId === t.id ? ' ap-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={11} className="ap-tab__done" />}</button>)}</div>
// //                                                             <div className="ap-tab-panel">
// //                                                                 {activeTabId === 'text' && <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns?.text) || '<em>No answer provided.</em>' }} /> : <ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" />}</div>}
// //                                                                 {activeTabId === 'audio' && (learnerAns?.audioUrl ? <audio controls src={learnerAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{isUploadLocked || !canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
// //                                                                 {activeTabId === 'url' && <div>{!isUploadLocked && canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{learnerAns?.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={learnerAns.url} /> : <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}</div>}
// //                                                                 {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : learnerAns?.uploadUrl ? <FilePreview url={learnerAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : <div className="ap-upload-empty">{isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes || 'Any'}, Max {MAX_FILE_SIZE_MB}MB)</p><input type="file" onChange={e => handleFileValidationAndUpload(e, block.id)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} /></>}</div>)}
// //                                                                 {activeTabId === 'code' && <textarea className="ap-code-textarea" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="Paste your code here…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
// //                                                             </div>
// //                                                         </div>
// //                                                     );
// //                                                 })()}

// //                                                 {/* CHECKLIST */}
// //                                                 {block.type === 'checklist' && (
// //                                                     <div className="ap-checklist">
// //                                                         <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item.</p>
// //                                                         {block.criteria?.map((crit: string, i: number) => {
// //                                                             const res = criteriaResults?.[i] || {};
// //                                                             return (
// //                                                                 <div key={i} className="ap-checklist__item">
// //                                                                     <p className="ap-checklist__item-title">{i + 1}. {crit}</p>
// //                                                                     <div className="ap-checklist__assessor-row">
// //                                                                         {res.status ? (
// //                                                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
// //                                                                                 <div><span className={`ap-checklist__status-chip ${res.status === 'C' ? 'ap-checklist__status-chip--c' : 'ap-checklist__status-chip--nyc'}`}>{savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')}</span></div>
// //                                                                                 {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
// //                                                                             </div>
// //                                                                         ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
// //                                                                     </div>
// //                                                                 </div>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* LOGBOOK */}
// //                                                 {block.type === 'logbook' && (
// //                                                     <div className="ap-logbook">
// //                                                         <div className="quill-read-only-content ap-logbook__desc" dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
// //                                                         <table className="ap-logbook__table">
// //                                                             <thead className="ap-logbook__thead"><tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{!isUploadLocked && canEditLogbook && <th style={{ width: '40px' }}></th>}</tr></thead>
// //                                                             <tbody>
// //                                                                 {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
// //                                                                     <tr key={i} className="ap-logbook__tbody">
// //                                                                         <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// //                                                                         <td className="ap-logbook__td ap-logbook__task-cell"><div className={`ap-quill-wrapper ap-quill-wrapper--logbook${isUploadLocked || !canEditLogbook ? ' locked' : ''}`}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} /> : <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={isUploadLocked || !canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />}</div></td>
// //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// //                                                                         <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
// //                                                                         {!isUploadLocked && canEditLogbook && <td className="ap-logbook__td"><button className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
// //                                                                     </tr>
// //                                                                 ))}
// //                                                                 {!isUploadLocked && canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
// //                                                             </tbody>
// //                                                         </table>
// //                                                     </div>
// //                                                 )}

// //                                                 {/* QCTO WORKPLACE */}
// //                                                 {block.type === 'qcto_workplace' && (
// //                                                     <div className="ap-workplace">
// //                                                         <div className="quill-read-only-content" style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
// //                                                         {block.workActivities?.map((wa: any) => {
// //                                                             const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
// //                                                             return (
// //                                                                 <div key={wa.id} className="ap-workplace__activity">
// //                                                                     <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>
// //                                                                     <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
// //                                                                         <input type="checkbox" disabled={isUploadLocked || !canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
// //                                                                         <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
// //                                                                     </label>
// //                                                                 </div>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* 🚀 LIVE IDE SANDBOX */}
// //                                                 {block.type === 'code_sandbox' && (
// //                                                     isFetchingSnapshots ? (
// //                                                         <div className="ap-spinner-container" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
// //                                                             <Loader2 size={24} className="ap-spin" style={{ margin: '0 auto 10px auto' }} />
// //                                                             <p>Loading code environment...</p>
// //                                                         </div>
// //                                                     ) : (
// //                                                         <CodeSandboxPlayer
// //                                                             block={block}
// //                                                             learnerAns={{
// //                                                                 ...(learnerAns || {}),
// //                                                                 snapshot: codeSnapshots[block.id] || learnerAns?.snapshot
// //                                                             }}
// //                                                             readOnly={isUploadLocked || !canEditCode}
// //                                                             onChange={(val) => saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
// //                                                         />
// //                                                     )
// //                                                 )}

// //                                                 {/* Per-question feedback */}
// //                                                 {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
// //                                                 {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
// //                                                 {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
// //                                             </div>
// //                                         </div>
// //                                     );
// //                                 }
// //                                 return null;
// //                             })}
// //                         </div>

// //                         {/* FOOTER */}
// //                         {isAwaitingSignoff ? (
// //                             <div className="ap-footer ap-footer--signoff no-print">
// //                                 <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
// //                                 <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
// //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// //                                     <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
// //                                 </label>
// //                                 <div className="ap-footer-actions">
// //                                     <button className="ap-btn ap-btn--amber" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}><Save size={14} /> Acknowledge & Submit for Grading</button>
// //                                 </div>
// //                             </div>
// //                         ) : !isGloballyLocked ? (
// //                             <div className="ap-footer no-print">
// //                                 <h3 className="ap-footer__title">Final Submission</h3>
// //                                 <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
// //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// //                                     <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
// //                                 </label>
// //                                 <div className="ap-footer-actions">
// //                                     <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}</span>
// //                                     <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}><Save size={14} /> Submit for Grading</button>
// //                                 </div>
// //                             </div>
// //                         ) : (
// //                             <div className="ap-footer ap-footer--locked no-print">
// //                                 <div className="ap-footer--locked__icon-wrap">
// //                                     {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
// //                                 </div>
// //                                 <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
// //                                 <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. It is currently under review by our faculty.</p>
// //                                 <button className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={safeNavigateBack}><ArrowLeft size={14} /> Return to Portfolio</button>
// //                             </div>
// //                         )}
// //                     </div>
// //                 </div>
// //             </div>
// //         </ProctoringWrapper>
// //     );
// // };

// // export default AssessmentPlayerContent;


// // // import React, { useState, useMemo, useEffect, useRef } from 'react';
// // // import {
// // //     ArrowLeft, Save, CheckCircle, Info, AlertCircle, Clock,
// // //     BookOpen, Scale, UserCheck, Timer, AlertTriangle,
// // //     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
// // //     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
// // //     Menu, FileArchive
// // // } from 'lucide-react';
// // // import { ToastContainer } from '../../../components/common/Toast/Toast';
// // // import ReactQuill from 'react-quill-new';
// // // import 'react-quill-new/dist/quill.snow.css';
// // // import './AssessmentPlayer.css';
// // // import { createPortal } from 'react-dom';
// // // import { UploadProgress } from '../../../components/common/UploadProgress';
// // // import { UrlPreview } from '../../../components/common/UrlPreview';
// // // import { ConfirmModal } from '../../../components/common/ConfirmModal';
// // // import { FilePreview } from '../../FacilitatorDashboard/SubmissionReview/SubmissionReview/SubmissionReviewPreviews';
// // // import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
// // // // import mLabLogo from '../../../assets/logo/mlab_logo.png';
// // // import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';

// // // const cleanRichText = (html?: string) => html ? html.replace(/&nbsp;/g, ' ') : '';
// // // const extractPlainText = (htmlString?: string) => {
// // //     if (!htmlString) return '';
// // //     const tmp = document.createElement("DIV");
// // //     tmp.innerHTML = htmlString;
// // //     return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
// // // };
// // // const getSafeDate = (ds: string) => {
// // //     if (!ds) return 'recently';
// // //     const d = new Date(ds);
// // //     return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// // // };
// // // const formatTime = (s: number) => {
// // //     const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
// // //     return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
// // // };

// // // const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] };
// // // const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// // // const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
// // //     const radius = (size - strokeWidth) / 2;
// // //     const circumference = 2 * Math.PI * radius;
// // //     const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;
// // //     return (
// // //         <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
// // //             <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
// // //             <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
// // //         </svg>
// // //     );
// // // };

// // // const CollapsibleEvidenceWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
// // //     const [isExpanded, setIsExpanded] = useState(false);
// // //     const contentRef = useRef<HTMLDivElement>(null);
// // //     const [needsCollapse, setNeedsCollapse] = useState(false);
// // //     useEffect(() => { if (contentRef.current) setNeedsCollapse(contentRef.current.scrollHeight > 160); }, [children]);
// // //     const showFold = needsCollapse && !isExpanded;
// // //     return (
// // //         <div style={{ position: 'relative', marginTop: '8px' }}>
// // //             <div ref={contentRef} style={{ maxHeight: isExpanded ? 'none' : '160px', overflow: 'hidden', transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
// // //                 <div style={{ padding: '12px' }}>{children}</div>
// // //                 {showFold && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(to top, #f8fafc, transparent)', pointerEvents: 'none' }} />}
// // //             </div>
// // //             {needsCollapse && (
// // //                 <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
// // //                     <button type="button" onClick={() => setIsExpanded(!isExpanded)} style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#4f46e5', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
// // //                         {isExpanded ? 'Collapse Evidence View ↑' : 'Expand Evidence View ↓'}
// // //                     </button>
// // //                 </div>
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
// // //     const [reason, setReason] = useState('');
// // //     useEffect(() => { const s = document.createElement('style'); s.innerHTML = 'body,html{overflow:hidden!important}'; document.head.appendChild(s); return () => { document.head.removeChild(s); }; }, []);
// // //     return createPortal(
// // //         <div className="ap-modal">
// // //             <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
// // //                 <div className="ap-modal-header ap-modal-header--danger">
// // //                     <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
// // //                     <div><h2 className="ap-modal-title">Lodge Formal Appeal</h2><p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p></div>
// // //                 </div>
// // //                 <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
// // //                     <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
// // //                     <div className="ap-form-group">
// // //                         <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
// // //                         <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
// // //                     </div>
// // //                     <div className="ap-modal-footer">
// // //                         <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
// // //                         <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
// // //                     </div>
// // //                 </form>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };

// // // export interface AssessmentPlayerContentProps {
// // //     user: any;
// // //     assessment: any;
// // //     submission: any;
// // //     answers: Record<string, any>;
// // //     learnerProfile: any;
// // //     learnerEnrollment: any;
// // //     assessorProfile: any;
// // //     moderatorProfile: any;
// // //     facilitatorProfile: any;
// // //     employers: any[];
// // //     staff: any[];
// // //     moduleLogs: any[];
// // //     approvedLogs: any[];
// // //     logsLoading: boolean;
// // //     saving: boolean;
// // //     setSaving: (v: boolean) => void;
// // //     uploadProgress: Record<string, number>;
// // //     setUploadProgress: (fn: (prev: any) => any) => void;
// // //     activeTabs: Record<string, string>;
// // //     setActiveTabs: (tabs: Record<string, string>) => void;
// // //     timeLeft: number | null;
// // //     isGloballyLocked: boolean;
// // //     isAwaitingSignoff: boolean;
// // //     isPracticalModule: boolean;
// // //     isWorkplaceModule: boolean;
// // //     isRemediation: boolean;
// // //     isAppealUpheld: boolean;
// // //     isFacDone: boolean;
// // //     isAssDone: boolean;
// // //     isModDone: boolean;
// // //     isSubmitted: boolean;
// // //     isMissed: boolean;
// // //     showGate: boolean;
// // //     showLeaveWarning: boolean;
// // //     setShowLeaveWarning: (v: boolean) => void;
// // //     showSubmitConfirm: boolean;
// // //     setShowSubmitConfirm: (v: boolean) => void;
// // //     showAppealModal: boolean;
// // //     setShowAppealModal: (v: boolean) => void;
// // //     declarationChecked: boolean;
// // //     setDeclarationChecked: (v: boolean) => void;
// // //     isMobileMenuOpen: boolean;
// // //     setIsMobileMenuOpen: (v: boolean) => void;
// // //     willBeProctored: boolean;
// // //     savedFacRole: string | null;
// // //     grandTotalAwarded: number;
// // //     grandTotalMax: number;
// // //     grandTotalPct: number;
// // //     sectionTotals: Record<string, { total: number; awarded: number }>;
// // //     outcome: { label: string; color: string; subtext: string; score?: number; percentage?: number; isCompetent: boolean } | null;
// // //     safeNavigateBack: () => void;
// // //     handleAnswerChange: (blockId: string, value: any) => void;
// // //     handleTaskAnswerChange: (blockId: string, field: string, value: any) => void;
// // //     handleNestedAnswerChange: (blockId: string, nestedKey: string, field: string, value: any) => void;
// // //     handleFileUpload: (file: File, blockId: string, nestedKey?: string) => void;
// // //     triggerSubmitConfirm: () => void;
// // //     executeSubmit: () => void;
// // //     executeAppeal: (reason: string) => void;
// // //     preventCopyPasteAndDrop: (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent) => void;
// // //     getBlockGrading: (blockId: string) => any;
// // //     isBlockVerified: (blockId: string) => boolean;
// // //     getSecureNow: () => number;
// // //     toast: any;
// // // }

// // // export const AssessmentPlayerContent: React.FC<AssessmentPlayerContentProps> = (props) => {
// // //     const {
// // //         user, assessment, submission, answers, learnerProfile, learnerEnrollment, assessorProfile,
// // //         moderatorProfile, facilitatorProfile, employers, staff, approvedLogs, logsLoading, saving,
// // //         uploadProgress, setUploadProgress, activeTabs, setActiveTabs, timeLeft, isGloballyLocked,
// // //         isAwaitingSignoff, isPracticalModule, isWorkplaceModule, isFacDone, isAssDone, isModDone,
// // //         isSubmitted, showLeaveWarning, setShowLeaveWarning, showSubmitConfirm, setShowSubmitConfirm,
// // //         showAppealModal, setShowAppealModal, declarationChecked, setDeclarationChecked, isMobileMenuOpen,
// // //         setIsMobileMenuOpen, willBeProctored, savedFacRole, grandTotalAwarded, grandTotalMax,
// // //         grandTotalPct, sectionTotals, outcome, safeNavigateBack, handleAnswerChange, handleTaskAnswerChange,
// // //         handleNestedAnswerChange, handleFileUpload, triggerSubmitConfirm, executeSubmit, executeAppeal,
// // //         preventCopyPasteAndDrop, getBlockGrading, isBlockVerified, toast
// // //     } = props;

// // //     const MAX_FILE_SIZE_MB = 10;
// // //     const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// // //     const handleFileValidationAndUpload = (e: React.ChangeEvent<HTMLInputElement>, blockId: string, nestedKey?: string) => {
// // //         const file = e.target.files?.[0];
// // //         if (!file) return;
// // //         if (file.size > MAX_FILE_SIZE_BYTES) {
// // //             toast.error(`File "${file.name}" is too large. Maximum size allowed is ${MAX_FILE_SIZE_MB}MB.`);
// // //             e.target.value = ''; return;
// // //         }
// // //         handleFileUpload(file, blockId, nestedKey);
// // //     };

// // //     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
// // //         if (block.type === 'section') {
// // //             acc.push({ type: 'section', label: block.title, id: block.id });
// // //         } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox'].includes(block.type)) {
// // //             const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
// // //             acc.push({ type: 'q', label: cleanLabel, id: block.id });
// // //         }
// // //         return acc;
// // //     }, []) || [];

// // //     const displayStatus = submission.status.replace('_', ' ');

// // //     const canEditTask = !isGloballyLocked;
// // //     const canEditChecklist = !isGloballyLocked || isAwaitingSignoff;
// // //     const canEditLogbook = !isGloballyLocked;
// // //     const canEditWorkplace = !isGloballyLocked || isAwaitingSignoff;
// // //     const canEditCode = !isGloballyLocked;

// // //     const renderBlockImage = (block: any) => {
// // //         if (!block.imageUrl) return null;
// // //         return (
// // //             <div style={{ margin: '1rem 0', textAlign: 'center' }}>
// // //                 <img src={block.imageUrl} alt={block.imageCaption || "Assessment attachment"} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }} />
// // //                 {block.imageCaption && <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>{block.imageCaption}</p>}
// // //             </div>
// // //         );
// // //     };

// // //     const workplaceInfo = useMemo(() => {
// // //         if (!learnerEnrollment) return null;
// // //         const employer = learnerEnrollment.employerId ? employers.find((e: any) => e.id === learnerEnrollment.employerId) : null;
// // //         const mentor = learnerEnrollment.mentorId ? staff.find((s: any) => s.id === learnerEnrollment.mentorId) : null;
// // //         return { employer, mentor };
// // //     }, [learnerEnrollment, employers, staff]);

// // //     let qNum = 0;

// // //     return (
// // //         <ProctoringWrapper assessmentId={assessment.id} learnerId={submission.authUid} isProctored={willBeProctored}>
// // //             <div className="ap-player ap-animate">
// // //                 <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// // //                 {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

// // //                 {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={safeNavigateBack} onCancel={() => setShowLeaveWarning(false)} />}
// // //                 {showSubmitConfirm && <ConfirmModal title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"} message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."} confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"} cancelText="Go Back" onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}
// // //                 {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

// // //                 <div className="ap-player-topbar no-print">
// // //                     <div className="ap-player-topbar__left">
// // //                         <button className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
// // //                         <button className="ap-player-topbar__back" onClick={safeNavigateBack}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
// // //                         <div className="ap-player-topbar__separator ap-hide-mobile" />
// // //                         <h1 className="ap-player-topbar__title">
// // //                             {assessment.title}
// // //                             {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
// // //                         </h1>
// // //                     </div>
// // //                     <div className="ap-player-topbar__right">
// // //                         {assessment?.isOpenBook && assessment?.referenceManualUrl && <button className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}><FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span></button>}
// // //                         {isGloballyLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
// // //                         {!isGloballyLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
// // //                         {isGloballyLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}><Timer size={14} /> {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken</div>}
// // //                         {!isGloballyLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
// // //                         <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
// // //                         <span className={`ap-status-badge${isGloballyLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
// // //                     </div>
// // //                 </div>

// // //                 <div className={`ap-player-body${isGloballyLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
// // //                     <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
// // //                         <button className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
// // //                         <div className="ap-sidebar__meta-block">
// // //                             <div className="ap-sidebar__meta-title">{assessment.title}</div>
// // //                             {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
// // //                             <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
// // //                             {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
// // //                             {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
// // //                         </div>

// // //                         {!isWorkplaceModule && isFacDone && (
// // //                             <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
// // //                                 <div className="ap-score-card__stripe" aria-hidden="true" />
// // //                                 <div className="ap-score-card__state">{isModDone ? <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</> : <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>}</div>
// // //                                 <div className="ap-score-card__body">
// // //                                     <div className="ap-score-card__ring-wrap">
// // //                                         <ProgressRing progress={grandTotalPct} size={72} strokeWidth={5} color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'} />
// // //                                         <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>{grandTotalPct}%</span>
// // //                                     </div>
// // //                                     <div className="ap-score-card__divider" aria-hidden="true" />
// // //                                     <div className="ap-score-card__fraction">
// // //                                         <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
// // //                                         <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
// // //                                         <span className="ap-score-card__pass-note">Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)</span>
// // //                                     </div>
// // //                                 </div>
// // //                                 {isModDone && outcome && <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>{outcome.isCompetent ? <><CheckCircle size={13} /> Competent (C)</> : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}</div>}
// // //                             </div>
// // //                         )}

// // //                         {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
// // //                             <>
// // //                                 <div className="ap-sidebar__label">Status Tracking</div>
// // //                                 <div className="ap-sidebar__status-box">
// // //                                     {isAssDone && outcome ? (
// // //                                         <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
// // //                                             <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
// // //                                             {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
// // //                                             {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
// // //                                             <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
// // //                                         </div>
// // //                                     ) : (
// // //                                         <div className="ap-sidebar__awaiting">
// // //                                             <Clock size={20} color="rgba(255,255,255,0.25)" />
// // //                                             <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
// // //                                             <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
// // //                                         </div>
// // //                                     )}
// // //                                     {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
// // //                                     {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
// // //                                     {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

// // //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? (savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator') : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div></div>
// // //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
// // //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>
// // //                                 </div>
// // //                             </>
// // //                         )}

// // //                         <div className="ap-sidebar__label">Workbook Contents</div>
// // //                         <div className="ap-sidebar__nav">
// // //                             {navItems.map((item: any) =>
// // //                                 item.type === 'section'
// // //                                     ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
// // //                                     : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
// // //                             )}
// // //                         </div>
// // //                     </nav>

// // //                     <div className="ap-player-content print-pane">
// // //                         <div className="ap-blocks">
// // //                             {assessment.blocks?.map((block: any) => {

// // //                                 if (block.type === 'section') {
// // //                                     const totals = sectionTotals[block.id];
// // //                                     return (
// // //                                         <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
// // //                                             <span>{block.title}</span>
// // //                                             {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
// // //                                             {block.content && <div className="quill-read-only-content ap-block-section__content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />}
// // //                                             {renderBlockImage(block)}
// // //                                         </div>
// // //                                     );
// // //                                 }

// // //                                 if (block.type === 'info') return (
// // //                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
// // //                                         <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
// // //                                         <div className="quill-read-only-content ap-block-info__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
// // //                                         {renderBlockImage(block)}
// // //                                     </div>
// // //                                 );

// // //                                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox'].includes(block.type)) {
// // //                                     qNum++;
// // //                                     const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
// // //                                     const learnerAns = answers[block.id];
// // //                                     let inkColor = '#64748b';
// // //                                     if (isModDone) inkColor = 'var(--mlab-green)';
// // //                                     else if (isAssDone) inkColor = 'var(--mlab-red)';
// // //                                     else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

// // //                                     const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
// // //                                     const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

// // //                                     const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'code_sandbox' ? 'ap-block-type-chip--code' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
// // //                                     const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : block.type === 'code_sandbox' ? 'IDE' : `Q${qNum}.`;

// // //                                     const isSectionVerified = isBlockVerified(block.id);
// // //                                     const isUploadLocked = isAwaitingSignoff ? false : (isGloballyLocked || isSectionVerified);

// // //                                     return (
// // //                                         <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isUploadLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
// // //                                             <div className="ap-block-question__header">
// // //                                                 <div className="ap-block-question__text-wrap">
// // //                                                     <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
// // //                                                         <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

// // //                                                         {block.type === 'qcto_workplace' ? (
// // //                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
// // //                                                         ) : block.type === 'code_sandbox' ? (
// // //                                                             <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
// // //                                                                 {block.title && <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>{block.title}</h3>}
// // //                                                                 {block.question && <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap', color: '#334155' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />}
// // //                                                             </div>
// // //                                                         ) : block.question ? (
// // //                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
// // //                                                         ) : block.title ? (
// // //                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title) }} />
// // //                                                         ) : null}
// // //                                                     </span>
// // //                                                     <div className="ap-grade-indicators">
// // //                                                         {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
// // //                                                         {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
// // //                                                         {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
// // //                                                     </div>
// // //                                                 </div>
// // //                                                 <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
// // //                                             </div>

// // //                                             <div className="ap-block-question__body">
// // //                                                 {renderBlockImage(block)}

// // //                                                 {/* MCQ */}
// // //                                                 {block.type === 'mcq' && (
// // //                                                     <div className="ap-mcq-options">
// // //                                                         {block.options?.map((opt: string, i: number) => {
// // //                                                             const selected = learnerAns === i;
// // //                                                             return (
// // //                                                                 <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isUploadLocked || !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
// // //                                                                     <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isUploadLocked || !canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
// // //                                                                     <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
// // //                                                                     <span className="ap-mcq-label__text">{opt}</span>
// // //                                                                 </label>
// // //                                                             );
// // //                                                         })}
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* TEXT */}
// // //                                                 {block.type === 'text' && (
// // //                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// // //                                                         {isGloballyLocked && !isAwaitingSignoff ? (
// // //                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
// // //                                                         ) : (
// // //                                                             <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
// // //                                                         )}
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* TASK */}
// // //                                                 {block.type === 'task' && (() => {
// // //                                                     const taskTabs = [{ id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text }, { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl }, { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url }, { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl }, { id: 'code', icon: <Code size={13} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code }].filter(t => t.allowed);
// // //                                                     const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
// // //                                                     const progress = uploadProgress[block.id];
// // //                                                     return (
// // //                                                         <div className="ap-evidence-container">
// // //                                                             {!isSectionVerified && !isGloballyLocked && <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}><Info size={14} /> You may attach your evidence now. This section will lock automatically once your Facilitator/Mentor verifies it.</div>}
// // //                                                             {isSectionVerified && !isGloballyLocked && !isAwaitingSignoff && <div className="ap-checklist__lock-notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}><Lock size={14} color="#166534" />Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.</div>}
// // //                                                             <div className="ap-tab-bar no-print">{taskTabs.map(t => <button key={t.id} className={`ap-tab${activeTabId === t.id ? ' ap-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={11} className="ap-tab__done" />}</button>)}</div>
// // //                                                             <div className="ap-tab-panel">
// // //                                                                 {activeTabId === 'text' && <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns?.text) || '<em>No answer provided.</em>' }} /> : <ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" />}</div>}
// // //                                                                 {activeTabId === 'audio' && (learnerAns?.audioUrl ? <audio controls src={learnerAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{isUploadLocked || !canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
// // //                                                                 {activeTabId === 'url' && <div>{!isUploadLocked && canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{learnerAns?.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={learnerAns.url} /> : <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}</div>}
// // //                                                                 {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : learnerAns?.uploadUrl ? <FilePreview url={learnerAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : <div className="ap-upload-empty">{isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes || 'Any'}, Max {MAX_FILE_SIZE_MB}MB)</p><input type="file" onChange={e => handleFileValidationAndUpload(e, block.id)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} /></>}</div>)}
// // //                                                                 {activeTabId === 'code' && <textarea className="ap-code-textarea" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="Paste your code here…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
// // //                                                             </div>
// // //                                                         </div>
// // //                                                     );
// // //                                                 })()}

// // //                                                 {/* CHECKLIST */}
// // //                                                 {block.type === 'checklist' && (
// // //                                                     <div className="ap-checklist">
// // //                                                         <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item.</p>
// // //                                                         {block.criteria?.map((crit: string, i: number) => {
// // //                                                             const res = criteriaResults?.[i] || {};
// // //                                                             return (
// // //                                                                 <div key={i} className="ap-checklist__item">
// // //                                                                     <p className="ap-checklist__item-title">{i + 1}. {crit}</p>
// // //                                                                     <div className="ap-checklist__assessor-row">
// // //                                                                         {res.status ? (
// // //                                                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
// // //                                                                                 <div><span className={`ap-checklist__status-chip ${res.status === 'C' ? 'ap-checklist__status-chip--c' : 'ap-checklist__status-chip--nyc'}`}>{savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')}</span></div>
// // //                                                                                 {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
// // //                                                                             </div>
// // //                                                                         ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
// // //                                                                     </div>
// // //                                                                 </div>
// // //                                                             );
// // //                                                         })}
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* LOGBOOK */}
// // //                                                 {block.type === 'logbook' && (
// // //                                                     <div className="ap-logbook">
// // //                                                         <div className="quill-read-only-content ap-logbook__desc" dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
// // //                                                         <table className="ap-logbook__table">
// // //                                                             <thead className="ap-logbook__thead"><tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{!isUploadLocked && canEditLogbook && <th style={{ width: '40px' }}></th>}</tr></thead>
// // //                                                             <tbody>
// // //                                                                 {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
// // //                                                                     <tr key={i} className="ap-logbook__tbody">
// // //                                                                         <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// // //                                                                         <td className="ap-logbook__td ap-logbook__task-cell"><div className={`ap-quill-wrapper ap-quill-wrapper--logbook${isUploadLocked || !canEditLogbook ? ' locked' : ''}`}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} /> : <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={isUploadLocked || !canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />}</div></td>
// // //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// // //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// // //                                                                         <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
// // //                                                                         {!isUploadLocked && canEditLogbook && <td className="ap-logbook__td"><button className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
// // //                                                                     </tr>
// // //                                                                 ))}
// // //                                                                 {!isUploadLocked && canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
// // //                                                             </tbody>
// // //                                                         </table>
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* QCTO WORKPLACE */}
// // //                                                 {block.type === 'qcto_workplace' && (
// // //                                                     <div className="ap-workplace">
// // //                                                         <div className="quill-read-only-content" style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
// // //                                                         {block.workActivities?.map((wa: any) => {
// // //                                                             const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
// // //                                                             return (
// // //                                                                 <div key={wa.id} className="ap-workplace__activity">
// // //                                                                     <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>
// // //                                                                     <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
// // //                                                                         <input type="checkbox" disabled={isUploadLocked || !canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
// // //                                                                         <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
// // //                                                                     </label>
// // //                                                                 </div>
// // //                                                             );
// // //                                                         })}
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* 🚀 LIVE IDE SANDBOX */}
// // //                                                 {block.type === 'code_sandbox' && (
// // //                                                     <CodeSandboxPlayer
// // //                                                         block={block}
// // //                                                         learnerAns={learnerAns}
// // //                                                         readOnly={isUploadLocked || !canEditCode}
// // //                                                         onChange={(val) => handleAnswerChange(block.id, val)}
// // //                                                     />
// // //                                                 )}

// // //                                                 {/* Per-question feedback */}
// // //                                                 {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
// // //                                                 {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
// // //                                                 {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
// // //                                             </div>
// // //                                         </div>
// // //                                     );
// // //                                 }
// // //                                 return null;
// // //                             })}
// // //                         </div>

// // //                         {/* FOOTER */}
// // //                         {isAwaitingSignoff ? (
// // //                             <div className="ap-footer ap-footer--signoff no-print">
// // //                                 <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
// // //                                 <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
// // //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// // //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// // //                                     <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
// // //                                 </label>
// // //                                 <div className="ap-footer-actions">
// // //                                     <button className="ap-btn ap-btn--amber" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}><Save size={14} /> Acknowledge & Submit for Grading</button>
// // //                                 </div>
// // //                             </div>
// // //                         ) : !isGloballyLocked ? (
// // //                             <div className="ap-footer no-print">
// // //                                 <h3 className="ap-footer__title">Final Submission</h3>
// // //                                 <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
// // //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// // //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// // //                                     <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
// // //                                 </label>
// // //                                 <div className="ap-footer-actions">
// // //                                     <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}</span>
// // //                                     <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}><Save size={14} /> Submit for Grading</button>
// // //                                 </div>
// // //                             </div>
// // //                         ) : (
// // //                             <div className="ap-footer ap-footer--locked no-print">
// // //                                 <div className="ap-footer--locked__icon-wrap">
// // //                                     {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
// // //                                 </div>
// // //                                 <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
// // //                                 <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. It is currently under review by our faculty.</p>
// // //                                 <button className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={safeNavigateBack}><ArrowLeft size={14} /> Return to Portfolio</button>
// // //                             </div>
// // //                         )}
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         </ProctoringWrapper>
// // //     );
// // // };

// // // export default AssessmentPlayerContent;