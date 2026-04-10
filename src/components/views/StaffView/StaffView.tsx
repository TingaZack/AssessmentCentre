// src/components/views/StaffView/StaffView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Edit2, Search, Users, Building2, X, Filter } from 'lucide-react';
import { useStore, type StaffMember } from '../../../store/useStore';

// 🚀 CRITICAL: Import WorkplacesManager CSS for the bespoke Header & Toolbar
import '../../admin/WorkplacesManager/WorkplacesManager.css';
// 🚀 Import the unified table styles (so mlab-table works perfectly)
import '../../../components/views/LearnersView/LearnersView.css';
import '../../admin/LearnerFormModal/LearnerFormModal.css';
import './StaffView.css';

type RoleFilter = 'all' | 'facilitator' | 'assessor' | 'moderator' | 'mentor';

interface StaffViewProps {
    staff: StaffMember[];
    onAdd: () => void;
    onEdit: (staff: StaffMember) => void; // 🚀 Added onEdit prop
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
                                            {/* 🚀 Added Edit Button */}
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



// // src/components/views/StaffView/StaffView.tsx

// import React, { useState, useMemo, useEffect } from 'react';
// import { Plus, Trash2, Search, Users, Building2, X, Filter } from 'lucide-react';
// import { useStore, type StaffMember } from '../../../store/useStore';
// import '../../admin/WorkplacesManager/WorkplacesManager.css';
// import '../../../components/views/LearnersView/LearnersView.css';
// import '../../admin/LearnerFormModal/LearnerFormModal.css';
// import './StaffView.css';

// type RoleFilter = 'all' | 'facilitator' | 'assessor' | 'moderator' | 'mentor';

// interface StaffViewProps {
//     staff: StaffMember[];
//     onAdd: () => void;
//     onDelete: (staff: StaffMember) => void;
// }

// const ROLE_CONFIG = {
//     facilitator: { label: 'Facilitator', dotClass: 'mlab-role-badge__dot', badge: 'mlab-role-badge--facilitator' },
//     assessor: { label: 'Assessor', dotClass: 'mlab-role-badge__dot', badge: 'mlab-role-badge--assessor' },
//     moderator: { label: 'Moderator', dotClass: 'mlab-role-badge__dot', badge: 'mlab-role-badge--moderator' },
//     mentor: { label: 'Mentor', dotClass: 'mlab-role-badge__dot', badge: 'mlab-role-badge--mentor' },
// } as const;

// export const StaffView: React.FC<StaffViewProps> = ({ staff, onAdd, onDelete }) => {
//     const [searchTerm, setSearchTerm] = useState('');
//     const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

//     // We need the employers list to map the employerId to an actual company name
//     const { employers, fetchEmployers } = useStore();

//     useEffect(() => {
//         if (employers.length === 0) {
//             fetchEmployers();
//         }
//     }, [employers.length, fetchEmployers]);

//     const filtered = useMemo(() => {
//         return staff.filter(s => {
//             if (roleFilter !== 'all' && s.role !== roleFilter) return false;
//             if (searchTerm) {
//                 const q = searchTerm.toLowerCase();
//                 if (!(
//                     s.fullName?.toLowerCase().includes(q) ||
//                     s.email?.toLowerCase().includes(q) ||
//                     s.phone?.includes(searchTerm)
//                 )) return false;
//             }
//             return true;
//         });
//     }, [staff, roleFilter, searchTerm]);

//     const counts = useMemo(() => ({
//         all: staff.length,
//         facilitator: staff.filter(s => s.role === 'facilitator').length,
//         assessor: staff.filter(s => s.role === 'assessor').length,
//         moderator: staff.filter(s => s.role === 'moderator').length,
//         mentor: staff.filter(s => s.role === 'mentor').length,
//     }), [staff]);

//     const getEmployerName = (employerId?: string) => {
//         if (!employerId) return '—';
//         const emp = employers.find(e => e.id === employerId);
//         return emp ? emp.name : 'Unknown Company';
//     };

//     return (
//         <div className="wm-root animate-fade-in">

//             {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
//             <div className="wm-page-header">
//                 <div className="wm-page-header__left">
//                     <div className="wm-page-header__icon"><Users size={22} /></div>
//                     <div>
//                         <h1 className="wm-page-header__title">Faculty & Staff</h1>
//                         <p className="wm-page-header__desc">Manage system access for facilitators, assessors, moderators, and mentors.</p>
//                     </div>
//                 </div>
//                 <button className="wm-btn wm-btn--primary" onClick={onAdd}>
//                     <Plus size={14} /> Add Staff Member
//                 </button>
//             </div>

//             {/* ── TOOLBAR (Reusing wm-toolbar styling) ── */}
//             <div className="wm-toolbar" style={{ flexWrap: 'wrap' }}>
//                 <div className="wm-search">
//                     <Search size={15} className="wm-search__icon" />
//                     <input
//                         type="text"
//                         className="wm-search__input"
//                         placeholder="Search by name, email or phone…"
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                     />
//                     {searchTerm && (
//                         <button className="wm-search__clear" onClick={() => setSearchTerm('')}><X size={13} /></button>
//                     )}
//                 </div>

//                 {/* Role Filter mapped to wm-search input style for consistency */}
//                 <div className="wm-search" style={{ flex: 'none', minWidth: '200px' }}>
//                     <Filter size={15} className="wm-search__icon" />
//                     <select
//                         className="wm-search__input"
//                         value={roleFilter}
//                         onChange={e => setRoleFilter(e.target.value as RoleFilter)}
//                         style={{ cursor: 'pointer' }}
//                     >
//                         <option value="all">All Roles ({counts.all})</option>
//                         <option value="facilitator">Facilitator ({counts.facilitator})</option>
//                         <option value="assessor">Assessor ({counts.assessor})</option>
//                         <option value="moderator">Moderator ({counts.moderator})</option>
//                         <option value="mentor">Mentor ({counts.mentor})</option>
//                     </select>
//                 </div>

//                 <div className="wm-toolbar__count">
//                     {filtered.length} staff member{filtered.length !== 1 ? 's' : ''}
//                 </div>
//             </div>

//             {/* ── TABLE (Restored original mlab-table structure) ── */}
//             <div className="mlab-table-wrap">
//                 <table className="mlab-table">
//                     <thead>
//                         <tr>
//                             <th>Full Name</th>
//                             <th>Role</th>
//                             <th>Contact Info</th>
//                             <th>Workplace / Registry Info</th>
//                             <th style={{ textAlign: 'right' }}>Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {filtered.map(s => {
//                             const cfg = ROLE_CONFIG[s.role as keyof typeof ROLE_CONFIG];
//                             return (
//                                 <tr key={s.id}>

//                                     {/* Name */}
//                                     <td>
//                                         <span className="mlab-staff-name" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>
//                                             {s.fullName}
//                                         </span>
//                                     </td>

//                                     {/* Role Badge */}
//                                     <td>
//                                         <span className={`mlab-role-badge ${cfg?.badge ?? ''}`}>
//                                             <span className="mlab-role-badge__dot" />
//                                             {s.role.toUpperCase()}
//                                         </span>
//                                     </td>

//                                     {/* Contact Info */}
//                                     <td>
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                             <span className="mlab-contact">{s.email}</span>
//                                             <span className={`mlab-contact ${!s.phone ? 'mlab-contact--muted' : ''}`} style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
//                                                 {s.phone || 'No phone provided'}
//                                             </span>
//                                         </div>
//                                     </td>

//                                     {/* Meta / Workplace Info */}
//                                     <td>
//                                         {s.role === 'mentor' ? (
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#b45309', background: '#fffbeb', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fde68a', width: 'fit-content' }}>
//                                                 <Building2 size={13} />
//                                                 <strong>{getEmployerName(s.employerId)}</strong>
//                                             </div>
//                                         ) : ['assessor', 'moderator'].includes(s.role) ? (
//                                             <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
//                                                 <strong>Reg:</strong> {s.assessorRegNumber || <em style={{ opacity: 0.5 }}>Pending</em>}
//                                             </span>
//                                         ) : (
//                                             <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>—</span>
//                                         )}
//                                     </td>

//                                     {/* Actions */}
//                                     <td style={{ textAlign: 'right' }}>
//                                         <div className="mlab-icon-btn-group" style={{ justifyContent: 'flex-end' }}>
//                                             <button
//                                                 className="mlab-icon-btn mlab-icon-btn--red"
//                                                 onClick={() => onDelete(s)}
//                                                 title="Remove Staff Member"
//                                             >
//                                                 <Trash2 size={15} />
//                                             </button>
//                                         </div>
//                                     </td>
//                                 </tr>
//                             );
//                         })}

//                         {/* Empty / No Results */}
//                         {filtered.length === 0 && (
//                             <tr>
//                                 <td colSpan={5} className="mlab-table-empty">
//                                     <div className="mlab-empty">
//                                         <Users size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
//                                         <p className="mlab-empty__title">
//                                             {staff.length === 0 ? 'No Staff Found' : 'No Results Match Your Filters'}
//                                         </p>
//                                         <p className="mlab-empty__desc">
//                                             {staff.length === 0
//                                                 ? 'Add a staff member to get started.'
//                                                 : 'Try adjusting your search or role filter.'}
//                                         </p>
//                                     </div>
//                                 </td>
//                             </tr>
//                         )}
//                     </tbody>
//                 </table>
//             </div>
//         </div>
//     );
// };



// // // src/components/views/StaffView/StaffView.tsx

// // import React, { useState, useMemo, useEffect } from 'react';
// // import { Plus, Trash2, Search, Users, Building2, X, Mail, Phone, ShieldCheck, Filter } from 'lucide-react';
// // import { useStore, type StaffMember } from '../../../store/useStore';

// // // 🚀 CRITICAL: Import the bespoke CSS directly from WorkplacesManager to share the styling!
// // import '../../admin/WorkplacesManager/WorkplacesManager.css';
// // import '../../admin/LearnerFormModal/LearnerFormModal.css';

// // type RoleFilter = 'all' | 'facilitator' | 'assessor' | 'moderator' | 'mentor';

// // interface StaffViewProps {
// //     staff: StaffMember[];
// //     onAdd: () => void;
// //     onDelete: (staff: StaffMember) => void;
// // }

// // export const StaffView: React.FC<StaffViewProps> = ({ staff, onAdd, onDelete }) => {
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

// //     // We need the employers list to map the employerId to an actual company name
// //     const { employers, fetchEmployers } = useStore();

// //     useEffect(() => {
// //         if (employers.length === 0) {
// //             fetchEmployers();
// //         }
// //     }, [employers.length, fetchEmployers]);

// //     const filtered = useMemo(() => {
// //         return staff.filter(s => {
// //             if (roleFilter !== 'all' && s.role !== roleFilter) return false;
// //             if (searchTerm) {
// //                 const q = searchTerm.toLowerCase();
// //                 if (!(
// //                     s.fullName?.toLowerCase().includes(q) ||
// //                     s.email?.toLowerCase().includes(q) ||
// //                     s.phone?.includes(searchTerm)
// //                 )) return false;
// //             }
// //             return true;
// //         });
// //     }, [staff, roleFilter, searchTerm]);

// //     const counts = useMemo(() => ({
// //         all: staff.length,
// //         facilitator: staff.filter(s => s.role === 'facilitator').length,
// //         assessor: staff.filter(s => s.role === 'assessor').length,
// //         moderator: staff.filter(s => s.role === 'moderator').length,
// //         mentor: staff.filter(s => s.role === 'mentor').length,
// //     }), [staff]);

// //     const getEmployerName = (employerId?: string) => {
// //         if (!employerId) return '—';
// //         const emp = employers.find(e => e.id === employerId);
// //         return emp ? emp.name : 'Unknown Company';
// //     };

// //     return (
// //         <div className="wm-root animate-fade-in">

// //             {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
// //             <div className="wm-page-header">
// //                 <div className="wm-page-header__left">
// //                     <div className="wm-page-header__icon"><Users size={22} /></div>
// //                     <div>
// //                         <h1 className="wm-page-header__title">Faculty & Staff</h1>
// //                         <p className="wm-page-header__desc">Manage system access for facilitators, assessors, moderators, and mentors.</p>
// //                     </div>
// //                 </div>
// //                 <button className="wm-btn wm-btn--primary" onClick={onAdd}>
// //                     <Plus size={14} /> Add Staff Member
// //                 </button>
// //             </div>

// //             {/* ── TOOLBAR ── */}
// //             <div className="wm-toolbar" style={{ flexWrap: 'wrap' }}>
// //                 <div className="wm-search">
// //                     <Search size={15} className="wm-search__icon" />
// //                     <input
// //                         type="text"
// //                         className="wm-search__input"
// //                         placeholder="Search by name, email or phone…"
// //                         value={searchTerm}
// //                         onChange={e => setSearchTerm(e.target.value)}
// //                     />
// //                     {searchTerm && (
// //                         <button className="wm-search__clear" onClick={() => setSearchTerm('')}><X size={13} /></button>
// //                     )}
// //                 </div>

// //                 {/* Role Filter mapped to wm-search input style for consistency */}
// //                 <div className="wm-search" style={{ flex: 'none', minWidth: '200px' }}>
// //                     <Filter size={15} className="wm-search__icon" />
// //                     <select
// //                         className="wm-search__input"
// //                         value={roleFilter}
// //                         onChange={e => setRoleFilter(e.target.value as RoleFilter)}
// //                         style={{ cursor: 'pointer' }}
// //                     >
// //                         <option value="all">All Roles ({counts.all})</option>
// //                         <option value="facilitator">Facilitator ({counts.facilitator})</option>
// //                         <option value="assessor">Assessor ({counts.assessor})</option>
// //                         <option value="moderator">Moderator ({counts.moderator})</option>
// //                         <option value="mentor">Mentor ({counts.mentor})</option>
// //                     </select>
// //                 </div>

// //                 <div className="wm-toolbar__count">
// //                     {filtered.length} staff member{filtered.length !== 1 ? 's' : ''}
// //                 </div>
// //             </div>

// //             {/* ── CONTENT / GRID ── */}
// //             {filtered.length === 0 ? (
// //                 <div className="wm-empty">
// //                     <div className="wm-empty__icon"><Users size={36} /></div>
// //                     <p className="wm-empty__title">
// //                         {staff.length === 0 ? 'No Staff Found' : 'No Results Match Your Filters'}
// //                     </p>
// //                     <p className="wm-empty__desc">
// //                         {staff.length === 0
// //                             ? 'Add a staff member to get started.'
// //                             : 'Try adjusting your search or role filter.'}
// //                     </p>
// //                 </div>
// //             ) : (
// //                 <div className="wm-grid">
// //                     {filtered.map(s => (
// //                         <div key={s.id} className="wm-card">

// //                             {/* Card header — name + actions */}
// //                             <div className="wm-card__header">
// //                                 <h3 className="wm-card__name">{s.fullName}</h3>
// //                                 <div className="wm-card__actions">
// //                                     <button
// //                                         className="mlab-icon-btn mlab-icon-btn--red"
// //                                         onClick={() => onDelete(s)}
// //                                         title="Remove Staff Member"
// //                                         style={{ width: '28px', height: '28px' }}
// //                                     >
// //                                         <Trash2 size={14} />
// //                                     </button>
// //                                 </div>
// //                             </div>

// //                             {/* Role chip */}
// //                             <div className="wm-card__reg">
// //                                 <ShieldCheck size={11} />
// //                                 <span style={{ textTransform: 'uppercase' }}>{s.role}</span>
// //                             </div>

// //                             {/* Contact rows */}
// //                             <div className="wm-card__contact" style={{ paddingBottom: '0.85rem' }}>
// //                                 <div className="wm-contact-row">
// //                                     <Mail size={12} className="wm-contact-row__icon" />
// //                                     <span className="wm-contact-row__label">Email</span>
// //                                     <span className="wm-contact-row__value wm-contact-row__value--muted">{s.email}</span>
// //                                 </div>
// //                                 {s.phone && (
// //                                     <div className="wm-contact-row">
// //                                         <Phone size={12} className="wm-contact-row__icon" />
// //                                         <span className="wm-contact-row__label">Phone</span>
// //                                         <span className="wm-contact-row__value wm-contact-row__value--muted">{s.phone}</span>
// //                                     </div>
// //                                 )}
// //                             </div>

// //                             {/* Registry/Employer Section (Mapped to wm-mentors block) */}
// //                             <div className="wm-card__mentors" style={{ background: '#f8fafc', borderTop: '1px solid var(--mlab-border)' }}>
// //                                 {s.role === 'mentor' ? (
// //                                     <div className="wm-mentors__title" style={{ color: '#b45309' }}>
// //                                         <Building2 size={13} />
// //                                         <span>{getEmployerName(s.employerId)}</span>
// //                                     </div>
// //                                 ) : ['assessor', 'moderator'].includes(s.role) ? (
// //                                     <div className="wm-mentors__title" style={{ color: 'var(--mlab-grey)' }}>
// //                                         <strong>Reg Number:</strong> &nbsp;
// //                                         {s.assessorRegNumber || <em style={{ opacity: 0.6, fontWeight: 'normal' }}>Pending</em>}
// //                                     </div>
// //                                 ) : (
// //                                     <div className="wm-mentors__title" style={{ color: 'var(--mlab-grey-light)', fontWeight: 'normal' }}>
// //                                         No specific registry required
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     ))}
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };


