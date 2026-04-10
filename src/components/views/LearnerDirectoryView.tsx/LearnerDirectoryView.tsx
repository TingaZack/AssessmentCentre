// src/components/views/LearnerDirectoryView/LearnerDirectoryView.tsx

import React, { useState, useMemo } from 'react';
import { Search, Mail, Phone, Eye, UserCheck, Users, ShieldAlert, GraduationCap, X, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardLearner } from '../../../types';

// 🚀 CRITICAL: Import WorkplacesManager CSS for the bespoke Header & Toolbar
import '../../admin/WorkplacesManager/WorkplacesManager.css';
// 🚀 Import the unified table styles (so mlab-table works perfectly)
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
                p.fullName?.toLowerCase().includes(s) ||
                p.idNumber?.includes(s) ||
                p.email?.toLowerCase().includes(s)
            );
        }

        return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
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
// import { Search, Mail, Phone, Eye, UserCheck, Users, ShieldAlert, GraduationCap, X } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import type { DashboardLearner } from '../../../types';

// // 🚀 CRITICAL: Import WorkplacesManager CSS for the bespoke Header & Toolbar
// import '../../admin/WorkplacesManager/WorkplacesManager.css';
// // 🚀 Import the unified table styles (so mlab-table works perfectly)
// import '../LearnersView/LearnersView.css';
// import './LearnerDirectoryView.css';

// interface LearnerDirectoryViewProps {
//     learners: DashboardLearner[];
// }

// export const LearnerDirectoryView: React.FC<LearnerDirectoryViewProps> = ({ learners }) => {
//     const navigate = useNavigate();
//     const [searchTerm, setSearchTerm] = useState('');

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

//         if (searchTerm.trim()) {
//             const s = searchTerm.toLowerCase();
//             results = results.filter(p =>
//                 p.fullName?.toLowerCase().includes(s) ||
//                 p.idNumber?.includes(s) ||
//                 p.email?.toLowerCase().includes(s)
//             );
//         }

//         return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
//     }, [learners, searchTerm]);

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
//             <div className="wm-toolbar">
//                 <div className="wm-search">
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
//                                             {searchTerm ? 'No matches found' : 'No Learners Found'}
//                                         </p>
//                                         <p className="wm-empty__desc">
//                                             {searchTerm
//                                                 ? 'Try adjusting your search criteria.'
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



// // // src/components/views/LearnerDirectoryView/LearnerDirectoryView.tsx

// // import React, { useState, useMemo } from 'react';
// // import { Search, Mail, Phone, Eye, UserCheck, Users, ShieldAlert, GraduationCap } from 'lucide-react';
// // import { useNavigate } from 'react-router-dom';
// // import type { DashboardLearner } from '../../../types';
// // import '../LearnersView/LearnersView.css';
// // import './LearnerDirectoryView.css';

// // interface LearnerDirectoryViewProps {
// //     learners: DashboardLearner[];
// // }

// // export const LearnerDirectoryView: React.FC<LearnerDirectoryViewProps> = ({ learners }) => {
// //     const navigate = useNavigate();
// //     const [searchTerm, setSearchTerm] = useState('');

// //     // ─── SMART GROUPING: EXTRACT UNIQUE HUMANS ───────────────────────────────
// //     const directoryData = useMemo(() => {
// //         const profileMap = new Map<string, any>();

// //         learners.forEach(l => {
// //             const humanId = l.learnerId || l.id;

// //             if (!profileMap.has(humanId)) {
// //                 profileMap.set(humanId, {
// //                     learnerId: humanId,
// //                     fullName: l.fullName,
// //                     idNumber: l.idNumber,
// //                     email: l.email,
// //                     phone: l.phone || l.mobile,
// //                     authStatus: l.authStatus || 'pending',
// //                     isArchived: l.isArchived,
// //                     enrollmentCount: 1,
// //                     latestCohort: l.cohortId,
// //                 });
// //             } else {
// //                 const existing = profileMap.get(humanId);
// //                 existing.enrollmentCount += 1;
// //                 if (!l.isArchived) existing.isArchived = false;
// //             }
// //         });

// //         let results = Array.from(profileMap.values());

// //         if (searchTerm.trim()) {
// //             const s = searchTerm.toLowerCase();
// //             results = results.filter(p =>
// //                 p.fullName?.toLowerCase().includes(s) ||
// //                 p.idNumber?.includes(s) ||
// //                 p.email?.toLowerCase().includes(s)
// //             );
// //         }

