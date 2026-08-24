// src/components/common/FacilitatorLogLeaveModal/FacilitatorLogLeaveModal.tsx

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { FileText, Calendar, UploadCloud, User, X, Loader2, Plus, CheckCircle2 } from 'lucide-react';
import { db, storage } from '../../../lib/firebase';
import { useToast } from '../Toast/Toast';

export interface FacilitatorLogLeaveModalProps {
    isOpen: boolean;
    onClose: () => void;
    learners: any[];
    cohortId: string;
    facilitatorUser: any;
    onSuccess?: () => void;
}

export const FacilitatorLogLeaveModal: React.FC<FacilitatorLogLeaveModalProps> = ({
    isOpen,
    onClose,
    learners,
    cohortId,
    facilitatorUser,
    onSuccess
}) => {
    const toast = useToast();
    const [selectedLearnerId, setSelectedLearnerId] = useState<string>('');
    const [leaveType, setLeaveType] = useState<string>('Sick Leave');
    const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState<string>('');
    const [autoApprove, setAutoApprove] = useState<boolean>(true);

    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            if (selectedFile.size > 10 * 1024 * 1024) {
                toast.error("File size must be under 10MB");
                return;
            }
            setFile(selectedFile);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedLearnerId) {
            toast.error("Please select a learner.");
            return;
        }
        if (!startDate || !endDate) {
            toast.error("Please select both start and end dates.");
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            toast.error("Start date cannot be after end date.");
            return;
        }

        const selectedLearner = learners.find(l => l.id === selectedLearnerId || l.idNumber === selectedLearnerId);
        if (!selectedLearner) {
            toast.error("Learner profile not found.");
            return;
        }

        setIsSubmitting(true);

        try {
            let attachmentUrl = '';
            let attachmentName = '';

            // 1. Upload proof attachment to Storage if provided
            if (file) {
                const storagePath = `leave_attachments/${cohortId}_${selectedLearner.idNumber || selectedLearner.id}_${Date.now()}_${file.name}`;
                const storageRef = ref(storage, storagePath);
                const uploadSnap = await uploadBytes(storageRef, file);
                attachmentUrl = await getDownloadURL(uploadSnap.ref);
                attachmentName = file.name;
            }

            // 2. Write record to Firestore
            const initialStatus = autoApprove ? 'Approved' : 'Pending';

            await addDoc(collection(db, 'leave_requests'), {
                cohortId: cohortId || selectedLearner.cohortId || '',
                learnerId: selectedLearner.id,
                learnerName: selectedLearner.fullName,
                idNumber: selectedLearner.idNumber || '',
                type: leaveType,
                startDate: startDate,
                endDate: endDate,
                dateAffected: startDate,
                reason: reason || 'Logged by facilitator with proof',
                attachmentUrl,
                attachmentName,
                status: initialStatus,
                loggedByFacilitator: true,
                createdBy: facilitatorUser?.uid || 'Facilitator',
                createdByName: facilitatorUser?.fullName || 'Facilitator',
                reviewedBy: autoApprove ? (facilitatorUser?.uid || 'Facilitator') : null,
                reviewedByName: autoApprove ? (facilitatorUser?.fullName || 'Facilitator') : null,
                reviewedAt: autoApprove ? new Date().toISOString() : null,
                createdAt: new Date().toISOString()
            });

            toast.success(`Leave request logged successfully (${initialStatus})`);

            // Reset form
            setSelectedLearnerId('');
            setReason('');
            setFile(null);

            if (onSuccess) onSuccess();
            onClose();

        } catch (error: any) {
            console.error("Failed to log leave:", error);
            toast.error(error.message || "Failed to log leave request.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 999999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                        <Plus size={20} />
                    </div>
                    <div>
                        <h2 className="wm-modal__title">Log Leave for Learner</h2>
                        <p className="wm-modal__subtitle">Submit an authorized leave request with proof on behalf of a candidate.</p>
                    </div>
                    <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: 16 }}>

                        {/* Learner Selector */}
                        <div className="wm-form-group">
                            <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <User size={14} /> Select Learner <span style={{ color: 'red' }}>*</span>
                            </label>
                            <select
                                className="wm-form-input"
                                value={selectedLearnerId}
                                onChange={e => setSelectedLearnerId(e.target.value)}
                                required
                            >
                                <option value="">-- Choose Learner --</option>
                                {learners.map(l => (
                                    <option key={l.id || l.idNumber} value={l.id || l.idNumber}>
                                        {l.fullName} ({l.idNumber || 'No ID'})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Leave Reason Category */}
                        <div className="wm-form-group">
                            <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileText size={14} /> Leave Type
                            </label>
                            <select
                                className="wm-form-input"
                                value={leaveType}
                                onChange={e => setLeaveType(e.target.value)}
                            >
                                <option value="Sick Leave">Sick Leave (Medical Note Required)</option>
                                <option value="Personal Emergency">Personal Emergency / Family</option>
                                <option value="Interview">Job / Work Placement Interview</option>
                                <option value="Bereavement">Bereavement</option>
                                <option value="Other">Other Authorized Absence</option>
                            </select>
                        </div>

                        {/* Start & End Dates */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="wm-form-group">
                                <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Calendar size={14} /> Start Date <span style={{ color: 'red' }}>*</span>
                                </label>
                                <input
                                    type="date"
                                    className="wm-form-input"
                                    value={startDate}
                                    onChange={e => {
                                        setStartDate(e.target.value);
                                        if (endDate < e.target.value) setEndDate(e.target.value);
                                    }}
                                    required
                                />
                            </div>

                            <div className="wm-form-group">
                                <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Calendar size={14} /> End Date <span style={{ color: 'red' }}>*</span>
                                </label>
                                <input
                                    type="date"
                                    className="wm-form-input"
                                    value={endDate}
                                    min={startDate}
                                    onChange={e => setEndDate(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        {/* Notes / Reason */}
                        <div className="wm-form-group">
                            <label className="wm-form-label">Reason & Notes</label>
                            <textarea
                                className="wm-form-input"
                                style={{ minHeight: '70px', resize: 'vertical' }}
                                placeholder="E.g., Medical certificate received via WhatsApp from HPCSA registered clinic..."
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                            />
                        </div>

                        {/* Attachment Upload */}
                        <div className="wm-form-group">
                            <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <UploadCloud size={14} /> Upload Proof Document (Sick Note / Court Order / Death Cert)
                            </label>
                            <input
                                type="file"
                                className="wm-form-input"
                                accept="image/*,.pdf,.doc,.docx"
                                onChange={handleFileChange}
                            />
                            {file && (
                                <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                                    Attached: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                </span>
                            )}
                        </div>

                        {/* Immediate Auto-Approval Toggle */}
                        <div style={{ background: '#f8fafc', padding: '10px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <strong style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', display: 'block' }}>Auto-Approve Request</strong>
                                <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>Mark leave as Approved immediately upon logging.</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={autoApprove}
                                onChange={e => setAutoApprove(e.target.checked)}
                                style={{ width: '18px', height: '18px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
                            />
                        </div>

                    </div>

                    <div className="wm-modal__footer">
                        <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isSubmitting}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="mlab-btn"
                            disabled={isSubmitting || !selectedLearnerId}
                            style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }}
                        >
                            {isSubmitting ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} Log Request
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};