// // // // src/components/views/StaffView/StaffView.tsx

// // // import React, { useState, useMemo, useEffect } from 'react';
// // // import { Plus, Trash2, Search, Users, Building2 } from 'lucide-react';
// // // import { useStore, type StaffMember } from '../../../store/useStore';
// // // import './StaffView.css';

// // // // 🚀 CRITICAL FIX: Explicitly import the modal CSS so the popup styling is guaranteed to load on this page
// // // import '../../admin/LearnerFormModal/LearnerFormModal.css';

// // // type RoleFilter = 'all' | 'facilitator' | 'assessor' | 'moderator' | 'mentor';

// // // interface StaffViewProps {
// // //     staff: StaffMember[];
// // //     onAdd: () => void;
// // //     onDelete: (staff: StaffMember) => void;
// // // }

// // // const ROLE_CONFIG = {
// // //     facilitator: { label: 'Facilitator', dotClass: 'mlab-role-badge__dot', pillDot: 'mlab-role-pill__dot--blue', activePill: 'mlab-role-pill--active-facilitator', badge: 'mlab-role-badge--facilitator' },
// // //     assessor: { label: 'Assessor', dotClass: 'mlab-role-badge__dot', pillDot: 'mlab-role-pill__dot--red', activePill: 'mlab-role-pill--active-assessor', badge: 'mlab-role-badge--assessor' },
// // //     moderator: { label: 'Moderator', dotClass: 'mlab-role-badge__dot', pillDot: 'mlab-role-pill__dot--green', activePill: 'mlab-role-pill--active-moderator', badge: 'mlab-role-badge--moderator' },
// // //     mentor: { label: 'Mentor', dotClass: 'mlab-role-badge__dot', pillDot: 'mlab-role-pill__dot--orange', activePill: 'mlab-role-pill--active-mentor', badge: 'mlab-role-badge--mentor' },
// // // } as const;

