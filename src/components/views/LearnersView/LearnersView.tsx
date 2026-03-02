// src/components/views/LearnersView.tsx

// Styled to align with mLab Corporate Identity Brand Guide 2019
// All visual styling lives in LearnersView.css

import React, { useState, useMemo, useEffect } from 'react';
import {
    Plus, Upload, Download, Search, Edit, Trash2,
    Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
    Eye, Archive as ArchiveIcon, Mail,
    Share2,
    CopyIcon,
    GraduationCap,
    Users,
    History
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './LearnersView.css';
import type { DashboardLearner, Cohort } from '../../../types';

interface LearnersViewProps {
    learners: DashboardLearner[];
    stagingLearners?: DashboardLearner[];
    cohorts?: Cohort[]; // 🚀 ADDED TO MAP COHORT IDs TO NAMES
    onAdd: () => void;
    onUpload: () => void;
    onEdit: (learner: DashboardLearner) => void;
    onArchive: (learner: DashboardLearner) => void;
    onRestore: (learner: DashboardLearner) => void;
    onDiscard: (learner: DashboardLearner) => void;
    onInvite: (learner: DashboardLearner) => void;
    onArchiveCohort: (year: string) => void;
    onBulkRestore?: (learners: DashboardLearner[]) => void;
    onBulkArchive?: (learners: DashboardLearner[]) => void;
    onBulkApprove?: (learners: DashboardLearner[]) => void;
    onBulkDiscard?: (learners: DashboardLearner[]) => void;
}

export const LearnersView: React.FC<LearnersViewProps> = ({
    learners,
    stagingLearners = [],
    cohorts = [],
    onAdd, onUpload, onEdit,
    onArchive, onRestore, onDiscard, onInvite,
    onBulkRestore, onBulkArchive, onBulkApprove, onBulkDiscard
}) => {
    const navigate = useNavigate();

    // ─── VIEW STATE ───
    const [viewMode, setViewMode] = useState<'active' | 'staging'>('active');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedYear, setSelectedYear] = useState<string>('all');
    const [selectedQualification, setSelectedQualification] = useState<string>('all');
    const [showArchived, setShowArchived] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Reset selection when switching tabs/filters
    useEffect(() => { setSelectedIds(new Set()); }, [viewMode, showArchived, selectedYear, selectedQualification]);

    // ─── 🚀 SMART MULTI-COURSE DETECTION 🚀 ───
    // Counts how many times an ID number appears to detect returning learners
    const learnerCountsById = useMemo(() => {
        const counts: Record<string, number> = {};
        [...learners, ...stagingLearners].forEach(l => {
            if (l.idNumber) {
                counts[l.idNumber] = (counts[l.idNumber] || 0) + 1;
            }
        });
        return counts;
    }, [learners, stagingLearners]);


    // ─── FILTER LOGIC ───
    const filteredLearners = useMemo(() => {
        const sourceData = viewMode === 'staging' ? stagingLearners : learners;
        return sourceData.filter(learner => {
            const isArchived = learner.isArchived === true;

            // 1. Archive Filter
            if (viewMode === 'active') {
                if (showArchived && !isArchived) return false;
                if (!showArchived && isArchived) return false;
            }

            // 2. Search Filter
            if (searchTerm) {
                const s = searchTerm.toLowerCase();
                if (!(
                    learner.fullName?.toLowerCase().includes(s) ||
                    learner.idNumber?.includes(searchTerm) ||
                    learner.email?.toLowerCase().includes(s)
                )) return false;
            }

            // 3. Year Filter (Active Tab Only)
            if (viewMode === 'active' && selectedYear !== 'all') {
                const y = learner.trainingStartDate
                    ? learner.trainingStartDate.substring(0, 4)
                    : 'Unknown';
                if (y !== selectedYear) return false;
            }

            // 4. Qualification Filter
            if (selectedQualification !== 'all') {
                if (learner.qualification?.name !== selectedQualification) return false;
            }

            // 5. Status Filter
            if (filterStatus !== 'all' && learner.status !== filterStatus) return false;

            return true;
        });
    }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, selectedQualification, showArchived]);

    // Available cohort years (active data only)
    const availableYears = useMemo(() => {
        const years = new Set<string>();
        learners.forEach(l => {
            if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
        });
        return Array.from(years).sort().reverse();
    }, [learners]);

    // Available Qualifications (across both active and staging)
    const availableQualifications = useMemo(() => {
        const quals = new Set<string>();
        const allLearners = [...learners, ...stagingLearners];
        allLearners.forEach(l => {
            if (l.qualification?.name) quals.add(l.qualification.name);
        });
        return Array.from(quals).sort();
    }, [learners, stagingLearners]);

    // ─── COUNTERS ───
    const activeCount = learners.filter(l => !l.isArchived).length;
    const archivedCount = learners.filter(l => l.isArchived).length;
    const stagingCount = stagingLearners.length;

    // ─── HANDLERS ───
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) setSelectedIds(new Set(filteredLearners.map(l => l.id)));
        else setSelectedIds(new Set());
    };

    const handleSelectOne = (id: string) => {
        const next = new Set(selectedIds);
        next.has(id) ? next.delete(id) : next.add(id);
        setSelectedIds(next);
    };

    const executeBulkAction = (action: 'approve' | 'restore' | 'archive' | 'discard') => {
        const sourceList = viewMode === 'staging' ? stagingLearners : learners;
        const selected = sourceList.filter(l => selectedIds.has(l.id));
        if (action === 'approve') onBulkApprove?.(selected);
        if (action === 'restore') onBulkRestore?.(selected);
        if (action === 'archive') onBulkArchive?.(selected);
        if (action === 'discard') onBulkDiscard?.(selected);
        setSelectedIds(new Set());
    };

    const handleCopyLink = (idNumber: string) => {
        const link = `${window.location.origin}/portal?id=${idNumber}`;
        navigator.clipboard.writeText(link).then(() => {
            setCopiedId(idNumber);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    const handleExport = () => {
        const csvContent = "data:text/csv;charset=utf-8," +
            ["Full Name,ID Number,Class / Cohort,Qualification,Status,Start Date,Auth Status"].concat(
                filteredLearners.map(l => {
                    const cohortName = cohorts.find(c => c.id === l.cohortId)?.name || 'Unassigned';
                    return `"${l.fullName}","${l.idNumber}","${cohortName}","${l.qualification?.name || 'N/A'}","${l.status}","${l.trainingStartDate}","${l.authStatus || 'pending'}"`;
                })
            ).join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `learners_enrollments_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
    };

    // ─── RENDER ───
    return (
        <div className="mlab-learners">

            {/* ── TABS ─────────────────────────────────────────────────────── */}
            <div className="mlab-tab-bar">
                <button
                    className={`mlab-tab ${viewMode === 'active' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
                    onClick={() => { setViewMode('active'); setShowArchived(false); }}
                >
                    Enrollments (Active)
                    <span className="mlab-tab__count">{activeCount}</span>
                </button>

                <button
                    className={`mlab-tab ${viewMode === 'staging' ? 'mlab-tab--staging-active' : 'mlab-tab--inactive'}`}
                    onClick={() => setViewMode('staging')}
                >
                    Staging Area
                    {stagingCount > 0 && (
                        <span className="mlab-tab__badge">{stagingCount}</span>
                    )}
                </button>
            </div>

            {/* ── TOOLBAR ──────────────────────────────────────────────────── */}
            <div className="mlab-toolbar">

                {/* Search */}
                <div className="mlab-search">
                    <Search size={18} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder="Search by name, ID or email…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Qualification Filter (Applies to both Active & Staging) */}
                <div className="mlab-select-wrap">
                    <GraduationCap size={16} color="var(--mlab-grey)" />
                    <select
                        value={selectedQualification}
                        onChange={e => setSelectedQualification(e.target.value)}
                    >
                        <option value="all">All Qualifications</option>
                        {availableQualifications.map(qual => (
                            <option key={qual} value={qual}>{qual}</option>
                        ))}
                    </select>
                </div>

                {viewMode === 'active' && (
                    <>
                        {/* Year filter */}
                        <div className="mlab-select-wrap">
                            <Calendar size={16} color="var(--mlab-grey)" />
                            <select
                                value={selectedYear}
                                onChange={e => setSelectedYear(e.target.value)}
                            >
                                <option value="all">All Years</option>
                                {availableYears.map(year => (
                                    <option key={year} value={year}>{year} Cohort</option>
                                ))}
                            </select>
                        </div>

                        {/* Archive toggle */}
                        <label className={`mlab-archive-toggle ${showArchived ? 'mlab-archive-toggle--on' : ''}`}>
                            <input
                                type="checkbox"
                                checked={showArchived}
                                onChange={e => setShowArchived(e.target.checked)}
                            />
                            Show Archived ({archivedCount})
                        </label>
                    </>
                )}
            </div>

            {/* ── ACTION BAR ───────────────────────────────────────────────── */}
            {selectedIds.size > 0 ? (
                /* Bulk actions (items selected) */
                <div className="mlab-action-bar">
                    <span className="mlab-action-bar__label">
                        {selectedIds.size} Enrollments Selected
                    </span>
                    <div className="mlab-bulk-actions">

                        {viewMode === 'staging' && (
                            <>
                                <button className="mlab-btn mlab-btn--green" onClick={() => executeBulkAction('approve')}>
                                    <ClipboardCheck size={15} /> Approve
                                </button>
                                <button className="mlab-btn mlab-btn--outline mlab-btn--outline-red" onClick={() => executeBulkAction('discard')}>
                                    <Trash2 size={15} /> Discard Drafts
                                </button>
                            </>
                        )}

                        {viewMode === 'active' && (
                            showArchived ? (
                                <button className="mlab-btn mlab-btn--outline mlab-btn--outline-green" onClick={() => executeBulkAction('restore')}>
                                    <RotateCcw size={15} /> Restore
                                </button>
                            ) : (
                                <button className="mlab-btn mlab-btn--outline mlab-btn--outline-amber" onClick={() => executeBulkAction('archive')}>
                                    <ArchiveIcon size={15} /> Archive
                                </button>
                            )
                        )}
                    </div>
                </div>

            ) : (

                /* Standard actions (nothing selected) */
                <div className="mlab-standard-actions">
                    <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue" onClick={handleExport}>
                        <Download size={15} /> Export
                    </button>
                    <button className="mlab-btn mlab-btn--primary" onClick={onUpload}>
                        <Upload size={15} /> Import CSV
                    </button>
                    <button className="mlab-btn mlab-btn--green" onClick={onAdd}>
                        <Plus size={15} /> Add Enrollment
                    </button>
                </div>
            )}

            {/* ── TABLE ────────────────────────────────────────────────────── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>
                                <input
                                    type="checkbox"
                                    onChange={handleSelectAll}
                                    checked={filteredLearners.length > 0 && selectedIds.size === filteredLearners.length}
                                />
                            </th>
                            <th>Learner</th>
                            <th>Class / Cohort</th> {/* 🚀 NEW COLUMN */}
                            <th>Qualification</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLearners.map(learner => {
                            const isSelected = selectedIds.has(learner.id);
                            const rowClass = [
                                learner.isArchived ? 'mlab-tr--archived' : '',
                                isSelected ? 'mlab-tr--selected' : '',
                            ].filter(Boolean).join(' ');

                            // Resolve Cohort Name
                            const cohortObj = cohorts.find(c => c.id === learner.cohortId);
                            const cohortName = cohortObj ? cohortObj.name : (learner.cohortId === 'Unassigned' ? 'Unassigned' : 'Unknown Class');

                            // Detect if learner is doing multiple courses
                            const isReturning = learner.idNumber && (learnerCountsById[learner.idNumber] > 1);

                            return (
                                <tr key={learner.id} className={rowClass}>

                                    {/* Checkbox */}
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleSelectOne(learner.id)}
                                        />
                                    </td>

                                    {/* Learner */}
                                    <td>
                                        <div>
                                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {learner.fullName}
                                                {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', color: '#374151' }}>Archived</span>}

                                                {/* 🚀 MULTI-COURSE INDICATOR 🚀 */}
                                                {isReturning && (
                                                    <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }} title="This learner is enrolled in multiple classes on the platform.">
                                                        <History size={10} /> Multi-Course
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                                                {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
                                            </div>
                                        </div>
                                    </td>

                                    {/* 🚀 Cohort / Class Column 🚀 */}
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Users size={14} color="#64748b" />
                                            <span style={{ fontWeight: 500, color: cohortName === 'Unassigned' ? '#ef4444' : '#334155' }}>
                                                {cohortName}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Qualification */}
                                    <td>
                                        <div className="mlab-cell-qual">{learner.qualification?.name || 'No Qualification'}</div>
                                        <div className="mlab-cell-sub">{learner.qualification?.saqaId}</div>
                                    </td>

                                    {/* Status badge */}
                                    <td>
                                        {learner.isArchived
                                            ? <span className="mlab-badge mlab-badge--archived">Archived</span>
                                            : viewMode === 'staging'
                                                ? <span className="mlab-badge mlab-badge--draft">Draft</span>
                                                : <span className="mlab-badge mlab-badge--active">Active</span>
                                        }
                                    </td>

                                    {/* Actions */}
                                    <td>
                                        <div className="mlab-icon-btn-group">
                                            {/* Edit – always visible */}
                                            <button
                                                className="mlab-icon-btn mlab-icon-btn--blue"
                                                onClick={() => onEdit(learner)}
                                                title="Edit Enrollment Details"
                                            >
                                                <Edit size={14} />
                                            </button>

                                            {/* Active & not archived */}
                                            {viewMode === 'active' && !learner.isArchived && !showArchived && (
                                                <>
                                                    <button
                                                        className="mlab-icon-btn mlab-icon-btn--blue"
                                                        onClick={() => navigate(`/sor/${learner.id}`)}
                                                        title="View SOR"
                                                    >
                                                        <Eye size={14} />
                                                    </button>

                                                    <button
                                                        className="mlab-icon-btn mlab-icon-btn--blue"
                                                        style={{ color: copiedId === learner.idNumber ? '#16a34a' : '' }}
                                                        onClick={() => handleCopyLink(learner.idNumber)}
                                                    >
                                                        {copiedId === learner.idNumber ? <CopyIcon size={18} /> : <Share2 size={18} />}
                                                    </button>

                                                    <button
                                                        className={`mlab-icon-btn ${learner.authStatus === 'active'
                                                            ? 'mlab-icon-btn--emerald'
                                                            : 'mlab-icon-btn--green'
                                                            }`}
                                                        onClick={() => onInvite(learner)}
                                                        title={learner.authStatus === 'active' ? 'Resend Invite' : 'Send Invite'}
                                                    >
                                                        <Mail size={14} />
                                                    </button>

                                                    <button
                                                        className="mlab-icon-btn mlab-icon-btn--amber"
                                                        onClick={() => onArchive(learner)}
                                                        title="Archive Record"
                                                    >
                                                        <ArchiveIcon size={14} />
                                                    </button>
                                                </>
                                            )}

                                            {/* Archived – restore only */}
                                            {viewMode === 'active' && learner.isArchived && (
                                                <button
                                                    className="mlab-icon-btn mlab-icon-btn--emerald"
                                                    onClick={() => onRestore(learner)}
                                                    title="Restore"
                                                >
                                                    <RotateCcw size={14} />
                                                </button>
                                            )}

                                            {/* Staging – discard only */}
                                            {viewMode === 'staging' && (
                                                <button
                                                    className="mlab-icon-btn mlab-icon-btn--red"
                                                    onClick={() => onDiscard(learner)}
                                                    title="Discard Draft"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Empty state */}
                {filteredLearners.length === 0 && (
                    <div className="mlab-empty">
                        <AlertTriangle size={40} color="var(--mlab-green)" style={{ opacity: 0.6 }} />
                        <p className="mlab-empty__title">No Enrollments Found</p>
                        <p className="mlab-empty__desc">
                            {viewMode === 'active'
                                ? showArchived
                                    ? "No archived records found."
                                    : "No active learners found. Check the Staging Area for imports."
                                : "Staging area is empty. Import a CSV to get started."}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};


// // Styled to align with mLab Corporate Identity Brand Guide 2019
// // All visual styling lives in LearnersView.css

// import React, { useState, useMemo, useEffect } from 'react';
// import {
//     Plus, Upload, Download, Search, Edit, Trash2,
//     Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
//     Eye, Archive as ArchiveIcon, Mail,
//     Share2,
//     CopyIcon,
//     GraduationCap,
//     Users,
//     History
// } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import './LearnersView.css';
// import type { DashboardLearner, Cohort } from '../../../types';

// interface LearnersViewProps {
//     learners: DashboardLearner[];
//     stagingLearners?: DashboardLearner[];
//     cohorts?: Cohort[]; // 🚀 ADDED TO MAP COHORT IDs TO NAMES
//     onAdd: () => void;
//     onUpload: () => void;
//     onEdit: (learner: DashboardLearner) => void;
//     onArchive: (learner: DashboardLearner) => void;
//     onRestore: (learner: DashboardLearner) => void;
//     onDiscard: (learner: DashboardLearner) => void;
//     onInvite: (learner: DashboardLearner) => void;
//     onArchiveCohort: (year: string) => void;
//     onBulkRestore?: (learners: DashboardLearner[]) => void;
//     onBulkArchive?: (learners: DashboardLearner[]) => void;
//     onBulkApprove?: (learners: DashboardLearner[]) => void;
//     onBulkDiscard?: (learners: DashboardLearner[]) => void;
// }

// export const LearnersView: React.FC<LearnersViewProps> = ({
//     learners,
//     stagingLearners = [],
//     cohorts = [],
//     onAdd, onUpload, onEdit,
//     onArchive, onRestore, onDiscard, onInvite,
//     onBulkRestore, onBulkArchive, onBulkApprove, onBulkDiscard
// }) => {
//     const navigate = useNavigate();

//     // ─── VIEW STATE ───
//     const [viewMode, setViewMode] = useState<'active' | 'staging'>('active');
//     const [searchTerm, setSearchTerm] = useState('');
//     const [filterStatus, setFilterStatus] = useState('all');
//     const [selectedYear, setSelectedYear] = useState<string>('all');
//     const [selectedQualification, setSelectedQualification] = useState<string>('all');
//     const [showArchived, setShowArchived] = useState(false);
//     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

//     const [copiedId, setCopiedId] = useState<string | null>(null);

//     // Reset selection when switching tabs/filters
//     useEffect(() => { setSelectedIds(new Set()); }, [viewMode, showArchived, selectedYear, selectedQualification]);

//     // ─── 🚀 SMART MULTI-COURSE DETECTION 🚀 ───
//     // Counts how many times an ID number appears to detect returning learners
//     const learnerCountsById = useMemo(() => {
//         const counts: Record<string, number> = {};
//         [...learners, ...stagingLearners].forEach(l => {
//             if (l.idNumber) {
//                 counts[l.idNumber] = (counts[l.idNumber] || 0) + 1;
//             }
//         });
//         return counts;
//     }, [learners, stagingLearners]);


//     // ─── FILTER LOGIC ───
//     const filteredLearners = useMemo(() => {
//         const sourceData = viewMode === 'staging' ? stagingLearners : learners;
//         return sourceData.filter(learner => {
//             const isArchived = learner.isArchived === true;

//             // 1. Archive Filter
//             if (viewMode === 'active') {
//                 if (showArchived && !isArchived) return false;
//                 if (!showArchived && isArchived) return false;
//             }

//             // 2. Search Filter
//             if (searchTerm) {
//                 const s = searchTerm.toLowerCase();
//                 if (!(
//                     learner.fullName?.toLowerCase().includes(s) ||
//                     learner.idNumber?.includes(searchTerm) ||
//                     learner.email?.toLowerCase().includes(s)
//                 )) return false;
//             }

//             // 3. Year Filter (Active Tab Only)
//             if (viewMode === 'active' && selectedYear !== 'all') {
//                 const y = learner.trainingStartDate
//                     ? learner.trainingStartDate.substring(0, 4)
//                     : 'Unknown';
//                 if (y !== selectedYear) return false;
//             }

//             // 4. Qualification Filter
//             if (selectedQualification !== 'all') {
//                 if (learner.qualification?.name !== selectedQualification) return false;
//             }

//             // 5. Status Filter
//             if (filterStatus !== 'all' && learner.status !== filterStatus) return false;

//             return true;
//         });
//     }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, selectedQualification, showArchived]);

//     // Available cohort years (active data only)
//     const availableYears = useMemo(() => {
//         const years = new Set<string>();
//         learners.forEach(l => {
//             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
//         });
//         return Array.from(years).sort().reverse();
//     }, [learners]);

//     // Available Qualifications (across both active and staging)
//     const availableQualifications = useMemo(() => {
//         const quals = new Set<string>();
//         const allLearners = [...learners, ...stagingLearners];
//         allLearners.forEach(l => {
//             if (l.qualification?.name) quals.add(l.qualification.name);
//         });
//         return Array.from(quals).sort();
//     }, [learners, stagingLearners]);

//     // ─── COUNTERS ───
//     const activeCount = learners.filter(l => !l.isArchived).length;
//     const archivedCount = learners.filter(l => l.isArchived).length;
//     const stagingCount = stagingLearners.length;

//     // ─── HANDLERS ───
//     const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
//         if (e.target.checked) setSelectedIds(new Set(filteredLearners.map(l => l.id)));
//         else setSelectedIds(new Set());
//     };

//     const handleSelectOne = (id: string) => {
//         const next = new Set(selectedIds);
//         next.has(id) ? next.delete(id) : next.add(id);
//         setSelectedIds(next);
//     };

//     const executeBulkAction = (action: 'approve' | 'restore' | 'archive' | 'discard') => {
//         const sourceList = viewMode === 'staging' ? stagingLearners : learners;
//         const selected = sourceList.filter(l => selectedIds.has(l.id));
//         if (action === 'approve') onBulkApprove?.(selected);
//         if (action === 'restore') onBulkRestore?.(selected);
//         if (action === 'archive') onBulkArchive?.(selected);
//         if (action === 'discard') onBulkDiscard?.(selected);
//         setSelectedIds(new Set());
//     };

//     const handleCopyLink = (idNumber: string) => {
//         const link = `${window.location.origin}/portal?id=${idNumber}`;
//         navigator.clipboard.writeText(link).then(() => {
//             setCopiedId(idNumber);
//             setTimeout(() => setCopiedId(null), 2000);
//         });
//     };

//     const handleExport = () => {
//         const csvContent = "data:text/csv;charset=utf-8," +
//             ["Full Name,ID Number,Class / Cohort,Qualification,Status,Start Date,Auth Status"].concat(
//                 filteredLearners.map(l => {
//                     const cohortName = cohorts.find(c => c.id === l.cohortId)?.name || 'Unassigned';
//                     return `"${l.fullName}","${l.idNumber}","${cohortName}","${l.qualification?.name || 'N/A'}","${l.status}","${l.trainingStartDate}","${l.authStatus || 'pending'}"`;
//                 })
//             ).join("\n");
//         const link = document.createElement("a");
//         link.setAttribute("href", encodeURI(csvContent));
//         link.setAttribute("download", `learners_enrollments_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
//         document.body.appendChild(link);
//         link.click();
//     };

//     // ─── RENDER ───
//     return (
//         <div className="mlab-learners">

//             {/* ── TABS ─────────────────────────────────────────────────────── */}
//             <div className="mlab-tab-bar">
//                 <button
//                     className={`mlab-tab ${viewMode === 'active' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
//                     onClick={() => { setViewMode('active'); setShowArchived(false); }}
//                 >
//                     Enrollments (Active)
//                     <span className="mlab-tab__count">{activeCount}</span>
//                 </button>

//                 <button
//                     className={`mlab-tab ${viewMode === 'staging' ? 'mlab-tab--staging-active' : 'mlab-tab--inactive'}`}
//                     onClick={() => setViewMode('staging')}
//                 >
//                     Staging Area
//                     {stagingCount > 0 && (
//                         <span className="mlab-tab__badge">{stagingCount}</span>
//                     )}
//                 </button>
//             </div>

//             {/* ── TOOLBAR ──────────────────────────────────────────────────── */}
//             <div className="mlab-toolbar">

//                 {/* Search */}
//                 <div className="mlab-search">
//                     <Search size={18} color="var(--mlab-grey)" />
//                     <input
//                         type="text"
//                         placeholder="Search by name, ID or email…"
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                     />
//                 </div>

//                 {/* Qualification Filter (Applies to both Active & Staging) */}
//                 <div className="mlab-select-wrap">
//                     <GraduationCap size={16} color="var(--mlab-grey)" />
//                     <select
//                         value={selectedQualification}
//                         onChange={e => setSelectedQualification(e.target.value)}
//                     >
//                         <option value="all">All Qualifications</option>
//                         {availableQualifications.map(qual => (
//                             <option key={qual} value={qual}>{qual}</option>
//                         ))}
//                     </select>
//                 </div>

//                 {viewMode === 'active' && (
//                     <>
//                         {/* Year filter */}
//                         <div className="mlab-select-wrap">
//                             <Calendar size={16} color="var(--mlab-grey)" />
//                             <select
//                                 value={selectedYear}
//                                 onChange={e => setSelectedYear(e.target.value)}
//                             >
//                                 <option value="all">All Years</option>
//                                 {availableYears.map(year => (
//                                     <option key={year} value={year}>{year} Cohort</option>
//                                 ))}
//                             </select>
//                         </div>

//                         {/* Archive toggle */}
//                         <label className={`mlab-archive-toggle ${showArchived ? 'mlab-archive-toggle--on' : ''}`}>
//                             <input
//                                 type="checkbox"
//                                 checked={showArchived}
//                                 onChange={e => setShowArchived(e.target.checked)}
//                             />
//                             Show Archived ({archivedCount})
//                         </label>
//                     </>
//                 )}
//             </div>

//             {/* ── ACTION BAR ───────────────────────────────────────────────── */}
//             {selectedIds.size > 0 ? (
//                 /* Bulk actions (items selected) */
//                 <div className="mlab-action-bar">
//                     <span className="mlab-action-bar__label">
//                         {selectedIds.size} Enrollments Selected
//                     </span>
//                     <div className="mlab-bulk-actions">

//                         {viewMode === 'staging' && (
//                             <>
//                                 <button className="mlab-btn mlab-btn--green" onClick={() => executeBulkAction('approve')}>
//                                     <ClipboardCheck size={15} /> Approve
//                                 </button>
//                                 <button className="mlab-btn mlab-btn--outline mlab-btn--outline-red" onClick={() => executeBulkAction('discard')}>
//                                     <Trash2 size={15} /> Discard Drafts
//                                 </button>
//                             </>
//                         )}

//                         {viewMode === 'active' && (
//                             showArchived ? (
//                                 <button className="mlab-btn mlab-btn--outline mlab-btn--outline-green" onClick={() => executeBulkAction('restore')}>
//                                     <RotateCcw size={15} /> Restore
//                                 </button>
//                             ) : (
//                                 <button className="mlab-btn mlab-btn--outline mlab-btn--outline-amber" onClick={() => executeBulkAction('archive')}>
//                                     <ArchiveIcon size={15} /> Archive
//                                 </button>
//                             )
//                         )}
//                     </div>
//                 </div>

//             ) : (

//                 /* Standard actions (nothing selected) */
//                 <div className="mlab-standard-actions">
//                     <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue" onClick={handleExport}>
//                         <Download size={15} /> Export
//                     </button>
//                     <button className="mlab-btn mlab-btn--primary" onClick={onUpload}>
//                         <Upload size={15} /> Import CSV
//                     </button>
//                     <button className="mlab-btn mlab-btn--green" onClick={onAdd}>
//                         <Plus size={15} /> Add Enrollment
//                     </button>
//                 </div>
//             )}

//             {/* ── TABLE ────────────────────────────────────────────────────── */}
//             <div className="mlab-table-wrap">
//                 <table className="mlab-table">
//                     <thead>
//                         <tr>
//                             <th style={{ width: '40px' }}>
//                                 <input
//                                     type="checkbox"
//                                     onChange={handleSelectAll}
//                                     checked={filteredLearners.length > 0 && selectedIds.size === filteredLearners.length}
//                                 />
//                             </th>
//                             <th>Learner</th>
//                             <th>Class / Cohort</th> {/* 🚀 NEW COLUMN */}
//                             <th>Qualification</th>
//                             <th>Status</th>
//                             <th>Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {filteredLearners.map(learner => {
//                             const isSelected = selectedIds.has(learner.id);
//                             const rowClass = [
//                                 learner.isArchived ? 'mlab-tr--archived' : '',
//                                 isSelected ? 'mlab-tr--selected' : '',
//                             ].filter(Boolean).join(' ');

//                             // Resolve Cohort Name
//                             const cohortObj = cohorts.find(c => c.id === learner.cohortId);
//                             const cohortName = cohortObj ? cohortObj.name : (learner.cohortId === 'Unassigned' ? 'Unassigned' : 'Unknown Class');

//                             // Detect if learner is doing multiple courses
//                             const isReturning = learner.idNumber && (learnerCountsById[learner.idNumber] > 1);

//                             return (
//                                 <tr key={learner.id} className={rowClass}>

//                                     {/* Checkbox */}
//                                     <td>
//                                         <input
//                                             type="checkbox"
//                                             checked={isSelected}
//                                             onChange={() => handleSelectOne(learner.id)}
//                                         />
//                                     </td>

//                                     {/* Learner */}
//                                     <td>
//                                         <div>
//                                             <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                 {learner.fullName}
//                                                 {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', color: '#374151' }}>Archived</span>}

//                                                 {/* 🚀 MULTI-COURSE INDICATOR 🚀 */}
//                                                 {isReturning && (
//                                                     <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }} title="This learner is enrolled in multiple classes on the platform.">
//                                                         <History size={10} /> Multi-Course
//                                                     </span>
//                                                 )}
//                                             </div>
//                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
//                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
//                                             </div>
//                                         </div>
//                                     </td>

//                                     {/* 🚀 Cohort / Class Column 🚀 */}
//                                     <td>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <Users size={14} color="#64748b" />
//                                             <span style={{ fontWeight: 500, color: cohortName === 'Unassigned' ? '#ef4444' : '#334155' }}>
//                                                 {cohortName}
//                                             </span>
//                                         </div>
//                                     </td>

//                                     {/* Qualification */}
//                                     <td>
//                                         <div className="mlab-cell-qual">{learner.qualification?.name || 'No Qualification'}</div>
//                                         <div className="mlab-cell-sub">{learner.qualification?.saqaId}</div>
//                                     </td>

//                                     {/* Status badge */}
//                                     <td>
//                                         {learner.isArchived
//                                             ? <span className="mlab-badge mlab-badge--archived">Archived</span>
//                                             : viewMode === 'staging'
//                                                 ? <span className="mlab-badge mlab-badge--draft">Draft</span>
//                                                 : <span className="mlab-badge mlab-badge--active">Active</span>
//                                         }
//                                     </td>

//                                     {/* Actions */}
//                                     <td>
//                                         <div className="mlab-icon-btn-group">
//                                             {/* Edit – always visible */}
//                                             <button
//                                                 className="mlab-icon-btn mlab-icon-btn--blue"
//                                                 onClick={() => onEdit(learner)}
//                                                 title="Edit Enrollment Details"
//                                             >
//                                                 <Edit size={14} />
//                                             </button>

//                                             {/* Active & not archived */}
//                                             {viewMode === 'active' && !learner.isArchived && !showArchived && (
//                                                 <>
//                                                     <button
//                                                         className="mlab-icon-btn mlab-icon-btn--blue"
//                                                         onClick={() => navigate(`/sor/${learner.id}`)}
//                                                         title="View SOR"
//                                                     >
//                                                         <Eye size={14} />
//                                                     </button>

//                                                     <button
//                                                         className="mlab-icon-btn mlab-icon-btn--blue"
//                                                         style={{ color: copiedId === learner.idNumber ? '#16a34a' : '' }}
//                                                         onClick={() => handleCopyLink(learner.idNumber)}
//                                                     >
//                                                         {copiedId === learner.idNumber ? <CopyIcon size={18} /> : <Share2 size={18} />}
//                                                     </button>

//                                                     <button
//                                                         className={`mlab-icon-btn ${learner.authStatus === 'active'
//                                                             ? 'mlab-icon-btn--emerald'
//                                                             : 'mlab-icon-btn--green'
//                                                             }`}
//                                                         onClick={() => onInvite(learner)}
//                                                         title={learner.authStatus === 'active' ? 'Resend Invite' : 'Send Invite'}
//                                                     >
//                                                         <Mail size={14} />
//                                                     </button>

//                                                     <button
//                                                         className="mlab-icon-btn mlab-icon-btn--amber"
//                                                         onClick={() => onArchive(learner)}
//                                                         title="Archive Record"
//                                                     >
//                                                         <ArchiveIcon size={14} />
//                                                     </button>
//                                                 </>
//                                             )}

//                                             {/* Archived – restore only */}
//                                             {viewMode === 'active' && learner.isArchived && (
//                                                 <button
//                                                     className="mlab-icon-btn mlab-icon-btn--emerald"
//                                                     onClick={() => onRestore(learner)}
//                                                     title="Restore"
//                                                 >
//                                                     <RotateCcw size={14} />
//                                                 </button>
//                                             )}

//                                             {/* Staging – discard only */}
//                                             {viewMode === 'staging' && (
//                                                 <button
//                                                     className="mlab-icon-btn mlab-icon-btn--red"
//                                                     onClick={() => onDiscard(learner)}
//                                                     title="Discard Draft"
//                                                 >
//                                                     <Trash2 size={14} />
//                                                 </button>
//                                             )}
//                                         </div>
//                                     </td>
//                                 </tr>
//                             );
//                         })}
//                     </tbody>
//                 </table>

//                 {/* Empty state */}
//                 {filteredLearners.length === 0 && (
//                     <div className="mlab-empty">
//                         <AlertTriangle size={40} color="var(--mlab-green)" style={{ opacity: 0.6 }} />
//                         <p className="mlab-empty__title">No Enrollments Found</p>
//                         <p className="mlab-empty__desc">
//                             {viewMode === 'active'
//                                 ? showArchived
//                                     ? "No archived records found."
//                                     : "No active learners found. Check the Staging Area for imports."
//                                 : "Staging area is empty. Import a CSV to get started."}
//                         </p>
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };


// // import React, { useState, useMemo, useEffect } from 'react';
// // import {
// //     Plus, Upload, Download, Search, Edit, Trash2,
// //     Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
// //     Eye, Archive as ArchiveIcon, Mail,
// //     CheckCheck,
// //     Share2,
// //     CopyIcon,
// //     GraduationCap // Added for Qualification Icon
// // } from 'lucide-react';
// // import { useNavigate } from 'react-router-dom';
// // import './LearnersView.css';
// // import type { DashboardLearner } from '../../../types';

// // interface LearnersViewProps {
// //     learners: DashboardLearner[];
// //     stagingLearners?: DashboardLearner[];
// //     onAdd: () => void;
// //     onUpload: () => void;
// //     onEdit: (learner: DashboardLearner) => void;
// //     onArchive: (learner: DashboardLearner) => void;
// //     onRestore: (learner: DashboardLearner) => void;
// //     onDiscard: (learner: DashboardLearner) => void;
// //     onInvite: (learner: DashboardLearner) => void;
// //     onArchiveCohort: (year: string) => void;
// //     onBulkRestore?: (learners: DashboardLearner[]) => void;
// //     onBulkArchive?: (learners: DashboardLearner[]) => void;
// //     onBulkApprove?: (learners: DashboardLearner[]) => void;
// //     onBulkDiscard?: (learners: DashboardLearner[]) => void;
// // }

// // export const LearnersView: React.FC<LearnersViewProps> = ({
// //     learners,
// //     stagingLearners = [],
// //     onAdd, onUpload, onEdit,
// //     onArchive, onRestore, onDiscard, onInvite,
// //     onBulkRestore, onBulkArchive, onBulkApprove, onBulkDiscard
// // }) => {
// //     const navigate = useNavigate();

// //     // ─── VIEW STATE ───
// //     const [viewMode, setViewMode] = useState<'active' | 'staging'>('active');
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [filterStatus, setFilterStatus] = useState('all');
// //     const [selectedYear, setSelectedYear] = useState<string>('all');
// //     const [selectedQualification, setSelectedQualification] = useState<string>('all'); // ✅ New Qualification State
// //     const [showArchived, setShowArchived] = useState(false);
// //     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

// //     const [copiedId, setCopiedId] = useState<string | null>(null);

// //     // Reset selection when switching tabs/filters
// //     useEffect(() => { setSelectedIds(new Set()); }, [viewMode, showArchived, selectedYear, selectedQualification]);

// //     // ─── FILTER LOGIC ───
// //     const filteredLearners = useMemo(() => {
// //         const sourceData = viewMode === 'staging' ? stagingLearners : learners;
// //         return sourceData.filter(learner => {
// //             const isArchived = learner.isArchived === true;

// //             // 1. Archive Filter
// //             if (viewMode === 'active') {
// //                 if (showArchived && !isArchived) return false;
// //                 if (!showArchived && isArchived) return false;
// //             }

// //             // 2. Search Filter
// //             if (searchTerm) {
// //                 const s = searchTerm.toLowerCase();
// //                 if (!(
// //                     learner.fullName?.toLowerCase().includes(s) ||
// //                     learner.idNumber?.includes(searchTerm) ||
// //                     learner.email?.toLowerCase().includes(s)
// //                 )) return false;
// //             }

// //             // 3. Year Filter (Active Tab Only)
// //             if (viewMode === 'active' && selectedYear !== 'all') {
// //                 const y = learner.trainingStartDate
// //                     ? learner.trainingStartDate.substring(0, 4)
// //                     : 'Unknown';
// //                 if (y !== selectedYear) return false;
// //             }

// //             // 4. Qualification Filter ✅
// //             if (selectedQualification !== 'all') {
// //                 if (learner.qualification?.name !== selectedQualification) return false;
// //             }

// //             // 5. Status Filter
// //             if (filterStatus !== 'all' && learner.status !== filterStatus) return false;

// //             return true;
// //         });
// //     }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, selectedQualification, showArchived]);

// //     // Available cohort years (active data only)
// //     const availableYears = useMemo(() => {
// //         const years = new Set<string>();
// //         learners.forEach(l => {
// //             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
// //         });
// //         return Array.from(years).sort().reverse();
// //     }, [learners]);

// //     // Available Qualifications (across both active and staging) ✅
// //     const availableQualifications = useMemo(() => {
// //         const quals = new Set<string>();
// //         const allLearners = [...learners, ...stagingLearners];
// //         allLearners.forEach(l => {
// //             if (l.qualification?.name) quals.add(l.qualification.name);
// //         });
// //         return Array.from(quals).sort();
// //     }, [learners, stagingLearners]);

// //     // ─── COUNTERS ───
// //     const activeCount = learners.filter(l => !l.isArchived).length;
// //     const archivedCount = learners.filter(l => l.isArchived).length;
// //     const stagingCount = stagingLearners.length;

// //     // ─── HANDLERS ───
// //     const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
// //         if (e.target.checked) setSelectedIds(new Set(filteredLearners.map(l => l.id)));
// //         else setSelectedIds(new Set());
// //     };

// //     const handleSelectOne = (id: string) => {
// //         const next = new Set(selectedIds);
// //         next.has(id) ? next.delete(id) : next.add(id);
// //         setSelectedIds(next);
// //     };

// //     const executeBulkAction = (action: 'approve' | 'restore' | 'archive' | 'discard') => {
// //         const sourceList = viewMode === 'staging' ? stagingLearners : learners;
// //         const selected = sourceList.filter(l => selectedIds.has(l.id));
// //         if (action === 'approve') onBulkApprove?.(selected);
// //         if (action === 'restore') onBulkRestore?.(selected);
// //         if (action === 'archive') onBulkArchive?.(selected);
// //         if (action === 'discard') onBulkDiscard?.(selected);
// //         setSelectedIds(new Set());
// //     };

// //     const handleCopyLink = (idNumber: string) => {
// //         const link = `${window.location.origin}/portal?id=${idNumber}`;
// //         navigator.clipboard.writeText(link).then(() => {
// //             setCopiedId(idNumber);
// //             setTimeout(() => setCopiedId(null), 2000);
// //         });
// //     };

// //     const handleExport = () => {
// //         const csvContent = "data:text/csv;charset=utf-8," +
// //             ["Full Name,ID Number,Status,Start Date,Auth Status"].concat(
// //                 filteredLearners.map(l =>
// //                     `${l.fullName},${l.idNumber},${l.status},${l.trainingStartDate},${l.authStatus || 'pending'}`
// //                 )
// //             ).join("\n");
// //         const link = document.createElement("a");
// //         link.setAttribute("href", encodeURI(csvContent));
// //         link.setAttribute("download", `learners_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
// //         document.body.appendChild(link);
// //         link.click();
// //     };

// //     // ─── RENDER ───
// //     return (
// //         <div className="mlab-learners">

// //             {/* ── TABS ─────────────────────────────────────────────────────── */}
// //             <div className="mlab-tab-bar">
// //                 <button
// //                     className={`mlab-tab ${viewMode === 'active' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
// //                     onClick={() => { setViewMode('active'); setShowArchived(false); }}
// //                 >
// //                     Active Records
// //                     <span className="mlab-tab__count">{activeCount}</span>
// //                 </button>

// //                 <button
// //                     className={`mlab-tab ${viewMode === 'staging' ? 'mlab-tab--staging-active' : 'mlab-tab--inactive'}`}
// //                     onClick={() => setViewMode('staging')}
// //                 >
// //                     Staging Area
// //                     {stagingCount > 0 && (
// //                         <span className="mlab-tab__badge">{stagingCount}</span>
// //                     )}
// //                 </button>
// //             </div>

// //             {/* ── TOOLBAR ──────────────────────────────────────────────────── */}
// //             <div className="mlab-toolbar">

// //                 {/* Search */}
// //                 <div className="mlab-search">
// //                     <Search size={18} color="var(--mlab-grey)" />
// //                     <input
// //                         type="text"
// //                         placeholder="Search by name, ID or email…"
// //                         value={searchTerm}
// //                         onChange={e => setSearchTerm(e.target.value)}
// //                     />
// //                 </div>

// //                 {/* Qualification Filter (Applies to both Active & Staging) ✅ */}
// //                 <div className="mlab-select-wrap">
// //                     <GraduationCap size={16} color="var(--mlab-grey)" />
// //                     <select
// //                         value={selectedQualification}
// //                         onChange={e => setSelectedQualification(e.target.value)}
// //                     >
// //                         <option value="all">All Qualifications</option>
// //                         {availableQualifications.map(qual => (
// //                             <option key={qual} value={qual}>{qual}</option>
// //                         ))}
// //                     </select>
// //                 </div>

// //                 {viewMode === 'active' && (
// //                     <>
// //                         {/* Year filter */}
// //                         <div className="mlab-select-wrap">
// //                             <Calendar size={16} color="var(--mlab-grey)" />
// //                             <select
// //                                 value={selectedYear}
// //                                 onChange={e => setSelectedYear(e.target.value)}
// //                             >
// //                                 <option value="all">All Years</option>
// //                                 {availableYears.map(year => (
// //                                     <option key={year} value={year}>{year} Cohort</option>
// //                                 ))}
// //                             </select>
// //                         </div>

// //                         {/* Archive toggle */}
// //                         <label className={`mlab-archive-toggle ${showArchived ? 'mlab-archive-toggle--on' : ''}`}>
// //                             <input
// //                                 type="checkbox"
// //                                 checked={showArchived}
// //                                 onChange={e => setShowArchived(e.target.checked)}
// //                             />
// //                             Show Archived ({archivedCount})
// //                         </label>
// //                     </>
// //                 )}
// //             </div>

// //             {/* ── ACTION BAR ───────────────────────────────────────────────── */}
// //             {selectedIds.size > 0 ? (

// //                 /* Bulk actions (items selected) */
// //                 <div className="mlab-action-bar">
// //                     <span className="mlab-action-bar__label">
// //                         {selectedIds.size} Selected
// //                     </span>
// //                     <div className="mlab-bulk-actions">

// //                         {viewMode === 'staging' && (
// //                             <>
// //                                 <button
// //                                     className="mlab-btn mlab-btn--green"
// //                                     onClick={() => executeBulkAction('approve')}
// //                                 >
// //                                     <ClipboardCheck size={15} /> Approve
// //                                 </button>
// //                                 <button
// //                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-red"
// //                                     onClick={() => executeBulkAction('discard')}
// //                                 >
// //                                     <Trash2 size={15} /> Discard Drafts
// //                                 </button>
// //                             </>
// //                         )}

// //                         {viewMode === 'active' && (
// //                             showArchived ? (
// //                                 <button
// //                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-green"
// //                                     onClick={() => executeBulkAction('restore')}
// //                                 >
// //                                     <RotateCcw size={15} /> Restore
// //                                 </button>
// //                             ) : (
// //                                 <button
// //                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-amber"
// //                                     onClick={() => executeBulkAction('archive')}
// //                                 >
// //                                     <ArchiveIcon size={15} /> Archive
// //                                 </button>
// //                             )
// //                         )}
// //                     </div>
// //                 </div>

// //             ) : (

// //                 /* Standard actions (nothing selected) */
// //                 <div className="mlab-standard-actions">
// //                     <button
// //                         className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
// //                         onClick={handleExport}
// //                     >
// //                         <Download size={15} /> Export
// //                     </button>
// //                     <button
// //                         className="mlab-btn mlab-btn--primary"
// //                         onClick={onUpload}
// //                     >
// //                         <Upload size={15} /> Import CSV
// //                     </button>
// //                     <button
// //                         className="mlab-btn mlab-btn--green"
// //                         onClick={onAdd}
// //                     >
// //                         <Plus size={15} /> Add Learner
// //                     </button>
// //                 </div>
// //             )}

// //             {/* ── TABLE ────────────────────────────────────────────────────── */}
// //             <div className="mlab-table-wrap">
// //                 <table className="mlab-table">
// //                     <thead>
// //                         <tr>
// //                             <th style={{ width: '40px' }}>
// //                                 <input
// //                                     type="checkbox"
// //                                     onChange={handleSelectAll}
// //                                     checked={
// //                                         filteredLearners.length > 0 &&
// //                                         selectedIds.size === filteredLearners.length
// //                                     }
// //                                 />
// //                             </th>
// //                             <th>Learner</th>
// //                             <th>Qualification</th>
// //                             <th>Modules</th>
// //                             <th>Status</th>
// //                             <th>Actions</th>
// //                         </tr>
// //                     </thead>
// //                     <tbody>
// //                         {filteredLearners.map(learner => {
// //                             const isSelected = selectedIds.has(learner.id);
// //                             const rowClass = [
// //                                 learner.isArchived ? 'mlab-tr--archived' : '',
// //                                 isSelected ? 'mlab-tr--selected' : '',
// //                             ].filter(Boolean).join(' ');

// //                             return (
// //                                 <tr key={learner.id} className={rowClass}>

// //                                     {/* Checkbox */}
// //                                     <td>
// //                                         <input
// //                                             type="checkbox"
// //                                             checked={isSelected}
// //                                             onChange={() => handleSelectOne(learner.id)}
// //                                         />
// //                                     </td>

// //                                     {/* Learner */}
// //                                     <td>
// //                                         {/* <div className="mlab-cell-name">{learner.fullName}</div>
// //                                         <div className="mlab-cell-sub">{learner.idNumber}</div> */}
// //                                         <div>
// //                                             <div style={{ fontWeight: 600 }}>
// //                                                 {learner.fullName}
// //                                                 {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#374151' }}>Archived</span>}
// //                                             </div>
// //                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
// //                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
// //                                             </div>
// //                                         </div>
// //                                     </td>

// //                                     {/* Qualification */}
// //                                     <td>
// //                                         <div className="mlab-cell-qual">{learner.qualification.name}</div>
// //                                         <div className="mlab-cell-sub">{learner.qualification.saqaId}</div>
// //                                     </td>

// //                                     {/* Modules */}
// //                                     <td>
// //                                         <div style={{ display: 'flex', gap: '0.5rem' }}>
// //                                             <span className="mlab-badge mlab-badge--active">K: {learner.knowledgeModules.length}</span>
// //                                             <span className="mlab-badge mlab-badge--active">P: {learner.practicalModules.length}</span>
// //                                             <span className="mlab-badge mlab-badge--active">W: {learner.workExperienceModules.length}</span>
// //                                         </div>
// //                                     </td>

// //                                     {/* Status badge */}
// //                                     <td>
// //                                         {learner.isArchived
// //                                             ? <span className="mlab-badge mlab-badge--archived">Archived</span>
// //                                             : viewMode === 'staging'
// //                                                 ? <span className="mlab-badge mlab-badge--draft">Draft</span>
// //                                                 : <span className="mlab-badge mlab-badge--active">Active</span>
// //                                         }
// //                                     </td>

// //                                     {/* Actions */}
// //                                     <td>
// //                                         <div className="mlab-icon-btn-group">

// //                                             {/* Edit – always visible */}
// //                                             <button
// //                                                 className="mlab-icon-btn mlab-icon-btn--blue"
// //                                                 onClick={() => onEdit(learner)}
// //                                                 title="Edit Details"
// //                                             >
// //                                                 <Edit size={14} />
// //                                             </button>

// //                                             {/* Active & not archived */}
// //                                             {viewMode === 'active' && !learner.isArchived && !showArchived && (
// //                                                 <>
// //                                                     <button
// //                                                         className="mlab-icon-btn mlab-icon-btn--blue"
// //                                                         onClick={() => navigate(`/sor/${learner.id}`)}
// //                                                         title="View SOR"
// //                                                     >
// //                                                         <Eye size={14} />
// //                                                     </button>

// //                                                     <button
// //                                                         className="mlab-icon-btn mlab-icon-btn--blue"
// //                                                         style={{ color: copiedId === learner.idNumber ? '#16a34a' : '' }} onClick={() => handleCopyLink(learner.idNumber)}>
// //                                                         {copiedId === learner.idNumber ? <CopyIcon size={18} /> : <Share2 size={18} />}
// //                                                     </button>

// //                                                     <button
// //                                                         className={`mlab-icon-btn ${learner.authStatus === 'active'
// //                                                             ? 'mlab-icon-btn--emerald'
// //                                                             : 'mlab-icon-btn--green'
// //                                                             }`}
// //                                                         onClick={() => onInvite(learner)}
// //                                                         title={learner.authStatus === 'active' ? 'Resend Invite' : 'Send Invite'}
// //                                                     >
// //                                                         <Mail size={14} />
// //                                                     </button>

// //                                                     <button
// //                                                         className="mlab-icon-btn mlab-icon-btn--amber"
// //                                                         onClick={() => onArchive(learner)}
// //                                                         title="Archive Record"
// //                                                     >
// //                                                         <ArchiveIcon size={14} />
// //                                                     </button>
// //                                                 </>
// //                                             )}

// //                                             {/* Archived – restore only */}
// //                                             {viewMode === 'active' && learner.isArchived && (
// //                                                 <button
// //                                                     className="mlab-icon-btn mlab-icon-btn--emerald"
// //                                                     onClick={() => onRestore(learner)}
// //                                                     title="Restore"
// //                                                 >
// //                                                     <RotateCcw size={14} />
// //                                                 </button>
// //                                             )}

// //                                             {/* Staging – discard only */}
// //                                             {viewMode === 'staging' && (
// //                                                 <button
// //                                                     className="mlab-icon-btn mlab-icon-btn--red"
// //                                                     onClick={() => onDiscard(learner)}
// //                                                     title="Discard Draft"
// //                                                 >
// //                                                     <Trash2 size={14} />
// //                                                 </button>
// //                                             )}
// //                                         </div>
// //                                     </td>
// //                                 </tr>
// //                             );
// //                         })}
// //                     </tbody>
// //                 </table>

// //                 {/* Empty state */}
// //                 {filteredLearners.length === 0 && (
// //                     <div className="mlab-empty">
// //                         <AlertTriangle size={40} color="var(--mlab-green)" style={{ opacity: 0.6 }} />
// //                         <p className="mlab-empty__title">No Learners Found</p>
// //                         <p className="mlab-empty__desc">
// //                             {viewMode === 'active'
// //                                 ? showArchived
// //                                     ? "No archived records found."
// //                                     : "No active learners found. Check the Staging Area for imports."
// //                                 : "Staging area is empty. Import a CSV to get started."}
// //                         </p>
// //                     </div>
// //                 )}
// //             </div>
// //         </div>
// //     );
// // };



// // // // src/components/views/LearnersView.tsx
