import React, { useState, useEffect } from 'react';
import { X, Save, Loader, ShieldCheck, Briefcase } from 'lucide-react';
import type { UserRole } from '../../types/auth.types';
import { useStore } from '../../store/useStore';

interface StaffFormProps {
    onClose: () => void;
    onSave: (staff: any) => Promise<void>;
}

export const StaffFormModal: React.FC<StaffFormProps> = ({ onClose, onSave }) => {
    // 🚀 Bring in employers from our new global store
    const { employers, fetchEmployers } = useStore();

    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        role: 'facilitator' as UserRole | 'mentor', // Added mentor to allowable states
        phone: '',
        assessorRegNumber: '',
        employerId: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Fetch employers when the modal opens
    useEffect(() => {
        if (employers.length === 0) {
            fetchEmployers();
        }
    }, [employers.length, fetchEmployers]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // 🚀 Strict Validation: Mentors MUST have a workplace
        if (formData.role === 'mentor' && !formData.employerId) {
            setError('Workplace Mentors must be linked to a Host Company.');
            return;
        }

        setLoading(true);

        // Clean up data based on role before saving
        const payload = { ...formData };
        if (payload.role === 'mentor') {
            payload.assessorRegNumber = ''; // Mentors don't need SETA reg
        } else if (['assessor', 'moderator'].includes(payload.role)) {
            payload.employerId = ''; // Assessors/Moderators don't need a host company
        } else {
            payload.assessorRegNumber = '';
            payload.employerId = '';
        }

        try {
            await onSave(payload);
        } catch (err: any) {
            setError(err.message || 'Failed to save staff member.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h2>Add Staff / Mentor</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#64748b" /></button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    {error && (
                        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '0.85rem', border: '1px solid #fecaca' }}>
                            {error}
                        </div>
                    )}

                    <div className="input-group">
                        <label>Full Name *</label>
                        <input
                            required
                            placeholder="e.g. John Doe"
                            value={formData.fullName}
                            onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                        />
                    </div>

                    <div className="input-group">
                        <label>Email Address *</label>
                        <input
                            type="email" required
                            placeholder="john@example.com"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>

                    <div className="input-group">
                        <label>System Role *</label>
                        <select
                            value={formData.role}
                            onChange={e => setFormData({ ...formData, role: e.target.value as any })}
                            style={{ fontWeight: 'bold' }}
                        >
                            <option value="facilitator">Facilitator (Trainer / Blue Pen)</option>
                            <option value="assessor">Assessor (SETA / Red Pen)</option>
                            <option value="moderator">Internal Moderator (SETA / Green Pen)</option>
                            <option value="mentor">Workplace Mentor (External / Orange Pen)</option>
                        </select>
                    </div>

                    {/* 🚀 CONDITIONAL FIELDS BASED ON ROLE 🚀 */}

                    {/* SETA Registration for Assessors/Moderators */}
                    {['assessor', 'moderator'].includes(formData.role) && (
                        <div className="input-group" style={{ background: '#fef2f2', padding: '15px', borderRadius: '6px', border: '1px solid #fecaca', marginTop: '10px' }}>
                            <label style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShieldCheck size={16} /> SETA Registration Number
                            </label>
                            <input
                                placeholder="e.g. MICT-ASS-1234"
                                value={formData.assessorRegNumber}
                                onChange={e => setFormData({ ...formData, assessorRegNumber: e.target.value })}
                                style={{ borderColor: '#fca5a5' }}
                            />
                        </div>
                    )}

                    {/* Workplace Linking for Mentors */}
                    {formData.role === 'mentor' && (
                        <div className="input-group" style={{ background: '#fffbeb', padding: '15px', borderRadius: '6px', border: '1px solid #fde68a', marginTop: '10px' }}>
                            <label style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Briefcase size={16} /> Linked Host Company *
                            </label>
                            <select
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
                            <span style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '6px', display: 'block' }}>
                                Mentors will only see logbooks from learners assigned to this specific company.
                            </span>
                        </div>
                    )}

                    <div className="input-group" style={{ marginTop: '10px' }}>
                        <label>Phone Number (Optional)</label>
                        <input
                            placeholder="082 123 4567"
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        />
                    </div>

                    <div className="modal-footer" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ background: 'var(--mlab-blue)', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {loading ? <Loader className="spin" size={18} /> : <Save size={18} />} Save Profile
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// import React, { useState } from 'react';
// import { X, Save, Loader } from 'lucide-react';
// import type { UserRole } from '../../types/auth.types';

// interface StaffFormProps {
//     onClose: () => void;
//     onSave: (staff: any) => Promise<void>;
// }

// export const StaffFormModal: React.FC<StaffFormProps> = ({ onClose, onSave }) => {
//     const [formData, setFormData] = useState({
//         fullName: '',
//         email: '',
//         role: 'facilitator' as UserRole,
//         phone: ''
//     });
//     const [loading, setLoading] = useState(false);

//     const handleSubmit = async (e: React.FormEvent) => {
//         e.preventDefault();
//         setLoading(true);
//         await onSave(formData);
//         setLoading(false);
//         onClose();
//     };

//     return (
//         <div className="modal-overlay">
//             <div className="modal-content">
//                 <div className="modal-header">
//                     <h2>Add Staff Member</h2>
//                     <button onClick={onClose}><X size={24} /></button>
//                 </div>
//                 <form onSubmit={handleSubmit} className="modal-body">
//                     <div className="input-group">
//                         <label>Full Name</label>
//                         <input
//                             required
//                             value={formData.fullName}
//                             onChange={e => setFormData({ ...formData, fullName: e.target.value })}
//                         />
//                     </div>
//                     <div className="input-group">
//                         <label>Email Address</label>
//                         <input
//                             type="email" required
//                             value={formData.email}
//                             onChange={e => setFormData({ ...formData, email: e.target.value })}
//                         />
//                     </div>
//                     <div className="input-group">
//                         <label>Role</label>
//                         <select
//                             value={formData.role}
//                             onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
//                         >
//                             <option value="facilitator">Facilitator (Blue Pen)</option>
//                             <option value="assessor">Assessor (Red Pen)</option>
//                             <option value="moderator">Moderator (Green Pen)</option>
//                         </select>
//                     </div>
//                     <div className="input-group">
//                         <label>Phone (Optional)</label>
//                         <input
//                             value={formData.phone}
//                             onChange={e => setFormData({ ...formData, phone: e.target.value })}
//                         />
//                     </div>

//                     <div className="modal-footer">
//                         <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
//                         <button type="submit" className="btn btn-primary" disabled={loading}>
//                             {loading ? <Loader className="spin" /> : <Save size={18} />} Save Staff
//                         </button>
//                     </div>
//                 </form>
//             </div>
//         </div>
//     );
// };