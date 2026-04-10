// src/components/views/StaffView/StaffView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Edit2, Search, Users, Building2, X, Filter } from 'lucide-react';
import { useStore, type StaffMember } from '../../../store/useStore';
import '../../admin/WorkplacesManager/WorkplacesManager.css';
import '../../../components/views/LearnersView/LearnersView.css';
import '../../admin/LearnerFormModal/LearnerFormModal.css';
import './StaffView.css';

type RoleFilter = 'all' | 'facilitator' | 'assessor' | 'moderator' | 'mentor';

interface StaffViewProps {
    staff: StaffMember[];
    onAdd: () => void;
    onEdit: (staff: StaffMember) => void;
    onDelete: (staff: StaffMember) => void;
}

const ROLE_CONFIG = {
    facilitator: { label: 'Facilitator', dotClass: 'mlab-role-badge__dot', badge: 'mlab-role-badge--facilitator' },
    assessor: { label: 'Assessor', dotClass: 'mlab-role-badge__dot', badge: 'mlab-role-badge--assessor' },
    moderator: { label: 'Moderator', dotClass: 'mlab-role-badge__dot', badge: 'mlab-role-badge--moderator' },
    mentor: { label: 'Mentor', dotClass: 'mlab-role-badge__dot', badge: 'mlab-role-badge--mentor' },
} as const;

export const StaffView: React.FC<StaffViewProps> = ({ staff, onAdd, onEdit, onDelete }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

    // We need the employers list to map the employerId to an actual company name
    const { employers, fetchEmployers } = useStore();

    useEffect(() => {
        if (employers.length === 0) {
            fetchEmployers();
        }
    }, [employers.length, fetchEmployers]);

    const filtered = useMemo(() => {
        return staff.filter(s => {
            if (roleFilter !== 'all' && s.role !== roleFilter) return false;
            if (searchTerm) {
                const q = searchTerm.toLowerCase();
                if (!(
                    s.fullName?.toLowerCase().includes(q) ||
                    s.email?.toLowerCase().includes(q) ||
                    s.phone?.includes(searchTerm)
                )) return false;
            }
            return true;
        });
    }, [staff, roleFilter, searchTerm]);

    const counts = useMemo(() => ({
        all: staff.length,
        facilitator: staff.filter(s => s.role === 'facilitator').length,
        assessor: staff.filter(s => s.role === 'assessor').length,
        moderator: staff.filter(s => s.role === 'moderator').length,
        mentor: staff.filter(s => s.role === 'mentor').length,
    }), [staff]);

    const getEmployerName = (employerId?: string) => {
        if (!employerId) return '—';
        const emp = employers.find(e => e.id === employerId);
        return emp ? emp.name : 'Unknown Company';
    };

    return (
        <div className="wm-root animate-fade-in">

            {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><Users size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Faculty & Staff</h1>
                        <p className="wm-page-header__desc">Manage system access for facilitators, assessors, moderators, and mentors.</p>
                    </div>
                </div>
                <button className="wm-btn wm-btn--primary" onClick={onAdd}>
                    <Plus size={14} /> Add Staff Member
                </button>
            </div>

            {/* ── TOOLBAR (Reusing wm-toolbar styling) ── */}
            <div className="wm-toolbar" style={{ flexWrap: 'wrap' }}>
                <div className="wm-search">
                    <Search size={15} className="wm-search__icon" />
                    <input
                        type="text"
                        className="wm-search__input"
                        placeholder="Search by name, email or phone…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button className="wm-search__clear" onClick={() => setSearchTerm('')}><X size={13} /></button>
                    )}
                </div>

                {/* Role Filter mapped to wm-search input style for consistency */}
                <div className="wm-search" style={{ flex: 'none', minWidth: '200px' }}>
                    <Filter size={15} className="wm-search__icon" />
                    <select
                        className="wm-search__input"
                        value={roleFilter}
                        onChange={e => setRoleFilter(e.target.value as RoleFilter)}
                        style={{ cursor: 'pointer' }}
                    >
                        <option value="all">All Roles ({counts.all})</option>
                        <option value="facilitator">Facilitator ({counts.facilitator})</option>
                        <option value="assessor">Assessor ({counts.assessor})</option>
                        <option value="moderator">Moderator ({counts.moderator})</option>
                        <option value="mentor">Mentor ({counts.mentor})</option>
                    </select>
                </div>

                <div className="wm-toolbar__count">
                    {filtered.length} staff member{filtered.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* ── TABLE (Restored original mlab-table structure) ── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Full Name</th>
                            <th>Role</th>
                            <th>Contact Info</th>
                            <th>Workplace / Registry Info</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(s => {
                            const cfg = ROLE_CONFIG[s.role as keyof typeof ROLE_CONFIG];
                            return (
                                <tr key={s.id}>

                                    {/* Name */}
                                    <td>
                                        <span className="mlab-staff-name" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>
                                            {s.fullName}
                                        </span>
                                    </td>

                                    {/* Role Badge */}
                                    <td>
                                        <span className={`mlab-role-badge ${cfg?.badge ?? ''}`}>
                                            <span className="mlab-role-badge__dot" />
                                            {s.role.toUpperCase()}
                                        </span>
                                    </td>

                                    {/* Contact Info */}
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span className="mlab-contact">{s.email}</span>
                                            <span className={`mlab-contact ${!s.phone ? 'mlab-contact--muted' : ''}`} style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                                {s.phone || 'No phone provided'}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Meta / Workplace Info */}
                                    <td>
                                        {s.role === 'mentor' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#b45309', background: '#fffbeb', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fde68a', width: 'fit-content' }}>
                                                <Building2 size={13} />
                                                <strong>{getEmployerName(s.employerId)}</strong>
                                            </div>
                                        ) : ['assessor', 'moderator'].includes(s.role) ? (
                                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                <strong>Reg:</strong> {s.assessorRegNumber || <em style={{ opacity: 0.5 }}>Pending</em>}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>—</span>
                                        )}
                                    </td>

                                    {/* Actions */}
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="mlab-icon-btn-group" style={{ justifyContent: 'flex-end' }}>
                                            <button
                                                className="mlab-icon-btn mlab-icon-btn--blue"
                                                onClick={() => onEdit(s)}
                                                title="Edit Staff Member"
                                            >
                                                <Edit2 size={15} />
                                            </button>
                                            <button
                                                className="mlab-icon-btn mlab-icon-btn--red"
                                                onClick={() => onDelete(s)}
                                                title="Remove Staff Member"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Empty / No Results */}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={5} className="mlab-table-empty">
                                    <div className="mlab-empty">
                                        <Users size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
                                        <p className="mlab-empty__title">
                                            {staff.length === 0 ? 'No Staff Found' : 'No Results Match Your Filters'}
                                        </p>
                                        <p className="mlab-empty__desc">
                                            {staff.length === 0
                                                ? 'Add a staff member to get started.'
                                                : 'Try adjusting your search or role filter.'}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

