// src/components/views/LearnerDirectoryView/LearnerDirectoryView.tsx

import React, { useState, useMemo } from 'react';
import { Search, Mail, Phone, Eye, UserCheck, Users, ShieldAlert, GraduationCap, X, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardLearner } from '../../../types';
import '../../admin/WorkplacesManager/WorkplacesManager.css';
import '../LearnersView/LearnersView.css';
import './LearnerDirectoryView.css';

interface LearnerDirectoryViewProps {
    learners: DashboardLearner[];
}

export const LearnerDirectoryView: React.FC<LearnerDirectoryViewProps> = ({ learners }) => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'pending'

    // ─── SMART GROUPING: EXTRACT UNIQUE HUMANS ───────────────────────────────
    const directoryData = useMemo(() => {
        const profileMap = new Map<string, any>();

        learners.forEach(l => {
            // 🚀 FIXED: GHOST SHIELD
            // Completely ignore any learner record that has no full name or no ID number
            if (!l.fullName || l.fullName.trim() === '' || !l.idNumber || l.idNumber.trim() === '') {
                return;
            }

            const humanId = l.learnerId || l.id;

            if (!profileMap.has(humanId)) {
                profileMap.set(humanId, {
                    learnerId: humanId,
                    fullName: l.fullName,
                    idNumber: l.idNumber,
                    email: l.email,
                    phone: l.phone || l.mobile,
                    authStatus: l.authStatus || 'pending',
                    isArchived: l.isArchived,
                    enrollmentCount: 1,
                    latestCohort: l.cohortId,
                });
            } else {
                const existing = profileMap.get(humanId);
                existing.enrollmentCount += 1;
                if (!l.isArchived) existing.isArchived = false;
            }
        });

        let results = Array.from(profileMap.values());

        // Apply Status Filter
        if (filterStatus !== 'all') {
            if (filterStatus === 'active') {
                results = results.filter(p => p.authStatus === 'active');
            } else if (filterStatus === 'pending') {
                results = results.filter(p => p.authStatus !== 'active');
            }
        }

        // Apply Text Search
        if (searchTerm.trim()) {
            const s = searchTerm.toLowerCase();
            results = results.filter(p =>
                (p.fullName && p.fullName.toLowerCase().includes(s)) ||
                (p.idNumber && p.idNumber.includes(s)) ||
                (p.email && p.email.toLowerCase().includes(s))
            );
        }

        // 🚀 FIXED: Robust Sorting. Falls back to empty string if undefined to prevent localeCompare crash
        return results.sort((a, b) => {
            const nameA = String(a.fullName || '');
            const nameB = String(b.fullName || '');
            return nameA.localeCompare(nameB);
        });
    }, [learners, searchTerm, filterStatus]);

    return (
        <div className="wm-root animate-fade-in">

            {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><Users size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Master Directory</h1>
                        <p className="wm-page-header__desc">
                            {directoryData.length} unique individual{directoryData.length !== 1 ? 's' : ''} registered on the platform.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── TOOLBAR (Reusing wm-toolbar styling) ── */}
            <div className="wm-toolbar" style={{ flexWrap: 'wrap' }}>
                {/* Search Bar */}
                <div className="wm-search" style={{ flex: '1 1 250px' }}>
                    <Search size={15} className="wm-search__icon" />
                    <input
                        type="text"
                        className="wm-search__input"
                        placeholder="Search by name, ID or email…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button className="wm-search__clear" onClick={() => setSearchTerm('')}><X size={13} /></button>
                    )}
                </div>

                {/* Status Filter */}
                <div className="wm-search" style={{ flex: 'none', minWidth: '180px' }}>
                    <Filter size={15} className="wm-search__icon" />
                    <select
                        className="wm-search__input"
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        style={{ cursor: 'pointer' }}
                    >
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="pending">Pending / Invited</option>
                    </select>
                </div>

                <div className="wm-toolbar__count">
                    {directoryData.length} learner{directoryData.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* ── TABLE (Restored original mlab-table structure) ── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Learner Identity</th>
                            <th>Contact Info</th>
                            <th>Auth Status</th>
                            <th>History</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {directoryData.length > 0 ? directoryData.map(profile => (
                            <tr key={profile.learnerId}>

                                {/* Identity */}
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '0.95rem' }}>
                                            {profile.fullName}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                            ID: {profile.idNumber}
                                        </span>
                                    </div>
                                </td>

                                {/* Contact */}
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>
                                            <Mail size={12} color="var(--mlab-grey-light)" />
                                            <span>{profile.email || <em style={{ color: 'var(--mlab-grey-light)' }}>No email</em>}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
                                            <Phone size={12} color="var(--mlab-grey-light)" />
                                            <span>{profile.phone || <em style={{ color: 'var(--mlab-grey-light)' }}>No phone</em>}</span>
                                        </div>
                                    </div>
                                </td>

                                {/* Auth Status */}
                                <td>
                                    {profile.authStatus === 'active' ? (
                                        <span className="mlab-badge mlab-badge--active" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                            <UserCheck size={12} /> Active
                                        </span>
                                    ) : (
                                        <span className="mlab-badge mlab-badge--draft" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                            <ShieldAlert size={12} /> Pending / Invited
                                        </span>
                                    )}
                                </td>

                                {/* Enrollments */}
                                <td>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase',
                                        background: profile.enrollmentCount > 1 ? '#e0e7ff' : '#f1f5f9',
                                        color: profile.enrollmentCount > 1 ? '#3730a3' : '#475569',
                                        padding: '4px 8px', borderRadius: '4px', border: `1px solid ${profile.enrollmentCount > 1 ? '#c7d2fe' : '#e2e8f0'}`
                                    }}>
                                        <GraduationCap size={14} />
                                        {profile.enrollmentCount} {profile.enrollmentCount === 1 ? 'Enrollment' : 'Enrollments'}
                                    </span>
                                </td>

                                {/* Actions */}
                                <td style={{ textAlign: 'right' }}>
                                    <button
                                        className="wm-btn wm-btn--ghost"
                                        onClick={() => navigate(`/admin/learners/${profile.learnerId}`)}
                                        style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                    >
                                        <Eye size={13} /> View 360° Profile
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={5} style={{ padding: 0 }}>
                                    {/* ── EMPTY STATE (Reusing wm-empty styling) ── */}
                                    <div className="wm-empty" style={{ margin: '2rem', border: 'none', background: 'transparent' }}>
                                        <div className="wm-empty__icon"><Users size={36} /></div>
                                        <p className="wm-empty__title">
                                            {searchTerm || filterStatus !== 'all' ? 'No matches found' : 'No Learners Found'}
                                        </p>
                                        <p className="wm-empty__desc">
                                            {searchTerm || filterStatus !== 'all'
                                                ? 'Try adjusting your search or filter criteria.'
                                                : 'No learners have registered on the platform yet.'}
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


