// src/pages/FacilitatorDashboard/SubmissionReview/SubmissionReviewModals.tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, MessageSquare, Undo2, Scale } from 'lucide-react';

// ─── REMEDIATION MODAL ───────────────────────────────────────────────────────
export const RemediationModal: React.FC<{
    submissionTitle: string;
    attemptNumber: number;
    onClose: () => void;
    onSubmit: (date: string, notes: string) => void;
}> = ({ submissionTitle, attemptNumber, onClose, onSubmit }) => {
    const [date, setDate] = useState('');
    const [notes, setNotes] = useState('');
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !notes.trim() || !confirmed) return;
        onSubmit(date, notes);
    };

    const isFinalAttempt = attemptNumber === 2;

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
            <div className="animate-fade-in" style={{ background: 'white', maxWidth: '500px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: isFinalAttempt ? '6px solid #ef4444' : '6px solid #f59e0b' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: isFinalAttempt ? '#fef2f2' : '#fffbeb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: isFinalAttempt ? '#ef4444' : '#f59e0b', padding: '10px', borderRadius: '50%', color: 'white' }}>
                            <RotateCcw size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: isFinalAttempt ? '#b91c1c' : '#b45309', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Initiate Remediation {isFinalAttempt && "(FINAL ATTEMPT)"}
                            </h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: isFinalAttempt ? '#991b1b' : '#92400e' }}>{submissionTitle}</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                        {isFinalAttempt
                            ? "WARNING: This will unlock the learner's 3rd and final attempt. A rigorous intervention is required."
                            : "QCTO regulations require evidence of a developmental intervention before a learner can attempt an assessment again. Please log the coaching session details below."}
                    </p>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>Date of Coaching / Feedback Session *</label>
                        <input type="date" required value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none' }} />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                            <MessageSquare size={14} color="#64748b" /> Coaching Notes / Areas Addressed *
                        </label>
                        <textarea required rows={3} placeholder={isFinalAttempt ? "Describe the rigorous intervention applied..." : "Briefly describe what was discussed..."} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', marginBottom: '1.5rem' }}>
                        <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: isFinalAttempt ? '#ef4444' : '#f59e0b' }} />
                        <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                            <strong>I legally declare</strong> that an academic intervention has taken place and this learner is ready for their next attempt.
                        </span>
                    </label>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        <button type="submit" disabled={!date || !notes.trim() || !confirmed} style={{ flex: 2, padding: '0.75rem', background: isFinalAttempt ? '#ef4444' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: (!date || !notes.trim() || !confirmed) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (!date || !notes.trim() || !confirmed) ? 0.5 : 1 }}>
                            Log Coaching & Unlock
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

