import React, { useState } from 'react';
import { X, Save, Loader } from 'lucide-react';
import type { UserRole } from '../../types/auth.types';

interface StaffFormProps {
    onClose: () => void;
    onSave: (staff: any) => Promise<void>;
}

export const StaffFormModal: React.FC<StaffFormProps> = ({ onClose, onSave }) => {
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        role: 'facilitator' as UserRole,
        phone: ''
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        await onSave(formData);
        setLoading(false);
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Add Staff Member</h2>
                    <button onClick={onClose}><X size={24} /></button>
                </div>
                <form onSubmit={handleSubmit} className="modal-body">
                    <div className="input-group">
                        <label>Full Name</label>
                        <input
                            required
                            value={formData.fullName}
                            onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                        />
                    </div>
                    <div className="input-group">
                        <label>Email Address</label>
                        <input
                            type="email" required
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>
                    <div className="input-group">
                        <label>Role</label>
                        <select
                            value={formData.role}
                            onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                        >
                            <option value="facilitator">Facilitator (Blue Pen)</option>
                            <option value="assessor">Assessor (Red Pen)</option>
                            <option value="moderator">Moderator (Green Pen)</option>
                        </select>
                    </div>
                    <div className="input-group">
                        <label>Phone (Optional)</label>
                        <input
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        />
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? <Loader className="spin" /> : <Save size={18} />} Save Staff
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};