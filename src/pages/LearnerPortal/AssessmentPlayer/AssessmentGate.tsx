// src/components/views/AssessmentPlayer/AssessmentGate.tsx

import React, { useState } from 'react';
import {
    ArrowLeft, BookOpen, Clock, GraduationCap, Info, Play, Scale,
    ShieldAlert, UserCheck, Wifi, FileArchive, Briefcase, MessageSquare,
    AlertTriangle, Video, ShieldCheck, Monitor
} from 'lucide-react';
import { ToastContainer } from '../../../components/common/Toast/Toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

const cleanRichText = (html?: string) => {
    if (!html) return '';
    return html.replace(/&nbsp;/g, ' ');
};

const getSafeDate = (ds: string) => {
    if (!ds) return 'recently';
    const d = new Date(ds);
    return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

interface AssessmentGateProps {
    assessment: any;
    submission: any;
    learnerProfile: any;
    isRemediation: boolean;
    needsRemediationGate: boolean;
    isAppealUpheld: boolean;
    willBeProctored: boolean;
    isSummative: boolean;
    passedFormative: boolean;
    hasOverride: boolean;
    isFullyCompliant: boolean;
    pendingTopics: any[];
    saving: boolean;
    isStarting: boolean;
    startDeclarationChecked: boolean;
    coachingAckChecked: boolean;
    onStart: () => void;
    onBack: () => void;
    setStartDeclarationChecked: (v: boolean) => void;
    setCoachingAckChecked: (v: boolean) => void;
    toast: any;
}

export const AssessmentGate: React.FC<AssessmentGateProps> = ({
    assessment,
    submission,
    learnerProfile,
    isRemediation,
    needsRemediationGate,
    isAppealUpheld,
    willBeProctored,
    isSummative,
    passedFormative,
    hasOverride,
    isFullyCompliant,
    pendingTopics,
    saving,
    isStarting,
    startDeclarationChecked,
    coachingAckChecked,
    onStart,
    onBack,
    setStartDeclarationChecked,
    setCoachingAckChecked,
    toast,
}) => {
    return (
        <div className="ap-gate ap-animate" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
            <div className="ap-gate-topbar">
                <button className="ap-gate-topbar__back" onClick={onBack}>
                    <ArrowLeft size={14} /> Back to Portfolio
                </button>
                <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
            </div>
            <div className="ap-gate-body">
                <div className="ap-gate-left">
                    <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
                    <h1 className="ap-gate-left__title">
                        {assessment.title}
                        {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
                        {isAppealUpheld && <span className="ap-gate-appeal-badge">Appeal Granted</span>}
                    </h1>
                    <p className="ap-gate-left__sub">
                        {isAppealUpheld
                            ? "A new attempt has been granted by the Academic Board following your successful appeal."
                            : isRemediation
                                ? "This is a fresh attempt. Use the Facilitator's Coaching Notes below to correct your answers."
                                : "Read all instructions and invigilation rules carefully before starting."}
                    </p>

                    {willBeProctored && (
                        <div className="ap-workplace-banner" style={{ background: '#fff1f2', padding: 16, marginBottom: 16, borderColor: '#fecdd3', borderLeftColor: '#e11d48' }}>
                            <strong className="ap-workplace-banner__title ap-info-card__label" style={{ color: '#be123c', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ShieldAlert size={16} /> Strict Proctored Environment &amp; Anti-Cheating Notice
                            </strong>
                            <p className="ap-workplace-banner__text" style={{ color: '#881337', marginTop: 8, lineHeight: 1.5 }}>
                                This examination is strictly invigilated. You must grant <strong>Webcam and Microphone</strong> access, share your <strong>Entire Screen</strong>, and remain in <strong>Fullscreen Mode</strong> throughout the assessment.
                            </p>
                            <p className="ap-workplace-banner__text" style={{ color: '#be123c', marginTop: 8, fontWeight: 'bold', lineHeight: 1.5 }}>
                                ⚠️ TERMINATION WARNING: Clicking "Stop sharing" on the browser screen bar, disabling your webcam, exiting fullscreen, or switching tabs will immediately trigger a critical security violation. This will INSTANTLY TERMINATE your assessment, mark your attempt as "Missed", and log dual screenshots to the Invigilator Dashboard.
                            </p>
                        </div>
                    )}

                    {assessment?.isOpenBook && assessment?.referenceManualUrl && (
                        <div className="ap-openbook-banner" style={{ marginBottom: 16 }}>
                            <strong className="ap-openbook-banner__title ap-info-card__label" style={{ textTransform: 'uppercase', fontSize: 14 }}><FileArchive size={16} /> Open Book Assessment</strong>
                            <p className="ap-openbook-banner__text">An official Reference Manual has been provided by your facilitator. You can access it inside the player at any time.</p>
                        </div>
                    )}

                    {assessment?.moduleType === 'workplace' && (
                        <div className="ap-workplace-banner">
                            <strong className="ap-workplace-banner__title"><Briefcase size={16} /> Workplace Experience Logbook</strong>
                            <p className="ap-workplace-banner__text">This module is a <strong>Learner Logbook</strong> tracking real-world workplace experience for review by your designated Workplace Mentor.</p>
                        </div>
                    )}

                    {needsRemediationGate && (
                        <div className="ap-coaching-log">
                            <strong className="ap-coaching-log__title"><MessageSquare size={16} /> Remediation Coaching Log</strong>
                            <p className="ap-coaching-log__desc">Before beginning Attempt #{submission.attemptNumber}, QCTO compliance requires you to acknowledge the feedback session conducted by your facilitator.</p>
                            <div className="ap-coaching-log__quote">
                                <span className="ap-coaching-log__quote-label">Facilitator Notes ({getSafeDate(submission.latestCoachingLog.date)}):</span>
                                <p className="ap-coaching-log__quote-text">"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
                            </div>
                            <label className="ap-coaching-log__ack">
                                <input type="checkbox" checked={coachingAckChecked} onChange={e => setCoachingAckChecked(e.target.checked)} />
                                <span className="ap-coaching-log__ack-label">I acknowledge that I received the coaching/feedback detailed above.</span>
                            </label>
                        </div>
                    )}

                    <div className="ap-info-grid">
                        <div className="ap-info-card"><div className="ap-info-card__label"><BookOpen size={12} /> Module</div><div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div><div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div></div>
                        <div className="ap-info-card"><div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div><div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div><div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div></div>
                        <div className="ap-info-card">
                            <div className="ap-info-card__label"><Clock size={12} /> Time Limit</div>
                            <div className="ap-info-card__value">
                                {assessment.moduleInfo?.timeLimit
                                    ? `${assessment.moduleInfo.timeLimit + (submission.extraTimeGranted || 0)} Min`
                                    : 'No Limit'}
                            </div>
                            <div className="ap-info-card__sub">
                                {submission.extraTimeGranted ? <span style={{ color: 'var(--mlab-green)' }}>Includes +{submission.extraTimeGranted} min extension.</span> : assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}
                            </div>
                        </div>
                        {!assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace' || b.type === 'logbook') ? (
                            <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Total Marks</div><div className="ap-info-card__value">{assessment.totalMarks}</div><div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div></div>
                        ) : (
                            <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Grading</div><div className="ap-info-card__value">C / NYC</div><div className="ap-info-card__sub">Competency-based. No numerical score.</div></div>
                        )}
                    </div>

                    <div className="ap-note-block">
                        <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
                        <div className="ap-note-block__text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.') }} />
                        {assessment.purpose && (
                            <>
                                <div className="ap-note-block__heading"><Info size={12} /> Purpose</div>
                                <div className="ap-note-block__text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.purpose) }} />
                            </>
                        )}
                    </div>
                </div>

                <div className="ap-gate-right">
                    <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
                    <ul className="ap-rules-list">
                        {willBeProctored && (
                            <>
                                <li className="ap-rule-item">
                                    <div className="ap-rule-icon" style={{ background: '#fff1f2', color: '#e11d48' }}><Monitor size={18} /></div>
                                    <div>
                                        <span className="ap-rule-title" style={{ color: '#be123c' }}>Mandatory Entire Screen Share</span>
                                        <p className="ap-rule-desc">You must share your <strong>Entire Screen</strong>. Sharing a single tab or window is forbidden. Clicking "Stop sharing" during the test will <strong>instantly abort and terminate</strong> your exam.</p>
                                    </div>
                                </li>
                                <li className="ap-rule-item">
                                    <div className="ap-rule-icon" style={{ background: '#fff1f2', color: '#e11d48' }}><Video size={18} /></div>
                                    <div>
                                        <span className="ap-rule-title" style={{ color: '#be123c' }}>AI Gaze &amp; Audio Surveillance</span>
                                        <p className="ap-rule-desc">AI gaze tracking, face presence, and room audio are continuously analyzed. Looking away, unapproved voices, or multiple people in frame trigger security violations.</p>
                                    </div>
                                </li>
                            </>
                        )}
                        <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or unauthorized AI tools violate QCTO guidelines.</p></div></li>
                        <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly a group project, no collaboration is permitted.</p></div></li>
                        <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
                        {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser. Plan your time carefully.</p></div></li>}
                    </ul>

                    {isSummative && !passedFormative && !hasOverride && !isAppealUpheld ? (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
                            <strong style={{ color: '#be123c', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <ShieldAlert size={18} /> Readiness Not Met
                            </strong>
                            <p style={{ color: '#9f1239', fontSize: '0.85rem', margin: 0 }}>
                                You must achieve Competency (C) in your Formative Assessment before unlocking this Summative Exam.
                            </p>
                        </div>
                    ) : !isFullyCompliant ? (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
                            <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <AlertTriangle size={18} /> Compliance Action Required
                            </strong>
                            <p style={{ color: '#92400e', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                Acknowledge the delivery of these module topics before the exam will unlock:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {pendingTopics.map((log: any) => (
                                    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>{log.topicTitle}</span>
                                        <button
                                            className="mlab-btn mlab-btn--sm"
                                            style={{ background: 'var(--mlab-green)', color: 'white', border: 'none', padding: '4px 8px', fontSize: '0.7rem' }}
                                            onClick={async () => {
                                                try {
                                                    const ackFn = httpsCallable(getFunctions(), 'acknowledgeCurriculumTopic');
                                                    await ackFn({ logId: log.id, learnerId: submission.learnerId });
                                                    toast.success("Topic Acknowledged!");
                                                } catch {
                                                    toast.error("Failed to acknowledge.");
                                                }
                                            }}
                                        >
                                            Acknowledge
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="ap-declaration">
                            <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
                                <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
                                <span className="ap-declaration-check__text"><strong>Declaration of Authenticity &amp; Invigilation Consent</strong> I have read and agree to all rules. I consent to webcam, audio, and entire screen monitoring. I understand that stopping screen share or exiting invigilation will terminate my exam immediately.</span>
                            </label>
                            <button className={`ap-start-btn${(startDeclarationChecked && (!needsRemediationGate || coachingAckChecked)) ? ' ap-start-btn--ready' : ''}`} onClick={onStart} disabled={saving || isStarting || !startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)}>
                                {saving || isStarting ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> {needsRemediationGate ? `Acknowledge & Resume Attempt #${submission.attemptNumber}` : 'I Agree, Begin Assessment'}</>}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};



// // src/components/views/AssessmentPlayer/AssessmentGate.tsx

// import React, { useState } from 'react';
// import {
//     ArrowLeft, BookOpen, Clock, GraduationCap, Info, Play, Scale,
//     ShieldAlert, UserCheck, Wifi, FileArchive, Briefcase, MessageSquare,
//     AlertTriangle, Video, ShieldCheck
// } from 'lucide-react';
// import { ToastContainer } from '../../../components/common/Toast/Toast';
// import { getFunctions, httpsCallable } from 'firebase/functions';

// // ─── HELPERS (copied from original) ────────────────────────────────────────
// const cleanRichText = (html?: string) => {
//     if (!html) return '';
//     return html.replace(/&nbsp;/g, ' ');
// };

// const getSafeDate = (ds: string) => {
//     if (!ds) return 'recently';
//     const d = new Date(ds);
//     return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', {
//         day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
//     });
// };

// // ─── PROPS ──────────────────────────────────────────────────────────────────
// interface AssessmentGateProps {
//     assessment: any;
//     submission: any;
//     learnerProfile: any;
//     isRemediation: boolean;
//     needsRemediationGate: boolean;
//     isAppealUpheld: boolean;
//     willBeProctored: boolean;
//     isSummative: boolean;
//     passedFormative: boolean;
//     hasOverride: boolean;
//     isFullyCompliant: boolean;
//     pendingTopics: any[];
//     saving: boolean;
//     isStarting: boolean;
//     startDeclarationChecked: boolean;
//     coachingAckChecked: boolean;
//     onStart: () => void;
//     onBack: () => void;
//     setStartDeclarationChecked: (v: boolean) => void;
//     setCoachingAckChecked: (v: boolean) => void;
//     toast: any; // passed from parent
// }

// // ─── COMPONENT ─────────────────────────────────────────────────────────────
// export const AssessmentGate: React.FC<AssessmentGateProps> = ({
//     assessment,
//     submission,
//     learnerProfile,
//     isRemediation,
//     needsRemediationGate,
//     isAppealUpheld,
//     willBeProctored,
//     isSummative,
//     passedFormative,
//     hasOverride,
//     isFullyCompliant,
//     pendingTopics,
//     saving,
//     isStarting,
//     startDeclarationChecked,
//     coachingAckChecked,
//     onStart,
//     onBack,
//     setStartDeclarationChecked,
//     setCoachingAckChecked,
//     toast,
// }) => {
//     return (
//         <div className="ap-gate ap-animate" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
//             <div className="ap-gate-topbar">
//                 <button className="ap-gate-topbar__back" onClick={onBack}>
//                     <ArrowLeft size={14} /> Back to Portfolio
//                 </button>
//                 <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
//             </div>
//             <div className="ap-gate-body">
//                 <div className="ap-gate-left">
//                     <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
//                     <h1 className="ap-gate-left__title">
//                         {assessment.title}
//                         {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
//                         {isAppealUpheld && <span className="ap-gate-appeal-badge">Appeal Granted</span>}
//                     </h1>
//                     <p className="ap-gate-left__sub">
//                         {isAppealUpheld
//                             ? "A new attempt has been granted by the Academic Board following your successful appeal."
//                             : isRemediation
//                                 ? "This is a fresh attempt. Use the Facilitator's Coaching Notes below to correct your answers."
//                                 : "Read all instructions carefully before starting."}
//                     </p>

//                     {willBeProctored && (
//                         <div className="ap-workplace-banner " style={{ background: '#fff1f2', padding: 16, marginBottom: 16, borderColor: '#fecdd3', borderLeftColor: '#e11d48' }}>
//                             <strong className="ap-workplace-banner__title ap-info-card__label" style={{ color: '#be123c', fontSize: 14 }}>
//                                 <ShieldAlert size={16} /> Secure Proctored Environment
//                             </strong>
//                             <p className="ap-workplace-banner__text" style={{ color: '#881337' }}>
//                                 This is a strictly invigilated assessment. You will be required to grant <strong>Camera and Microphone</strong> permissions and complete the test in <strong>Fullscreen Mode</strong>. Exiting fullscreen or switching browser tabs will immediately log a security violation to your Assessor.
//                             </p>
//                         </div>
//                     )}

//                     {assessment?.isOpenBook && assessment?.referenceManualUrl && (
//                         <div className="ap-openbook-banner" style={{ marginBottom: 16 }}>
//                             <strong className="ap-openbook-banner__title ap-info-card__label" style={{ textTransform: 'uppercase', fontSize: 14 }}><FileArchive size={16} /> Open Book Assessment</strong>
//                             <p className="ap-openbook-banner__text">This is an open-book assessment. An official Reference Manual has been provided by your facilitator. You can access it inside the player at any time.</p>
//                         </div>
//                     )}

//                     {assessment?.moduleType === 'workplace' && (
//                         <div className="ap-workplace-banner">
//                             <strong className="ap-workplace-banner__title"><Briefcase size={16} /> Workplace Experience Logbook</strong>
//                             <p className="ap-workplace-banner__text">This module is a <strong>Learner Logbook</strong>. It tracks and verifies your real-world workplace experience. You will map tasks to specific Work Activities (WA), record your hours, and upload Supporting Evidence (SE) for review by your designated Workplace Mentor.</p>
//                         </div>
//                     )}

//                     {needsRemediationGate && (
//                         <div className="ap-coaching-log">
//                             <strong className="ap-coaching-log__title"><MessageSquare size={16} /> Remediation Coaching Log</strong>
//                             <p className="ap-coaching-log__desc">Before beginning Attempt #{submission.attemptNumber}, QCTO compliance requires you to acknowledge the feedback session conducted by your facilitator.</p>
//                             <div className="ap-coaching-log__quote">
//                                 <span className="ap-coaching-log__quote-label">Facilitator Notes ({getSafeDate(submission.latestCoachingLog.date)}):</span>
//                                 <p className="ap-coaching-log__quote-text">"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
//                             </div>
//                             <label className="ap-coaching-log__ack">
//                                 <input type="checkbox" checked={coachingAckChecked} onChange={e => setCoachingAckChecked(e.target.checked)} />
//                                 <span className="ap-coaching-log__ack-label">I acknowledge that I received the coaching/feedback detailed above.</span>
//                             </label>
//                         </div>
//                     )}

//                     <div className="ap-info-grid">
//                         <div className="ap-info-card"><div className="ap-info-card__label"><BookOpen size={12} /> Module</div><div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div><div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div></div>
//                         <div className="ap-info-card"><div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div><div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div><div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div></div>
//                         <div className="ap-info-card">
//                             <div className="ap-info-card__label"><Clock size={12} /> Time Limit</div>
//                             <div className="ap-info-card__value">
//                                 {assessment.moduleInfo?.timeLimit
//                                     ? `${assessment.moduleInfo.timeLimit + (submission.extraTimeGranted || 0)} Min`
//                                     : 'No Limit'}
//                             </div>
//                             <div className="ap-info-card__sub">
//                                 {submission.extraTimeGranted ? <span style={{ color: 'var(--mlab-green)' }}>Includes +{submission.extraTimeGranted} min extension.</span> : assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}
//                             </div>
//                         </div>
//                         {!assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace' || b.type === 'logbook') ? (
//                             <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Total Marks</div><div className="ap-info-card__value">{assessment.totalMarks}</div><div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div></div>
//                         ) : (
//                             <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Grading</div><div className="ap-info-card__value">C / NYC</div><div className="ap-info-card__sub">Competency-based. No numerical score.</div></div>
//                         )}
//                     </div>

//                     <div className="ap-note-block">
//                         <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
//                         <div className="ap-note-block__text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.') }} />
//                         {assessment.purpose && (
//                             <>
//                                 <div className="ap-note-block__heading"><Info size={12} /> Purpose</div>
//                                 <div className="ap-note-block__text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.purpose) }} />
//                             </>
//                         )}
//                     </div>
//                 </div>

//                 <div className="ap-gate-right">
//                     <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
//                     <ul className="ap-rules-list">
//                         {willBeProctored && (
//                             <li className="ap-rule-item">
//                                 <div className="ap-rule-icon" style={{ background: '#fff1f2', color: '#e11d48' }}><Video size={18} /></div>
//                                 <div>
//                                     <span className="ap-rule-title" style={{ color: '#be123c' }}>Live Invigilation</span>
//                                     <p className="ap-rule-desc">Your webcam and screen activity are actively monitored. Tab-switching is disabled.</p>
//                                 </div>
//                             </li>
//                         )}
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or unauthorized AI tools violate QCTO guidelines.</p></div></li>
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly a group project, no collaboration is permitted.</p></div></li>
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
//                         {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser. Plan your time carefully.</p></div></li>}
//                     </ul>

//                     {isSummative && !passedFormative && !hasOverride && !isAppealUpheld ? (
//                         <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
//                             <strong style={{ color: '#be123c', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
//                                 <ShieldAlert size={18} /> Readiness Not Met
//                             </strong>
//                             <p style={{ color: '#9f1239', fontSize: '0.85rem', margin: 0 }}>
//                                 You must achieve Competency (C) in your Formative Assessment before unlocking this Summative Exam.
//                             </p>
//                         </div>
//                     ) : !isFullyCompliant ? (
//                         <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
//                             <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
//                                 <AlertTriangle size={18} /> Compliance Action Required
//                             </strong>
//                             <p style={{ color: '#92400e', fontSize: '0.85rem', marginBottom: '1rem' }}>
//                                 Acknowledge the delivery of these module topics before the exam will unlock:
//                             </p>
//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                 {pendingTopics.map((log: any) => (
//                                     <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #fde68a' }}>
//                                         <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>{log.topicTitle}</span>
//                                         <button
//                                             className="mlab-btn mlab-btn--sm"
//                                             style={{ background: 'var(--mlab-green)', color: 'white', border: 'none', padding: '4px 8px', fontSize: '0.7rem' }}
//                                             onClick={async () => {
//                                                 try {
//                                                     const ackFn = httpsCallable(getFunctions(), 'acknowledgeCurriculumTopic');
//                                                     await ackFn({ logId: log.id, learnerId: submission.learnerId });
//                                                     toast.success("Topic Acknowledged!");
//                                                 } catch {
//                                                     toast.error("Failed to acknowledge.");
//                                                 }
//                                             }}
//                                         >
//                                             Acknowledge
//                                         </button>
//                                     </div>
//                                 ))}
//                             </div>
//                         </div>
//                     ) : (
//                         <div className="ap-declaration">
//                             <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
//                                 <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
//                                 <span className="ap-declaration-check__text"><strong>Declaration of Authenticity</strong> I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.</span>
//                             </label>
//                             <button className={`ap-start-btn${(startDeclarationChecked && (!needsRemediationGate || coachingAckChecked)) ? ' ap-start-btn--ready' : ''}`} onClick={onStart} disabled={saving || isStarting || !startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)}>
//                                 {saving || isStarting ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> {needsRemediationGate ? `Acknowledge & Resume Attempt #${submission.attemptNumber}` : 'I Agree, Begin Assessment'}</>}
//                             </button>
//                         </div>
//                     )}
//                 </div>
//             </div>
//         </div>
//     );
// };