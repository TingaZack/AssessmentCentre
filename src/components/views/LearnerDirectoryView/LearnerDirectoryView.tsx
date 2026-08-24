// src/components/views/LearnerDirectoryView/LearnerDirectoryView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { Search, Mail, Phone, Eye, UserCheck, Users, ShieldAlert, GraduationCap, X, Filter, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { DashboardLearner } from '../../../types';
import '../../admin/WorkplacesManager/WorkplacesManager.css';
import '../LearnersView/LearnersView.css';
import './LearnerDirectoryView.css';

interface LearnerDirectoryViewProps {
    learners: DashboardLearner[];
}

const ITEMS_PER_PAGE = 50;

// Helper to convert Firestore Timestamps, ISO strings, or numbers safely to milliseconds
const getTimestampMs = (val: any): number => {
    if (!val) return 0;
    if (typeof val?.toDate === 'function') return val.toDate().getTime();
    if (val?.seconds) return val.seconds * 1000;
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
};

// Formats timestamp into a clean, human-readable South African date & time
const formatLastLogin = (lastLoginAt: any): string => {
    const ms = getTimestampMs(lastLoginAt);
    if (!ms) return 'Never';

    const date = new Date(ms);
    return date.toLocaleString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const LearnerDirectoryView: React.FC<LearnerDirectoryViewProps> = ({ learners }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // ─── URL-BOUND VIEW & FILTER PARAMETERS ───
    const urlSearchTerm = searchParams.get('q') || '';
    const filterStatus = searchParams.get('status') || 'all';
    const currentPage = parseInt(searchParams.get('page') || '1', 10);

    const [localSearch, setLocalSearch] = useState(urlSearchTerm);

    // Sync URL changes to local state
    useEffect(() => {
        if (localSearch !== urlSearchTerm) {
            setLocalSearch(urlSearchTerm);
        }
    }, [urlSearchTerm]);

    // Debounce search input to prevent lag on every keystroke
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localSearch !== searchParams.get('q') && !(localSearch === '' && !searchParams.get('q'))) {
                updateUrlParam('q', localSearch);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [localSearch]);

    const updateUrlParam = (key: string, value: string | number | null) => {
        const nextParams = new URLSearchParams(searchParams);

        if (!value || value === 'all') {
            nextParams.delete(key);
        } else {
            nextParams.set(key, String(value));
        }

        // Always reset to page 1 when filters change
        if (key !== 'page') {
            nextParams.delete('page');
        }

        setSearchParams(nextParams, { replace: true });
    };

    const handleClearFilters = () => {
        const nextParams = new URLSearchParams(searchParams);
        ['q', 'status', 'page'].forEach(k => nextParams.delete(k));
        setLocalSearch('');
        setSearchParams(nextParams, { replace: true });
    };

    const hasActiveFilters = urlSearchTerm !== '' || filterStatus !== 'all';

    // ─── SMART GROUPING: EXTRACT UNIQUE HUMANS & RECENT LOGIN ───────────────────────────────
    const directoryData = useMemo(() => {
        const profileMap = new Map<string, any>();

        learners.forEach(l => {
            // GHOST SHIELD: Ignore any learner record that has no full name or no ID number
            if (!l.fullName || l.fullName.trim() === '' || !l.idNumber || l.idNumber.trim() === '') {
                return;
            }

            const humanId = l.learnerId || l.id;
            const learnerLogin = (l as any).lastLoginAt || (l as any).lastLoginAt || null;

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
                    lastLoginAt: learnerLogin,
                });
            } else {
                const existing = profileMap.get(humanId);
                existing.enrollmentCount += 1;
                if (!l.isArchived) existing.isArchived = false;

                // Pick the most recent login timestamp across duplicate/enrolment records
                if (getTimestampMs(learnerLogin) > getTimestampMs(existing.lastLoginAt)) {
                    existing.lastLoginAt = learnerLogin;
                }
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
        if (urlSearchTerm.trim()) {
            const s = urlSearchTerm.toLowerCase();
            results = results.filter(p =>
                (p.fullName && p.fullName.toLowerCase().includes(s)) ||
                (p.idNumber && p.idNumber.includes(s)) ||
                (p.email && p.email.toLowerCase().includes(s))
            );
        }

        // Robust Sorting
        return results.sort((a, b) => {
            const nameA = String(a.fullName || '');
            const nameB = String(b.fullName || '');
            return nameA.localeCompare(nameB);
        });
    }, [learners, urlSearchTerm, filterStatus]);

    // ─── PAGINATION LOGIC ───
    const totalPages = Math.ceil(directoryData.length / ITEMS_PER_PAGE);
    const paginatedData = useMemo(() => {
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        return directoryData.slice(startIdx, startIdx + ITEMS_PER_PAGE);
    }, [directoryData, currentPage]);

    return (
        <div className="wm-root animate-fade-in mlab-learners">

            {/* 🚀 STRICT MLAB STYLING OVERRIDES FOR UI/UX ALIGNMENT */}
            <style>{`
                .mlab-learners .wm-search__input,
                .mlab-learners .wm-btn,
                .mlab-learners .mlab-btn,
                .mlab-learners .mlab-table-wrap,
                .mlab-learners .mlab-badge {
                    border-radius: 0 !important;
                }
                .wm-btn, .mlab-btn { 
                    text-transform: uppercase; font-family: var(--font-heading); 
                    font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; 
                }
            `}</style>

            {/* ── PAGE HEADER ── */}
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

            {/* ── TOOLBAR ── */}
            <div className="wm-toolbar" style={{ flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
                {/* Search Bar */}
                <div className="wm-search" style={{ flex: '1 1 250px' }}>
                    <Search size={15} className="wm-search__icon" color="var(--mlab-grey)" />
                    <input
                        type="text"
                        className="wm-search__input"
                        placeholder="Search by name, ID or email…"
                        value={localSearch}
                        onChange={e => setLocalSearch(e.target.value)}
                    />
                    {localSearch && (
                        <button className="wm-search__clear" onClick={() => updateUrlParam('q', '')}><X size={13} color="var(--mlab-grey)" /></button>
                    )}
                </div>

                {/* Status Filter */}
                <div className="wm-search" style={{ flex: 'none', minWidth: '180px' }}>
                    <Filter size={15} className="wm-search__icon" color="var(--mlab-grey)" />
                    <select
                        className="wm-search__input"
                        value={filterStatus}
                        onChange={e => updateUrlParam('status', e.target.value)}
                        style={{ cursor: 'pointer' }}
                    >
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="pending">Pending / Invited</option>
                    </select>
                </div>

                {hasActiveFilters && (
                    <button
                        className="mlab-btn mlab-btn--ghost"
                        onClick={handleClearFilters}
                        title="Clear all filters"
                        style={{ padding: '0.4rem 0.75rem', background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}
                    >
                        <X size={14} /> Clear
                    </button>
                )}

                <div className="wm-toolbar__count" style={{ marginLeft: 'auto' }}>
                    {directoryData.length} learner{directoryData.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* ── TABLE ── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Learner Identity</th>
                            <th>Contact Info</th>
                            <th>Auth Status</th>
                            <th>Last Active</th>
                            <th>History</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.length > 0 ? paginatedData.map(profile => (
                            <tr key={profile.learnerId} className="animate-fade-in" style={{ transition: 'all 0.2s' }}>

                                {/* Identity */}
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>
                                            {profile.fullName}
                                        </span>
                                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>
                                            ID: {profile.idNumber}
                                        </span>
                                    </div>
                                </td>

                                {/* Contact */}
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
                                            <Mail size={12} color="var(--mlab-grey)" />
                                            <span>{profile.email || <em style={{ color: 'var(--mlab-grey-light)' }}>No email</em>}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
                                            <Phone size={12} color="var(--mlab-grey)" />
                                            <span>{profile.phone || <em style={{ color: 'var(--mlab-grey-light)' }}>No phone</em>}</span>
                                        </div>
                                    </div>
                                </td>

                                {/* Auth Status */}
                                <td>
                                    {profile.authStatus === 'active' ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', border: '1px solid #bae6fd', borderRadius: 0 }}>
                                            <UserCheck size={12} /> Active
                                        </span>
                                    ) : (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: 0 }}>
                                            <ShieldAlert size={12} /> Pending / Invited
                                        </span>
                                    )}
                                </td>

                                {/* 🚀 LAST ACTIVE COLUMN */}
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: profile.lastLoginAt ? 'var(--mlab-midnight)' : 'var(--mlab-grey-light)' }}>
                                        <Clock size={12} color={profile.lastLoginAt ? "var(--mlab-blue)" : "var(--mlab-grey-light)"} />
                                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: profile.lastLoginAt ? 500 : 400 }}>
                                            {formatLastLogin(profile.lastLoginAt)}
                                        </span>
                                    </div>
                                </td>

                                {/* Enrollments */}
                                <td>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase',
                                        background: profile.enrollmentCount > 1 ? '#eff6ff' : 'var(--mlab-bg)',
                                        color: profile.enrollmentCount > 1 ? '#1d4ed8' : 'var(--mlab-grey)',
                                        padding: '4px 8px', borderRadius: 0, border: `1px solid ${profile.enrollmentCount > 1 ? '#bfdbfe' : 'var(--mlab-border)'}`
                                    }}>
                                        <GraduationCap size={14} />
                                        {profile.enrollmentCount} {profile.enrollmentCount === 1 ? 'Enrollment' : 'Enrollments'}
                                    </span>
                                </td>

                                {/* Actions */}
                                <td style={{ textAlign: 'right' }}>
                                    <button
                                        className="mlab-btn mlab-btn--ghost"
                                        onClick={() => navigate(`/admin/learners/${profile.learnerId}`)}
                                        style={{ fontSize: '0.7rem', padding: '6px 12px', color: 'var(--mlab-blue)', borderColor: 'var(--mlab-border)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <Eye size={13} /> View 360° Profile
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={6} style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--mlab-grey)', background: 'var(--mlab-white)' }}>
                                    <Users size={36} color="var(--mlab-grey)" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                    <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                                        {urlSearchTerm || filterStatus !== 'all' ? 'No matches found' : 'No Learners Found'}
                                    </p>
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                                        {urlSearchTerm || filterStatus !== 'all'
                                            ? 'Try adjusting your search or filter criteria.'
                                            : 'No learners have registered on the platform yet.'}
                                    </p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── PAGINATION PANEL CONTROLS ── */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '1.5rem', borderTop: '1px solid var(--mlab-border)', background: 'var(--mlab-white)' }}>
                    <button className="mlab-btn mlab-btn--ghost" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => updateUrlParam('page', currentPage - 1)} disabled={currentPage === 1}>
                        <ChevronLeft size={16} /> Prev
                    </button>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600, padding: '0 10px' }}>
                        Page {currentPage} of {totalPages} (Total: {directoryData.length})
                    </span>
                    <button className="mlab-btn mlab-btn--ghost" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => updateUrlParam('page', currentPage + 1)} disabled={currentPage === totalPages}>
                        Next <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
};


