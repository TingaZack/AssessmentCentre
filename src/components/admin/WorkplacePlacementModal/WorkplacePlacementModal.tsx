import React, { useState, useMemo } from 'react';
import { X, Save, Loader2, Building2, Briefcase } from 'lucide-react';
import { useStore } from '../../../store/useStore';
import type { DashboardLearner } from '../../../types';
import { ToastContainer, useToast } from '../../common/Toast/Toast'; // 🚀 Imported Toast

interface WorkplacePlacementModalProps {
    learner: DashboardLearner;
    onClose: () => void;
}

export const WorkplacePlacementModal: React.FC<WorkplacePlacementModalProps> = ({ learner, onClose }) => {
    const { employers, staff, updateLearnerPlacement } = useStore();
    const toast = useToast(); // 🚀 Initialize Toast

    // Default to existing placement if they already have one
    const [employerId, setEmployerId] = useState(learner.employerId || '');
    const [mentorId, setMentorId] = useState(learner.mentorId || '');
    const [saving, setSaving] = useState(false);

    // Filter to only show Active Employers
    const activeEmployers = useMemo(() => employers.filter(e => e.status !== 'archived'), [employers]);

    // Dynamically filter Mentors who belong to the selected Employer
    const availableMentors = useMemo(() => {
        return staff.filter(s => s.role === 'mentor' && s.status !== 'archived' && s.employerId === employerId);
    }, [staff, employerId]);

    // Reset mentor if employer changes to prevent mismatches
    const handleEmployerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setEmployerId(e.target.value);
        setMentorId('');
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const targetId = learner.enrollmentId || learner.id;
            await updateLearnerPlacement(targetId, employerId, mentorId);

            toast.success("Workplace assigned successfully!");

            setTimeout(() => {
                onClose();
            }, 1500);

        } catch (error: any) {
            toast.error(error.message || "Failed to save placement.");
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5, 46, 58, 0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>

            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            <div style={{ background: 'white', maxWidth: '450px', width: '100%', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>Workplace Placement</h2>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Assigning {learner.fullName}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} disabled={saving}><X size={20} /></button>
                </div>

                <form onSubmit={handleSave} style={{ padding: '1.5rem' }}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
                            <Building2 size={16} color="#0284c7" /> Host Company / Employer
                        </label>
                        <select
                            required
                            value={employerId}
                            onChange={handleEmployerChange}
                            disabled={saving}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none' }}
                        >
                            <option value="">-- Select Workplace --</option>
                            {activeEmployers.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
                            <Briefcase size={16} color="#d97706" /> Assigned Mentor
                        </label>
                        <select
                            required
                            disabled={!employerId || availableMentors.length === 0 || saving}
                            value={mentorId}
                            onChange={e => setMentorId(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', backgroundColor: (!employerId || availableMentors.length === 0) ? '#f1f5f9' : 'white' }}
                        >
                            <option value="">-- Select Mentor --</option>
                            {availableMentors.map(mentor => (
                                <option key={mentor.id} value={mentor.id}>{mentor.fullName}</option>
                            ))}
                        </select>
                        {employerId && availableMentors.length === 0 && (
                            <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: '#ef4444' }}>No mentors found for this company. Add one via Staff Management first.</p>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                        <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#475569', fontWeight: 'bold', cursor: 'pointer' }} disabled={saving}>Cancel</button>
                        <button type="submit" disabled={saving || !employerId || !mentorId} style={{ padding: '8px 16px', background: 'var(--mlab-blue)', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Placement
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

