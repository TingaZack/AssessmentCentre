// src/components/views/AssessmentPlayer/AssessmentPlayerContent.tsx

import React, { useState, useMemo, useEffect } from 'react';
import {
    ArrowLeft, Save, CheckCircle, Info, ShieldAlert, AlertCircle, Play, Clock,
    GraduationCap, BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
    ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
    RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
    Briefcase, Menu, FileArchive, Video, CalendarDays
} from 'lucide-react';
import { ToastContainer } from '../../../components/common/Toast/Toast';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import moment from 'moment';
import './AssessmentPlayer.css';
import { createPortal } from 'react-dom';
import { UploadProgress } from '../../../components/common/UploadProgress';
import { UrlPreview } from '../../../components/common/UrlPreview';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { FilePreview } from '../../FacilitatorDashboard/SubmissionReview/SubmissionReview/SubmissionReviewPreviews';
import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
import mLabLogo from '../../../assets/logo/mlab_logo.png';

// ─── HELPERS ────────────────────────────────────────────────────────────────
const cleanRichText = (html?: string) => {
    if (!html) return '';
    return html.replace(/&nbsp;/g, ' ');
};

const extractPlainText = (htmlString?: string) => {
    if (!htmlString) return '';
    const tmp = document.createElement("DIV");
    tmp.innerHTML = htmlString;
    return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
};

const getSafeDate = (ds: string) => {
    if (!ds) return 'recently';
    const d = new Date(ds);
    return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const formatTime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
};

const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] };
const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// ─── SUB‑COMPONENTS ──────────────────────────────────────────────────────
const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({
    progress, size = 60, strokeWidth = 5, color = "#94c73d"
}) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
            <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
            />
        </svg>
    );
};