// // // export const StaffView: React.FC<StaffViewProps> = ({ staff, onAdd, onDelete }) => {
// // //     const [searchTerm, setSearchTerm] = useState('');
// // //     const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

// // //     // We need the employers list to map the employerId to an actual company name
// // //     const { employers, fetchEmployers } = useStore();

// // //     useEffect(() => {
// // //         if (employers.length === 0) {
// // //             fetchEmployers();
// // //         }
// // //     }, [employers.length, fetchEmployers]);

// // //     const filtered = useMemo(() => {
// // //         return staff.filter(s => {
// // //             if (roleFilter !== 'all' && s.role !== roleFilter) return false;
// // //             if (searchTerm) {
// // //                 const q = searchTerm.toLowerCase();
// // //                 if (!(
// // //                     s.fullName?.toLowerCase().includes(q) ||
// // //                     s.email?.toLowerCase().includes(q) ||
// // //                     s.phone?.includes(searchTerm)
// // //                 )) return false;
// // //             }
// // //             return true;
// // //         });
// // //     }, [staff, roleFilter, searchTerm]);

// // //     // Counts per role for filter pills
// // //     const counts = useMemo(() => ({
// // //         all: staff.length,
// // //         facilitator: staff.filter(s => s.role === 'facilitator').length,
// // //         assessor: staff.filter(s => s.role === 'assessor').length,
// // //         moderator: staff.filter(s => s.role === 'moderator').length,
// // //         mentor: staff.filter(s => s.role === 'mentor').length,
// // //     }), [staff]);