// // src/components/views/LearnerDirectoryView/LearnerDirectoryView.tsx

// import React, { useState, useMemo } from 'react';
// import { Search, Mail, Phone, Eye, UserCheck, Users, ShieldAlert, GraduationCap, X, Filter } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import type { DashboardLearner } from '../../../types';
// import '../../admin/WorkplacesManager/WorkplacesManager.css';
// import '../LearnersView/LearnersView.css';
// import './LearnerDirectoryView.css';

// interface LearnerDirectoryViewProps {
//     learners: DashboardLearner[];
// }

// export const LearnerDirectoryView: React.FC<LearnerDirectoryViewProps> = ({ learners }) => {
//     const navigate = useNavigate();
//     const [searchTerm, setSearchTerm] = useState('');
//     const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'pending'

//     // ─── SMART GROUPING: EXTRACT UNIQUE HUMANS ───────────────────────────────
//     const directoryData = useMemo(() => {
//         const profileMap = new Map<string, any>();

//         learners.forEach(l => {
//             const humanId = l.learnerId || l.id;

//             if (!profileMap.has(humanId)) {
//                 profileMap.set(humanId, {
//                     learnerId: humanId,
//                     fullName: l.fullName,
//                     idNumber: l.idNumber,
//                     email: l.email,
//                     phone: l.phone || l.mobile,
//                     authStatus: l.authStatus || 'pending',
//                     isArchived: l.isArchived,
//                     enrollmentCount: 1,
//                     latestCohort: l.cohortId,
//                 });
//             } else {
//                 const existing = profileMap.get(humanId);
//                 existing.enrollmentCount += 1;
//                 if (!l.isArchived) existing.isArchived = false;
//             }
//         });

//         let results = Array.from(profileMap.values());

//         // Apply Status Filter
//         if (filterStatus !== 'all') {
//             if (filterStatus === 'active') {
//                 results = results.filter(p => p.authStatus === 'active');
//             } else if (filterStatus === 'pending') {
//                 results = results.filter(p => p.authStatus !== 'active');
//             }
//         }

//         // Apply Text Search
//         if (searchTerm.trim()) {
//             const s = searchTerm.toLowerCase();
//             results = results.filter(p =>
//                 p.fullName?.toLowerCase().includes(s) ||
//                 p.idNumber?.includes(s) ||
//                 p.email?.toLowerCase().includes(s)
//             );
//         }

//         return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
//     }, [learners, searchTerm, filterStatus]);

//     return (
//         <div className="wm-root animate-fade-in">

//             {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
//             <div className="wm-page-header">
//                 <div className="wm-page-header__left">
//                     <div className="wm-page-header__icon"><Users size={22} /></div>
//                     <div>
//                         <h1 className="wm-page-header__title">Master Directory</h1>
//                         <p className="wm-page-header__desc">
//                             {directoryData.length} unique individual{directoryData.length !== 1 ? 's' : ''} registered on the platform.
//                         </p>
//                     </div>
//                 </div>
//             </div>