// // src/components/views/LearnerDirectoryView/LearnerDirectoryView.tsx

// import React, { useState, useMemo, useEffect } from 'react';
// import { Search, Mail, Phone, Eye, UserCheck, Users, ShieldAlert, GraduationCap, X, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
// import { useNavigate, useSearchParams } from 'react-router-dom';
// import type { DashboardLearner } from '../../../types';
// import '../../admin/WorkplacesManager/WorkplacesManager.css';
// import '../LearnersView/LearnersView.css';
// import './LearnerDirectoryView.css';

// interface LearnerDirectoryViewProps {
//     learners: DashboardLearner[];
// }

// const ITEMS_PER_PAGE = 50;

// export const LearnerDirectoryView: React.FC<LearnerDirectoryViewProps> = ({ learners }) => {
//     const navigate = useNavigate();
//     const [searchParams, setSearchParams] = useSearchParams();

//     // ─── URL-BOUND VIEW & FILTER PARAMETERS ───
//     const urlSearchTerm = searchParams.get('q') || '';
//     const filterStatus = searchParams.get('status') || 'all';
//     const currentPage = parseInt(searchParams.get('page') || '1', 10);

//     const [localSearch, setLocalSearch] = useState(urlSearchTerm);

//     // Sync URL changes to local state
//     useEffect(() => {
//         if (localSearch !== urlSearchTerm) {
//             setLocalSearch(urlSearchTerm);
//         }
//     }, [urlSearchTerm]);

