import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, UploadCloud, UserMinus, FileText, AlertCircle, X } from 'lucide-react';
import { useToast } from '../../common/Toast/Toast';
import type { DashboardLearner } from '../../../types';

interface Props {
    learner: DashboardLearner;
    onClose: () => void;
    onConfirm: (data: {
        date: string;
        reason: string;
        notes: string;
        evidenceUrl: string;
        resignationUrl: string;
    }) => Promise<void>;
}

export const LearnerDropoutModal: React.FC<Props> = ({ learner, onClose, onConfirm }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState('Personal/Other');
    const [notes, setNotes] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [resignationFile, setResignationFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const toast = useToast();

    const handleSubmit = async () => {
        if (!date) {
            toast.error('Exit date is required.');
            return;
        }

        setIsSubmitting(true);

        try {
            let evidenceUrl = '';
            let resignationUrl = '';

            // Upload General Evidence
            if (file) {
                const storageRef = ref(getStorage(), `dropout_evidence/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
                await uploadBytes(storageRef, file);
                evidenceUrl = await getDownloadURL(storageRef);
            }

            // Upload Resignation Letter
            if (resignationFile) {
                const resRef = ref(getStorage(), `dropout_resignation/${Date.now()}_${resignationFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
                await uploadBytes(resRef, resignationFile);
                resignationUrl = await getDownloadURL(resRef);
            }

            await onConfirm({ date, reason, notes, evidenceUrl, resignationUrl });
        } catch (err: any) {
            const errorMessage = err?.message || err?.code || 'An unknown error occurred during upload.';
            if (errorMessage.includes('unauthorized') || errorMessage.includes('permission-denied')) {
                toast.error('Permission Denied: Please check Firebase Storage Rules.');
            } else {
                toast.error(`Failed to process: ${errorMessage}`);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-red)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
                        <UserMinus size={20} />
                    </div>
                    <div>
                        <h2 className="wm-modal__title">Process Learner Withdrawal</h2>
                        <p className="wm-modal__subtitle">Officially remove <strong>{learner.fullName}</strong> from this cohort.</p>
                    </div>
                    <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
                </div>

                <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px', borderRadius: '6px', color: '#991b1b', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>This action will update the learner's status to "Dropped", making them inactive in the roster while retaining their historical data for QCTO auditing.</span>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className="wm-form-group" style={{ flex: 1 }}>
                            <label className="wm-form-label">Exit Date *</label>
                            <input type="date" className="wm-form-input" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div className="wm-form-group" style={{ flex: 2 }}>
                            <label className="wm-form-label">Primary Reason *</label>
                            <select className="wm-form-input" value={reason} onChange={e => setReason(e.target.value)}>
                                <option value="Employment/New Job">Employment / New Job</option>
                                <option value="Medical/Health">Medical / Health Reasons</option>
                                <option value="Financial Constraints">Financial Constraints</option>
                                <option value="Academic Difficulty">Academic Difficulty</option>
                                <option value="Disciplinary Dismissal">Disciplinary Dismissal</option>
                                <option value="Relocation">Relocation</option>
                                <option value="Deceased">Deceased</option>
                                <option value="Personal/Other">Personal / Other</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className="wm-form-group" style={{ flex: 1 }}>
                            <label className="wm-form-label">Resignation Letter</label>
                            <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '6px', textAlign: 'center', background: '#f8fafc', transition: 'all 0.2s', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <input type="file" id="resignation-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setResignationFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                                <label htmlFor="resignation-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
                                    <FileText size={24} color={resignationFile ? "var(--mlab-green)" : "#94a3b8"} />
                                    <span style={{ fontSize: '0.75rem', color: resignationFile ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
                                        {resignationFile ? resignationFile.name : 'Upload Resignation Letter'}
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="wm-form-group" style={{ flex: 1 }}>
                            <label className="wm-form-label">Other Evidence (e.g. Medical)</label>
                            <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '6px', textAlign: 'center', background: '#f8fafc', transition: 'all 0.2s', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <input type="file" id="evidence-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                                <label htmlFor="evidence-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
                                    <UploadCloud size={24} color={file ? "var(--mlab-green)" : "#94a3b8"} />
                                    <span style={{ fontSize: '0.75rem', color: file ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
                                        {file ? file.name : 'Upload Other Evidence'}
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="wm-form-group">
                        <label className="wm-form-label">Additional Context / Notes</label>
                        <textarea className="wm-form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Provide further context regarding this withdrawal..." />
                    </div>
                </div>

                <div className="wm-modal__footer">
                    <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                    <button className="mlab-btn" style={{ background: 'var(--mlab-red)', color: 'white', border: 'none' }} onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 size={16} className="spin" /> : <UserMinus size={16} />} Confirm Withdrawal
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};