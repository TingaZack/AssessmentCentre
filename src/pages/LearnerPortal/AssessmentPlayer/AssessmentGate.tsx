// src/components/views/AssessmentPlayer/AssessmentGate.tsx

import React from 'react';
import {
    ArrowLeft, BookOpen, Clock, GraduationCap, Info, Play, Scale,
    ShieldAlert, UserCheck, Wifi, FileArchive, Briefcase, MessageSquare,
    AlertTriangle, Video, Monitor, Calendar, ShieldCheck
} from 'lucide-react';
import { ToastContainer } from '../../../components/common/Toast/Toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import moment from 'moment';

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

export interface AssessmentGateProps {
    isSECAM?: boolean; // SECAM / Bootcamp Framework Flag
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
    onRequestSupport?: () => void; // Support Meeting Modal Trigger
}

export const AssessmentGate: React.FC<AssessmentGateProps> = ({
    isSECAM,
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
    onRequestSupport,
}) => {
    return (
        <div className="ap-gate ap-animate" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
            <div className="ap-gate-topbar">
                <button className="ap-gate-topbar__back" onClick={onBack}>
                    <ArrowLeft size={14} /> Back to Portfolio
                </button>
                {isSECAM ? (
                    <span className="ap-gate-topbar__badge" style={{ background: 'var(--mlab-blue)', color: 'var(--mlab-green)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        mLab Skills SECAM
                    </span>
                ) : (
                    <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
                )}
            </div>
            <div className="ap-gate-body">
                <div className="ap-gate-left">
                    <p className="ap-gate-left__eyebrow">
                        {isSECAM ? 'mLab SECAM Competency Assessment' : 'Pre-Assessment Briefing'}
                    </p>
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
                                : isSECAM
                                    ? "Review the project instructions and competency requirements before initiating your session."
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
                            <p className="ap-coaching-log__desc">Before beginning Attempt #{submission.attemptNumber}, compliance requires you to acknowledge the feedback session conducted by your facilitator.</p>
                            <div className="ap-coaching-log__quote">
                                <span className="ap-coaching-log__quote-label">Facilitator Notes ({getSafeDate(submission.latestCoachingLog.date)}):</span>
                                <p className="ap-coaching-log__quote-text">"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
                            </div>

                            {/* REQUEST PENDING / SUPPORT BUTTON WITH HOVER POPOVER */}
                            {submission?.coachingRequested ? (
                                <div className="ap-pending-tooltip-wrap" style={{ marginTop: '12px' }}>
                                    <button type="button" className="mlab-btn mlab-btn--sm" disabled style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', cursor: 'help' }}>
                                        <Clock size={14} style={{ marginRight: '4px' }} /> Support Meeting Requested
                                        <Info size={12} style={{ marginLeft: '4px', opacity: 0.8 }} />
                                    </button>
                                    <div className="ap-pending-popover">
                                        <strong><ShieldCheck size={13} /> Coaching Session Pending</strong>
                                        <p>Your request for a 1-on-1 support meeting is being scheduled. Your facilitator will conduct the session and log meeting notes to unlock Attempt #{submission.attemptNumber}.</p>
                                        {submission.coachingRequestedAt && (
                                            <small>Requested on: {moment(submission.coachingRequestedAt).format('DD MMM YYYY [at] HH:mm')}</small>
                                        )}
                                    </div>
                                </div>
                            ) : onRequestSupport ? (
                                <button
                                    type="button"
                                    className="mlab-btn mlab-btn--warning mlab-btn--sm"
                                    style={{ marginTop: '12px', color: 'var(--mlab-blue)' }}
                                    onClick={onRequestSupport}
                                >
                                    <Calendar size={14} style={{ marginRight: '4px' }} /> Request 1-on-1 Coaching Session
                                </button>
                            ) : null}

                            <label className="ap-coaching-log__ack" style={{ marginTop: '12px' }}>
                                <input type="checkbox" checked={coachingAckChecked} onChange={e => setCoachingAckChecked(e.target.checked)} />
                                <span className="ap-coaching-log__ack-label">I acknowledge that I received the coaching/feedback detailed above.</span>
                            </label>
                        </div>
                    )}

                    <div className="ap-info-grid">
                        <div className="ap-info-card">
                            <div className="ap-info-card__label"><BookOpen size={12} /> {isSECAM ? 'Framework' : 'Module'}</div>
                            <div className="ap-info-card__value">{isSECAM ? 'mLab SECAM' : (assessment.moduleInfo?.moduleNumber || '—')}</div>
                            <div className="ap-info-card__sub">{isSECAM ? 'Bootcamp Track' : `Code: ${assessment.moduleInfo?.occupationalCode || 'N/A'}`}</div>
                        </div>
                        <div className="ap-info-card">
                            <div className="ap-info-card__label"><GraduationCap size={12} /> Program Standard</div>
                            <div className="ap-info-card__value">{isSECAM ? 'Practical Skills' : `NQF Level ${assessment.moduleInfo?.nqfLevel || '4'}`}</div>
                            <div className="ap-info-card__sub">{isSECAM ? 'Software Engineering' : `Credits: ${assessment.moduleInfo?.credits || '12'} · Hours: ${assessment.moduleInfo?.notionalHours || '120'}`}</div>
                        </div>
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
                            <div className="ap-info-card">
                                <div className="ap-info-card__label"><Scale size={12} /> Total Marks</div>
                                <div className="ap-info-card__value">{assessment.totalMarks}</div>
                                {(() => {
                                    const passPct = assessment?.passPercentage || 80;
                                    const requiredMarks = Math.ceil((assessment?.totalMarks || 0) * (passPct / 100));
                                    return (
                                        <div className="ap-info-card__sub">
                                            {isSECAM ? 'Weighted SECAM Evaluation' : `Pass mark: ${passPct}% (${requiredMarks} marks)`}
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : (
                            <div className="ap-info-card">
                                <div className="ap-info-card__label"><Scale size={12} /> Grading</div>
                                <div className="ap-info-card__value">C / NYC</div>
                                <div className="ap-info-card__sub">Competency-based. No numerical score.</div>
                            </div>
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
                        <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or unauthorized AI tools violate CodeTribe guidelines.</p></div></li>
                        <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly a group project, no collaboration is permitted.</p></div></li>
                        <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
                        {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser. Plan your time carefully.</p></div></li>}
                    </ul>

                    {/* FORMAL ACADEMIC APPEAL FOR LEARNERS */}
                    {isSummative && !passedFormative && !hasOverride && !isAppealUpheld ? (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
                            <strong style={{ color: '#be123c', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <ShieldAlert size={18} /> Readiness Not Met
                            </strong>
                            <p style={{ color: '#9f1239', fontSize: '0.85rem', margin: 0, marginBottom: '1rem' }}>
                                You must achieve Competency (C) in your Formative Assessment before unlocking this Summative Exam. If you believe this is an error or wish to lodge a formal academic dispute, you may request an appeal.
                            </p>

                            {submission?.appeal?.status === 'pending' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ffedd5', color: '#b45309', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid #fde68a' }}>
                                    <Clock size={14} /> Appeal Pending Review by Academic Board
                                </span>
                            ) : (
                                <button
                                    className="mlab-btn mlab-btn--outline mlab-btn--sm"
                                    style={{ borderColor: '#fca5a5', color: '#dc2626' }}
                                    onClick={() => {
                                        const reason = window.prompt("Please state the reason for your formal appeal:");
                                        if (reason) {
                                            updateDoc(doc(db, 'learner_submissions', submission.id), {
                                                status: 'appealed',
                                                'appeal.status': 'pending',
                                                'appeal.reason': reason,
                                                'appeal.date': new Date().toISOString()
                                            }).then(() => toast.success("Formal appeal lodged successfully."));
                                        }
                                    }}
                                >
                                    <AlertTriangle size={14} /> Lodge Formal Appeal
                                </button>
                            )}
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
                                                    const targetId = learnerProfile?.id || submission.learnerId;
                                                    await ackFn({ logId: log.id, learnerId: targetId });
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

// import React from 'react';
// import {
//     ArrowLeft, BookOpen, Clock, GraduationCap, Info, Play, Scale,
//     ShieldAlert, UserCheck, Wifi, FileArchive, Briefcase, MessageSquare,
//     AlertTriangle, Video, Monitor
// } from 'lucide-react';
// import { ToastContainer } from '../../../components/common/Toast/Toast';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import { doc, updateDoc } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';

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

// export interface AssessmentGateProps {
//     isSECAM?: boolean; // 🚀 SECAM / Bootcamp Framework Flag
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
//     toast: any;
// }

// export const AssessmentGate: React.FC<AssessmentGateProps> = ({
//     isSECAM,
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
//                 {isSECAM ? (
//                     <span className="ap-gate-topbar__badge" style={{ background: 'var(--mlab-blue)', color: 'var(--mlab-green)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                         mLab Skills SECAM
//                     </span>
//                 ) : (
//                     <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
//                 )}
//             </div>
//             <div className="ap-gate-body">
//                 <div className="ap-gate-left">
//                     <p className="ap-gate-left__eyebrow">
//                         {isSECAM ? 'mLab SECAM Competency Assessment' : 'Pre-Assessment Briefing'}
//                     </p>
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
//                                 : isSECAM
//                                     ? "Review the project instructions and competency requirements before initiating your session."
//                                     : "Read all instructions and invigilation rules carefully before starting."}
//                     </p>

//                     {willBeProctored && (
//                         <div className="ap-workplace-banner" style={{ background: '#fff1f2', padding: 16, marginBottom: 16, borderColor: '#fecdd3', borderLeftColor: '#e11d48' }}>
//                             <strong className="ap-workplace-banner__title ap-info-card__label" style={{ color: '#be123c', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
//                                 <ShieldAlert size={16} /> Strict Proctored Environment &amp; Anti-Cheating Notice
//                             </strong>
//                             <p className="ap-workplace-banner__text" style={{ color: '#881337', marginTop: 8, lineHeight: 1.5 }}>
//                                 This examination is strictly invigilated. You must grant <strong>Webcam and Microphone</strong> access, share your <strong>Entire Screen</strong>, and remain in <strong>Fullscreen Mode</strong> throughout the assessment.
//                             </p>
//                             <p className="ap-workplace-banner__text" style={{ color: '#be123c', marginTop: 8, fontWeight: 'bold', lineHeight: 1.5 }}>
//                                 ⚠️ TERMINATION WARNING: Clicking "Stop sharing" on the browser screen bar, disabling your webcam, exiting fullscreen, or switching tabs will immediately trigger a critical security violation. This will INSTANTLY TERMINATE your assessment, mark your attempt as "Missed", and log dual screenshots to the Invigilator Dashboard.
//                             </p>
//                         </div>
//                     )}

//                     {assessment?.isOpenBook && assessment?.referenceManualUrl && (
//                         <div className="ap-openbook-banner" style={{ marginBottom: 16 }}>
//                             <strong className="ap-openbook-banner__title ap-info-card__label" style={{ textTransform: 'uppercase', fontSize: 14 }}><FileArchive size={16} /> Open Book Assessment</strong>
//                             <p className="ap-openbook-banner__text">An official Reference Manual has been provided by your facilitator. You can access it inside the player at any time.</p>
//                         </div>
//                     )}

//                     {assessment?.moduleType === 'workplace' && (
//                         <div className="ap-workplace-banner">
//                             <strong className="ap-workplace-banner__title"><Briefcase size={16} /> Workplace Experience Logbook</strong>
//                             <p className="ap-workplace-banner__text">This module is a <strong>Learner Logbook</strong> tracking real-world workplace experience for review by your designated Workplace Mentor.</p>
//                         </div>
//                     )}

//                     {needsRemediationGate && (
//                         <div className="ap-coaching-log">
//                             <strong className="ap-coaching-log__title"><MessageSquare size={16} /> Remediation Coaching Log</strong>
//                             <p className="ap-coaching-log__desc">Before beginning Attempt #{submission.attemptNumber}, compliance requires you to acknowledge the feedback session conducted by your facilitator.</p>
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
//                         <div className="ap-info-card">
//                             <div className="ap-info-card__label"><BookOpen size={12} /> {isSECAM ? 'Framework' : 'Module'}</div>
//                             <div className="ap-info-card__value">{isSECAM ? 'mLab SECAM' : (assessment.moduleInfo?.moduleNumber || '—')}</div>
//                             <div className="ap-info-card__sub">{isSECAM ? 'Bootcamp Track' : `Code: ${assessment.moduleInfo?.occupationalCode || 'N/A'}`}</div>
//                         </div>
//                         <div className="ap-info-card">
//                             <div className="ap-info-card__label"><GraduationCap size={12} /> Program Standard</div>
//                             <div className="ap-info-card__value">{isSECAM ? 'Practical Skills' : `NQF Level ${assessment.moduleInfo?.nqfLevel || '4'}`}</div>
//                             <div className="ap-info-card__sub">{isSECAM ? 'Software Engineering' : `Credits: ${assessment.moduleInfo?.credits || '12'} · Hours: ${assessment.moduleInfo?.notionalHours || '120'}`}</div>
//                         </div>
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
//                             <div className="ap-info-card">
//                                 <div className="ap-info-card__label"><Scale size={12} /> Total Marks</div>
//                                 <div className="ap-info-card__value">{assessment.totalMarks}</div>
//                                 {(() => {
//                                     const passPct = assessment?.passPercentage || 80;
//                                     const requiredMarks = Math.ceil((assessment?.totalMarks || 0) * (passPct / 100));
//                                     return (
//                                         <div className="ap-info-card__sub">
//                                             {isSECAM ? 'Weighted SECAM Evaluation' : `Pass mark: ${passPct}% (${requiredMarks} marks)`}
//                                         </div>
//                                     );
//                                 })()}
//                             </div>
//                         ) : (
//                             <div className="ap-info-card">
//                                 <div className="ap-info-card__label"><Scale size={12} /> Grading</div>
//                                 <div className="ap-info-card__value">C / NYC</div>
//                                 <div className="ap-info-card__sub">Competency-based. No numerical score.</div>
//                             </div>
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
//                             <>
//                                 <li className="ap-rule-item">
//                                     <div className="ap-rule-icon" style={{ background: '#fff1f2', color: '#e11d48' }}><Monitor size={18} /></div>
//                                     <div>
//                                         <span className="ap-rule-title" style={{ color: '#be123c' }}>Mandatory Entire Screen Share</span>
//                                         <p className="ap-rule-desc">You must share your <strong>Entire Screen</strong>. Sharing a single tab or window is forbidden. Clicking "Stop sharing" during the test will <strong>instantly abort and terminate</strong> your exam.</p>
//                                     </div>
//                                 </li>
//                                 <li className="ap-rule-item">
//                                     <div className="ap-rule-icon" style={{ background: '#fff1f2', color: '#e11d48' }}><Video size={18} /></div>
//                                     <div>
//                                         <span className="ap-rule-title" style={{ color: '#be123c' }}>AI Gaze &amp; Audio Surveillance</span>
//                                         <p className="ap-rule-desc">AI gaze tracking, face presence, and room audio are continuously analyzed. Looking away, unapproved voices, or multiple people in frame trigger security violations.</p>
//                                     </div>
//                                 </li>
//                             </>
//                         )}
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or unauthorized AI tools violate CodeTribe guidelines.</p></div></li>
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly a group project, no collaboration is permitted.</p></div></li>
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
//                         {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser. Plan your time carefully.</p></div></li>}
//                     </ul>

//                     {/* 🚀 FORMAL ACADEMIC APPEAL FOR LEARNERS */}
//                     {isSummative && !passedFormative && !hasOverride && !isAppealUpheld ? (
//                         <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
//                             <strong style={{ color: '#be123c', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
//                                 <ShieldAlert size={18} /> Readiness Not Met
//                             </strong>
//                             <p style={{ color: '#9f1239', fontSize: '0.85rem', margin: 0, marginBottom: '1rem' }}>
//                                 You must achieve Competency (C) in your Formative Assessment before unlocking this Summative Exam. If you believe this is an error or wish to lodge a formal academic dispute, you may request an appeal.
//                             </p>

//                             {submission?.appeal?.status === 'pending' ? (
//                                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ffedd5', color: '#b45309', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid #fde68a' }}>
//                                     <Clock size={14} /> Appeal Pending Review by Academic Board
//                                 </span>
//                             ) : (
//                                 <button
//                                     className="mlab-btn mlab-btn--outline mlab-btn--sm"
//                                     style={{ borderColor: '#fca5a5', color: '#dc2626' }}
//                                     onClick={() => {
//                                         const reason = window.prompt("Please state the reason for your formal appeal:");
//                                         if (reason) {
//                                             updateDoc(doc(db, 'learner_submissions', submission.id), {
//                                                 status: 'appealed',
//                                                 'appeal.status': 'pending',
//                                                 'appeal.reason': reason,
//                                                 'appeal.date': new Date().toISOString()
//                                             }).then(() => toast.success("Formal appeal lodged successfully."));
//                                         }
//                                     }}
//                                 >
//                                     <AlertTriangle size={14} /> Lodge Formal Appeal
//                                 </button>
//                             )}
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
//                                                     // 🚀 FIX: Pass the learner profile ID so it matches the Dashboard perfectly!
//                                                     const targetId = learnerProfile?.id || submission.learnerId;
//                                                     await ackFn({ logId: log.id, learnerId: targetId });
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
//                                 <span className="ap-declaration-check__text"><strong>Declaration of Authenticity &amp; Invigilation Consent</strong> I have read and agree to all rules. I consent to webcam, audio, and entire screen monitoring. I understand that stopping screen share or exiting invigilation will terminate my exam immediately.</span>
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



// // // src/components/views/AssessmentPlayer/AssessmentGate.tsx

// // import React, { useState } from 'react';
// // import {
// //     ArrowLeft, BookOpen, Clock, GraduationCap, Info, Play, Scale,
// //     ShieldAlert, UserCheck, Wifi, FileArchive, Briefcase, MessageSquare,
// //     AlertTriangle, Video, ShieldCheck, Monitor, Award
// // } from 'lucide-react';
// // import { ToastContainer } from '../../../components/common/Toast/Toast';
// // import { getFunctions, httpsCallable } from 'firebase/functions';

// // const cleanRichText = (html?: string) => {
// //     if (!html) return '';
// //     return html.replace(/&nbsp;/g, ' ');
// // };

// // const getSafeDate = (ds: string) => {
// //     if (!ds) return 'recently';
// //     const d = new Date(ds);
// //     return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', {
// //         day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
// //     });
// // };

// // export interface AssessmentGateProps {
// //     isSECAM?: boolean; // 🚀 SECAM / Bootcamp Framework Flag
// //     assessment: any;
// //     submission: any;
// //     learnerProfile: any;
// //     isRemediation: boolean;
// //     needsRemediationGate: boolean;
// //     isAppealUpheld: boolean;
// //     willBeProctored: boolean;
// //     isSummative: boolean;
// //     passedFormative: boolean;
// //     hasOverride: boolean;
// //     isFullyCompliant: boolean;
// //     pendingTopics: any[];
// //     saving: boolean;
// //     isStarting: boolean;
// //     startDeclarationChecked: boolean;
// //     coachingAckChecked: boolean;
// //     onStart: () => void;
// //     onBack: () => void;
// //     setStartDeclarationChecked: (v: boolean) => void;
// //     setCoachingAckChecked: (v: boolean) => void;
// //     toast: any;
// // }

// // export const AssessmentGate: React.FC<AssessmentGateProps> = ({
// //     isSECAM,
// //     assessment,
// //     submission,
// //     learnerProfile,
// //     isRemediation,
// //     needsRemediationGate,
// //     isAppealUpheld,
// //     willBeProctored,
// //     isSummative,
// //     passedFormative,
// //     hasOverride,
// //     isFullyCompliant,
// //     pendingTopics,
// //     saving,
// //     isStarting,
// //     startDeclarationChecked,
// //     coachingAckChecked,
// //     onStart,
// //     onBack,
// //     setStartDeclarationChecked,
// //     setCoachingAckChecked,
// //     toast,
// // }) => {
// //     return (
// //         <div className="ap-gate ap-animate" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// //             <div className="ap-gate-topbar">
// //                 <button className="ap-gate-topbar__back" onClick={onBack}>
// //                     <ArrowLeft size={14} /> Back to Portfolio
// //                 </button>
// //                 {isSECAM ? (
// //                     <span className="ap-gate-topbar__badge" style={{ background: 'var(--mlab-blue)', color: 'var(--mlab-green)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                         mLab Skills SECAM
// //                     </span>
// //                 ) : (
// //                     <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
// //                 )}
// //             </div>
// //             <div className="ap-gate-body">
// //                 <div className="ap-gate-left">
// //                     <p className="ap-gate-left__eyebrow">
// //                         {isSECAM ? 'mLab SECAM Competency Assessment' : 'Pre-Assessment Briefing'}
// //                     </p>
// //                     <h1 className="ap-gate-left__title">
// //                         {assessment.title}
// //                         {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
// //                         {isAppealUpheld && <span className="ap-gate-appeal-badge">Appeal Granted</span>}
// //                     </h1>
// //                     <p className="ap-gate-left__sub">
// //                         {isAppealUpheld
// //                             ? "A new attempt has been granted by the Academic Board following your successful appeal."
// //                             : isRemediation
// //                                 ? "This is a fresh attempt. Use the Facilitator's Coaching Notes below to correct your answers."
// //                                 : isSECAM
// //                                     ? "Review the project instructions and competency requirements before initiating your session."
// //                                     : "Read all instructions and invigilation rules carefully before starting."}
// //                     </p>

// //                     {willBeProctored && (
// //                         <div className="ap-workplace-banner" style={{ background: '#fff1f2', padding: 16, marginBottom: 16, borderColor: '#fecdd3', borderLeftColor: '#e11d48' }}>
// //                             <strong className="ap-workplace-banner__title ap-info-card__label" style={{ color: '#be123c', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
// //                                 <ShieldAlert size={16} /> Strict Proctored Environment &amp; Anti-Cheating Notice
// //                             </strong>
// //                             <p className="ap-workplace-banner__text" style={{ color: '#881337', marginTop: 8, lineHeight: 1.5 }}>
// //                                 This examination is strictly invigilated. You must grant <strong>Webcam and Microphone</strong> access, share your <strong>Entire Screen</strong>, and remain in <strong>Fullscreen Mode</strong> throughout the assessment.
// //                             </p>
// //                             <p className="ap-workplace-banner__text" style={{ color: '#be123c', marginTop: 8, fontWeight: 'bold', lineHeight: 1.5 }}>
// //                                 ⚠️ TERMINATION WARNING: Clicking "Stop sharing" on the browser screen bar, disabling your webcam, exiting fullscreen, or switching tabs will immediately trigger a critical security violation. This will INSTANTLY TERMINATE your assessment, mark your attempt as "Missed", and log dual screenshots to the Invigilator Dashboard.
// //                             </p>
// //                         </div>
// //                     )}

// //                     {assessment?.isOpenBook && assessment?.referenceManualUrl && (
// //                         <div className="ap-openbook-banner" style={{ marginBottom: 16 }}>
// //                             <strong className="ap-openbook-banner__title ap-info-card__label" style={{ textTransform: 'uppercase', fontSize: 14 }}><FileArchive size={16} /> Open Book Assessment</strong>
// //                             <p className="ap-openbook-banner__text">An official Reference Manual has been provided by your facilitator. You can access it inside the player at any time.</p>
// //                         </div>
// //                     )}

// //                     {assessment?.moduleType === 'workplace' && (
// //                         <div className="ap-workplace-banner">
// //                             <strong className="ap-workplace-banner__title"><Briefcase size={16} /> Workplace Experience Logbook</strong>
// //                             <p className="ap-workplace-banner__text">This module is a <strong>Learner Logbook</strong> tracking real-world workplace experience for review by your designated Workplace Mentor.</p>
// //                         </div>
// //                     )}

// //                     {needsRemediationGate && (
// //                         <div className="ap-coaching-log">
// //                             <strong className="ap-coaching-log__title"><MessageSquare size={16} /> Remediation Coaching Log</strong>
// //                             <p className="ap-coaching-log__desc">Before beginning Attempt #{submission.attemptNumber}, compliance requires you to acknowledge the feedback session conducted by your facilitator.</p>
// //                             <div className="ap-coaching-log__quote">
// //                                 <span className="ap-coaching-log__quote-label">Facilitator Notes ({getSafeDate(submission.latestCoachingLog.date)}):</span>
// //                                 <p className="ap-coaching-log__quote-text">"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
// //                             </div>
// //                             <label className="ap-coaching-log__ack">
// //                                 <input type="checkbox" checked={coachingAckChecked} onChange={e => setCoachingAckChecked(e.target.checked)} />
// //                                 <span className="ap-coaching-log__ack-label">I acknowledge that I received the coaching/feedback detailed above.</span>
// //                             </label>
// //                         </div>
// //                     )}

// //                     <div className="ap-info-grid">
// //                         <div className="ap-info-card">
// //                             <div className="ap-info-card__label"><BookOpen size={12} /> {isSECAM ? 'Framework' : 'Module'}</div>
// //                             <div className="ap-info-card__value">{isSECAM ? 'mLab SECAM' : (assessment.moduleInfo?.moduleNumber || '—')}</div>
// //                             <div className="ap-info-card__sub">{isSECAM ? 'Bootcamp Track' : `Code: ${assessment.moduleInfo?.occupationalCode || 'N/A'}`}</div>
// //                         </div>
// //                         <div className="ap-info-card">
// //                             <div className="ap-info-card__label"><GraduationCap size={12} /> Program Standard</div>
// //                             <div className="ap-info-card__value">{isSECAM ? 'Practical Skills' : `NQF Level ${assessment.moduleInfo?.nqfLevel || '4'}`}</div>
// //                             <div className="ap-info-card__sub">{isSECAM ? 'Software Engineering' : `Credits: ${assessment.moduleInfo?.credits || '12'} · Hours: ${assessment.moduleInfo?.notionalHours || '120'}`}</div>
// //                         </div>
// //                         <div className="ap-info-card">
// //                             <div className="ap-info-card__label"><Clock size={12} /> Time Limit</div>
// //                             <div className="ap-info-card__value">
// //                                 {assessment.moduleInfo?.timeLimit
// //                                     ? `${assessment.moduleInfo.timeLimit + (submission.extraTimeGranted || 0)} Min`
// //                                     : 'No Limit'}
// //                             </div>
// //                             <div className="ap-info-card__sub">
// //                                 {submission.extraTimeGranted ? <span style={{ color: 'var(--mlab-green)' }}>Includes +{submission.extraTimeGranted} min extension.</span> : assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}
// //                             </div>
// //                         </div>
// //                         {!assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace' || b.type === 'logbook') ? (
// //                             <div className="ap-info-card">
// //                                 <div className="ap-info-card__label"><Scale size={12} /> Total Marks</div>
// //                                 <div className="ap-info-card__value">{assessment.totalMarks}</div>
// //                                 {/* <div className="ap-info-card__sub">{isSECAM ? 'Weighted SECAM Evaluation' : `Pass mark: 60% (${Math.ceil(assessment.totalMarks * 0.6)} marks)`}</div> */}
// //                                 {(() => {
// //                                     const passPct = assessment?.passPercentage || 80; // Reads from DB or defaults to 80%
// //                                     const requiredMarks = Math.ceil((assessment?.totalMarks || 0) * (passPct / 100));
// //                                     return (
// //                                         <div className="ap-info-card__sub">
// //                                             {isSECAM ? 'Weighted SECAM Evaluation' : `Pass mark: ${passPct}% (${requiredMarks} marks)`}
// //                                         </div>
// //                                     );
// //                                 })()}
// //                             </div>
// //                         ) : (
// //                             <div className="ap-info-card">
// //                                 <div className="ap-info-card__label"><Scale size={12} /> Grading</div>
// //                                 <div className="ap-info-card__value">C / NYC</div>
// //                                 <div className="ap-info-card__sub">Competency-based. No numerical score.</div>
// //                             </div>
// //                         )}
// //                     </div>

// //                     <div className="ap-note-block">
// //                         <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
// //                         <div className="ap-note-block__text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.') }} />
// //                         {assessment.purpose && (
// //                             <>
// //                                 <div className="ap-note-block__heading"><Info size={12} /> Purpose</div>
// //                                 <div className="ap-note-block__text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.purpose) }} />
// //                             </>
// //                         )}
// //                     </div>
// //                 </div>

// //                 <div className="ap-gate-right">
// //                     <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
// //                     <ul className="ap-rules-list">
// //                         {willBeProctored && (
// //                             <>
// //                                 <li className="ap-rule-item">
// //                                     <div className="ap-rule-icon" style={{ background: '#fff1f2', color: '#e11d48' }}><Monitor size={18} /></div>
// //                                     <div>
// //                                         <span className="ap-rule-title" style={{ color: '#be123c' }}>Mandatory Entire Screen Share</span>
// //                                         <p className="ap-rule-desc">You must share your <strong>Entire Screen</strong>. Sharing a single tab or window is forbidden. Clicking "Stop sharing" during the test will <strong>instantly abort and terminate</strong> your exam.</p>
// //                                     </div>
// //                                 </li>
// //                                 <li className="ap-rule-item">
// //                                     <div className="ap-rule-icon" style={{ background: '#fff1f2', color: '#e11d48' }}><Video size={18} /></div>
// //                                     <div>
// //                                         <span className="ap-rule-title" style={{ color: '#be123c' }}>AI Gaze &amp; Audio Surveillance</span>
// //                                         <p className="ap-rule-desc">AI gaze tracking, face presence, and room audio are continuously analyzed. Looking away, unapproved voices, or multiple people in frame trigger security violations.</p>
// //                                     </div>
// //                                 </li>
// //                             </>
// //                         )}
// //                         <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or unauthorized AI tools violate CodeTribe guidelines.</p></div></li>
// //                         <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly a group project, no collaboration is permitted.</p></div></li>
// //                         <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
// //                         {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser. Plan your time carefully.</p></div></li>}
// //                     </ul>

// //                     {isSummative && !passedFormative && !hasOverride && !isAppealUpheld ? (
// //                         <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
// //                             <strong style={{ color: '#be123c', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
// //                                 <ShieldAlert size={18} /> Readiness Not Met
// //                             </strong>
// //                             <p style={{ color: '#9f1239', fontSize: '0.85rem', margin: 0 }}>
// //                                 You must achieve Competency (C) in your Formative Assessment before unlocking this Summative Exam.
// //                             </p>
// //                         </div>
// //                     ) : !isFullyCompliant ? (
// //                         <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
// //                             <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
// //                                 <AlertTriangle size={18} /> Compliance Action Required
// //                             </strong>
// //                             <p style={{ color: '#92400e', fontSize: '0.85rem', marginBottom: '1rem' }}>
// //                                 Acknowledge the delivery of these module topics before the exam will unlock:
// //                             </p>
// //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                                 {pendingTopics.map((log: any) => (
// //                                     <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #fde68a' }}>
// //                                         <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>{log.topicTitle}</span>
// //                                         <button
// //                                             className="mlab-btn mlab-btn--sm"
// //                                             style={{ background: 'var(--mlab-green)', color: 'white', border: 'none', padding: '4px 8px', fontSize: '0.7rem' }}
// //                                             onClick={async () => {
// //                                                 try {
// //                                                     const ackFn = httpsCallable(getFunctions(), 'acknowledgeCurriculumTopic');
// //                                                     await ackFn({ logId: log.id, learnerId: submission.learnerId });
// //                                                     toast.success("Topic Acknowledged!");
// //                                                 } catch {
// //                                                     toast.error("Failed to acknowledge.");
// //                                                 }
// //                                             }}
// //                                         >
// //                                             Acknowledge
// //                                         </button>
// //                                     </div>
// //                                 ))}
// //                             </div>
// //                         </div>
// //                     ) : (
// //                         <div className="ap-declaration">
// //                             <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
// //                                 <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
// //                                 <span className="ap-declaration-check__text"><strong>Declaration of Authenticity &amp; Invigilation Consent</strong> I have read and agree to all rules. I consent to webcam, audio, and entire screen monitoring. I understand that stopping screen share or exiting invigilation will terminate my exam immediately.</span>
// //                             </label>
// //                             <button className={`ap-start-btn${(startDeclarationChecked && (!needsRemediationGate || coachingAckChecked)) ? ' ap-start-btn--ready' : ''}`} onClick={onStart} disabled={saving || isStarting || !startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)}>
// //                                 {saving || isStarting ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> {needsRemediationGate ? `Acknowledge & Resume Attempt #${submission.attemptNumber}` : 'I Agree, Begin Assessment'}</>}
// //                             </button>
// //                         </div>
// //                     )}
// //                 </div>
// //             </div>
// //         </div>
// //     );
// // };