//     // Debounce search input to prevent lag on every keystroke
//     useEffect(() => {
//         const timer = setTimeout(() => {
//             if (localSearch !== searchParams.get('q') && !(localSearch === '' && !searchParams.get('q'))) {
//                 updateUrlParam('q', localSearch);
//             }
//         }, 300);
//         return () => clearTimeout(timer);
//     }, [localSearch]);

//     const updateUrlParam = (key: string, value: string | number | null) => {
//         const nextParams = new URLSearchParams(searchParams);

//         if (!value || value === 'all') {
//             nextParams.delete(key);
//         } else {
//             nextParams.set(key, String(value));
//         }

//         // Always reset to page 1 when filters change
//         if (key !== 'page') {
//             nextParams.delete('page');
//         }

//         setSearchParams(nextParams, { replace: true });
//     };

//     const handleClearFilters = () => {
//         const nextParams = new URLSearchParams(searchParams);
//         ['q', 'status', 'page'].forEach(k => nextParams.delete(k));
//         setLocalSearch('');
//         setSearchParams(nextParams, { replace: true });
//     };

//     const hasActiveFilters = urlSearchTerm !== '' || filterStatus !== 'all';

//     // ─── SMART GROUPING: EXTRACT UNIQUE HUMANS ───────────────────────────────
//     const directoryData = useMemo(() => {
//         const profileMap = new Map<string, any>();