// // //     const getEmployerName = (employerId?: string) => {
// // //         if (!employerId) return '—';
// // //         const emp = employers.find(e => e.id === employerId);
// // //         return emp ? emp.name : 'Unknown Company';
// // //     };

// // //     return (
// // //         <div className="mlab-staff animate-fade-in">

// // //             {/* ── Unified Toolbar (Local header removed to prevent double-headers) ── */}
// // //             <div className="mlab-staff__toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>

// // //                 {/* Search */}
// // //                 <div className="mlab-search" style={{ flex: '1 1 250px' }}>
// // //                     <Search size={17} color="var(--mlab-grey)" />
// // //                     <input
// // //                         type="text"
// // //                         placeholder="Search by name, email or phone…"
// // //                         value={searchTerm}
// // //                         onChange={e => setSearchTerm(e.target.value)}
// // //                     />
// // //                 </div>

// // //                 {/* Role Filter Pills */}
// // //                 <div className="mlab-role-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
// // //                     <button
// // //                         className={`mlab-role-pill ${roleFilter === 'all' ? 'mlab-role-pill--active-all' : ''}`}
// // //                         onClick={() => setRoleFilter('all')}
// // //                     >
// // //                         All ({counts.all})
// // //                     </button>

// // //                     {(['facilitator', 'assessor', 'moderator', 'mentor'] as const).map(role => {
// // //                         const cfg = ROLE_CONFIG[role];
// // //                         const isActive = roleFilter === role;
// // //                         return (
// // //                             <button
// // //                                 key={role}
// // //                                 className={`mlab-role-pill ${isActive ? cfg.activePill : ''}`}
// // //                                 onClick={() => setRoleFilter(role)}
// // //                             >
// // //                                 <span className={`mlab-role-pill__dot ${cfg.pillDot}`} />
// // //                                 {cfg.label} ({counts[role]})
// // //                             </button>
// // //                         );
// // //                     })}
// // //                 </div>

