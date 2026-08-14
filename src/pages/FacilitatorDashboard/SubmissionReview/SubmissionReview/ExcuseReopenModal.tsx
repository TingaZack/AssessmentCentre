// src/pages/FacilitatorDashboard/SubmissionReview/SubmissionReview/ExcuseReopenModal.tsx

import React, { useState } from 'react';
import { Unlock, X, AlertCircle } from 'lucide-react';

// 🚀 Predefined list of acceptable QCTO/Audit excuses
const PRESET_EXCUSE_REASONS = [
    "Verified Power Outage / Loadshedding",
    "Network / Internet Disconnection",
    "Browser / IDE Technical Crash",
    "Hardware / Device Failure",
    "Invigilator / Facilitator Discretion",
    "Medical / Personal Emergency",
    "Other (Details specified below)"
];

interface ExcuseReopenModalProps {
    learnerName: string;
    onClose: () => void;
    onSubmit: (reason: string) => void;
}

export const ExcuseReopenModal: React.FC<ExcuseReopenModalProps> = ({ learnerName, onClose, onSubmit }) => {
    const [selectedPreset, setSelectedPreset] = useState<string>(PRESET_EXCUSE_REASONS[0]);
    const [details, setDetails] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const combinedReason = details.trim()
            ? `${selectedPreset} — ${details.trim()}`
            : selectedPreset;

        // Force details if "Other" is selected
        if (selectedPreset.startsWith("Other") && !details.trim()) {
            setError('Please provide specific details in the text box when selecting "Other".');
            return;
        }

        onSubmit(combinedReason);
    };

    return (
        <div className="lfm-overlay" onClick={onClose}>
            <div className="lfm-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>

                {/* ── HEADER ── */}
                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <Unlock size={16} /> Excuse & Reopen Assessment
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    {/* ── BODY ── */}
                    <div className="lfm-body">

                        {error && (
                            <div className="lfm-error-banner">
                                <AlertCircle size={16} />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="lfm-flags-panel" style={{ marginTop: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-blue)', lineHeight: 1.5 }}>
                                You are clearing the security block for <strong>{learnerName}</strong>. The original violation logs and evidence snapshots will remain permanently archived for QCTO/SETA audits.
                            </p>
                        </div>

                        {/* Standard Reason Dropdown */}
                        <div className="lfm-fg">
                            <label>Standard Audit Category *</label>
                            <select
                                className="lfm-input lfm-select"
                                value={selectedPreset}
                                onChange={(e) => {
                                    setSelectedPreset(e.target.value);
                                    if (error) setError('');
                                }}
                                required
                            >
                                {PRESET_EXCUSE_REASONS.map((reason, idx) => (
                                    <option key={idx} value={reason}>
                                        {reason}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Additional Supporting Evidence Text Area */}
                        <div className="lfm-fg">
                            <label>
                                Additional Notes / Supporting Evidence
                                {selectedPreset.startsWith('Other') && <span style={{ color: '#ef4444' }}> *</span>}
                            </label>
                            <textarea
                                className="lfm-input"
                                rows={3}
                                placeholder="e.g., Ticket number, invigilator notes, specific error message..."
                                value={details}
                                onChange={(e) => {
                                    setDetails(e.target.value);
                                    if (error) setError('');
                                }}
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                    </div>

                    {/* ── FOOTER ── */}
                    <div className="lfm-footer">
                        <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="lfm-btn lfm-btn--primary">
                            <Unlock size={13} /> Excuse & Reopen
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};