//         learners.forEach(l => {
//             // GHOST SHIELD: Ignore any learner record that has no full name or no ID number
//             if (!l.fullName || l.fullName.trim() === '' || !l.idNumber || l.idNumber.trim() === '') {
//                 return;
//             }

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
//         if (urlSearchTerm.trim()) {
//             const s = urlSearchTerm.toLowerCase();
//             results = results.filter(p =>
//                 (p.fullName && p.fullName.toLowerCase().includes(s)) ||
//                 (p.idNumber && p.idNumber.includes(s)) ||
//                 (p.email && p.email.toLowerCase().includes(s))
//             );
//         }

//         // Robust Sorting
//         return results.sort((a, b) => {
//             const nameA = String(a.fullName || '');
//             const nameB = String(b.fullName || '');
//             return nameA.localeCompare(nameB);
//         });
//     }, [learners, urlSearchTerm, filterStatus]);

//     // ─── PAGINATION LOGIC ───
//     const totalPages = Math.ceil(directoryData.length / ITEMS_PER_PAGE);
//     const paginatedData = useMemo(() => {
//         const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
//         return directoryData.slice(startIdx, startIdx + ITEMS_PER_PAGE);
//     }, [directoryData, currentPage]);

//     return (
//         <div className="wm-root animate-fade-in mlab-learners">

//             {/* 🚀 STRICT MLAB STYLING OVERRIDES FOR UI/UX ALIGNMENT */}
//             <style>{`
//                 .mlab-learners .wm-search__input,
//                 .mlab-learners .wm-btn,
//                 .mlab-learners .mlab-btn,
//                 .mlab-learners .mlab-table-wrap,
//                 .mlab-learners .mlab-badge {
//                     border-radius: 0 !important;
//                 }
//                 .wm-btn, .mlab-btn { 
//                     text-transform: uppercase; font-family: var(--font-heading); 
//                     font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; 
//                 }
//             `}</style>

//             {/* ── PAGE HEADER ── */}
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