// ─── RETURN TO LEARNER MODAL ─────────────────────────────────────────────────
export const ReturnToLearnerModal: React.FC<{
    onClose: () => void;
    onSubmit: (reason: string) => void;
}> = ({ onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason.trim() || !confirmed) return;
        onSubmit(reason);
    };

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
            <div className="animate-fade-in" style={{ background: 'white', maxWidth: '480px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: '6px solid #f59e0b' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: '#fffbeb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#f59e0b', padding: '10px', borderRadius: '50%', color: 'white' }}>
                            <Undo2 size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#b45309', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Return Logbook to Learner
                            </h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#92400e' }}>
                                The learner will be able to correct and resubmit their logbook.
                            </p>
                        </div>
                    </div>
                </div>
                <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px', padding: '12px', marginBottom: '1.5rem', fontSize: '0.82rem', color: '#92400e', lineHeight: 1.5 }}>
                        <strong>When to use this:</strong> The learner's hours are incorrect, evidence is missing or blurry, or the logbook does not accurately reflect the work performed. The logbook will return to <em>In Progress</em> so the learner can correct and resubmit.
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                            <MessageSquare size={14} color="#64748b" /> Reason for Return (visible to learner) *
                        </label>
                        <textarea
                            required
                            rows={4}
                            placeholder="e.g. The hours logged on 12 March do not match our records. Please correct your entry and resubmit."
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }}
                        />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', marginBottom: '1.5rem' }}>
                        <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: '#f59e0b' }} />
                        <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                            I confirm that I am returning this logbook because it does not meet the required standard for verification.
                        </span>
                    </label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        <button type="submit" disabled={!reason.trim() || !confirmed} style={{ flex: 2, padding: '0.75rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: (!reason.trim() || !confirmed) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (!reason.trim() || !confirmed) ? 0.5 : 1 }}>
                            <Undo2 size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                            Return to Learner
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

// ─── RESOLVE APPEAL MODAL ───────────────────────────────────────────────────
export const ResolveAppealModal: React.FC<{
    appealReason: string;
    onClose: () => void;
    onSubmit: (decision: 'overturn' | 'new_attempt' | 'reject', notes: string) => void;
}> = ({ appealReason, onClose, onSubmit }) => {
    const [notes, setNotes] = useState('');
    const [decision, setDecision] = useState<'overturn' | 'new_attempt' | 'reject' | null>(null);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
            <div className="animate-fade-in" style={{ background: 'white', maxWidth: '600px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: '6px solid #8b5cf6' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f5f3ff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#8b5cf6', padding: '10px', borderRadius: '50%', color: 'white' }}><Scale size={24} /></div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#6d28d9', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Academic Appeal Resolution</h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#5b21b6' }}>National Training Manager / Board Review</p>
                        </div>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    <div style={{ background: '#f8fafc', padding: '1rem', border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '1.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Learner's Reason for Appeal:</span>
                        <p style={{ fontSize: '0.9rem', color: '#0f172a', margin: '8px 0 0 0', fontStyle: 'italic' }}>"{appealReason}"</p>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>Select Resolution Action *</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', border: decision === 'overturn' ? '2px solid #22c55e' : '1px solid #cbd5e1', background: decision === 'overturn' ? '#f0fdf4' : 'white', borderRadius: '6px', cursor: 'pointer' }}>
                                <input type="radio" name="decision" checked={decision === 'overturn'} onChange={() => setDecision('overturn')} style={{ marginTop: '2px', accentColor: '#22c55e' }} />
                                <div><strong style={{ display: 'block', color: '#166534', fontSize: '0.9rem' }}>Overturn Decision (Change to Competent)</strong><span style={{ fontSize: '0.75rem', color: '#475569' }}>The learner's appeal is valid. The NYC grade is overturned to Competent.</span></div>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', border: decision === 'new_attempt' ? '2px solid #f59e0b' : '1px solid #cbd5e1', background: decision === 'new_attempt' ? '#fffbeb' : 'white', borderRadius: '6px', cursor: 'pointer' }}>
                                <input type="radio" name="decision" checked={decision === 'new_attempt'} onChange={() => setDecision('new_attempt')} style={{ marginTop: '2px', accentColor: '#f59e0b' }} />
                                <div><strong style={{ display: 'block', color: '#b45309', fontSize: '0.9rem' }}>Grant Additional Attempt</strong><span style={{ fontSize: '0.75rem', color: '#475569' }}>The NYC grade stands, but the learner is granted a fresh attempt (even if max attempts were reached).</span></div>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', border: decision === 'reject' ? '2px solid #ef4444' : '1px solid #cbd5e1', background: decision === 'reject' ? '#fef2f2' : 'white', borderRadius: '6px', cursor: 'pointer' }}>
                                <input type="radio" name="decision" checked={decision === 'reject'} onChange={() => setDecision('reject')} style={{ marginTop: '2px', accentColor: '#ef4444' }} />
                                <div><strong style={{ display: 'block', color: '#b91c1c', fontSize: '0.9rem' }}>Uphold Original Grade (Reject Appeal)</strong><span style={{ fontSize: '0.75rem', color: '#475569' }}>The appeal is dismissed. The NYC grade remains locked.</span></div>
                            </label>
                        </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>Official Resolution Notes *</label>
                        <textarea required rows={3} placeholder="Provide justification for the Academic Board's decision..." value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        <button type="button" onClick={() => onSubmit(decision!, notes)} disabled={!decision || !notes.trim()} style={{ flex: 2, padding: '0.75rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', cursor: (!decision || !notes.trim()) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (!decision || !notes.trim()) ? 0.5 : 1 }}>
                            Finalise Resolution
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};