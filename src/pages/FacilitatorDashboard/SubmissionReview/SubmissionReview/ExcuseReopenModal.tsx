import React, { useState } from 'react';
import { ShieldCheck, AlertCircle, Unlock } from 'lucide-react';

interface ExcuseReopenModalProps {
    learnerName: string;
    onClose: () => void;
    onSubmit: (reason: string) => void;
}

export const ExcuseReopenModal: React.FC<ExcuseReopenModalProps> = ({ learnerName, onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = () => {
        if (!reason.trim()) {
            setError('Please provide a justification for overriding this security incident.');
            return;
        }
        onSubmit(reason.trim());
    };

    return (
        <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="lfm-modal" style={{ maxWidth: '520px', width: '100%', background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.37)' }}>
                <div style={{ background: '#0f172a', padding: '1rem 1.25rem', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#10b981', padding: '6px', borderRadius: '6px' }}>
                            <Unlock size={18} color="white" />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: 'white' }}>Excuse & Reopen Assessment</h3>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ padding: '1.25rem' }}>
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#334155', lineHeight: 1.5 }}>
                        You are clearing the security block for <strong>{learnerName}</strong>. The original violation logs and evidence snapshots will remain permanently archived for QCTO/SETA audits.
                    </p>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', marginBottom: '6px' }}>
                            Justification / Excuse Rationale <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <textarea
                            rows={3}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
                            placeholder="e.g., Learner experienced a verified power outage; technical issue confirmed by invigilator..."
                            value={reason}
                            onChange={(e) => { setReason(e.target.value); setError(''); }}
                        />
                        {error && <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>{error}</span>}
                    </div>
                </div>

                <div style={{ padding: '12px 1.25rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button onClick={onClose} className="mlab-btn mlab-btn--ghost" style={{ fontSize: '0.8rem' }}>Cancel</button>
                    <button onClick={handleSubmit} className="mlab-btn" style={{ background: '#10b981', color: 'white', border: 'none', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        Excuse & Reopen
                    </button>
                </div>
            </div>
        </div>
    );
};