//             {/* ── TOOLBAR (Reusing wm-toolbar styling) ── */}
//             <div className="wm-toolbar" style={{ flexWrap: 'wrap' }}>
//                 {/* Search Bar */}
//                 <div className="wm-search" style={{ flex: '1 1 250px' }}>
//                     <Search size={15} className="wm-search__icon" />
//                     <input
//                         type="text"
//                         className="wm-search__input"
//                         placeholder="Search by name, ID or email…"
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                     />
//                     {searchTerm && (
//                         <button className="wm-search__clear" onClick={() => setSearchTerm('')}><X size={13} /></button>
//                     )}
//                 </div>

//                 {/* Status Filter */}
//                 <div className="wm-search" style={{ flex: 'none', minWidth: '180px' }}>
//                     <Filter size={15} className="wm-search__icon" />
//                     <select
//                         className="wm-search__input"
//                         value={filterStatus}
//                         onChange={e => setFilterStatus(e.target.value)}
//                         style={{ cursor: 'pointer' }}
//                     >
//                         <option value="all">All Statuses</option>
//                         <option value="active">Active</option>
//                         <option value="pending">Pending / Invited</option>
//                     </select>
//                 </div>

//                 <div className="wm-toolbar__count">
//                     {directoryData.length} learner{directoryData.length !== 1 ? 's' : ''}
//                 </div>
//             </div>

//             {/* ── TABLE (Restored original mlab-table structure) ── */}
//             <div className="mlab-table-wrap">
//                 <table className="mlab-table">
//                     <thead>
//                         <tr>
//                             <th>Learner Identity</th>
//                             <th>Contact Info</th>
//                             <th>Auth Status</th>
//                             <th>History</th>
//                             <th style={{ textAlign: 'right' }}>Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {directoryData.length > 0 ? directoryData.map(profile => (
//                             <tr key={profile.learnerId}>

//                                 {/* Identity */}
//                                 <td>
//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
//                                         <span style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '0.95rem' }}>
//                                             {profile.fullName}
//                                         </span>
//                                         <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
//                                             ID: {profile.idNumber}
//                                         </span>
//                                     </div>
//                                 </td>

//                                 {/* Contact */}
//                                 <td>
//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>
//                                             <Mail size={12} color="var(--mlab-grey-light)" />
//                                             <span>{profile.email || <em style={{ color: 'var(--mlab-grey-light)' }}>No email</em>}</span>
//                                         </div>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
//                                             <Phone size={12} color="var(--mlab-grey-light)" />
//                                             <span>{profile.phone || <em style={{ color: 'var(--mlab-grey-light)' }}>No phone</em>}</span>
//                                         </div>
//                                     </div>
//                                 </td>

//                                 {/* Auth Status */}
//                                 <td>
//                                     {profile.authStatus === 'active' ? (
//                                         <span className="mlab-badge mlab-badge--active" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
//                                             <UserCheck size={12} /> Active
//                                         </span>
//                                     ) : (
//                                         <span className="mlab-badge mlab-badge--draft" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
//                                             <ShieldAlert size={12} /> Pending / Invited
//                                         </span>
//                                     )}
//                                 </td>

//                                 {/* Enrollments */}
//                                 <td>
//                                     <span style={{
//                                         display: 'inline-flex', alignItems: 'center', gap: '6px',
//                                         fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase',
//                                         background: profile.enrollmentCount > 1 ? '#e0e7ff' : '#f1f5f9',
//                                         color: profile.enrollmentCount > 1 ? '#3730a3' : '#475569',
//                                         padding: '4px 8px', borderRadius: '4px', border: `1px solid ${profile.enrollmentCount > 1 ? '#c7d2fe' : '#e2e8f0'}`
//                                     }}>
//                                         <GraduationCap size={14} />
//                                         {profile.enrollmentCount} {profile.enrollmentCount === 1 ? 'Enrollment' : 'Enrollments'}
//                                     </span>
//                                 </td>

//                                 {/* Actions */}
//                                 <td style={{ textAlign: 'right' }}>
//                                     <button
//                                         className="wm-btn wm-btn--ghost"
//                                         onClick={() => navigate(`/admin/learners/${profile.learnerId}`)}
//                                         style={{ fontSize: '0.7rem', padding: '4px 10px' }}
//                                     >
//                                         <Eye size={13} /> View 360° Profile
//                                     </button>
//                                 </td>
//                             </tr>
//                         )) : (
//                             <tr>
//                                 <td colSpan={5} style={{ padding: 0 }}>
//                                     {/* ── EMPTY STATE (Reusing wm-empty styling) ── */}
//                                     <div className="wm-empty" style={{ margin: '2rem', border: 'none', background: 'transparent' }}>
//                                         <div className="wm-empty__icon"><Users size={36} /></div>
//                                         <p className="wm-empty__title">
//                                             {searchTerm || filterStatus !== 'all' ? 'No matches found' : 'No Learners Found'}
//                                         </p>
//                                         <p className="wm-empty__desc">
//                                             {searchTerm || filterStatus !== 'all'
//                                                 ? 'Try adjusting your search or filter criteria.'
//                                                 : 'No learners have registered on the platform yet.'}
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

