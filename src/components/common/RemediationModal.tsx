import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, MessageSquare } from 'lucide-react';

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

    const modalContent = (
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
        </div>
    );
    return createPortal(modalContent, document.body);
};