// // //                 {/* 🚀 Moved Action Button inside the toolbar and aligned it to the right */}
// // //                 <button
// // //                     className="mlab-btn mlab-btn--green"
// // //                     onClick={onAdd}
// // //                     style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
// // //                 >
// // //                     <Plus size={16} /> Add Staff
// // //                 </button>
// // //             </div>

// // //             {/* ── Result Count ────────────────────────────────────────────── */}
// // //             <p className="mlab-staff__count" style={{ marginTop: '1rem' }}>
// // //                 Showing <strong>{filtered.length}</strong> of {staff.length} staff members
// // //             </p>

// // //             {/* ── Table ──────────────────────────────────────────────────── */}
// // //             <div className="mlab-table-wrap">
// // //                 <table className="mlab-table">
// // //                     <thead>
// // //                         <tr>
// // //                             <th>Full Name</th>
// // //                             <th>Role</th>
// // //                             <th>Contact Info</th>
// // //                             <th>Workplace / Registry Info</th>
// // //                             <th>Actions</th>
// // //                         </tr>
// // //                     </thead>
// // //                     <tbody>
// // //                         {filtered.map(s => {
// // //                             const cfg = ROLE_CONFIG[s.role as keyof typeof ROLE_CONFIG];
// // //                             return (
// // //                                 <tr key={s.id}>