// //         return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
// //     }, [learners, searchTerm]);

// //     return (
// //         <div className="mlab-learners ld-root">

// //             {/* ── HEADER ── */}
// //             <div className="ld-header">
// //                 <div className="ld-header__identity">
// //                     <div className="ld-header__icon-box">
// //                         <Users size={24} />
// //                     </div>
// //                     <div>
// //                         <h2 className="ld-header__title">Master Directory</h2>
// //                         <p className="ld-header__sub">
// //                             {directoryData.length} unique individual{directoryData.length !== 1 ? 's' : ''} registered on the platform.
// //                         </p>
// //                     </div>
// //                 </div>

// //                 <div className="mlab-search ld-search">
// //                     <Search size={18} color="var(--mlab-grey)" />
// //                     <input
// //                         type="text"
// //                         placeholder="Search by name, ID or email…"
// //                         value={searchTerm}
// //                         onChange={e => setSearchTerm(e.target.value)}
// //                     />
// //                 </div>
// //             </div>

// //             {/* ── TABLE ── */}
// //             <div className="mlab-table-wrap">
// //                 <table className="mlab-table">
// //                     <thead>
// //                         <tr>
// //                             <th>Learner Identity</th>
// //                             <th>Contact Info</th>
// //                             <th>Auth Status</th>
// //                             <th>History</th>
// //                             <th className="ld-th--right">Actions</th>
// //                         </tr>
// //                     </thead>
// //                     <tbody>
// //                         {directoryData.length > 0 ? directoryData.map(profile => (
// //                             <tr key={profile.learnerId}>

// //                                 {/* Identity */}
// //                                 <td>
// //                                     <div className="ld-identity">
// //                                         <span className="ld-identity__name">{profile.fullName}</span>
// //                                         <span className="ld-identity__id">ID: {profile.idNumber}</span>
// //                                     </div>
// //                                 </td>

// //                                 {/* Contact */}
// //                                 <td>
// //                                     <div className="ld-contact">
// //                                         <div className="ld-contact__row">
// //                                             <Mail size={12} />
// //                                             <span>{profile.email || <em className="ld-empty-val">No email</em>}</span>
// //                                         </div>
// //                                         <div className="ld-contact__row">
// //                                             <Phone size={12} />
// //                                             <span>{profile.phone || <em className="ld-empty-val">No phone</em>}</span>
// //                                         </div>
// //                                     </div>
// //                                 </td>

// //                                 {/* Auth Status */}
// //                                 <td>
// //                                     {profile.authStatus === 'active' ? (
// //                                         <span className="mlab-badge mlab-badge--active ld-badge">
// //                                             <UserCheck size={12} /> Active
// //                                         </span>
// //                                     ) : (
// //                                         <span className="mlab-badge mlab-badge--draft ld-badge">
// //                                             <ShieldAlert size={12} /> Pending / Invited
// //                                         </span>
// //                                     )}
// //                                 </td>

// //                                 {/* Enrollments */}
// //                                 <td>
// //                                     <span className={`ld-enrol-chip${profile.enrollmentCount > 1 ? ' ld-enrol-chip--multi' : ''}`}>
// //                                         <GraduationCap size={14} />
// //                                         {profile.enrollmentCount} {profile.enrollmentCount === 1 ? 'Enrollment' : 'Enrollments'}
// //                                     </span>
// //                                 </td>

// //                                 {/* Actions */}
// //                                 <td className="ld-td--right">
// //                                     <button
// //                                         className="mlab-btn mlab-btn--outline mlab-btn--outline-blue ld-view-btn"
// //                                         onClick={() => navigate(`/admin/learners/${profile.learnerId}`)}
// //                                     >
// //                                         <Eye size={14} /> View 360° Profile
// //                                     </button>
// //                                 </td>
// //                             </tr>
// //                         )) : (
// //                             <tr>
// //                                 <td colSpan={5} style={{ padding: 0 }}>
// //                                     <div className="mlab-empty">
// //                                         <Users size={40} color="var(--mlab-green)" style={{ opacity: 0.6 }} />
// //                                         <p className="mlab-empty__title">No Learners Found</p>
// //                                         <p className="mlab-empty__desc">Try adjusting your search criteria.</p>
// //                                     </div>
// //                                 </td>
// //                             </tr>
// //                         )}
// //                     </tbody>
// //                 </table>
// //             </div>
// //         </div>
// //     );
// // };