const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    useEffect(() => {
        const s = document.createElement('style');
        s.innerHTML = 'body,html{overflow:hidden!important}';
        document.head.appendChild(s);
        return () => { document.head.removeChild(s); };
    }, []);
    return createPortal(
        <div className="ap-modal">
            <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
                <div className="ap-modal-header ap-modal-header--danger">
                    <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
                    <div>
                        <h2 className="ap-modal-title">Lodge Formal Appeal</h2>
                        <p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p>
                    </div>
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

// ─── PROPS ──────────────────────────────────────────────────────────────────
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
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────
export const AssessmentPlayerContent: React.FC<AssessmentPlayerContentProps> = (props) => {
    const {
        user,
        assessment,
        submission,
        answers,
        learnerProfile,
        learnerEnrollment,
        assessorProfile,
        moderatorProfile,
        facilitatorProfile,
        employers,
        staff,
        approvedLogs,
        logsLoading,
        saving,
        uploadProgress,
        activeTabs,
        setActiveTabs,
        timeLeft,
        isGloballyLocked,
        isAwaitingSignoff,
        isPracticalModule,
        isWorkplaceModule,
        isFacDone,
        isAssDone,
        isModDone,
        isSubmitted,
        showLeaveWarning,
        setShowLeaveWarning,
        showSubmitConfirm,
        setShowSubmitConfirm,
        showAppealModal,
        setShowAppealModal,
        declarationChecked,
        setDeclarationChecked,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        willBeProctored,
        savedFacRole,
        grandTotalAwarded,
        grandTotalMax,
        grandTotalPct,
        sectionTotals,
        outcome,
        safeNavigateBack,
        handleAnswerChange,
        handleTaskAnswerChange,
        handleNestedAnswerChange,
        handleFileUpload,
        triggerSubmitConfirm,
        executeSubmit,
        executeAppeal,
        preventCopyPasteAndDrop,
        getBlockGrading,
        isBlockVerified,
        toast,
    } = props;

    // ─── Navigation items ──────────────────────────────────────────────────
    const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
        if (block.type === 'section') {
            acc.push({ type: 'section', label: block.title, id: block.id });
        } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
            const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
            acc.push({ type: 'q', label: cleanLabel, id: block.id });
        }
        return acc;
    }, []) || [];

    const displayStatus = submission.status.replace('_', ' ');
    const canEditTask = !isGloballyLocked;
    const canEditChecklist = !isGloballyLocked;
    const canEditLogbook = !isGloballyLocked;
    const canEditWorkplace = !isGloballyLocked;

    // ─── Render block image helper ──────────────────────────────────────────
    const renderBlockImage = (block: any) => {
        if (!block.imageUrl) return null;
        return (
            <div style={{ margin: '1rem 0', textAlign: 'center' }}>
                <img
                    src={block.imageUrl}
                    alt={block.imageCaption || "Assessment attachment"}
                    style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }}
                />
                {block.imageCaption && (
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>
                        {block.imageCaption}
                    </p>
                )}
            </div>
        );
    };

    // ─── Workplace info ──────────────────────────────────────────────────────
    const workplaceInfo = useMemo(() => {
        if (!learnerEnrollment) return null;
        const employer = learnerEnrollment.employerId ? employers.find((e: any) => e.id === learnerEnrollment.employerId) : null;
        const mentor = learnerEnrollment.mentorId ? staff.find((s: any) => s.id === learnerEnrollment.mentorId) : null;
        return { employer, mentor };
    }, [learnerEnrollment, employers, staff]);

    // ─── QNUM COUNTER ────────────────────────────────────────────────────────
    let qNum = 0;

    // ─── MAIN JSX ───────────────────────────────────────────────────────────
    return (
        <ProctoringWrapper
            assessmentId={assessment.id}
            learnerId={submission.authUid}
            isProctored={willBeProctored}
        >
            <div className="ap-player ap-animate">
                <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

                {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

                {showLeaveWarning && (
                    <ConfirmModal
                        title="Leave Timed Assessment?"
                        message="Your timer will NOT pause. If you leave, the clock continues counting down in the background."
                        confirmText="Yes, Leave"
                        cancelText="Stay Here"
                        onConfirm={safeNavigateBack}
                        onCancel={() => setShowLeaveWarning(false)}
                    />
                )}
                {showSubmitConfirm && (
                    <ConfirmModal
                        title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"}
                        message={isAwaitingSignoff
                            ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading."
                            : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."}
                        confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"}
                        cancelText="Go Back"
                        onConfirm={executeSubmit}
                        onCancel={() => setShowSubmitConfirm(false)}
                    />
                )}
                {showAppealModal && (
                    <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />
                )}

                {/* ── TOP BAR ── */}
                <div className="ap-player-topbar no-print">
                    <div className="ap-player-topbar__left">
                        <button className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
                        <button className="ap-player-topbar__back" onClick={safeNavigateBack}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
                        <div className="ap-player-topbar__separator ap-hide-mobile" />
                        <h1 className="ap-player-topbar__title">
                            {assessment.title}
                            {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
                        </h1>
                    </div>
                    <div className="ap-player-topbar__right">
                        {assessment?.isOpenBook && assessment?.referenceManualUrl && (
                            <button className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}>
                                <FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span>
                            </button>
                        )}
                        {isGloballyLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}

                        {/* Active Countdown Timer */}
                        {!isGloballyLocked && !isPracticalModule && timeLeft !== null && (
                            <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}>
                                <Timer size={14} /> {formatTime(timeLeft)}
                            </div>
                        )}

                        {/* Frozen 'Time Taken' Badge (Shows ONLY when submitted) */}
                        {isGloballyLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && (
                            <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}>
                                <Timer size={14} />
                                {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken
                            </div>
                        )}

                        {!isGloballyLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
                        <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>
                            {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}
                        </span>
                        <span className={`ap-status-badge${isGloballyLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
                    </div>
                </div>

                {/* ── BODY ── */}
                <div className={`ap-player-body${isGloballyLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>

                    {/* ── LEFT SIDEBAR ── */}
                    <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
                        <button className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>

                        <div className="ap-sidebar__meta-block">
                            <div className="ap-sidebar__meta-title">{assessment.title}</div>
                            {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
                            <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
                            {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
                            {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
                        </div>

                        {/* SCORE DISPLAY FOR LEARNER */}
                        {!isWorkplaceModule && isFacDone && (
                            <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
                                <div className="ap-score-card__stripe" aria-hidden="true" />

                                <div className="ap-score-card__state">
                                    {isModDone ? (
                                        <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</>
                                    ) : (
                                        <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>
                                    )}
                                </div>

                                <div className="ap-score-card__body">
                                    <div className="ap-score-card__ring-wrap">
                                        <ProgressRing
                                            progress={grandTotalPct}
                                            size={72}
                                            strokeWidth={5}
                                            color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'}
                                        />
                                        <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>
                                            {grandTotalPct}%
                                        </span>
                                    </div>
                                    <div className="ap-score-card__divider" aria-hidden="true" />
                                    <div className="ap-score-card__fraction">
                                        <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
                                        <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
                                        <span className="ap-score-card__pass-note">
                                            Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)
                                        </span>
                                    </div>
                                </div>

                                {isModDone && outcome && (
                                    <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>
                                        {outcome.isCompetent
                                            ? <><CheckCircle size={13} /> Competent (C)</>
                                            : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}
                                    </div>
                                )}
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

                                    {submission?.appeal?.status && submission.appeal.status !== 'pending' && (
                                        <div className="ap-sidebar__feedback" style={{ background: submission.appeal.status === 'upheld' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)', borderLeftColor: submission.appeal.status === 'upheld' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)' }}>
                                            <strong className="ap-sidebar__feedback__heading" style={{ color: submission.appeal.status === 'upheld' ? '#4ade80' : '#ef4444' }}>
                                                <Scale size={11} /> Board Appeal {submission.appeal.status === 'upheld' ? 'Granted' : 'Rejected'}
                                            </strong>
                                            <p className="ap-sidebar__feedback__text" style={{ color: submission.appeal.status === 'upheld' ? '#4ade80' : '#ef4444' }}>
                                                "{submission.appeal.resolutionNotes}"
                                            </p>
                                        </div>
                                    )}

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

                    {/* ── CONTENT ── */}
                    <div className="ap-player-content print-pane">

                        {/* Print cover */}
                        {isGloballyLocked && !isAwaitingSignoff && (
                            <div className="print-only-cover">
                                <div className="print-page print-page--cover">
                                    <div className="print-cover__logo-bar">
                                        <img height={50} src={mLabLogo} alt="Institution Logo" />
                                        <span className="print-cover__doc-type">Official Assessment Workbook</span>
                                    </div>
                                    <div className="print-cover__title-block">
                                        <h1 className="print-cover__module-title">
                                            {assessment?.moduleInfo?.moduleName || assessment?.title}
                                        </h1>
                                        <div className="print-cover__meta-chips">
                                            <span className="print-cover__chip">NQF Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</span>
                                            <span className="print-cover__chip">Credits: {assessment?.moduleInfo?.credits || 'N/A'}</span>
                                            <span className="print-cover__chip">Hours: {assessment?.moduleInfo?.notionalHours || 'N/A'}</span>
                                            {submission?.attemptNumber > 1 && <span className="print-cover__chip print-cover__chip--attempt">Attempt #{submission.attemptNumber}</span>}
                                        </div>
                                        <h2 className="print-cover__doc-subtitle">
                                            LEARNER {assessment?.moduleType === 'workplace' ? 'WORKPLACE LOGBOOK' : 'WORKBOOK'}
                                        </h2>
                                    </div>

                                    {/* Timing & Duration Audit */}
                                    {isGloballyLocked && !isPracticalModule && (
                                        <div className="ap-print-only-timing-block" style={{
                                            marginTop: '20px',
                                            marginBottom: '20px',
                                            borderRadius: '8px',
                                        }}>
                                            <div className="print-cover__table-heading">TIMING & DURATION AUDIT</div>
                                            <table className="print-table">
                                                <tbody>
                                                    <tr><td className="print-table__label">Maximum Allowed Time: </td><td> {(assessment?.moduleInfo?.timeLimit || 0) + (submission?.extraTimeGranted || 0) > 0
                                                        ? `${(assessment?.moduleInfo?.timeLimit || 0) + (submission?.extraTimeGranted || 0)} Minutes`
                                                        : 'Untimed'}</td></tr>
                                                    <tr><td className="print-table__label">Actual Time Taken:  </td><td>{submission?.startedAt && submission?.submittedAt
                                                        ? formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))
                                                        : 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Session Started: </td><td>{submission?.startedAt ? getSafeDate(submission.startedAt) : 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Session Submitted:</td><td>{submission?.submittedAt ? getSafeDate(submission.submittedAt) : 'N/A'}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    <div className="print-cover__tables">
                                        <div className="print-cover__table-group">
                                            <div className="print-cover__table-heading">MODULE INFORMATION</div>
                                            <table className="print-table">
                                                <tbody>
                                                    <tr><td className="print-table__label">Module Number</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Notional Hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Credits</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="print-cover__table-group">
                                            <div className="print-cover__table-heading">LEARNER CONTACT INFORMATION</div>
                                            <table className="print-table">
                                                <tbody>
                                                    <tr><td className="print-table__label">Full Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">ID Number</td><td>{submission?.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Email Address</td><td>{learnerProfile?.email || user?.email || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    {assessment?.moduleType === 'workplace' && workplaceInfo?.employer && (
                                        <div className="print-cover__table-group">
                                            <div className="print-cover__table-heading">WORKPLACE PLACEMENT DETAILS</div>
                                            <table className="print-table">
                                                <tbody>
                                                    <tr><td className="print-table__label">Host Company Name</td><td>{workplaceInfo.employer.name}</td></tr>
                                                    <tr><td className="print-table__label">Registration / SETA Number</td><td>{workplaceInfo.employer.registrationNumber || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Physical Address</td><td>{workplaceInfo.employer.physicalAddress || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Contact Person</td><td>{workplaceInfo.employer.contactPerson}</td></tr>
                                                    <tr><td className="print-table__label">Assigned Workplace Mentor</td><td>{workplaceInfo.mentor?.fullName || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Mentor Contact</td><td>{workplaceInfo.employer.contactEmail || workplaceInfo.mentor?.email}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    <div className="print-cover__footer-bar">
                                        <span>Printed: {new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                        <span>Submission ID: {submission?.id?.slice(0, 12) || 'N/A'}</span>
                                    </div>
                                </div>

                                <div className="print-page print-page--instructions">
                                    <h2 className="print-section-heading">Note to the Learner</h2>
                                    {/* 🚀 FIXED HTML PARSING FOR PRINT */}
                                    <div className="print-body-text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment?.instructions || '') }} />

                                    {assessment?.purpose && (
                                        <>
                                            <h2 className="print-section-heading">Purpose of this Module</h2>
                                            {/* 🚀 FIXED HTML PARSING FOR PRINT */}
                                            <div className="print-body-text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment?.purpose || '') }} />
                                        </>
                                    )}
                                    <h2 className="print-section-heading">Topic Elements Covered</h2>
                                    <table className="print-table print-table--topics">
                                        <thead><tr><th className="print-table__th">Section</th><th className="print-table__th print-table__th--narrow">Weighting</th></tr></thead>
                                        <tbody>
                                            {assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, i: number) => {
                                                const tot = sectionTotals[sec.id]?.total || 0;
                                                return (
                                                    <tr key={i}>
                                                        <td><strong>Section {i + 1}: </strong>{sec.title}</td>
                                                        <td className="print-table__td--center">
                                                            {isWorkplaceModule ? 'Competency Based' : (tot > 0 && assessment.totalMarks ? `${Math.round((tot / assessment.totalMarks) * 100)}%` : '—')}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Remediation record page */}
                                {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
                                    <div className="print-page print-page--remediation">
                                        <h2 className="print-section-heading">Record of Developmental Intervention (Remediation)</h2>
                                        <p className="print-body-text">Official evidence of a developmental intervention conducted prior to Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>
                                        <table className="print-table">
                                            <tbody>
                                                <tr><td className="print-table__label">Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
                                                <tr><td className="print-table__label">Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString('en-ZA')}</td></tr>
                                                <tr><td className="print-table__label">Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
                                                <tr><td className="print-table__label print-table__label--vtop">Coaching Notes</td><td className="print-table__td--prewrap">{submission.latestCoachingLog.notes}</td></tr>
                                            </tbody>
                                        </table>
                                        <div className="sr-signature-block print-sig-row">
                                            <div className="sr-sig-box sr-sig-box--fac">
                                                <span className="sr-sig-box__label sr-sig-box__label--fac">Facilitator Declaration</span>
                                                {submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl
                                                    ? <img src={submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
                                                    : <div className="sr-sig-no-image">No Canvas Signature</div>}
                                                <strong className="sr-sig-box__name sr-sig-box__name--fac">{submission.latestCoachingLog.facilitatorName}</strong>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--fac">Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString('en-ZA')}</em>
                                                <div className="sr-sig-line sr-sig-line--fac">Coaching Conducted</div>
                                            </div>
                                            <div className="sr-sig-box sr-sig-box--learner">
                                                <span className="sr-sig-box__label sr-sig-box__label--learner">Learner Acknowledgement</span>
                                                {submission.latestCoachingLog.acknowledged ? (
                                                    <>
                                                        {submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl
                                                            ? <img src={submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl} alt="Learner Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
                                                            : <div className="sr-sig-no-image">No Canvas Signature</div>}
                                                        <strong className="sr-sig-box__name sr-sig-box__name--learner">{learnerProfile?.fullName || user?.fullName}</strong>
                                                        <em className="sr-sig-box__meta sr-sig-box__meta--learner">Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString('en-ZA')}</em>
                                                        <div className="sr-sig-line sr-sig-line--learner">Intervention Received</div>
                                                    </>
                                                ) : (
                                                    <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span></div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="ap-blocks">
                            {assessment.blocks?.map((block: any) => {

                                /* Section */
                                if (block.type === 'section') {
                                    const totals = sectionTotals[block.id];
                                    return (
                                        <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
                                            <span>{block.title}</span>
                                            {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
                                            {/* FIXED HTML PARSING FOR SECTION */}
                                            {block.content && <div className="quill-read-only-content ap-block-section__content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />}
                                            {renderBlockImage(block)}
                                        </div>
                                    );
                                }

                                /* Info */
                                if (block.type === 'info') return (
                                    <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
                                        <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
                                        {/* FIXED HTML PARSING FOR INFO CONTENT */}
                                        <div className="quill-read-only-content ap-block-info__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
                                        {renderBlockImage(block)}
                                    </div>
                                );

                                /* Question blocks */
                                if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
                                    qNum++;
                                    const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
                                    const learnerAns = answers[block.id];
                                    let inkColor = '#64748b';
                                    if (isModDone) inkColor = 'var(--mlab-green)';
                                    else if (isAssDone) inkColor = 'var(--mlab-red)';
                                    else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';
                                    const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
                                    const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);
                                    const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
                                    const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : `Q${qNum}.`;

                                    // ─── 🚀 LIVE UPLOAD LOCK MECHANISM ──
                                    // Determines if the user is allowed to edit or upload evidence for THIS specific block
                                    const isSectionVerified = isBlockVerified(block.id);
                                    const isUploadLocked = isGloballyLocked || isSectionVerified;

                                    return (
                                        <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isUploadLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
                                            <div className="ap-block-question__header">
                                                <div className="ap-block-question__text-wrap">
                                                    <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

                                                        {/* FIXED HTML PARSING FOR QUESTIONS */}
                                                        {block.type === 'qcto_workplace' ? (
                                                            <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
                                                        ) : block.question ? (
                                                            <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
                                                        ) : block.title ? (
                                                            <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title) }} />
                                                        ) : null}
                                                    </span>
                                                    <div className="ap-grade-indicators">
                                                        {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac" title="Facilitator Pre-Mark">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
                                                        {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass" title="Assessor Grade">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
                                                        {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod" title="Moderator QA">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
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
                                                    <div
                                                        className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`}
                                                        onCopyCapture={preventCopyPasteAndDrop}
                                                        onCutCapture={preventCopyPasteAndDrop}
                                                        onPasteCapture={preventCopyPasteAndDrop}
                                                        onDropCapture={preventCopyPasteAndDrop}
                                                        onKeyDownCapture={preventCopyPasteAndDrop}
                                                    >
                                                        {isGloballyLocked && !isAwaitingSignoff ? (
                                                            // FIXED HTML PARSING FOR LEARNER ANSWER (READ ONLY)
                                                            <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
                                                        ) : (
                                                            <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
                                                        )}
                                                    </div>
                                                )}

                                                {/* TASK */}
                                                {block.type === 'task' && (() => {
                                                    const taskTabs = [
                                                        { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text },
                                                        { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl },
                                                        { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url },
                                                        { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl },
                                                        { id: 'code', icon: <Code size={13} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code },
                                                    ].filter(t => t.allowed);
                                                    const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
                                                    const progress = uploadProgress[block.id];
                                                    return (
                                                        <div className="ap-evidence-container">
                                                            {!isSectionVerified && !isGloballyLocked && (
                                                                <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}>
                                                                    <Info size={14} /> You may attach your evidence now. This section will lock automatically once your Facilitator/Mentor verifies it.
                                                                </div>
                                                            )}
                                                            {isSectionVerified && !isGloballyLocked && (
                                                                <div className="ap-evidence-lock-banner" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginBottom: '10px' }}>
                                                                    <Lock size={14} color="#166534" />
                                                                    Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.
                                                                </div>
                                                            )}
                                                            <div className="ap-tab-bar no-print">
                                                                {taskTabs.map(t => <button key={t.id} className={`ap-tab${activeTabId === t.id ? ' ap-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={11} className="ap-tab__done" />}</button>)}
                                                            </div>
                                                            <div className="ap-tab-panel">
                                                                {activeTabId === 'text' && (
                                                                    <div
                                                                        className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`}
                                                                        onCopyCapture={preventCopyPasteAndDrop}
                                                                        onCutCapture={preventCopyPasteAndDrop}
                                                                        onPasteCapture={preventCopyPasteAndDrop}
                                                                        onDropCapture={preventCopyPasteAndDrop}
                                                                        onKeyDownCapture={preventCopyPasteAndDrop}
                                                                    >
                                                                        {isGloballyLocked && !isAwaitingSignoff ? (
                                                                            // FIXED HTML PARSING FOR TASK ANSWER
                                                                            <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns?.text) || '<em>No answer provided.</em>' }} />
                                                                        ) : (
                                                                            <ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" />
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {activeTabId === 'audio' && (learnerAns?.audioUrl ? <audio controls src={learnerAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{isUploadLocked || !canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
                                                                {activeTabId === 'url' && <div>{!isUploadLocked && canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{learnerAns?.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={learnerAns.url} /> : <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}</div>}
                                                                {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : learnerAns?.uploadUrl ? <FilePreview url={learnerAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : <div className="ap-upload-empty">{isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes})</p><input type="file" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} /></>}</div>)}
                                                                {activeTabId === 'code' && <textarea className="ap-code-textarea" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="Paste your code here…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* CHECKLIST */}
                                                {block.type === 'checklist' && (
                                                    <div className="ap-checklist">
                                                        <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item. Upload evidence for each if required below.</p>

                                                        {isSectionVerified && !isGloballyLocked && (
                                                            <div className="ap-checklist__lock-notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
                                                                <Lock size={14} color="#166534" />
                                                                Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.
                                                            </div>
                                                        )}
                                                        {!isAwaitingSignoff && !isSubmitted && !isSectionVerified && (
                                                            <div className="ap-checklist__lock-notice"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>
                                                        )}

                                                        {block.criteria?.map((crit: string, i: number) => {
                                                            const res = criteriaResults?.[i] || {};
                                                            const critKey = `evidence_${i}`;
                                                            const raw = answers[block.id]?.[critKey];
                                                            const critEv = typeof raw === 'string' ? { text: raw } : (raw || {});
                                                            const cTabKey = `${block.id}_${i}`;
                                                            const allTabs = [
                                                                { id: 'upload', icon: <UploadCloud size={12} />, label: 'File', val: critEv?.uploadUrl },
                                                                { id: 'url', icon: <LinkIcon size={12} />, label: 'Link', val: critEv?.url },
                                                                { id: 'code', icon: <Code size={12} />, label: 'Code', val: critEv?.code },
                                                                { id: 'text', icon: <FileText size={12} />, label: 'Notes', val: critEv?.text },
                                                            ];

                                                            const tabs = (!canEditChecklist || isUploadLocked) ? allTabs.filter(t => t.val) : allTabs;
                                                            const activeCtab = activeTabs[cTabKey] || tabs[0]?.id || 'upload';
                                                            const progress = uploadProgress[`${block.id}_${critKey}`];

                                                            return (
                                                                <div key={i} className="ap-checklist__item">
                                                                    <p className="ap-checklist__item-title">{i + 1}. {crit}</p>
                                                                    <div className="ap-checklist__assessor-row">
                                                                        {isFacDone ? (
                                                                            <><span className={`ap-checklist__status-chip${res.status === 'C' ? ' ap-checklist__status-chip--c' : res.status === 'NYC' ? ' ap-checklist__status-chip--nyc' : ' ap-checklist__status-chip--pending'}`}>{res.status ? (savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')) : 'Not Graded'}</span>{res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}</>
                                                                        ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
                                                                    </div>
                                                                    {block.requireEvidencePerCriterion !== false && (
                                                                        <div className="ap-checklist__evidence-tabs">
                                                                            <div className="ap-checklist__tab-bar">
                                                                                {tabs.length > 0 ? tabs.map(t => <button key={t.id} className={`ap-checklist__tab${activeCtab === t.id ? ' ap-checklist__tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [cTabKey]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}</button>) : <div className="ap-checklist__no-evidence">No evidence provided.</div>}
                                                                            </div>
                                                                            {tabs.length > 0 && (
                                                                                <div className="ap-checklist__tab-panel">
                                                                                    {activeCtab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : critEv.uploadUrl ? <FilePreview url={critEv.uploadUrl} onRemove={!isUploadLocked && canEditChecklist ? () => handleNestedAnswerChange(block.id, critKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditChecklist} /> : <input type="file" disabled={isUploadLocked || !canEditChecklist} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, critKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
                                                                                    {activeCtab === 'url' && (<div>{canEditChecklist && !isUploadLocked && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{critEv.url && (isUploadLocked || !canEditChecklist) ? <UrlPreview url={critEv.url} /> : <input type="url" className="ab-input" value={critEv.url || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditChecklist} placeholder="https://…" />}</div>)}
                                                                                    {activeCtab === 'code' && <textarea className="ap-code-textarea" rows={3} value={critEv.code || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'code', e.target.value)} disabled={isUploadLocked || !canEditChecklist} placeholder="Paste code snippet…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
                                                                                    {activeCtab === 'text' && (
                                                                                        <div className={`ap-quill-wrapper${isUploadLocked || !canEditChecklist ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
                                                                                            {isGloballyLocked && !isAwaitingSignoff ? (
                                                                                                // FIXED HTML PARSING FOR CHECKLIST TEXT
                                                                                                <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(critEv.text) || '<em>No notes provided.</em>' }} />
                                                                                            ) : (
                                                                                                <ReactQuill theme="snow" value={critEv.text || ''} onChange={c => handleNestedAnswerChange(block.id, critKey, 'text', c)} readOnly={isUploadLocked || !canEditChecklist} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" />
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* LOGBOOK */}
                                                {block.type === 'logbook' && (
                                                    <div className="ap-logbook">
                                                        {/* FIXED HTML PARSING FOR LOGBOOK TITLE */}
                                                        <div className="quill-read-only-content ap-logbook__desc" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />

                                                        {!isSectionVerified && !isGloballyLocked && (
                                                            <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}>
                                                                <Info size={14} /> You may attach your evidence now. This section will lock automatically once your Mentor verifies it.
                                                            </div>
                                                        )}
                                                        {isSectionVerified && !isGloballyLocked && (
                                                            <div className="ap-evidence-lock-banner" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginBottom: '10px' }}>
                                                                <Lock size={14} color="#166534" />
                                                                Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.
                                                            </div>
                                                        )}

                                                        <table className="ap-logbook__table">
                                                            <thead className="ap-logbook__thead">
                                                                <tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{!isUploadLocked && canEditLogbook && <th style={{ width: '40px' }}></th>}</tr>
                                                            </thead>
                                                            <tbody>
                                                                {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
                                                                    <tr key={i} className="ap-logbook__tbody">
                                                                        <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td ap-logbook__task-cell">
                                                                            <div className={`ap-quill-wrapper ap-quill-wrapper--logbook${isUploadLocked || !canEditLogbook ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
                                                                                {isGloballyLocked && !isAwaitingSignoff ? (
                                                                                    // FIXED HTML PARSING FOR LOGBOOK ENTRY
                                                                                    <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} />
                                                                                ) : (
                                                                                    <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={isUploadLocked || !canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />
                                                                                )}
                                                                            </div>
                                                                            {entry.uploadUrl && <div style={{ marginTop: '10px' }}><FilePreview url={entry.uploadUrl} disabled /></div>}
                                                                            {entry.url && <div style={{ marginTop: '10px' }}><UrlPreview url={entry.url} /></div>}
                                                                        </td>
                                                                        <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
                                                                        {!isUploadLocked && canEditLogbook && <td className="ap-logbook__td"><button className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
                                                                    </tr>
                                                                ))}
                                                                {!isUploadLocked && canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
                                                                <tr className="ap-logbook__totals-row">
                                                                    <td colSpan={4} className="ap-logbook__totals-label">Total Logged Hours:</td>
                                                                    <td className="ap-logbook__totals-val" style={(() => { const logged = (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0); return block.requiredHours && logged < block.requiredHours ? { color: '#dc2626', fontWeight: 'bold' } : {}; })()}>
                                                                        {(Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0)}
                                                                        {block.requiredHours && (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0) < block.requiredHours && <span className="ap-logbook__hours-warning">⚠ Required: {block.requiredHours} hrs</span>}
                                                                    </td>
                                                                    {!isUploadLocked && canEditLogbook && <td></td>}
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}

                                                {/* QCTO WORKPLACE */}
                                                {block.type === 'qcto_workplace' && (
                                                    <div className="ap-workplace">
                                                        <div className="quill-read-only-content" style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />

                                                        {!isSectionVerified && !isGloballyLocked && (
                                                            <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}>
                                                                <Info size={14} /> You may attach your evidence now. This section will lock automatically once your Mentor verifies it.
                                                            </div>
                                                        )}
                                                        {isSectionVerified && !isGloballyLocked && (
                                                            <div className="ap-evidence-lock-banner" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginBottom: '10px' }}>
                                                                <Lock size={14} color="#166534" />
                                                                Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.
                                                            </div>
                                                        )}

                                                        {block.workActivities?.map((wa: any) => {
                                                            const waTask = learnerAns?.[`wa_${wa.id}_task`] || '';
                                                            const waDate = learnerAns?.[`wa_${wa.id}_date`] || new Date().toISOString().split('T')[0];
                                                            const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
                                                            return (
                                                                <div key={wa.id} className="ap-workplace__activity">
                                                                    <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>

                                                                    <div className="ap-workplace__fields">
                                                                        {/* Auto-Hydrated Task View */}
                                                                        <div className="ap-workplace__field">
                                                                            <label className="ap-workplace__field-label">Verified Task (Auto-pulled from Logbook)</label>

                                                                            {(() => {
                                                                                // Find the specific approved log for this Work Activity
                                                                                const matchedLog = approvedLogs.find(log => log.workActivityId === wa.id);

                                                                                if (logsLoading) return <div className="ap-spinner ap-spinner--sm" />;

                                                                                if (matchedLog) {
                                                                                    return (
                                                                                        <div className="quill-read-only-content" style={{ padding: '0.75rem', background: '#ecfdf5', border: '1px solid #10b981', borderRadius: '4px' }}>
                                                                                            <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 'bold', marginBottom: '4px' }}>
                                                                                                ✓ Mentor Approved on {new Date(matchedLog.approvedAt || matchedLog.date).toLocaleDateString()}
                                                                                            </div>
                                                                                            <div dangerouslySetInnerHTML={{ __html: cleanRichText(matchedLog.taskDescription) }} />
                                                                                        </div>
                                                                                    );
                                                                                }

                                                                                return (
                                                                                    <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #ef4444', borderRadius: '4px', color: '#b91c1c', fontSize: '0.9rem' }}>
                                                                                        ⚠ No approved log found for this activity. Please complete this task in your daily logbook and await mentor approval.
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    </div>


                                                                    {(wa.evidenceItems || []).length > 0 && (
                                                                        <div className="ap-workplace__se-block">
                                                                            <span className="ap-workplace__se-title">Supporting Evidence Required:</span>
                                                                            {wa.evidenceItems.map((se: any) => {
                                                                                const seKey = `se_${se.id}`;
                                                                                const seData = learnerAns?.[seKey] || {};
                                                                                const seTabs = [{ id: 'upload', icon: <UploadCloud size={13} />, label: 'Document', val: seData.uploadUrl }, { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', val: seData.url }, { id: 'text', icon: <FileText size={13} />, label: 'Reflection', val: seData.text }];
                                                                                const activeSeTab = activeTabs[`${block.id}_${se.id}`] || seTabs[0].id;
                                                                                const progress = uploadProgress[`${block.id}_${seKey}`];
                                                                                return (
                                                                                    <div key={se.id} className="ap-workplace__se-item">
                                                                                        <strong className="ap-workplace__se-item__code">{se.code}: {se.description}</strong>
                                                                                        <div className="ap-workplace__se-tabs">
                                                                                            <div className="ap-workplace__se-tab-bar no-print">{seTabs.map(t => <button key={t.id} className={`ap-workplace__se-tab${activeSeTab === t.id ? ' ap-workplace__se-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [`${block.id}_${se.id}`]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}</button>)}</div>
                                                                                            <div className="ap-workplace__se-tab-panel">
                                                                                                {activeSeTab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : seData.uploadUrl ? <FilePreview url={seData.uploadUrl} onRemove={!isUploadLocked && canEditWorkplace ? () => handleNestedAnswerChange(block.id, seKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditWorkplace} /> : <input type="file" disabled={isUploadLocked || !canEditWorkplace} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, seKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
                                                                                                {activeSeTab === 'url' && <div>{!isUploadLocked && canEditWorkplace && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{seData.url && (isUploadLocked || !canEditWorkplace) ? <UrlPreview url={seData.url} /> : <input type="url" className="ab-input" value={seData.url || ''} onChange={e => handleNestedAnswerChange(block.id, seKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditWorkplace} placeholder="https://…" />}</div>}
                                                                                                {activeSeTab === 'text' && (
                                                                                                    <div className={`ap-quill-wrapper${isUploadLocked || !canEditWorkplace ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
                                                                                                        {isGloballyLocked && !isAwaitingSignoff ? (
                                                                                                            // FIXED HTML PARSING FOR WORKPLACE EVIDENCE
                                                                                                            <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(seData.text) || '<em>No notes provided.</em>' }} />
                                                                                                        ) : (
                                                                                                            <ReactQuill theme="snow" value={seData.text || ''} onChange={c => handleNestedAnswerChange(block.id, seKey, 'text', c)} readOnly={isUploadLocked || !canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" />
                                                                                                        )}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                    <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
                                                                        <input type="checkbox" disabled={isUploadLocked || !canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
                                                                        <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
                                                                    </label>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
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

                        {/* PRINT-ONLY: OVERALL FEEDBACK + APPEAL RECORD */}
                        {isGloballyLocked && !isAwaitingSignoff && (
                            <div className="print-page print-page--feedback print-only">
                                <h2 className="print-section-heading">Overall Assessment Feedback</h2>

                                {submission.grading?.facilitatorOverallFeedback && (
                                    <div className="print-fb print-fb--fac">
                                        <h4 className="print-fb__title print-fb__title--fac">
                                            {submission.grading?.facilitatorRole === 'mentor' ? 'Mentor / Supervisor Comments' : 'Facilitator Remarks'}
                                        </h4>
                                        <p className="print-fb__body print-fb__body--fac">{submission.grading.facilitatorOverallFeedback}</p>
                                    </div>
                                )}

                                {(submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
                                    <div className="print-fb print-fb--ass">
                                        <h4 className="print-fb__title print-fb__title--ass">Assessor Grading Remarks</h4>
                                        <p className="print-fb__body print-fb__body--ass">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p>
                                    </div>
                                )}

                                {submission.moderation?.feedback && (
                                    <div className="print-fb print-fb--mod">
                                        <h4 className="print-fb__title print-fb__title--mod">Moderator QA Notes</h4>
                                        <p className="print-fb__body print-fb__body--mod">{submission.moderation.feedback}</p>
                                    </div>
                                )}

                                {submission?.appeal?.status && (
                                    <div className={`print-fb print-fb--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                        <h4 className={`print-fb__title print-fb__title--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                            Formal Appeal Record — {submission.appeal.status === 'upheld' ? 'Appeal Granted' : submission.appeal.status === 'pending' ? 'Appeal Pending' : 'Appeal Rejected'}
                                        </h4>
                                        <p className="print-fb__appeal-reason"><strong>Learner's Reason:</strong> "{submission.appeal.reason}"</p>
                                        {submission.appeal.status !== 'pending' && (
                                            <p className={`print-fb__body print-fb__body--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                                <strong>Board Resolution:</strong> "{submission.appeal.resolutionNotes}"
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* PRINT-ONLY + SCREEN: SIGNATURE BLOCK */}
                        {isGloballyLocked && !isAwaitingSignoff && (
                            <div className="print-page print-page--signatures print-only">
                                <h2 className="print-section-heading">Official Signatures &amp; Declarations</h2>
                                <div className="sr-signature-block print-sig-row">

                                    <div className="sr-sig-box sr-sig-box--learner">
                                        <span className="sr-sig-box__label sr-sig-box__label--learner">Learner Declaration</span>
                                        {isSubmitted ? (
                                            <>
                                                {submission.learnerDeclaration?.signatureUrl
                                                    ? <img src={submission.learnerDeclaration.signatureUrl} alt="Learner signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
                                                    : <div className="sr-sig-no-image">Digitally Authenticated<br />(ECTA Compliant)</div>}
                                                <strong className="sr-sig-box__name sr-sig-box__name--learner">{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '—'}</strong>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--learner">Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString('en-ZA')}</em>
                                                <div className="sr-sig-line sr-sig-line--learner">Digital Timestamp Authenticated</div>
                                            </>
                                        ) : (
                                            <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--learner">Awaiting Submission</div></div>
                                        )}
                                    </div>

                                    <div className="sr-sig-box sr-sig-box--fac">
                                        <span className="sr-sig-box__label sr-sig-box__label--fac">
                                            {submission.grading?.facilitatorRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Marking'}
                                        </span>
                                        {isFacDone && submission.grading?.facilitatorReviewedAt ? (
                                            <>
                                                {submission.grading?.facilitatorSignatureUrl
                                                    ? <img src={submission.grading.facilitatorSignatureUrl} alt="Facilitator Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
                                                    : <div className="sr-sig-no-image">System Authenticated</div>}
                                                <strong className="sr-sig-box__name sr-sig-box__name--fac">{submission.grading?.facilitatorName || 'Facilitator'}</strong>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--fac">Signed: {new Date(submission.grading.facilitatorReviewedAt).toLocaleDateString('en-ZA')}</em>
                                                <div className="sr-sig-line sr-sig-line--fac">
                                                    {submission.grading?.facilitatorRole === 'mentor' ? 'Workplace Verification Confirmed' : 'Pre-Marking Completed'}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="sr-sig-pending"><span className="sr-sig-pending__text">Digitally Authenticated</span><div className="sr-sig-line sr-sig-line--fac">Verification</div></div>
                                        )}
                                    </div>

                                    <div className="sr-sig-box sr-sig-box--ass">
                                        <span className="sr-sig-box__label sr-sig-box__label--ass">Assessor Sign-off</span>
                                        {isAssDone && submission.grading?.gradedAt ? (
                                            <>
                                                {submission.grading?.assessorSignatureUrl
                                                    ? <img src={submission.grading.assessorSignatureUrl} alt="Assessor Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
                                                    : <div className="sr-sig-no-image">No Canvas Signature</div>}
                                                <strong className="sr-sig-box__name sr-sig-box__name--ass">{submission.grading?.assessorName || '—'}</strong>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--ass">Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--ass">Signed: {new Date(submission.grading.gradedAt).toLocaleDateString('en-ZA')}</em>
                                                <div className="sr-sig-line sr-sig-line--ass">Digital Signature Confirmed</div>
                                            </>
                                        ) : (
                                            <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--ass">Awaiting Assessment</div></div>
                                        )}
                                    </div>

                                    <div className="sr-sig-box sr-sig-box--mod">
                                        <span className="sr-sig-box__label sr-sig-box__label--mod">Internal Moderation</span>
                                        {isModDone && submission.moderation?.moderatedAt ? (
                                            <>
                                                {submission.moderation?.moderatorSignatureUrl
                                                    ? <img src={submission.moderation.moderatorSignatureUrl} alt="Moderator Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
                                                    : moderatorProfile?.signatureUrl
                                                        ? <img src={moderatorProfile.signatureUrl} alt="Moderator fallback" />
                                                        : <div className="sr-sig-no-image">No Canvas Signature</div>}
                                                <strong className="sr-sig-box__name sr-sig-box__name--mod">{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</strong>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--mod">Outcome: {submission.moderation?.outcome}</em>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--mod">Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString('en-ZA')}</em>
                                                <div className="sr-sig-line sr-sig-line--mod">QA Sign-off Confirmed</div>
                                            </>
                                        ) : (
                                            <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--mod">Awaiting Moderation</div></div>
                                        )}
                                    </div>

                                    {submission?.appeal?.status && submission.appeal.status !== 'pending' && (
                                        <div className={`sr-sig-box sr-sig-box--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                            <span className={`sr-sig-box__label sr-sig-box__label--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                                Appeal Resolution
                                            </span>
                                            {submission.appeal?.resolvedBySignatureUrl ? (
                                                <img src={submission.appeal.resolvedBySignatureUrl} alt="Board Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
                                            ) : <div className="sr-sig-no-image">Resolved Digitally</div>}
                                            <strong className={`sr-sig-box__name sr-sig-box__name--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                                {submission.appeal?.resolvedByName || 'Academic Board'}
                                            </strong>
                                            <em className={`sr-sig-box__meta sr-sig-box__meta--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                                Resolved: {submission.appeal?.resolvedAt ? new Date(submission.appeal.resolvedAt).toLocaleDateString('en-ZA') : 'N/A'}
                                            </em>
                                            <div className={`sr-sig-line sr-sig-line--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                                Board Decision Finalised
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── FOOTER ── */}
                        {isAwaitingSignoff ? (
                            <div className="ap-footer ap-footer--signoff no-print">
                                <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
                                <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
                                <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
                                    <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
                                    <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
                                </label>
                                <div className="ap-footer-actions">
                                    <span className="ap-autosave-label">{saving && <><div className="ap-spinner ap-spinner--sm" /> Saving…</>}{Object.keys(uploadProgress).length > 0 && <span className="ap-uploads-label ap-uploads-label--amber">Uploads in progress…</span>}</span>
                                    <button className="ap-btn ap-btn--amber" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}><Save size={14} /> Acknowledge & Submit for Grading</button>
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
                                    <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}{Object.keys(uploadProgress).length > 0 && <span className="ap-uploads-label">Uploads in progress…</span>}</span>
                                    <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}><Save size={14} /> Submit for Grading</button>
                                </div>
                            </div>
                        ) : (
                            <div className="ap-footer ap-footer--locked no-print">
                                <div className="ap-footer--locked__icon-wrap">
                                    {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
                                </div>
                                {isModDone && outcome?.isCompetent === false ? (
                                    <>
                                        <h3 className="ap-footer--locked__title ap-footer--locked__title--amber">Assessment Outcome: Not Yet Competent (NYC)</h3>
                                        <div className="ap-remediation-box">
                                            <p>Your assessment has been fully verified. At this stage, you have not yet met all the requirements for competency.</p>
                                            {(submission.attemptNumber || 1) >= 3 ? (
                                                <div className="ap-remediation-box__lockout">
                                                    <h4 className="ap-remediation-box__lockout-title"><ShieldAlert size={15} /> Maximum Attempts Reached</h4>
                                                    <p>You have exhausted all 3 permitted attempts. Under QCTO regulations, this workbook is permanently locked. You must re-enrol in the module or lodge a formal appeal.</p>
                                                </div>
                                            ) : (
                                                <><h4 className="ap-remediation-box__steps-title">What happens next?</h4><ol className="ap-remediation-box__steps"><li><strong>Review Feedback:</strong> Scroll up and review the Assessor's feedback on your incorrect answers.</li><li><strong>Coaching:</strong> Your facilitator will schedule a brief intervention to discuss the feedback.</li><li><strong>Remediation:</strong> Your facilitator will unlock this workbook for Attempt {submission.attemptNumber ? submission.attemptNumber + 1 : 2} of 3.</li></ol></>
                                            )}
                                            <div className="ap-remediation-box__appeal-section">
                                                <p className="ap-remediation-box__appeal">
                                                    <strong>Academic Rights:</strong> If you disagree with this outcome, you have the right to lodge a formal appeal.
                                                </p>
                                                {submission.appeal?.status === 'pending' ? (
                                                    <div className="ap-appeal-status ap-appeal-status--pending"><Clock size={15} /> <span><strong>Appeal Pending:</strong> Your formal appeal is currently under investigation by the Academic Board.</span></div>
                                                ) : submission.appeal?.status === 'rejected' ? (
                                                    <div className="ap-appeal-status ap-appeal-status--rejected"><X size={15} /> <span><strong>Appeal Concluded:</strong> Your appeal was reviewed and the original outcome was upheld.</span></div>
                                                ) : (
                                                    <button className="ap-btn ap-btn--outline ap-btn--outline-danger" onClick={() => setShowAppealModal(true)}><AlertTriangle size={14} /> Lodge Formal Appeal</button>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : isModDone && outcome?.isCompetent === true ? (
                                    <>
                                        <h3 className="ap-footer--locked__title" style={{ color: 'var(--mlab-green)' }}>Congratulations! You are Competent.</h3>
                                        <p className="ap-footer--locked__desc">Your final score is <strong>{grandTotalPct}% ({grandTotalAwarded}/{grandTotalMax} marks)</strong>. This result has been fully verified and endorsed by the internal moderator.</p>
                                    </>
                                ) : isAssDone && outcome?.isCompetent === true ? (
                                    <>
                                        <h3 className="ap-footer--locked__title" style={{ color: 'var(--mlab-blue)' }}>Assessor Grading Complete</h3>
                                        <p className="ap-footer--locked__desc">Your provisional score is <strong>{grandTotalPct}% ({grandTotalAwarded}/{grandTotalMax} marks)</strong>. Awaiting final moderator QA.</p>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
                                        <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. {isAssDone ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}</p>
                                        {!isWorkplaceModule && isFacDone && !isAssDone && (
                                            <p style={{ marginTop: '8px', color: 'var(--mlab-blue)', fontWeight: 'bold' }}>Provisional Score: {grandTotalPct}% ({grandTotalAwarded}/{grandTotalMax} marks)</p>
                                        )}
                                    </>
                                )}
                                <button className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={safeNavigateBack}><ArrowLeft size={14} /> Return to Portfolio</button>
                            </div>
                        )}
                    </div>

                    {/* ── RIGHT AUDIT SIDEBAR ── */}
                    {isGloballyLocked && !isAwaitingSignoff && (
                        <aside className="ap-right-sidebar no-print">
                            <h3 className="ap-right-sidebar__title"><ShieldCheck size={15} color="var(--mlab-blue)" /> Official Audit Trail</h3>

                            <div className="ap-audit-card">
                                <span className="ap-audit-card__label">Learner Declaration</span>
                                <div className="ap-audit-card__sig-wrap">
                                    {submission.learnerDeclaration?.signatureUrl
                                        ? <img src={submission.learnerDeclaration.signatureUrl} alt="Learner signature" />
                                        : learnerProfile?.signatureUrl
                                            ? <img src={learnerProfile.signatureUrl} alt="Learner signature fallback" />
                                            : <span className="ap-audit-card__sig-placeholder">Digitally Authenticated<br />(ECTA Compliant)</span>}
                                </div>
                                <span className="ap-audit-card__name">{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}</span>
                                <span className="ap-audit-card__sub"><Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}</span>
                            </div>

                            {submission?.appeal?.status && submission?.appeal?.status !== 'pending' && (
                                <div className="ap-audit-card" style={{ borderTopColor: submission.appeal.status === 'upheld' ? '#22c55e' : '#ef4444' }}>
                                    <span className="ap-audit-card__label" style={{ color: submission.appeal.status === 'upheld' ? '#166534' : '#991b1b', display: 'flex', alignItems: 'center', gap: '4px' }}><Scale size={12} /> Appeal Resolution</span>
                                    <span className="ap-audit-card__name" style={{ color: submission.appeal.status === 'upheld' ? '#22c55e' : '#ef4444' }}>{submission.appeal.status === 'upheld' ? 'Appeal Granted' : 'Appeal Rejected'}</span>
                                    <span className="ap-audit-card__reg" style={{ color: '#64748b' }}>{submission.appeal?.resolvedByName || 'Academic Board'}</span>
                                    <span className="ap-audit-card__sub" style={{ color: '#64748b' }}><Clock size={11} /> {submission.appeal?.resolvedAt ? moment(submission.appeal.resolvedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}

                            {outcome ? (
                                <div className="ap-audit-outcome" style={{ borderLeftColor: outcome.color }}>
                                    <div className="ap-audit-outcome__label" style={{ color: outcome.color }}>{outcome.label}</div>
                                    {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Score: {outcome.score} / {assessment.totalMarks} ({outcome.percentage}%)</div>}
                                    {isWorkplaceModule && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Grading: Competency-Based</div>}
                                    <div className="ap-audit-outcome__note">{outcome.subtext}</div>
                                </div>
                            ) : (
                                <div className="ap-audit-card" style={{ textAlign: 'center', padding: '1.5rem', background: '#f8fafc', border: '1px dashed var(--mlab-border)' }}>
                                    <Clock size={24} color="#94a3b8" style={{ margin: '0 auto 0.5rem' }} />
                                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', fontWeight: 700 }}>Pending Outcome</span>
                                    <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Your workbook is currently being evaluated.</span>
                                </div>
                            )}

                            {isFacDone && (
                                <div className="ap-audit-card" style={{ borderTopColor: '#3b82f6' }}>
                                    <span className="ap-audit-card__label" style={{ color: '#3b82f6' }}>{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</span>
                                    <span className="ap-audit-card__name" style={{ color: '#3b82f6' }}>{submission.grading?.facilitatorName || 'Facilitator'}</span>
                                    <div className="ap-audit-card__sig-wrap">
                                        {submission.grading?.facilitatorSignatureUrl
                                            ? <img src={submission.grading.facilitatorSignatureUrl} alt="Facilitator Signature" />
                                            : facilitatorProfile?.signatureUrl
                                                ? <img src={facilitatorProfile.signatureUrl} alt="Facilitator fallback" />
                                                : <span className="ap-audit-card__sig-placeholder" style={{ color: '#3b82f6' }}>System Authenticated</span>}
                                    </div>
                                    <span className="ap-audit-card__sub" style={{ color: '#3b82f6' }}><Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}
                            {isAssDone && (
                                <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-red)' }}>
                                    <span className="ap-audit-card__label" style={{ color: 'var(--mlab-red)' }}>{isWorkplaceModule ? 'Assessor Evaluation' : 'Assessor Verification'}</span>
                                    <div className="ap-audit-card__sig-wrap">
                                        {submission.grading?.assessorSignatureUrl
                                            ? <img src={submission.grading.assessorSignatureUrl} alt="Assessor Signature" />
                                            : assessorProfile?.signatureUrl
                                                ? <img src={assessorProfile.signatureUrl} alt="Assessor fallback" />
                                                : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-red)' }}>Awaiting Signature</span>}
                                    </div>
                                    <span className="ap-audit-card__name" style={{ color: 'var(--mlab-red)' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</span>
                                    <span className="ap-audit-card__reg" style={{ color: 'var(--mlab-red)' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</span>
                                    <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-red)' }}><Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}
                            {isModDone && (
                                <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-green)' }}>
                                    <span className="ap-audit-card__label" style={{ color: 'var(--mlab-green)' }}>Internal Moderation QA</span>
                                    <div className="ap-audit-card__sig-wrap">
                                        {submission.moderation?.moderatorSignatureUrl
                                            ? <img src={submission.moderation.moderatorSignatureUrl} alt="Moderator Signature" />
                                            : moderatorProfile?.signatureUrl
                                                ? <img src={moderatorProfile.signatureUrl} alt="Moderator fallback" />
                                                : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-green)' }}>Awaiting Signature</span>}
                                    </div>
                                    <span className="ap-audit-card__name" style={{ color: 'var(--mlab-green)' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</span>
                                    <span className="ap-audit-card__reg" style={{ color: submission.moderation?.outcome === 'Returned' ? 'var(--mlab-red)' : 'var(--mlab-green)' }}>Outcome: {submission.moderation?.outcome === 'Endorsed' ? 'Endorsed ✓' : submission.moderation?.outcome === 'Returned' ? 'Returned ✗' : submission.moderation?.outcome}</span>
                                    <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-green)' }}><Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}
                        </aside>
                    )}
                </div>
            </div>
        </ProctoringWrapper>
    );
};

export default AssessmentPlayerContent;