//             {/* ── TOOLBAR ── */}
//             <div className="wm-toolbar" style={{ flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
//                 {/* Search Bar */}
//                 <div className="wm-search" style={{ flex: '1 1 250px' }}>
//                     <Search size={15} className="wm-search__icon" color="var(--mlab-grey)" />
//                     <input
//                         type="text"
//                         className="wm-search__input"
//                         placeholder="Search by name, ID or email…"
//                         value={localSearch}
//                         onChange={e => setLocalSearch(e.target.value)}
//                     />
//                     {localSearch && (
//                         <button className="wm-search__clear" onClick={() => updateUrlParam('q', '')}><X size={13} color="var(--mlab-grey)" /></button>
//                     )}
//                 </div>

//                 {/* Status Filter */}
//                 <div className="wm-search" style={{ flex: 'none', minWidth: '180px' }}>
//                     <Filter size={15} className="wm-search__icon" color="var(--mlab-grey)" />
//                     <select
//                         className="wm-search__input"
//                         value={filterStatus}
//                         onChange={e => updateUrlParam('status', e.target.value)}
//                         style={{ cursor: 'pointer' }}
//                     >
//                         <option value="all">All Statuses</option>
//                         <option value="active">Active</option>
//                         <option value="pending">Pending / Invited</option>
//                     </select>
//                 </div>

//                 {hasActiveFilters && (
//                     <button
//                         className="mlab-btn mlab-btn--ghost"
//                         onClick={handleClearFilters}
//                         title="Clear all filters"
//                         style={{ padding: '0.4rem 0.75rem', background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}
//                     >
//                         <X size={14} /> Clear
//                     </button>
//                 )}

//                 <div className="wm-toolbar__count" style={{ marginLeft: 'auto' }}>
//                     {directoryData.length} learner{directoryData.length !== 1 ? 's' : ''}
//                 </div>
//             </div>

//             {/* ── TABLE ── */}
//             <div className="mlab-table-wrap">
//                 {/* <table className="mlab-table">
//                     <thead style={{ background: 'var(--mlab-light-blue)' }}>
//                         <tr>
//                             <th style={{ color: 'var(--mlab-grey)', borderTop: 'none', borderBottom: '2px solid var(--mlab-border)' }}>Learner Identity</th>
//                             <th style={{ color: 'var(--mlab-grey)', borderTop: 'none', borderBottom: '2px solid var(--mlab-border)' }}>Contact Info</th>
//                             <th style={{ color: 'var(--mlab-grey)', borderTop: 'none', borderBottom: '2px solid var(--mlab-border)' }}>Auth Status</th>
//                             <th style={{ color: 'var(--mlab-grey)', borderTop: 'none', borderBottom: '2px solid var(--mlab-border)' }}>History</th>
//                             <th style={{ textAlign: 'right', color: 'var(--mlab-grey)', borderTop: 'none', borderBottom: '2px solid var(--mlab-border)' }}>Actions</th>
//                         </tr>
//                     </thead> */}
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
//                         {paginatedData.length > 0 ? paginatedData.map(profile => (
//                             <tr key={profile.learnerId} className="animate-fade-in" style={{ transition: 'all 0.2s' }}>

//                                 {/* Identity */}
//                                 <td>
//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
//                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>
//                                             {profile.fullName}
//                                         </span>
//                                         <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>
//                                             ID: {profile.idNumber}
//                                         </span>
//                                     </div>
//                                 </td>

//                                 {/* Contact */}
//                                 <td>
//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
//                                             <Mail size={12} color="var(--mlab-grey)" />
//                                             <span>{profile.email || <em style={{ color: 'var(--mlab-grey-light)' }}>No email</em>}</span>
//                                         </div>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
//                                             <Phone size={12} color="var(--mlab-grey)" />
//                                             <span>{profile.phone || <em style={{ color: 'var(--mlab-grey-light)' }}>No phone</em>}</span>
//                                         </div>
//                                     </div>
//                                 </td>

