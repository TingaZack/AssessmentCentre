// src/components/admin/StaffFormModal.tsx

import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, ShieldCheck, Briefcase, UserPlus } from 'lucide-react';
import type { UserRole } from '../../types/auth.types';
import { useStore } from '../../store/useStore';

// Assuming LearnerFormModal.css handles the lfm- classes globally or is imported higher up.
// If it's not loading globally, uncomment the line below and adjust the path:
// import './LearnerFormModal/LearnerFormModal.css'; 

interface StaffFormProps {
    onClose: () => void;
    onSave: (staff: any) => Promise<void>;
}

export const StaffFormModal: React.FC<StaffFormProps> = ({ onClose, onSave }) => {
    const { employers, fetchEmployers } = useStore();

    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        role: 'facilitator' as UserRole | 'mentor',
        phone: '',
        assessorRegNumber: '',
        employerId: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (employers.length === 0) {
            fetchEmployers();
        }
    }, [employers.length, fetchEmployers]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (formData.role === 'mentor' && !formData.employerId) {
            setError('Workplace Mentors must be linked to a Host Company.');
            return;
        }

        setLoading(true);

        const payload = { ...formData };
        if (payload.role === 'mentor') {
            payload.assessorRegNumber = '';
        } else if (['assessor', 'moderator'].includes(payload.role)) {
            payload.employerId = '';
        } else {
            payload.assessorRegNumber = '';
            payload.employerId = '';
        }

        try {
            await onSave(payload);
        } catch (err: any) {
            setError(err.message || 'Failed to save staff member.');
            setLoading(false);
        }
    };

    return (
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 9999 }}>

            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>

                <div className="lfm-header" style={{ background: 'var(--mlab-blue)' }}>
                    <h2 className="lfm-header__title"><UserPlus size={16} /> Add Staff / Mentor</h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={loading}><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
                    <div className="lfm-body">
                        {error && (
                            <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', border: '1px solid #fecaca', marginBottom: '16px' }}>
                                {error}
                            </div>
                        )}

                        <div className="lfm-grid">
                            <div className="lfm-fg lfm-fg--full">
                                <label>Full Name *</label>
                                <input
                                    className="lfm-input"
                                    required
                                    placeholder="e.g. John Doe"
                                    value={formData.fullName}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                />
                            </div>

                            <div className="lfm-fg lfm-fg--full">
                                <label>Email Address *</label>
                                <input
                                    className="lfm-input"
                                    type="email" required
                                    placeholder="john@example.com"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>

                            <div className="lfm-fg lfm-fg--full">
                                <label>System Role *</label>
                                <select
                                    className="lfm-input"
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value as any })}
                                    style={{ fontWeight: '600', color: '#0f172a' }}
                                >
                                    <option value="facilitator">Facilitator (Trainer / Blue Pen)</option>
                                    <option value="assessor">Assessor (SETA / Red Pen)</option>
                                    <option value="moderator">Internal Moderator (SETA / Green Pen)</option>
                                    <option value="mentor">Workplace Mentor (External / Orange Pen)</option>
                                </select>
                            </div>

                            {/* SETA Registration for Assessors/Moderators */}
                            {['assessor', 'moderator'].includes(formData.role) && (
                                <div className="lfm-fg lfm-fg--full" style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca', marginTop: '4px' }}>
                                    <label style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem' }}>
                                        <ShieldCheck size={14} /> SETA Registration Number
                                    </label>
                                    <input
                                        className="lfm-input"
                                        placeholder="e.g. MICT-ASS-1234"
                                        value={formData.assessorRegNumber}
                                        onChange={e => setFormData({ ...formData, assessorRegNumber: e.target.value })}
                                        style={{ borderColor: '#fca5a5' }}
                                    />
                                </div>
                            )}

                            {/* Workplace Linking for Mentors */}
                            {formData.role === 'mentor' && (
                                <div className="lfm-fg lfm-fg--full" style={{ background: '#fffbeb', padding: '16px', borderRadius: '8px', border: '1px solid #fde68a', marginTop: '4px' }}>
                                    <label style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem' }}>
                                        <Briefcase size={14} /> Linked Host Company *
                                    </label>
                                    <select
                                        className="lfm-input"
                                        required
                                        value={formData.employerId}
                                        onChange={e => setFormData({ ...formData, employerId: e.target.value })}
                                        style={{ borderColor: '#fcd34d' }}
                                    >
                                        <option value="">-- Select Workplace --</option>
                                        {employers.filter(e => e.status !== 'archived').map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                                        ))}
                                    </select>
                                    <span style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '8px', display: 'block', lineHeight: 1.4 }}>
                                        Mentors will only see logbooks from learners assigned to this specific company.
                                    </span>
                                </div>
                            )}

                            <div className="lfm-fg lfm-fg--full" style={{ marginTop: '8px' }}>
                                <label>Phone Number (Optional)</label>
                                <input
                                    className="lfm-input"
                                    type="tel"
                                    placeholder="082 123 4567"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="lfm-footer">
                        <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={loading}>Cancel</button>
                        <button type="submit" className="lfm-btn lfm-btn--primary" disabled={loading} style={{ background: 'var(--mlab-blue)', borderColor: 'var(--mlab-blue)' }}>
                            {loading ? <><Loader2 className="lfm-spin" size={13} /> Saving...</> : <><Save size={13} /> Save Staff</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};