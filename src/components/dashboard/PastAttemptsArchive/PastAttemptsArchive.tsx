// src/components/dashboard/PastAttemptsArchive/PastAttemptsArchive.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { History, Eye, X, Check, MessageSquare, Clock, ShieldCheck, Info, Award } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

interface PastAttemptsArchiveProps {
    historySnapshots: any[];
    assessment: any;
}

const ArchivedSnapshotViewer: React.FC<{ snapshot: any; assessment: any; onClose: () => void }> = ({ snapshot, assessment, onClose }) => {

    const [lProfile, setLProfile] = useState<any>(null);
    const [aProfile, setAProfile] = useState<any>(null);
    const [mProfile, setMProfile] = useState<any>(null);
    const [fProfile, setFProfile] = useState<any>(null);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);

        // Fetch the historical signees for this exact snapshot as a fallback
        // if the snapshot doesn't contain the signature URL (for old records).
        const fetchProfiles = async () => {
            try {
                // 1. Properly resolve Learner Auth UID
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

                // Fetch Facilitator for Coaching Signature
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

    // DYNAMIC COMPLIANCE LOGIC
    const preIntervention = sData.latestCoachingLog; // Exists on Attempt 2/3 (Proves they were coached BEFORE starting)
    const postIntervention = sData.coachingLog; // Exists when Facilitator logs coaching AFTER failing, to unlock the NEXT attempt

    const modalContent = (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 99999, backdropFilter: 'blur(5px)', padding: '2rem' }}>
            <div className="animate-fade-in" style={{ background: 'white', maxWidth: '900px', width: '100%', height: '100%', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>

                {/* Header */}
                <div style={{ background: '#1e293b', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <History size={20} color="#94a3b8" />
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'var(--font-heading)' }}>Audit Archive: Attempt #{sData.attemptNumber || 1}</h2>
                        </div>
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Archived on {new Date(sData.archivedAt).toLocaleString()}</span>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <X size={16} /> Close Archive
                    </button>
                </div>

                {/* Scrollable Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', background: '#f8fafc' }}>

                    {/* Outcome Banner */}
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: sData.competency === 'NYC' ? '4px solid #ef4444' : '4px solid #22c55e' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', color: '#334155' }}>Final Outcome: {sData.competency === 'NYC' ? 'Not Yet Competent' : (sData.competency || 'Pending')}</h3>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Score: {sData.marks} / {assessment.totalMarks}</p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {postIntervention && (
                                <div style={{ background: '#fffbeb', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fcd34d', maxWidth: '350px' }}>
                                    <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b45309', fontSize: '0.75rem', marginBottom: '4px' }}><MessageSquare size={13} /> Coaching Logged for Attempt {(sData.attemptNumber || 1) + 1}</strong>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#92400e', fontStyle: 'italic', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>"{postIntervention.notes}" — {postIntervention.facilitatorName}</p>
                                </div>
                            )}
                            {preIntervention && sData.attemptNumber > 1 && (
                                <div style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: '6px', border: '1px solid #bbf7d0', maxWidth: '350px' }}>
                                    <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', fontSize: '0.75rem', marginBottom: '4px' }}><Check size={13} /> Coaching Acknowledged for Attempt {sData.attemptNumber}</strong>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#15803d', fontStyle: 'italic', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>"{preIntervention.notes}" — {preIntervention.facilitatorName}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Render Read-Only Blocks */}
                    {assessment.blocks?.filter((b: any) => b.type === 'mcq' || b.type === 'text').map((block: any, idx: number) => {
                        const fData = fBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
                        const aData = aBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
                        const mData = mBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
                        const learnerAns = sData.answers?.[block.id];

                        return (
                            <div key={block.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <strong style={{ color: '#0f172a' }}>Q{idx + 1}. {block.question}</strong>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {fData.isCorrect !== null && fData.isCorrect !== undefined && (
                                            <span title="Facilitator" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 4px', borderRadius: '4px' }}>
                                                {fData.isCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}
                                            </span>
                                        )}
                                        {aData.isCorrect !== null && aData.isCorrect !== undefined && (
                                            <span title="Assessor" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 4px', borderRadius: '4px' }}>
                                                {aData.isCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}
                                            </span>
                                        )}
                                        {mData.isCorrect !== null && mData.isCorrect !== undefined && (
                                            <span title="Moderator" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 4px', borderRadius: '4px' }}>
                                                {mData.isCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #f1f5f9', marginBottom: '1rem', overflowX: 'auto' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Learner Response</div>
                                    {block.type === 'mcq' ? (
                                        <div style={{ color: '#334155', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                            {learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}
                                        </div>
                                    ) : (
                                        <div className="quill-read-only-content" style={{ color: '#334155', wordBreak: 'break-word', overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: learnerAns || '<em>No answer provided.</em>' }} />
                                    )}
                                </div>

                                {fData.feedback && (
                                    <div style={{ borderLeft: '3px solid #3b82f6', background: '#eff6ff', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
                                        <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Facilitator Note [{fData.score}/{block.marks}]</div>
                                        <div style={{ color: '#0369a1', fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{fData.feedback}</div>
                                    </div>
                                )}
                                {aData.feedback && (
                                    <div style={{ borderLeft: '3px solid #ef4444', background: '#fef2f2', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
                                        <div style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Assessor Note [{aData.score}/{block.marks}]</div>
                                        <div style={{ color: '#991b1b', fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{aData.feedback}</div>
                                    </div>
                                )}
                                {mData.feedback && (
                                    <div style={{ borderLeft: '3px solid #22c55e', background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px' }}>
                                        <div style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Moderator Note [{mData.score}/{block.marks}]</div>
                                        <div style={{ color: '#16a34a', fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{mData.feedback}</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* OVERALL REMARKS & FEEDBACK */}
                    {(sData.grading?.facilitatorOverallFeedback || sData.grading?.assessorOverallFeedback || sData.grading?.overallFeedback || sData.moderation?.feedback) && (
                        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '2rem' }}>
                            <h3 style={{ margin: '0 0 1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                                Overall Remarks & Feedback
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                                {sData.grading?.facilitatorOverallFeedback && (
                                    <div style={{ background: '#eff6ff', borderLeft: '4px solid #3b82f6', padding: '1rem', borderRadius: '6px' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0284c7', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '6px' }}>
                                            <Info size={14} /> Facilitator Overall Summary
                                        </strong>
                                        <p style={{ margin: 0, color: '#0369a1', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                            {sData.grading.facilitatorOverallFeedback}
                                        </p>
                                    </div>
                                )}

                                {(sData.grading?.assessorOverallFeedback || sData.grading?.overallFeedback) && (
                                    <div style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '1rem', borderRadius: '6px' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b91c1c', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '6px' }}>
                                            <Award size={14} /> Assessor Final Remarks
                                        </strong>
                                        <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                            {sData.grading.assessorOverallFeedback || sData.grading.overallFeedback}
                                        </p>
                                    </div>
                                )}

                                {sData.moderation?.feedback && (
                                    <div style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '1rem', borderRadius: '6px' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803d', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '6px' }}>
                                            <ShieldCheck size={14} /> Moderator QA Notes
                                        </strong>
                                        <p style={{ margin: 0, color: '#16a34a', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                            {sData.moderation.feedback}
                                        </p>
                                    </div>
                                )}

                            </div>
                        </div>
                    )}

                    {/* RECORD OF INTERVENTION (Prior to THIS Attempt) */}
                    {preIntervention && sData.attemptNumber > 1 && (
                        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #bbf7d0', borderTop: '4px solid #22c55e', marginBottom: '2rem' }}>
                            <h3 style={{ margin: '0 0 1rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShieldCheck size={18} /> Pre-Assessment Intervention Record (Attempt #{sData.attemptNumber})
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: '#166534', marginBottom: '1.5rem' }}>
                                This section proves that a developmental intervention was conducted by the facilitator and formally acknowledged by the learner prior to starting this attempt.
                            </p>

                            <table style={{ width: '100%', marginBottom: '20px', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                <tbody>
                                    <tr><td style={{ width: '30%', padding: '6px 0', borderBottom: '1px solid #bbf7d0', fontWeight: 'bold', color: '#14532d' }}>Date of Coaching</td><td style={{ padding: '6px 0', borderBottom: '1px solid #bbf7d0', color: '#166534' }}>{new Date(preIntervention.date).toLocaleDateString()}</td></tr>
                                    <tr><td style={{ padding: '6px 0', borderBottom: '1px solid #bbf7d0', fontWeight: 'bold', color: '#14532d' }}>Facilitator</td><td style={{ padding: '6px 0', borderBottom: '1px solid #bbf7d0', color: '#166534' }}>{preIntervention.facilitatorName}</td></tr>
                                    <tr><td style={{ padding: '6px 0', fontWeight: 'bold', color: '#14532d', verticalAlign: 'top' }}>Coaching Notes</td><td style={{ padding: '6px 0', color: '#166534', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{preIntervention.notes}</td></tr>
                                </tbody>
                            </table>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'center' }}>
                                    <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 'bold', color: '#0284c7', textTransform: 'uppercase' }}>Facilitator Declaration</p>
                                    {preIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl ? (
                                        <img src={preIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl} alt="Facilitator Signature" style={{ height: '40px', objectFit: 'contain', margin: '0 auto' }} />
                                    ) : (
                                        <div style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
                                    )}
                                    <p style={{ margin: '8px 0 0', fontWeight: 'bold', color: '#0f172a' }}>{preIntervention.facilitatorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Logged: {new Date(preIntervention.date).toLocaleDateString()}</p>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'center' }}>
                                    <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Learner Acknowledgement</p>
                                    {preIntervention.acknowledged ? (
                                        <>
                                            {preIntervention.learnerSignatureUrl || lProfile?.signatureUrl ? (
                                                <img src={preIntervention.learnerSignatureUrl || lProfile?.signatureUrl} alt="Learner Signature" style={{ height: '40px', objectFit: 'contain', margin: '0 auto' }} />
                                            ) : (
                                                <div style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
                                            )}
                                            <p style={{ margin: '8px 0 0', fontWeight: 'bold', color: '#0f172a' }}>{lProfile?.fullName || 'Learner'}</p>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Acknowledged: {new Date(preIntervention.acknowledgedAt).toLocaleDateString()}</p>
                                        </>
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
                                            <Clock size={24} color="#94a3b8" style={{ marginBottom: '8px' }} />
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>Awaiting learner acknowledgement</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RECORD OF INTERVENTION (Unlocking NEXT Attempt) */}
                    {postIntervention && (
                        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #fcd34d', borderTop: '4px solid #f59e0b', marginBottom: '2rem' }}>
                            <h3 style={{ margin: '0 0 1rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MessageSquare size={18} /> Post-Assessment Remediation (Unlocking Attempt {(sData.attemptNumber || 1) + 1})
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: '#92400e', marginBottom: '1.5rem' }}>
                                This section captures the developmental intervention logged by the facilitator immediately after this attempt failed, in order to unlock the next attempt.
                            </p>

                            <table style={{ width: '100%', marginBottom: '20px', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                <tbody>
                                    <tr><td style={{ width: '30%', padding: '6px 0', borderBottom: '1px solid #fde68a', fontWeight: 'bold', color: '#78350f' }}>Date of Coaching</td><td style={{ padding: '6px 0', borderBottom: '1px solid #fde68a', color: '#92400e' }}>{new Date(postIntervention.date).toLocaleDateString()}</td></tr>
                                    <tr><td style={{ padding: '6px 0', borderBottom: '1px solid #fde68a', fontWeight: 'bold', color: '#78350f' }}>Facilitator</td><td style={{ padding: '6px 0', borderBottom: '1px solid #fde68a', color: '#92400e' }}>{postIntervention.facilitatorName}</td></tr>
                                    <tr><td style={{ padding: '6px 0', fontWeight: 'bold', color: '#78350f', verticalAlign: 'top' }}>Coaching Notes</td><td style={{ padding: '6px 0', color: '#92400e', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{postIntervention.notes}</td></tr>
                                </tbody>
                            </table>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'center' }}>
                                    <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 'bold', color: '#0284c7', textTransform: 'uppercase' }}>Facilitator Declaration</p>
                                    {postIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl ? (
                                        <img src={postIntervention.facilitatorSignatureUrl || fProfile?.signatureUrl} alt="Facilitator Signature" style={{ height: '40px', objectFit: 'contain', margin: '0 auto' }} />
                                    ) : (
                                        <div style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
                                    )}
                                    <p style={{ margin: '8px 0 0', fontWeight: 'bold', color: '#0f172a' }}>{postIntervention.facilitatorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Logged: {new Date(postIntervention.date).toLocaleDateString()}</p>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: 0.7 }}>
                                    <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Learner Acknowledgement</p>
                                    <Clock size={24} color="#94a3b8" style={{ margin: '10px 0' }} />
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>Awaiting Learner Acknowledgement on Attempt {(sData.attemptNumber || 1) + 1}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Historical Final Signatures USING SNAPSHOTS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>

                        <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Learner Declared</p>
                            {sData.learnerDeclaration?.signatureUrl || lProfile?.signatureUrl ? (
                                <img src={sData.learnerDeclaration?.signatureUrl || lProfile?.signatureUrl} alt="Learner Signature" style={{ height: '40px', objectFit: 'contain', margin: '0 auto' }} />
                            ) : (
                                <div style={{ height: '40px', display: 'flex', alignItems: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
                            )}
                            <p style={{ margin: '8px 0 4px', fontWeight: 'bold' }}>{sData.learnerDeclaration?.learnerName || lProfile?.fullName}</p>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>{new Date(sData.learnerDeclaration?.timestamp || sData.submittedAt).toLocaleDateString()}</p>
                        </div>

                        <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #fca5a5' }}>
                            <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 'bold', color: '#ef4444', textTransform: 'uppercase' }}>Assessor Signed</p>
                            {sData.grading?.gradedAt ? (
                                <>
                                    {sData.grading?.assessorSignatureUrl || aProfile?.signatureUrl ? (
                                        <img src={sData.grading?.assessorSignatureUrl || aProfile?.signatureUrl} alt="Assessor Signature" style={{ height: '40px', objectFit: 'contain', margin: '0 auto' }} />
                                    ) : (
                                        <div style={{ height: '40px', display: 'flex', alignItems: 'center', color: '#ef4444', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
                                    )}
                                    <p style={{ margin: '8px 0 4px', fontWeight: 'bold', color: '#b91c1c' }}>{sData.grading?.assessorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#ef4444' }}>{new Date(sData.grading.gradedAt).toLocaleDateString()}</p>
                                </>
                            ) : (
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#ef4444', fontStyle: 'italic' }}>Pending Signature</p>
                            )}
                        </div>

                        <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #86efac' }}>
                            <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 'bold', color: '#22c55e', textTransform: 'uppercase' }}>Moderator Signed</p>
                            {sData.moderation?.moderatedAt ? (
                                <>
                                    {sData.moderation?.moderatorSignatureUrl || mProfile?.signatureUrl ? (
                                        <img src={sData.moderation?.moderatorSignatureUrl || mProfile?.signatureUrl} alt="Moderator Signature" style={{ height: '40px', objectFit: 'contain', margin: '0 auto' }} />
                                    ) : (
                                        <div style={{ height: '40px', display: 'flex', alignItems: 'center', color: '#22c55e', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
                                    )}
                                    <p style={{ margin: '8px 0 4px', fontWeight: 'bold', color: '#15803d' }}>{sData.moderation?.moderatorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#22c55e' }}>{new Date(sData.moderation.moderatedAt).toLocaleDateString()}</p>
                                </>
                            ) : (
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#22c55e', fontStyle: 'italic' }}>Pending Signature</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
    return createPortal(modalContent, document.body);
};

// ─── EXPORTED PARENT COMPONENT ───
export const PastAttemptsArchive: React.FC<PastAttemptsArchiveProps> = ({ historySnapshots, assessment }) => {
    const [viewingSnapshot, setViewingSnapshot] = useState<any | null>(null);

    if (!historySnapshots || historySnapshots.length === 0) return null;

    return (
        <>
            {viewingSnapshot && (
                <ArchivedSnapshotViewer
                    snapshot={viewingSnapshot}
                    assessment={assessment}
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
                            <button onClick={() => setViewingSnapshot(snap)} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#334155', fontWeight: 'bold' }}>
                                <Eye size={12} /> View
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};