//                                 {/* Auth Status */}
//                                 <td>
//                                     {profile.authStatus === 'active' ? (
//                                         <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', border: '1px solid #bae6fd', borderRadius: 0 }}>
//                                             <UserCheck size={12} /> Active
//                                         </span>
//                                     ) : (
//                                         <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: 0 }}>
//                                             <ShieldAlert size={12} /> Pending / Invited
//                                         </span>
//                                     )}
//                                 </td>

//                                 {/* Enrollments */}
//                                 <td>
//                                     <span style={{
//                                         display: 'inline-flex', alignItems: 'center', gap: '6px',
//                                         fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase',
//                                         background: profile.enrollmentCount > 1 ? '#eff6ff' : 'var(--mlab-bg)',
//                                         color: profile.enrollmentCount > 1 ? '#1d4ed8' : 'var(--mlab-grey)',
//                                         padding: '4px 8px', borderRadius: 0, border: `1px solid ${profile.enrollmentCount > 1 ? '#bfdbfe' : 'var(--mlab-border)'}`
//                                     }}>
//                                         <GraduationCap size={14} />
//                                         {profile.enrollmentCount} {profile.enrollmentCount === 1 ? 'Enrollment' : 'Enrollments'}
//                                     </span>
//                                 </td>

//                                 {/* Actions */}
//                                 <td style={{ textAlign: 'right' }}>
//                                     <button
//                                         className="mlab-btn mlab-btn--ghost"
//                                         onClick={() => navigate(`/admin/learners/${profile.learnerId}`)}
//                                         style={{ fontSize: '0.7rem', padding: '6px 12px', color: 'var(--mlab-blue)', borderColor: 'var(--mlab-border)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
//                                     >
//                                         <Eye size={13} /> View 360° Profile
//                                     </button>
//                                 </td>
//                             </tr>
//                         )) : (
//                             <tr>
//                                 <td colSpan={5} style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--mlab-grey)', background: 'var(--mlab-white)' }}>
//                                     <Users size={36} color="var(--mlab-grey)" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
//                                     <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
//                                         {urlSearchTerm || filterStatus !== 'all' ? 'No matches found' : 'No Learners Found'}
//                                     </p>
//                                     <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
//                                         {urlSearchTerm || filterStatus !== 'all'
//                                             ? 'Try adjusting your search or filter criteria.'
//                                             : 'No learners have registered on the platform yet.'}
//                                     </p>
//                                 </td>
//                             </tr>
//                         )}
//                     </tbody>
//                 </table>
//             </div>

//             {/* ── PAGINATION PANEL CONTROLS ── */}
//             {totalPages > 1 && (
//                 <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '1.5rem', borderTop: '1px solid var(--mlab-border)', background: 'var(--mlab-white)' }}>
//                     <button className="mlab-btn mlab-btn--ghost" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => updateUrlParam('page', currentPage - 1)} disabled={currentPage === 1}>
//                         <ChevronLeft size={16} /> Prev
//                     </button>
//                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600, padding: '0 10px' }}>
//                         Page {currentPage} of {totalPages} (Total: {directoryData.length})
//                     </span>
//                     <button className="mlab-btn mlab-btn--ghost" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => updateUrlParam('page', currentPage + 1)} disabled={currentPage === totalPages}>
//                         Next <ChevronRight size={16} />
//                     </button>
//                 </div>
//             )}
//         </div>
//     );
// };



// // // src/components/views/LearnerDirectoryView/LearnerDirectoryView.tsx

// // import React, { useState, useMemo } from 'react';
// // import { Search, Mail, Phone, Eye, UserCheck, Users, ShieldAlert, GraduationCap, X, Filter } from 'lucide-react';
// // import { useNavigate } from 'react-router-dom';
// // import type { DashboardLearner } from '../../../types';
// // import '../../admin/WorkplacesManager/WorkplacesManager.css';
// // import '../LearnersView/LearnersView.css';
// // import './LearnerDirectoryView.css';

// // interface LearnerDirectoryViewProps {
// //     learners: DashboardLearner[];
// // }