// // //                                     {/* Name */}
// // //                                     <td>
// // //                                         <span className="mlab-staff-name">{s.fullName}</span>
// // //                                     </td>

// // //                                     {/* Role Badge */}
// // //                                     <td>
// // //                                         <span className={`mlab-role-badge ${cfg?.badge ?? ''}`}>
// // //                                             <span className="mlab-role-badge__dot" />
// // //                                             {s.role.toUpperCase()}
// // //                                         </span>
// // //                                     </td>

// // //                                     {/* Contact Info */}
// // //                                     <td>
// // //                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
// // //                                             <span className="mlab-contact">{s.email}</span>
// // //                                             <span className={`mlab-contact ${!s.phone ? 'mlab-contact--muted' : ''}`} style={{ fontSize: '0.8rem' }}>
// // //                                                 {s.phone || 'No phone provided'}
// // //                                             </span>
// // //                                         </div>
// // //                                     </td>

// // //                                     {/* Meta / Workplace Info */}
// // //                                     <td>
// // //                                         {s.role === 'mentor' ? (
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#b45309', background: '#fffbeb', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fde68a', width: 'fit-content' }}>
// // //                                                 <Building2 size={13} />
// // //                                                 <strong>{getEmployerName(s.employerId)}</strong>
// // //                                             </div>
// // //                                         ) : ['assessor', 'moderator'].includes(s.role) ? (
// // //                                             <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
// // //                                                 <strong>Reg:</strong> {s.assessorRegNumber || <em style={{ opacity: 0.5 }}>Pending</em>}
// // //                                             </span>
// // //                                         ) : (
// // //                                             <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>—</span>
// // //                                         )}
// // //                                     </td>

// // //                                     {/* Actions */}
// // //                                     <td>
// // //                                         <button
// // //                                             className="mlab-icon-btn mlab-icon-btn--red"
// // //                                             onClick={() => onDelete(s)}
// // //                                             title="Remove Staff Member"
// // //                                         >
// // //                                             <Trash2 size={15} />
// // //                                         </button>
// // //                                     </td>
// // //                                 </tr>
// // //                             );
// // //                         })}

// // //                         {/* Empty / No Results */}
// // //                         {filtered.length === 0 && (
// // //                             <tr>
// // //                                 <td colSpan={5} className="mlab-table-empty">
// // //                                     <Users size={36} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // //                                     <span className="mlab-table-empty__title">
// // //                                         {staff.length === 0 ? 'No Staff Found' : 'No Results Match Your Filters'}
// // //                                     </span>
// // //                                     {staff.length === 0
// // //                                         ? 'Add a staff member to get started.'
// // //                                         : 'Try adjusting your search or role filter.'}
// // //                                 </td>
// // //                             </tr>
// // //                         )}
// // //                     </tbody>
// // //                 </table>
// // //             </div>
// // //         </div>
// // //     );
// // // };