// src/components/views/StaffView/StaffView.tsx

// src/components/views/StaffView/StaffView.tsx
// Styled to align with mLab Corporate Identity Brand Guide 2019
// All visual styling lives in StaffView.css

import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Search, Users, Building2 } from 'lucide-react';
import { useStore, type StaffMember } from '../../../store/useStore';
import './StaffView.css';

type RoleFilter = 'all' | 'facilitator' | 'assessor' | 'moderator' | 'mentor';

interface StaffViewProps {
    staff: StaffMember[];
    onAdd: () => void;
    onDelete: (staff: StaffMember) => void;
}

const ROLE_CONFIG = {
    facilitator: { label: 'Facilitator', dotClass: 'mlab-role-badge__dot', pillDot: 'mlab-role-pill__dot--blue', activePill: 'mlab-role-pill--active-facilitator', badge: 'mlab-role-badge--facilitator' },
    assessor: { label: 'Assessor', dotClass: 'mlab-role-badge__dot', pillDot: 'mlab-role-pill__dot--red', activePill: 'mlab-role-pill--active-assessor', badge: 'mlab-role-badge--assessor' },
    moderator: { label: 'Moderator', dotClass: 'mlab-role-badge__dot', pillDot: 'mlab-role-pill__dot--green', activePill: 'mlab-role-pill--active-moderator', badge: 'mlab-role-badge--moderator' },
    mentor: { label: 'Mentor', dotClass: 'mlab-role-badge__dot', pillDot: 'mlab-role-pill__dot--orange', activePill: 'mlab-role-pill--active-mentor', badge: 'mlab-role-badge--mentor' },
} as const;

export const StaffView: React.FC<StaffViewProps> = ({ staff, onAdd, onDelete }) => {
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

    // Counts per role for filter pills
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
        <div className="mlab-staff">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="mlab-staff__header">
                <h2 className="mlab-staff__title">
                    Faculty & Workplace Mentors
                </h2>
                <button className="mlab-btn mlab-btn--green" onClick={onAdd}>
                    <Plus size={16} /> Add Staff Member
                </button>
            </div>

            {/* ── Toolbar ────────────────────────────────────────────────── */}
            <div className="mlab-staff__toolbar">

                {/* Search */}
                <div className="mlab-search">
                    <Search size={17} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder="Search by name, email or phone…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Role Filter Pills */}
                <div className="mlab-role-filters">
                    <button
                        className={`mlab-role-pill ${roleFilter === 'all' ? 'mlab-role-pill--active-all' : ''}`}
                        onClick={() => setRoleFilter('all')}
                    >
                        All ({counts.all})
                    </button>

                    {(['facilitator', 'assessor', 'moderator', 'mentor'] as const).map(role => {
                        const cfg = ROLE_CONFIG[role];
                        const isActive = roleFilter === role;
                        return (
                            <button
                                key={role}
                                className={`mlab-role-pill ${isActive ? cfg.activePill : ''}`}
                                onClick={() => setRoleFilter(role)}
                            >
                                <span className={`mlab-role-pill__dot ${cfg.pillDot}`} />
                                {cfg.label} ({counts[role]})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Result Count ────────────────────────────────────────────── */}
            <p className="mlab-staff__count">
                Showing <strong>{filtered.length}</strong> of {staff.length} staff members
            </p>

            {/* ── Table ──────────────────────────────────────────────────── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Full Name</th>
                            <th>Role</th>
                            <th>Contact Info</th>
                            <th>Workplace / Registry Info</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(s => {
                            const cfg = ROLE_CONFIG[s.role as keyof typeof ROLE_CONFIG];
                            return (
                                <tr key={s.id}>

                                    {/* Name */}
                                    <td>
                                        <span className="mlab-staff-name">{s.fullName}</span>
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
                                            <span className={`mlab-contact ${!s.phone ? 'mlab-contact--muted' : ''}`} style={{ fontSize: '0.8rem' }}>
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
                                    <td>
                                        <button
                                            className="mlab-icon-btn mlab-icon-btn--red"
                                            onClick={() => onDelete(s)}
                                            title="Remove Staff Member"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Empty / No Results */}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={5} className="mlab-table-empty">
                                    <Users size={36} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                    <span className="mlab-table-empty__title">
                                        {staff.length === 0 ? 'No Staff Found' : 'No Results Match Your Filters'}
                                    </span>
                                    {staff.length === 0
                                        ? 'Add a staff member to get started.'
                                        : 'Try adjusting your search or role filter.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

