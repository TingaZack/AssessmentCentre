// src/components/dashboard/PastAttemptsArchive/PastAttemptsArchive.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    History, Eye, X, Check, MessageSquare, Clock,
    ShieldCheck, Info, Award, AlertTriangle, Send,
    Unlock, Loader2, BookOpen
} from 'lucide-react';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../common/Toast/Toast';

interface PastAttemptsArchiveProps {
    historySnapshots: any[];
    assessment: any;
    mainSubmissionId?: string;
    mainStatus?: string;
}

const cleanRichText = (html?: any): string => {
    if (!html) return '';
    if (typeof html !== 'string') return String(html);
    return html.replace(/&nbsp;/g, ' ');
};

const ArchivedSnapshotViewer: React.FC<{
    snapshot: any;
    assessment: any;
    mainSubmissionId?: string;
    mainStatus?: string;
    onClose: () => void;
}> = ({ snapshot, assessment, mainSubmissionId, mainStatus, onClose }) => {

    const { user } = useStore() as any;
    const toast = useToast();
    const isLearner = user?.role === 'learner';

    const [lProfile, setLProfile] = useState<any>(null);
    const [aProfile, setAProfile] = useState<any>(null);
    const [mProfile, setMProfile] = useState<any>(null);
    const [fProfile, setFProfile] = useState<any>(null);

    // Appeal & Override States
    const [actionReason, setActionReason] = useState('');
    const [showActionBox, setShowActionBox] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 🚀 FAIL-SAFE LOGIC: If mainStatus is missing OR in any active state, hide the override button!
    const normalizedMainStatus = String(mainStatus || '').toLowerCase();
    const isMainInMotion = !mainStatus || [
        'not_started',
        'in_progress',
        'submitted',
        'facilitator_reviewed',
        'awaiting_learner_signoff',
        'returned'
    ].includes(normalizedMainStatus);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);

        const fetchProfiles = async () => {
            try {
                let targetLearnerUid = snapshot.learnerDeclaration?.learnerAuthUid;
                if (!targetLearnerUid && snapshot.learnerId) {
                    const learnerRef = await getDoc(doc(db, 'learners', snapshot.learnerId));
                    if (learnerRef.exists()) targetLearnerUid = learnerRef.data().authUid;
                }
                if (!targetLearnerUid) targetLearnerUid = snapshot.learnerId;

                if (targetLearnerUid) {
                    const lSnap = await getDoc(doc(db, 'users', targetLearnerUid));
                    if (lSnap.exists()) setLProfile(lSnap.data());
                }

                if (snapshot.grading?.gradedBy) {
                    const aSnap = await getDoc(doc(db, 'users', snapshot.grading.gradedBy));
                    if (aSnap.exists()) setAProfile(aSnap.data());
                }

                if (snapshot.moderation?.moderatedBy) {
                    const mSnap = await getDoc(doc(db, 'users', snapshot.moderation.moderatedBy));
                    if (mSnap.exists()) setMProfile(mSnap.data());
                }

                const facId = snapshot.coachingLog?.facilitatorId || snapshot.latestCoachingLog?.facilitatorId || snapshot.grading?.facilitatorId;
                if (facId) {
                    const fSnap = await getDoc(doc(db, 'users', facId));
                    if (fSnap.exists()) setFProfile(fSnap.data());
                }
            } catch (err) {
                console.error('Error fetching historical profiles:', err);
            }
        };

        fetchProfiles();

        return () => { document.head.removeChild(style); };
    }, [snapshot]);

    const sData = snapshot;
    const fBreakdown = sData.grading?.facilitatorBreakdown || sData.grading?.breakdown || {};
    const aBreakdown = sData.grading?.assessorBreakdown || {};
    const mBreakdown = sData.moderation?.breakdown || {};

    const preIntervention = sData.latestCoachingLog;
    const postIntervention = sData.coachingLog;

    const handleActionSubmit = async (type: 'appeal' | 'override') => {
        if (!actionReason.trim()) {
            toast.error("Please provide a reason.");
            return;
        }

        const targetSubmissionId = mainSubmissionId || sData.id;
        if (!targetSubmissionId) {
            toast.error("Error: Could not locate live submission ID.");
            return;
        }

        setIsSubmitting(true);
        try {
            const subRef = doc(db, 'learner_submissions', targetSubmissionId);

            if (type === 'appeal') {
                await updateDoc(subRef, {
                    status: 'appealed',
                    appeal: {
                        status: 'pending',
                        reason: actionReason,
                        date: new Date().toISOString()
                    }
                });
                toast.success("Appeal submitted to the Academic Board.");
            } else {
                await updateDoc(subRef, {
                    status: 'not_started',
                    competency: deleteField(),
                    grading: deleteField(),
                    moderation: deleteField(),
                    attemptNumber: (sData.attemptNumber || 1) + 1,
                    appeal: {
                        status: 'upheld',
                        reason: actionReason,
                        date: new Date().toISOString(),
                        grantedBy: user.uid
                    },
                    hasOverride: true
                });
                toast.success("Special Re-assessment Granted. Workbook unlocked.");
            }
            setShowActionBox(false);
            onClose();
        } catch (err: any) {
            toast.error("Failed to process request: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const modalContent = (
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%', height: '90vh' }}>

                {/* Header */}
                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <History size={18} />
                        <span>Audit Archive: Attempt #{sData.attemptNumber || 1}</span>
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 'normal', textTransform: 'none', marginLeft: '8px' }}>
                            ({new Date(sData.archivedAt).toLocaleString()})
                        </span>
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="lfm-body" style={{ flex: 1, overflowY: 'auto' }}>

                    {/* Outcome Banner */}
                    <div className="lfm-flags-panel" style={{ marginTop: 0, borderLeftWidth: '5px', borderLeftColor: sData.competency === 'NYC' ? 'var(--mlab-red)' : 'var(--mlab-green)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <h3 style={{ margin: '0 0 4px 0', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                    Final Outcome: {sData.competency === 'NYC' ? 'Not Yet Competent' : (sData.competency || 'Pending')}
                                </h3>
                                <p style={{ margin: 0, color: 'var(--mlab-grey)', fontSize: '0.88rem' }}>
                                    Score: <strong>{sData.marks}</strong> / {assessment.totalMarks}
                                </p>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {postIntervention && (
                                    <div style={{ background: '#fffbeb', padding: '8px 12px', borderRadius: '4px', border: '1px solid #fcd34d', maxWidth: '350px' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b45309', fontSize: '0.75rem', marginBottom: '4px' }}>
                                            <MessageSquare size={13} /> Coaching Logged for Attempt {(sData.attemptNumber || 1) + 1}
                                        </strong>
                                        <div className="quill-read-only-content" style={{ fontSize: '0.75rem', color: '#92400e', fontStyle: 'italic' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`"${postIntervention.notes}" — ${postIntervention.facilitatorName}`) }} />
                                    </div>
                                )}
                                {preIntervention && sData.attemptNumber > 1 && (
                                    <div style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: '4px', border: '1px solid #bbf7d0', maxWidth: '350px' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', fontSize: '0.75rem', marginBottom: '4px' }}>
                                            <Check size={13} /> Coaching Acknowledged for Attempt {sData.attemptNumber}
                                        </strong>
                                        <div className="quill-read-only-content" style={{ fontSize: '0.75rem', color: '#15803d', fontStyle: 'italic' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`"${preIntervention.notes}" — ${preIntervention.facilitatorName}`) }} />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 🚀 ONLY SHOW OVERRIDE/APPEAL ACTION BOX IF MAIN SUBMISSION IS TRULY LOCKED/FINISHED */}
                        {sData.competency === 'NYC' && !isMainInMotion && (
                            <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '0.85rem', marginTop: '0.5rem' }}>
                                {!showActionBox ? (
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {isLearner ? (
                                            <button className="lfm-btn lfm-btn--ghost" onClick={() => setShowActionBox(true)} style={{ color: '#b45309', borderColor: '#fde68a' }}>
                                                <AlertTriangle size={14} /> Request Academic Appeal / Re-assessment
                                            </button>
                                        ) : (
                                            <button className="lfm-btn lfm-btn--primary" onClick={() => setShowActionBox(true)}>
                                                <Unlock size={14} /> Grant Special Override / Unlock Attempt
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="animate-fade-in lfm-fg" style={{ background: 'white', padding: '1rem', border: '1px solid var(--mlab-border)' }}>
                                        <label>
                                            {isLearner ? 'Reason for Appeal or Re-assessment Request *' : 'Reason for Granting Special Override *'}
                                        </label>
                                        <textarea
                                            className="lfm-input"
                                            rows={3}
                                            value={actionReason}
                                            onChange={e => setActionReason(e.target.value)}
                                            placeholder={isLearner ? "Explain why you believe an appeal or an extra attempt is warranted under special circumstances..." : "Provide the administrative reason or special circumstance for unlocking this assessment..."}
                                            style={{ resize: 'vertical' }}
                                        />
                                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowActionBox(false)} disabled={isSubmitting}>Cancel</button>
                                            <button type="button" className="lfm-btn lfm-btn--primary" onClick={() => handleActionSubmit(isLearner ? 'appeal' : 'override')} disabled={isSubmitting}>
                                                {isSubmitting ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />} {isLearner ? 'Submit Appeal' : 'Confirm Override'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Section Header */}
                    <div className="lfm-section-hdr" style={{ marginTop: '0.5rem' }}>
                        <BookOpen size={13} /> Assessment Questions &amp; Responses
                    </div>

                    {/* Render Read-Only Question Blocks */}
                    {assessment.blocks?.filter((b: any) => b.type === 'mcq' || b.type === 'text' || b.type === 'task' || b.type === 'code_sandbox').map((block: any, idx: number) => {
                        const fData = fBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
                        const aData = aBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
                        const mData = mBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
                        const learnerAns = sData.answers?.[block.id];

                        return (
                            <div key={block.id} style={{ background: 'white', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '1.25rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '1rem', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Question {idx + 1}</span>
                                        <div className="quill-read-only-content" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', marginTop: '2px', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question || block.title) }} />
                                    </div>

                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                        {fData.isCorrect !== null && fData.isCorrect !== undefined && (
                                            <span title="Facilitator" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
                                                {fData.isCorrect ? <Check size={14} color="#0284c7" strokeWidth={3} /> : <X size={14} color="#0284c7" strokeWidth={3} />}
                                            </span>
                                        )}
                                        {aData.isCorrect !== null && aData.isCorrect !== undefined && (
                                            <span title="Assessor" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px' }}>
                                                {aData.isCorrect ? <Check size={14} color="#ef4444" strokeWidth={3} /> : <X size={14} color="#ef4444" strokeWidth={3} />}
                                            </span>
                                        )}
                                        {mData.isCorrect !== null && mData.isCorrect !== undefined && (
                                            <span title="Moderator" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 6px', borderRadius: '4px' }}>
                                                {mData.isCorrect ? <Check size={14} color="#22c55e" strokeWidth={3} /> : <X size={14} color="#22c55e" strokeWidth={3} />}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ background: 'var(--mlab-bg)', padding: '0.85rem', border: '1px solid var(--mlab-border)', marginBottom: '0.75rem' }}>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.08em' }}>Learner Response</div>
                                    {block.type === 'mcq' ? (
                                        <div style={{ color: 'var(--mlab-blue)', fontWeight: 600 }}>
                                            {learnerAns !== undefined ? `${String.fromCharCode(65 + Number(learnerAns))}. ${block.options?.[learnerAns] || ''}` : 'No answer provided.'}
                                        </div>
                                    ) : (
                                        <div className="quill-read-only-content" style={{ color: 'var(--mlab-blue)', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cleanRichText(typeof learnerAns === 'object' ? (learnerAns?.text || learnerAns?.code || JSON.stringify(learnerAns)) : (learnerAns || '<em>No answer provided.</em>')) }} />
                                    )}
                                </div>

                                {fData.feedback && (
                                    <div style={{ borderLeft: '3px solid #3b82f6', background: '#eff6ff', padding: '0.6rem 0.85rem', marginBottom: '0.4rem' }}>
                                        <div style={{ color: '#0284c7', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Facilitator Note [{fData.score}/{block.marks}]</div>
                                        <div className="quill-read-only-content" style={{ color: '#0369a1', fontSize: '0.85rem', marginTop: '2px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(fData.feedback) }} />
                                    </div>
                                )}
                                {aData.feedback && (
                                    <div style={{ borderLeft: '3px solid #ef4444', background: '#fef2f2', padding: '0.6rem 0.85rem', marginBottom: '0.4rem' }}>
                                        <div style={{ color: '#b91c1c', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Assessor Note [{aData.score}/{block.marks}]</div>
                                        <div className="quill-read-only-content" style={{ color: '#991b1b', fontSize: '0.85rem', marginTop: '2px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(aData.feedback) }} />
                                    </div>
                                )}
                                {mData.feedback && (
                                    <div style={{ borderLeft: '3px solid #22c55e', background: '#f0fdf4', padding: '0.6rem 0.85rem' }}>
                                        <div style={{ color: '#15803d', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Moderator Note [{mData.score}/{block.marks}]</div>
                                        <div className="quill-read-only-content" style={{ color: '#16a34a', fontSize: '0.85rem', marginTop: '2px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(mData.feedback) }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Overall Remarks & Feedback Section */}
                    {(sData.grading?.facilitatorOverallFeedback || sData.grading?.assessorOverallFeedback || sData.grading?.overallFeedback || sData.moderation?.feedback) && (
                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>
                            <div className="lfm-section-hdr" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '0.75rem' }}>
                                <Award size={13} /> Overall Remarks &amp; Feedback
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                                {sData.grading?.facilitatorOverallFeedback && (
                                    <div style={{ background: '#eff6ff', borderLeft: '4px solid #3b82f6', padding: '0.85rem' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0284c7', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                            <Info size={13} /> Facilitator Overall Summary
                                        </strong>
                                        <div className="quill-read-only-content" style={{ color: '#0369a1', fontSize: '0.88rem', marginTop: '4px', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cleanRichText(sData.grading.facilitatorOverallFeedback) }} />
                                    </div>
                                )}

                                {(sData.grading?.assessorOverallFeedback || sData.grading?.overallFeedback) && (
                                    <div style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '0.85rem' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b91c1c', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                            <Award size={13} /> Assessor Final Remarks
                                        </strong>
                                        <div className="quill-read-only-content" style={{ color: '#991b1b', fontSize: '0.88rem', marginTop: '4px', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cleanRichText(sData.grading.assessorOverallFeedback || sData.grading.overallFeedback) }} />
                                    </div>
                                )}

                                {sData.moderation?.feedback && (
                                    <div style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '0.85rem' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803d', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                            <ShieldCheck size={13} /> Moderator QA Notes
                                        </strong>
                                        <div className="quill-read-only-content" style={{ color: '#16a34a', fontSize: '0.88rem', marginTop: '4px', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cleanRichText(sData.moderation.feedback) }} />
                                    </div>
                                )}

                            </div>
                        </div>
                    )}

                    {/* Pre-Assessment Intervention Record */}
                    {preIntervention && sData.attemptNumber > 1 && (
                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid #bbf7d0', borderLeft: '4px solid #22c55e', marginBottom: '1.5rem' }}>
                            <div className="lfm-section-hdr" style={{ color: '#15803d', borderBottomColor: '#bbf7d0' }}>
                                <ShieldCheck size={13} /> Pre-Assessment Intervention Record (Attempt #{sData.attemptNumber})
                            </div>
                            <p style={{ fontSize: '0.82rem', color: '#166534', marginBottom: '1rem', lineHeight: 1.4 }}>
                                Proof that a developmental intervention was conducted by the facilitator and formally acknowledged by the learner prior to starting this attempt.
                            </p>

                            <div className="lfm-grid" style={{ marginBottom: '1rem' }}>
                                <div className="lfm-fg">
                                    <label>Date of Coaching</label>
                                    <div className="lfm-input" style={{ background: '#f8fafc' }}>{new Date(preIntervention.date).toLocaleDateString()}</div>
                                </div>
                                <div className="lfm-fg">
                                    <label>Facilitator</label>
                                    <div className="lfm-input" style={{ background: '#f8fafc' }}>{preIntervention.facilitatorName}</div>
                                </div>
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Coaching Notes</label>
                                    <div className="lfm-input quill-read-only-content" style={{ background: '#f8fafc', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(preIntervention.notes) }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ background: '#f8fafc', padding: '0.85rem', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                                    <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Facilitator Declaration</p>
                                    {preIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl ? (
                                        <img src={preIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl} crossOrigin="anonymous" alt="Facilitator Signature" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
                                    ) : (
                                        <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
                                    )}
                                    <p style={{ margin: '6px 0 0', fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{preIntervention.facilitatorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>Logged: {new Date(preIntervention.date).toLocaleDateString()}</p>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '0.85rem', border: '1px solid var(--mlab-border)', textAlign: 'center' }}>
                                    <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Learner Acknowledgement</p>
                                    {preIntervention.acknowledged ? (
                                        <>
                                            {preIntervention.learnerSignatureUrl || lProfile?.signatureUrl ? (
                                                <img src={preIntervention.learnerSignatureUrl || lProfile?.signatureUrl} alt="Learner Signature" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
                                            ) : (
                                                <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
                                            )}
                                            <p style={{ margin: '6px 0 0', fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{lProfile?.fullName || 'Learner'}</p>
                                            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>Acknowledged: {new Date(preIntervention.acknowledgedAt).toLocaleDateString()}</p>
                                        </>
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
                                            <Clock size={20} color="#94a3b8" style={{ marginBottom: '4px' }} />
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Awaiting learner acknowledgement</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Post-Assessment Remediation */}
                    {postIntervention && (
                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b', marginBottom: '1.5rem' }}>
                            <div className="lfm-section-hdr" style={{ color: '#b45309', borderBottomColor: '#fcd34d' }}>
                                <MessageSquare size={13} /> Post-Assessment Remediation (Unlocking Attempt {(sData.attemptNumber || 1) + 1})
                            </div>
                            <p style={{ fontSize: '0.82rem', color: '#92400e', marginBottom: '1rem', lineHeight: 1.4 }}>
                                Developmental intervention logged by the facilitator immediately after this attempt failed, in order to unlock the next attempt.
                            </p>

                            <div className="lfm-grid" style={{ marginBottom: '1rem' }}>
                                <div className="lfm-fg">
                                    <label>Date of Coaching</label>
                                    <div className="lfm-input" style={{ background: '#f8fafc' }}>{new Date(postIntervention.date).toLocaleDateString()}</div>
                                </div>
                                <div className="lfm-fg">
                                    <label>Facilitator</label>
                                    <div className="lfm-input" style={{ background: '#f8fafc' }}>{postIntervention.facilitatorName}</div>
                                </div>
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Coaching Notes</label>
                                    <div className="lfm-input quill-read-only-content" style={{ background: '#f8fafc', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(postIntervention.notes) }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ background: '#f8fafc', padding: '0.85rem', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                                    <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Facilitator Declaration</p>
                                    {postIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl ? (
                                        <img src={postIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl} alt="Facilitator Signature" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
                                    ) : (
                                        <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
                                    )}
                                    <p style={{ margin: '6px 0 0', fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{postIntervention.facilitatorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>Logged: {new Date(postIntervention.date).toLocaleDateString()}</p>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '0.85rem', border: '1px solid var(--mlab-border)', display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: 0.7 }}>
                                    <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Learner Acknowledgement</p>
                                    <Clock size={20} color="#94a3b8" style={{ margin: '6px 0' }} />
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Awaiting Learner Acknowledgement on Attempt {(sData.attemptNumber || 1) + 1}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Historical Final Signatures */}
                    <div className="lfm-section-hdr">
                        <ShieldCheck size={13} /> Historical Signatures &amp; Authentication
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>

                        <div style={{ background: 'white', padding: '0.85rem', border: '1px solid var(--mlab-border)', textAlign: 'center' }}>
                            <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Learner Declared</p>
                            {sData.learnerDeclaration?.signatureUrl || lProfile?.signatureUrl ? (
                                <img src={sData.learnerDeclaration?.signatureUrl || lProfile?.signatureUrl} alt="Learner Signature" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
                            ) : (
                                <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
                            )}
                            <p style={{ margin: '6px 0 2px', fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>{sData.learnerDeclaration?.learnerName || lProfile?.fullName}</p>
                            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>{new Date(sData.learnerDeclaration?.timestamp || sData.submittedAt).toLocaleDateString()}</p>
                        </div>

                        <div style={{ background: 'white', padding: '0.85rem', border: '1px solid #fca5a5', textAlign: 'center' }}>
                            <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Assessor Signed</p>
                            {sData.grading?.gradedAt ? (
                                <>
                                    {sData.grading?.assessorSignatureUrl || aProfile?.signatureUrl ? (
                                        <img src={sData.grading?.assessorSignatureUrl || aProfile?.signatureUrl} alt="Assessor Signature" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
                                    ) : (
                                        <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
                                    )}
                                    <p style={{ margin: '6px 0 2px', fontWeight: 'bold', fontSize: '0.85rem', color: '#b91c1c' }}>{sData.grading?.assessorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#ef4444' }}>{new Date(sData.grading.gradedAt).toLocaleDateString()}</p>
                                </>
                            ) : (
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#ef4444', fontStyle: 'italic' }}>Pending Signature</p>
                            )}
                        </div>

                        <div style={{ background: 'white', padding: '0.85rem', border: '1px solid #86efac', textAlign: 'center' }}>
                            <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Moderator Signed</p>
                            {sData.moderation?.moderatedAt ? (
                                <>
                                    {sData.moderation?.moderatorSignatureUrl || mProfile?.signatureUrl ? (
                                        <img src={sData.moderation?.moderatorSignatureUrl || mProfile?.signatureUrl} alt="Moderator Signature" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
                                    ) : (
                                        <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
                                    )}
                                    <p style={{ margin: '6px 0 2px', fontWeight: 'bold', fontSize: '0.85rem', color: '#15803d' }}>{sData.moderation?.moderatorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#22c55e' }}>{new Date(sData.moderation.moderatedAt).toLocaleDateString()}</p>
                                </>
                            ) : (
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#22c55e', fontStyle: 'italic' }}>Pending Signature</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="lfm-footer">
                    <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose}>
                        <X size={13} /> Close Archive
                    </button>
                </div>
            </div>
        </div>
    );
    return createPortal(modalContent, document.body);
};

// ─── EXPORTED PARENT COMPONENT ───
export const PastAttemptsArchive: React.FC<PastAttemptsArchiveProps> = ({ historySnapshots, assessment, mainSubmissionId, mainStatus }) => {
    const [viewingSnapshot, setViewingSnapshot] = useState<any | null>(null);

    if (!historySnapshots || historySnapshots.length === 0) return null;

    return (
        <>
            {viewingSnapshot && (
                <ArchivedSnapshotViewer
                    snapshot={viewingSnapshot}
                    assessment={assessment}
                    mainSubmissionId={mainSubmissionId}
                    mainStatus={mainStatus}
                    onClose={() => setViewingSnapshot(null)}
                />
            )}
            <div className="sr-summary-card" style={{ marginTop: '1.5rem', borderTop: '4px solid #64748b' }}>
                <h3 className="sr-summary-title" style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <History size={16} /> Past Attempts Archive
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {historySnapshots.map((snap, index) => (
                        <div key={snap.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', display: 'block' }}>Attempt #{snap.attemptNumber || historySnapshots.length - index}</span>
                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{new Date(snap.archivedAt).toLocaleDateString()}</span>
                            </div>
                            <button onClick={() => setViewingSnapshot(snap)} className="lfm-btn lfm-btn--ghost" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                                <Eye size={12} /> View
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};



// // src/components/dashboard/PastAttemptsArchive/PastAttemptsArchive.tsx

// import React, { useState, useEffect } from 'react';
// import { createPortal } from 'react-dom';
// import {
//     History, Eye, X, Check, MessageSquare, Clock,
//     ShieldCheck, Info, Award, AlertTriangle, Send,
//     Unlock, Loader2, BookOpen
// } from 'lucide-react';
// import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import { useToast } from '../../common/Toast/Toast';

// interface PastAttemptsArchiveProps {
//     historySnapshots: any[];
//     assessment: any;
//     mainSubmissionId?: string;
// }

// const cleanRichText = (html?: any): string => {
//     if (!html) return '';
//     if (typeof html !== 'string') return String(html);
//     return html.replace(/&nbsp;/g, ' ');
// };

// const ArchivedSnapshotViewer: React.FC<{
//     snapshot: any;
//     assessment: any;
//     mainSubmissionId?: string;
//     onClose: () => void;
// }> = ({ snapshot, assessment, mainSubmissionId, onClose }) => {

//     const { user } = useStore() as any;
//     const toast = useToast();
//     const isLearner = user?.role === 'learner';

//     const [lProfile, setLProfile] = useState<any>(null);
//     const [aProfile, setAProfile] = useState<any>(null);
//     const [mProfile, setMProfile] = useState<any>(null);
//     const [fProfile, setFProfile] = useState<any>(null);

//     // Appeal & Override States
//     const [actionReason, setActionReason] = useState('');
//     const [showActionBox, setShowActionBox] = useState(false);
//     const [isSubmitting, setIsSubmitting] = useState(false);

//     useEffect(() => {
//         const style = document.createElement('style');
//         style.innerHTML = `body, html { overflow: hidden !important; }`;
//         document.head.appendChild(style);

//         const fetchProfiles = async () => {
//             try {
//                 let targetLearnerUid = snapshot.learnerDeclaration?.learnerAuthUid;
//                 if (!targetLearnerUid && snapshot.learnerId) {
//                     const learnerRef = await getDoc(doc(db, 'learners', snapshot.learnerId));
//                     if (learnerRef.exists()) targetLearnerUid = learnerRef.data().authUid;
//                 }
//                 if (!targetLearnerUid) targetLearnerUid = snapshot.learnerId;

//                 if (targetLearnerUid) {
//                     const lSnap = await getDoc(doc(db, 'users', targetLearnerUid));
//                     if (lSnap.exists()) setLProfile(lSnap.data());
//                 }

//                 if (snapshot.grading?.gradedBy) {
//                     const aSnap = await getDoc(doc(db, 'users', snapshot.grading.gradedBy));
//                     if (aSnap.exists()) setAProfile(aSnap.data());
//                 }

//                 if (snapshot.moderation?.moderatedBy) {
//                     const mSnap = await getDoc(doc(db, 'users', snapshot.moderation.moderatedBy));
//                     if (mSnap.exists()) setMProfile(mSnap.data());
//                 }

//                 const facId = snapshot.coachingLog?.facilitatorId || snapshot.latestCoachingLog?.facilitatorId || snapshot.grading?.facilitatorId;
//                 if (facId) {
//                     const fSnap = await getDoc(doc(db, 'users', facId));
//                     if (fSnap.exists()) setFProfile(fSnap.data());
//                 }
//             } catch (err) {
//                 console.error('Error fetching historical profiles:', err);
//             }
//         };

//         fetchProfiles();

//         return () => { document.head.removeChild(style); };
//     }, [snapshot]);

//     const sData = snapshot;
//     const fBreakdown = sData.grading?.facilitatorBreakdown || sData.grading?.breakdown || {};
//     const aBreakdown = sData.grading?.assessorBreakdown || {};
//     const mBreakdown = sData.moderation?.breakdown || {};

//     const preIntervention = sData.latestCoachingLog;
//     const postIntervention = sData.coachingLog;

//     const handleActionSubmit = async (type: 'appeal' | 'override') => {
//         if (!actionReason.trim()) {
//             toast.error("Please provide a reason.");
//             return;
//         }

//         const targetSubmissionId = mainSubmissionId || sData.id;
//         if (!targetSubmissionId) {
//             toast.error("Error: Could not locate live submission ID.");
//             return;
//         }

//         setIsSubmitting(true);
//         try {
//             const subRef = doc(db, 'learner_submissions', targetSubmissionId);

//             if (type === 'appeal') {
//                 await updateDoc(subRef, {
//                     status: 'appealed',
//                     appeal: {
//                         status: 'pending',
//                         reason: actionReason,
//                         date: new Date().toISOString()
//                     }
//                 });
//                 toast.success("Appeal submitted to the Academic Board.");
//             } else {
//                 await updateDoc(subRef, {
//                     status: 'not_started',
//                     competency: deleteField(),
//                     grading: deleteField(),
//                     moderation: deleteField(),
//                     attemptNumber: (sData.attemptNumber || 1) + 1,
//                     appeal: {
//                         status: 'upheld',
//                         reason: actionReason,
//                         date: new Date().toISOString(),
//                         grantedBy: user.uid
//                     },
//                     hasOverride: true
//                 });
//                 toast.success("Special Re-assessment Granted. Workbook unlocked.");
//             }
//             setShowActionBox(false);
//             onClose();
//         } catch (err: any) {
//             toast.error("Failed to process request: " + err.message);
//         } finally {
//             setIsSubmitting(false);
//         }
//     };

//     const modalContent = (
//         <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 99999 }}>
//             <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%', height: '90vh' }}>

//                 {/* Header */}
//                 <div className="lfm-header">
//                     <h2 className="lfm-header__title">
//                         <History size={18} />
//                         <span>Audit Archive: Attempt #{sData.attemptNumber || 1}</span>
//                         <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 'normal', textTransform: 'none', marginLeft: '8px' }}>
//                             ({new Date(sData.archivedAt).toLocaleString()})
//                         </span>
//                     </h2>
//                     <button className="lfm-close-btn" type="button" onClick={onClose}>
//                         <X size={20} />
//                     </button>
//                 </div>

//                 {/* Body */}
//                 <div className="lfm-body" style={{ flex: 1, overflowY: 'auto' }}>

//                     {/* Outcome Banner */}
//                     <div className="lfm-flags-panel" style={{ marginTop: 0, borderLeftWidth: '5px', borderLeftColor: sData.competency === 'NYC' ? 'var(--mlab-red)' : 'var(--mlab-green)' }}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
//                             <div>
//                                 <h3 style={{ margin: '0 0 4px 0', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
//                                     Final Outcome: {sData.competency === 'NYC' ? 'Not Yet Competent' : (sData.competency || 'Pending')}
//                                 </h3>
//                                 <p style={{ margin: 0, color: 'var(--mlab-grey)', fontSize: '0.88rem' }}>
//                                     Score: <strong>{sData.marks}</strong> / {assessment.totalMarks}
//                                 </p>
//                             </div>

//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                 {postIntervention && (
//                                     <div style={{ background: '#fffbeb', padding: '8px 12px', borderRadius: '4px', border: '1px solid #fcd34d', maxWidth: '350px' }}>
//                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b45309', fontSize: '0.75rem', marginBottom: '4px' }}>
//                                             <MessageSquare size={13} /> Coaching Logged for Attempt {(sData.attemptNumber || 1) + 1}
//                                         </strong>
//                                         <div className="quill-read-only-content" style={{ fontSize: '0.75rem', color: '#92400e', fontStyle: 'italic' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`"${postIntervention.notes}" — ${postIntervention.facilitatorName}`) }} />
//                                     </div>
//                                 )}
//                                 {preIntervention && sData.attemptNumber > 1 && (
//                                     <div style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: '4px', border: '1px solid #bbf7d0', maxWidth: '350px' }}>
//                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', fontSize: '0.75rem', marginBottom: '4px' }}>
//                                             <Check size={13} /> Coaching Acknowledged for Attempt {sData.attemptNumber}
//                                         </strong>
//                                         <div className="quill-read-only-content" style={{ fontSize: '0.75rem', color: '#15803d', fontStyle: 'italic' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`"${preIntervention.notes}" — ${preIntervention.facilitatorName}`) }} />
//                                     </div>
//                                 )}
//                             </div>
//                         </div>

//                         {/* Appeal & Override Trigger */}
//                         {sData.competency === 'NYC' && (
//                             <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '0.85rem', marginTop: '0.5rem' }}>
//                                 {!showActionBox ? (
//                                     <div style={{ display: 'flex', gap: '10px' }}>
//                                         {isLearner ? (
//                                             <button className="lfm-btn lfm-btn--ghost" onClick={() => setShowActionBox(true)} style={{ color: '#b45309', borderColor: '#fde68a' }}>
//                                                 <AlertTriangle size={14} /> Request Academic Appeal / Re-assessment
//                                             </button>
//                                         ) : (
//                                             <button className="lfm-btn lfm-btn--primary" onClick={() => setShowActionBox(true)}>
//                                                 <Unlock size={14} /> Grant Special Override / Unlock Attempt
//                                             </button>
//                                         )}
//                                     </div>
//                                 ) : (
//                                     <div className="animate-fade-in lfm-fg" style={{ background: 'white', padding: '1rem', border: '1px solid var(--mlab-border)' }}>
//                                         <label>
//                                             {isLearner ? 'Reason for Appeal or Re-assessment Request *' : 'Reason for Granting Special Override *'}
//                                         </label>
//                                         <textarea
//                                             className="lfm-input"
//                                             rows={3}
//                                             value={actionReason}
//                                             onChange={e => setActionReason(e.target.value)}
//                                             placeholder={isLearner ? "Explain why you believe an appeal or an extra attempt is warranted under special circumstances..." : "Provide the administrative reason or special circumstance for unlocking this assessment..."}
//                                             style={{ resize: 'vertical' }}
//                                         />
//                                         <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
//                                             <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowActionBox(false)} disabled={isSubmitting}>Cancel</button>
//                                             <button type="button" className="lfm-btn lfm-btn--primary" onClick={() => handleActionSubmit(isLearner ? 'appeal' : 'override')} disabled={isSubmitting}>
//                                                 {isSubmitting ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />} {isLearner ? 'Submit Appeal' : 'Confirm Override'}
//                                             </button>
//                                         </div>
//                                     </div>
//                                 )}
//                             </div>
//                         )}
//                     </div>

//                     {/* Section Header */}
//                     <div className="lfm-section-hdr" style={{ marginTop: '0.5rem' }}>
//                         <BookOpen size={13} /> Assessment Questions &amp; Responses
//                     </div>

//                     {/* Render Read-Only Question Blocks */}
//                     {assessment.blocks?.filter((b: any) => b.type === 'mcq' || b.type === 'text' || b.type === 'task' || b.type === 'code_sandbox').map((block: any, idx: number) => {
//                         const fData = fBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
//                         const aData = aBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
//                         const mData = mBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
//                         const learnerAns = sData.answers?.[block.id];

//                         return (
//                             <div key={block.id} style={{ background: 'white', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '1.25rem', marginBottom: '1rem' }}>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '1rem', alignItems: 'flex-start' }}>
//                                     <div style={{ flex: 1 }}>
//                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Question {idx + 1}</span>
//                                         <div className="quill-read-only-content" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', marginTop: '2px', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question || block.title) }} />
//                                     </div>

//                                     <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
//                                         {fData.isCorrect !== null && fData.isCorrect !== undefined && (
//                                             <span title="Facilitator" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
//                                                 {fData.isCorrect ? <Check size={14} color="#0284c7" strokeWidth={3} /> : <X size={14} color="#0284c7" strokeWidth={3} />}
//                                             </span>
//                                         )}
//                                         {aData.isCorrect !== null && aData.isCorrect !== undefined && (
//                                             <span title="Assessor" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px' }}>
//                                                 {aData.isCorrect ? <Check size={14} color="#ef4444" strokeWidth={3} /> : <X size={14} color="#ef4444" strokeWidth={3} />}
//                                             </span>
//                                         )}
//                                         {mData.isCorrect !== null && mData.isCorrect !== undefined && (
//                                             <span title="Moderator" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 6px', borderRadius: '4px' }}>
//                                                 {mData.isCorrect ? <Check size={14} color="#22c55e" strokeWidth={3} /> : <X size={14} color="#22c55e" strokeWidth={3} />}
//                                             </span>
//                                         )}
//                                     </div>
//                                 </div>

//                                 <div style={{ background: 'var(--mlab-bg)', padding: '0.85rem', border: '1px solid var(--mlab-border)', marginBottom: '0.75rem' }}>
//                                     <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.08em' }}>Learner Response</div>
//                                     {block.type === 'mcq' ? (
//                                         <div style={{ color: 'var(--mlab-blue)', fontWeight: 600 }}>
//                                             {learnerAns !== undefined ? `${String.fromCharCode(65 + Number(learnerAns))}. ${block.options?.[learnerAns] || ''}` : 'No answer provided.'}
//                                         </div>
//                                     ) : (
//                                         <div className="quill-read-only-content" style={{ color: 'var(--mlab-blue)', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cleanRichText(typeof learnerAns === 'object' ? (learnerAns?.text || learnerAns?.code || JSON.stringify(learnerAns)) : (learnerAns || '<em>No answer provided.</em>')) }} />
//                                     )}
//                                 </div>

//                                 {fData.feedback && (
//                                     <div style={{ borderLeft: '3px solid #3b82f6', background: '#eff6ff', padding: '0.6rem 0.85rem', marginBottom: '0.4rem' }}>
//                                         <div style={{ color: '#0284c7', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Facilitator Note [{fData.score}/{block.marks}]</div>
//                                         <div className="quill-read-only-content" style={{ color: '#0369a1', fontSize: '0.85rem', marginTop: '2px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(fData.feedback) }} />
//                                     </div>
//                                 )}
//                                 {aData.feedback && (
//                                     <div style={{ borderLeft: '3px solid #ef4444', background: '#fef2f2', padding: '0.6rem 0.85rem', marginBottom: '0.4rem' }}>
//                                         <div style={{ color: '#b91c1c', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Assessor Note [{aData.score}/{block.marks}]</div>
//                                         <div className="quill-read-only-content" style={{ color: '#991b1b', fontSize: '0.85rem', marginTop: '2px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(aData.feedback) }} />
//                                     </div>
//                                 )}
//                                 {mData.feedback && (
//                                     <div style={{ borderLeft: '3px solid #22c55e', background: '#f0fdf4', padding: '0.6rem 0.85rem' }}>
//                                         <div style={{ color: '#15803d', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Moderator Note [{mData.score}/{block.marks}]</div>
//                                         <div className="quill-read-only-content" style={{ color: '#16a34a', fontSize: '0.85rem', marginTop: '2px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(mData.feedback) }} />
//                                     </div>
//                                 )}
//                             </div>
//                         );
//                     })}

//                     {/* Overall Remarks & Feedback Section */}
//                     {(sData.grading?.facilitatorOverallFeedback || sData.grading?.assessorOverallFeedback || sData.grading?.overallFeedback || sData.moderation?.feedback) && (
//                         <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>
//                             <div className="lfm-section-hdr" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '0.75rem' }}>
//                                 <Award size={13} /> Overall Remarks &amp; Feedback
//                             </div>
//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

//                                 {sData.grading?.facilitatorOverallFeedback && (
//                                     <div style={{ background: '#eff6ff', borderLeft: '4px solid #3b82f6', padding: '0.85rem' }}>
//                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0284c7', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
//                                             <Info size={13} /> Facilitator Overall Summary
//                                         </strong>
//                                         <div className="quill-read-only-content" style={{ color: '#0369a1', fontSize: '0.88rem', marginTop: '4px', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cleanRichText(sData.grading.facilitatorOverallFeedback) }} />
//                                     </div>
//                                 )}

//                                 {(sData.grading?.assessorOverallFeedback || sData.grading?.overallFeedback) && (
//                                     <div style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '0.85rem' }}>
//                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b91c1c', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
//                                             <Award size={13} /> Assessor Final Remarks
//                                         </strong>
//                                         <div className="quill-read-only-content" style={{ color: '#991b1b', fontSize: '0.88rem', marginTop: '4px', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cleanRichText(sData.grading.assessorOverallFeedback || sData.grading.overallFeedback) }} />
//                                     </div>
//                                 )}

//                                 {sData.moderation?.feedback && (
//                                     <div style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '0.85rem' }}>
//                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803d', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
//                                             <ShieldCheck size={13} /> Moderator QA Notes
//                                         </strong>
//                                         <div className="quill-read-only-content" style={{ color: '#16a34a', fontSize: '0.88rem', marginTop: '4px', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cleanRichText(sData.moderation.feedback) }} />
//                                     </div>
//                                 )}

//                             </div>
//                         </div>
//                     )}

//                     {/* Pre-Assessment Intervention Record */}
//                     {preIntervention && sData.attemptNumber > 1 && (
//                         <div style={{ background: 'white', padding: '1.25rem', border: '1px solid #bbf7d0', borderLeft: '4px solid #22c55e', marginBottom: '1.5rem' }}>
//                             <div className="lfm-section-hdr" style={{ color: '#15803d', borderBottomColor: '#bbf7d0' }}>
//                                 <ShieldCheck size={13} /> Pre-Assessment Intervention Record (Attempt #{sData.attemptNumber})
//                             </div>
//                             <p style={{ fontSize: '0.82rem', color: '#166534', marginBottom: '1rem', lineHeight: 1.4 }}>
//                                 Proof that a developmental intervention was conducted by the facilitator and formally acknowledged by the learner prior to starting this attempt.
//                             </p>

//                             <div className="lfm-grid" style={{ marginBottom: '1rem' }}>
//                                 <div className="lfm-fg">
//                                     <label>Date of Coaching</label>
//                                     <div className="lfm-input" style={{ background: '#f8fafc' }}>{new Date(preIntervention.date).toLocaleDateString()}</div>
//                                 </div>
//                                 <div className="lfm-fg">
//                                     <label>Facilitator</label>
//                                     <div className="lfm-input" style={{ background: '#f8fafc' }}>{preIntervention.facilitatorName}</div>
//                                 </div>
//                                 <div className="lfm-fg lfm-fg--full">
//                                     <label>Coaching Notes</label>
//                                     <div className="lfm-input quill-read-only-content" style={{ background: '#f8fafc', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(preIntervention.notes) }} />
//                                 </div>
//                             </div>

//                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
//                                 <div style={{ background: '#f8fafc', padding: '0.85rem', border: '1px solid #bfdbfe', textAlign: 'center' }}>
//                                     <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Facilitator Declaration</p>
//                                     {preIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl ? (
//                                         <img src={preIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl} crossOrigin="anonymous" alt="Facilitator Signature" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
//                                     ) : (
//                                         <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
//                                     )}
//                                     <p style={{ margin: '6px 0 0', fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{preIntervention.facilitatorName}</p>
//                                     <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>Logged: {new Date(preIntervention.date).toLocaleDateString()}</p>
//                                 </div>
//                                 <div style={{ background: '#f8fafc', padding: '0.85rem', border: '1px solid var(--mlab-border)', textAlign: 'center' }}>
//                                     <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Learner Acknowledgement</p>
//                                     {preIntervention.acknowledged ? (
//                                         <>
//                                             {preIntervention.learnerSignatureUrl || lProfile?.signatureUrl ? (
//                                                 <img src={preIntervention.learnerSignatureUrl || lProfile?.signatureUrl} alt="Learner Signature" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
//                                             ) : (
//                                                 <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
//                                             )}
//                                             <p style={{ margin: '6px 0 0', fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{lProfile?.fullName || 'Learner'}</p>
//                                             <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>Acknowledged: {new Date(preIntervention.acknowledgedAt).toLocaleDateString()}</p>
//                                         </>
//                                     ) : (
//                                         <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
//                                             <Clock size={20} color="#94a3b8" style={{ marginBottom: '4px' }} />
//                                             <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Awaiting learner acknowledgement</p>
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* Post-Assessment Remediation */}
//                     {postIntervention && (
//                         <div style={{ background: 'white', padding: '1.25rem', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b', marginBottom: '1.5rem' }}>
//                             <div className="lfm-section-hdr" style={{ color: '#b45309', borderBottomColor: '#fcd34d' }}>
//                                 <MessageSquare size={13} /> Post-Assessment Remediation (Unlocking Attempt {(sData.attemptNumber || 1) + 1})
//                             </div>
//                             <p style={{ fontSize: '0.82rem', color: '#92400e', marginBottom: '1rem', lineHeight: 1.4 }}>
//                                 Developmental intervention logged by the facilitator immediately after this attempt failed, in order to unlock the next attempt.
//                             </p>

//                             <div className="lfm-grid" style={{ marginBottom: '1rem' }}>
//                                 <div className="lfm-fg">
//                                     <label>Date of Coaching</label>
//                                     <div className="lfm-input" style={{ background: '#f8fafc' }}>{new Date(postIntervention.date).toLocaleDateString()}</div>
//                                 </div>
//                                 <div className="lfm-fg">
//                                     <label>Facilitator</label>
//                                     <div className="lfm-input" style={{ background: '#f8fafc' }}>{postIntervention.facilitatorName}</div>
//                                 </div>
//                                 <div className="lfm-fg lfm-fg--full">
//                                     <label>Coaching Notes</label>
//                                     <div className="lfm-input quill-read-only-content" style={{ background: '#f8fafc', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(postIntervention.notes) }} />
//                                 </div>
//                             </div>

//                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
//                                 <div style={{ background: '#f8fafc', padding: '0.85rem', border: '1px solid #bfdbfe', textAlign: 'center' }}>
//                                     <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Facilitator Declaration</p>
//                                     {postIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl ? (
//                                         <img src={postIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl} alt="Facilitator Signature" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
//                                     ) : (
//                                         <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
//                                     )}
//                                     <p style={{ margin: '6px 0 0', fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{postIntervention.facilitatorName}</p>
//                                     <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>Logged: {new Date(postIntervention.date).toLocaleDateString()}</p>
//                                 </div>
//                                 <div style={{ background: '#f8fafc', padding: '0.85rem', border: '1px solid var(--mlab-border)', display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: 0.7 }}>
//                                     <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Learner Acknowledgement</p>
//                                     <Clock size={20} color="#94a3b8" style={{ margin: '6px 0' }} />
//                                     <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Awaiting Learner Acknowledgement on Attempt {(sData.attemptNumber || 1) + 1}</p>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* Historical Final Signatures */}
//                     <div className="lfm-section-hdr">
//                         <ShieldCheck size={13} /> Historical Signatures &amp; Authentication
//                     </div>
//                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>

//                         <div style={{ background: 'white', padding: '0.85rem', border: '1px solid var(--mlab-border)', textAlign: 'center' }}>
//                             <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Learner Declared</p>
//                             {sData.learnerDeclaration?.signatureUrl || lProfile?.signatureUrl ? (
//                                 <img src={sData.learnerDeclaration?.signatureUrl || lProfile?.signatureUrl} alt="Learner Signature" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
//                             ) : (
//                                 <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
//                             )}
//                             <p style={{ margin: '6px 0 2px', fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>{sData.learnerDeclaration?.learnerName || lProfile?.fullName}</p>
//                             <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>{new Date(sData.learnerDeclaration?.timestamp || sData.submittedAt).toLocaleDateString()}</p>
//                         </div>

//                         <div style={{ background: 'white', padding: '0.85rem', border: '1px solid #fca5a5', textAlign: 'center' }}>
//                             <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Assessor Signed</p>
//                             {sData.grading?.gradedAt ? (
//                                 <>
//                                     {sData.grading?.assessorSignatureUrl || aProfile?.signatureUrl ? (
//                                         <img src={sData.grading?.assessorSignatureUrl || aProfile?.signatureUrl} alt="Assessor Signature" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
//                                     ) : (
//                                         <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
//                                     )}
//                                     <p style={{ margin: '6px 0 2px', fontWeight: 'bold', fontSize: '0.85rem', color: '#b91c1c' }}>{sData.grading?.assessorName}</p>
//                                     <p style={{ margin: 0, fontSize: '0.72rem', color: '#ef4444' }}>{new Date(sData.grading.gradedAt).toLocaleDateString()}</p>
//                                 </>
//                             ) : (
//                                 <p style={{ margin: 0, fontSize: '0.82rem', color: '#ef4444', fontStyle: 'italic' }}>Pending Signature</p>
//                             )}
//                         </div>

//                         <div style={{ background: 'white', padding: '0.85rem', border: '1px solid #86efac', textAlign: 'center' }}>
//                             <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Moderator Signed</p>
//                             {sData.moderation?.moderatedAt ? (
//                                 <>
//                                     {sData.moderation?.moderatorSignatureUrl || mProfile?.signatureUrl ? (
//                                         <img src={sData.moderation?.moderatorSignatureUrl || mProfile?.signatureUrl} alt="Moderator Signature" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', margin: '0 auto' }} />
//                                     ) : (
//                                         <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', fontStyle: 'italic', fontSize: '0.78rem' }}>No Canvas Signature</div>
//                                     )}
//                                     <p style={{ margin: '6px 0 2px', fontWeight: 'bold', fontSize: '0.85rem', color: '#15803d' }}>{sData.moderation?.moderatorName}</p>
//                                     <p style={{ margin: 0, fontSize: '0.72rem', color: '#22c55e' }}>{new Date(sData.moderation.moderatedAt).toLocaleDateString()}</p>
//                                 </>
//                             ) : (
//                                 <p style={{ margin: 0, fontSize: '0.82rem', color: '#22c55e', fontStyle: 'italic' }}>Pending Signature</p>
//                             )}
//                         </div>
//                     </div>
//                 </div>

//                 {/* Footer */}
//                 <div className="lfm-footer">
//                     <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose}>
//                         <X size={13} /> Close Archive
//                     </button>
//                 </div>
//             </div>
//         </div>
//     );
//     return createPortal(modalContent, document.body);
// };

// // ─── EXPORTED PARENT COMPONENT ───
// export const PastAttemptsArchive: React.FC<PastAttemptsArchiveProps> = ({ historySnapshots, assessment, mainSubmissionId }) => {
//     const [viewingSnapshot, setViewingSnapshot] = useState<any | null>(null);

//     if (!historySnapshots || historySnapshots.length === 0) return null;

//     return (
//         <>
//             {viewingSnapshot && (
//                 <ArchivedSnapshotViewer
//                     snapshot={viewingSnapshot}
//                     assessment={assessment}
//                     mainSubmissionId={mainSubmissionId}
//                     onClose={() => setViewingSnapshot(null)}
//                 />
//             )}
//             <div className="sr-summary-card" style={{ marginTop: '1.5rem', borderTop: '4px solid #64748b' }}>
//                 <h3 className="sr-summary-title" style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                     <History size={16} /> Past Attempts Archive
//                 </h3>
//                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                     {historySnapshots.map((snap, index) => (
//                         <div key={snap.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                             <div>
//                                 <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', display: 'block' }}>Attempt #{snap.attemptNumber || historySnapshots.length - index}</span>
//                                 <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{new Date(snap.archivedAt).toLocaleDateString()}</span>
//                             </div>
//                             <button onClick={() => setViewingSnapshot(snap)} className="lfm-btn lfm-btn--ghost" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
//                                 <Eye size={12} /> View
//                             </button>
//                         </div>
//                     ))}
//                 </div>
//             </div>
//         </>
//     );
// };