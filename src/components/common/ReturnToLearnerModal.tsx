import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Undo2, MessageSquare } from 'lucide-react';

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

    const modalContent = (
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
        </div>
    );
    return createPortal(modalContent, document.body);
};