// // export const LearnerDirectoryView: React.FC<LearnerDirectoryViewProps> = ({ learners }) => {
// //     const navigate = useNavigate();
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'pending'

// //     // ─── SMART GROUPING: EXTRACT UNIQUE HUMANS ───────────────────────────────
// //     const directoryData = useMemo(() => {
// //         const profileMap = new Map<string, any>();

// //         learners.forEach(l => {
// //             //  GHOST SHIELD
// //             // Completely ignore any learner record that has no full name or no ID number
// //             if (!l.fullName || l.fullName.trim() === '' || !l.idNumber || l.idNumber.trim() === '') {
// //                 return;
// //             }

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

// //         // Apply Status Filter
// //         if (filterStatus !== 'all') {
// //             if (filterStatus === 'active') {
// //                 results = results.filter(p => p.authStatus === 'active');
// //             } else if (filterStatus === 'pending') {
// //                 results = results.filter(p => p.authStatus !== 'active');
// //             }
// //         }

// //         // Apply Text Search
// //         if (searchTerm.trim()) {
// //             const s = searchTerm.toLowerCase();
// //             results = results.filter(p =>
// //                 (p.fullName && p.fullName.toLowerCase().includes(s)) ||
// //                 (p.idNumber && p.idNumber.includes(s)) ||
// //                 (p.email && p.email.toLowerCase().includes(s))
// //             );
// //         }

// //         //  Robust Sorting. Falls back to empty string if undefined to prevent localeCompare crash
// //         return results.sort((a, b) => {
// //             const nameA = String(a.fullName || '');
// //             const nameB = String(b.fullName || '');
// //             return nameA.localeCompare(nameB);
// //         });
// //     }, [learners, searchTerm, filterStatus]);

// //     return (
// //         <div className="wm-root animate-fade-in">

// //             {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
// //             <div className="wm-page-header">
// //                 <div className="wm-page-header__left">
// //                     <div className="wm-page-header__icon"><Users size={22} /></div>
// //                     <div>
// //                         <h1 className="wm-page-header__title">Master Directory</h1>
// //                         <p className="wm-page-header__desc">
// //                             {directoryData.length} unique individual{directoryData.length !== 1 ? 's' : ''} registered on the platform.
// //                         </p>
// //                     </div>
// //                 </div>
// //             </div>

// //             {/* ── TOOLBAR (Reusing wm-toolbar styling) ── */}
// //             <div className="wm-toolbar" style={{ flexWrap: 'wrap' }}>
// //                 {/* Search Bar */}
// //                 <div className="wm-search" style={{ flex: '1 1 250px' }}>
// //                     <Search size={15} className="wm-search__icon" />
// //                     <input
// //                         type="text"
// //                         className="wm-search__input"
// //                         placeholder="Search by name, ID or email…"
// //                         value={searchTerm}
// //                         onChange={e => setSearchTerm(e.target.value)}
// //                     />
// //                     {searchTerm && (
// //                         <button className="wm-search__clear" onClick={() => setSearchTerm('')}><X size={13} /></button>
// //                     )}
// //                 </div>

// //                 {/* Status Filter */}
// //                 <div className="wm-search" style={{ flex: 'none', minWidth: '180px' }}>
// //                     <Filter size={15} className="wm-search__icon" />
// //                     <select
// //                         className="wm-search__input"
// //                         value={filterStatus}
// //                         onChange={e => setFilterStatus(e.target.value)}
// //                         style={{ cursor: 'pointer' }}
// //                     >
// //                         <option value="all">All Statuses</option>
// //                         <option value="active">Active</option>
// //                         <option value="pending">Pending / Invited</option>
// //                     </select>
// //                 </div>

// //                 <div className="wm-toolbar__count">
// //                     {directoryData.length} learner{directoryData.length !== 1 ? 's' : ''}
// //                 </div>
// //             </div>

