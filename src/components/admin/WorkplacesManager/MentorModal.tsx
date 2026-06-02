import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { Briefcase, X, Loader2, Save } from 'lucide-react';
import { useToast } from '../../../components/common/Toast/Toast';
import type { StaffMember } from '../../../store/useStore';

interface MentorModalProps {
    editing: StaffMember | null;
    employerId: string;
    onClose: () => void;
    onSaved: () => void;
    addStaff: (m: StaffMember) => Promise<void>;
}

export const MentorModal: React.FC<MentorModalProps> = ({ editing, employerId, onClose, onSaved, addStaff }) => {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        fullName: editing?.fullName || '',
        email: editing?.email || '',
        phone: editing?.phone || '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                await updateDoc(doc(db, 'users', editing.id), {
                    fullName: form.fullName,
                    phone: form.phone,
                    updatedAt: new Date().toISOString()
                });
                toast.success('Mentor updated successfully!');
            } else {
                await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
                toast.success('Mentor created — invite sent!');
            }
            onSaved();
            onClose();
        } catch (err) {
            console.error('Mentor save error:', err);
            toast.error('Failed to save mentor details.');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
                <div className="wm-modal__header wm-modal__header--green">
                    <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
                    <div>
                        <h2 className="wm-modal__title">{editing ? 'Edit Mentor' : 'Add Workplace Mentor'}</h2>
                        <p className="wm-modal__subtitle">Workplace supervision contact</p>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="wm-modal__form">
                    <div className="wm-modal__body">
                        <div className="wm-form-grid">
                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Mentor Full Name <span className="wm-form-required">*</span></label>
                                <input className="wm-form-input" required type="text" placeholder="e.g. John Smith"
                                    value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
                            </div>
                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
                                <input className="wm-form-input" required type="email" placeholder="john@company.com"
                                    value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                                    disabled={!!editing} />
                                {editing && <span className="wm-form-hint">Email cannot be changed after creation.</span>}
                            </div>
                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Phone Number</label>
                                <input className="wm-form-input" type="tel" placeholder="082 123 4567"
                                    value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                            </div>
                        </div>
                    </div>
                    <div className="wm-modal__footer">
                        <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
                        <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
                            {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Mentor</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default MentorModal;