// //             {/* ── TABLE (Restored original mlab-table structure) ── */}
// //             <div className="mlab-table-wrap">
// //                 <table className="mlab-table">
// //                     <thead>
// //                         <tr>
// //                             <th>Learner Identity</th>
// //                             <th>Contact Info</th>
// //                             <th>Auth Status</th>
// //                             <th>History</th>
// //                             <th style={{ textAlign: 'right' }}>Actions</th>
// //                         </tr>
// //                     </thead>
// //                     <tbody>
// //                         {directoryData.length > 0 ? directoryData.map(profile => (
// //                             <tr key={profile.learnerId}>

// //                                 {/* Identity */}
// //                                 <td>
// //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
// //                                         <span style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '0.95rem' }}>
// //                                             {profile.fullName}
// //                                         </span>
// //                                         <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
// //                                             ID: {profile.idNumber}
// //                                         </span>
// //                                     </div>
// //                                 </td>

// //                                 {/* Contact */}
// //                                 <td>
// //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
// //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>
// //                                             <Mail size={12} color="var(--mlab-grey-light)" />
// //                                             <span>{profile.email || <em style={{ color: 'var(--mlab-grey-light)' }}>No email</em>}</span>
// //                                         </div>
// //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
// //                                             <Phone size={12} color="var(--mlab-grey-light)" />
// //                                             <span>{profile.phone || <em style={{ color: 'var(--mlab-grey-light)' }}>No phone</em>}</span>
// //                                         </div>
// //                                     </div>
// //                                 </td>

// //                                 {/* Auth Status */}
// //                                 <td>
// //                                     {profile.authStatus === 'active' ? (
// //                                         <span className="mlab-badge mlab-badge--active" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// //                                             <UserCheck size={12} /> Active
// //                                         </span>
// //                                     ) : (
// //                                         <span className="mlab-badge mlab-badge--draft" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// //                                             <ShieldAlert size={12} /> Pending / Invited
// //                                         </span>
// //                                     )}
// //                                 </td>

// //                                 {/* Enrollments */}
// //                                 <td>
// //                                     <span style={{
// //                                         display: 'inline-flex', alignItems: 'center', gap: '6px',
// //                                         fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase',
// //                                         background: profile.enrollmentCount > 1 ? '#e0e7ff' : '#f1f5f9',
// //                                         color: profile.enrollmentCount > 1 ? '#3730a3' : '#475569',
// //                                         padding: '4px 8px', borderRadius: '4px', border: `1px solid ${profile.enrollmentCount > 1 ? '#c7d2fe' : '#e2e8f0'}`
// //                                     }}>
// //                                         <GraduationCap size={14} />
// //                                         {profile.enrollmentCount} {profile.enrollmentCount === 1 ? 'Enrollment' : 'Enrollments'}
// //                                     </span>
// //                                 </td>

// //                                 {/* Actions */}
// //                                 <td style={{ textAlign: 'right' }}>
// //                                     <button
// //                                         className="wm-btn wm-btn--ghost"
// //                                         onClick={() => navigate(`/admin/learners/${profile.learnerId}`)}
// //                                         style={{ fontSize: '0.7rem', padding: '4px 10px' }}
// //                                     >
// //                                         <Eye size={13} /> View 360° Profile
// //                                     </button>
// //                                 </td>
// //                             </tr>
// //                         )) : (
// //                             <tr>
// //                                 <td colSpan={5} style={{ padding: 0 }}>
// //                                     {/* ── EMPTY STATE (Reusing wm-empty styling) ── */}
// //                                     <div className="wm-empty" style={{ margin: '2rem', border: 'none', background: 'transparent' }}>
// //                                         <div className="wm-empty__icon"><Users size={36} /></div>
// //                                         <p className="wm-empty__title">
// //                                             {searchTerm || filterStatus !== 'all' ? 'No matches found' : 'No Learners Found'}
// //                                         </p>
// //                                         <p className="wm-empty__desc">
// //                                             {searchTerm || filterStatus !== 'all'
// //                                                 ? 'Try adjusting your search or filter criteria.'
// //                                                 : 'No learners have registered on the platform yet.'}
// //                                         </p>
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
