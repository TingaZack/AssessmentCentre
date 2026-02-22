// src/components/views/LearnersView.tsx
// Styled to align with mLab Corporate Identity Brand Guide 2019
// All visual styling lives in LearnersView.css

import React, { useState, useMemo, useEffect } from 'react';
import {
    Plus, Upload, Download, Search, Edit, Trash2,
    Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
    Eye, Archive as ArchiveIcon, Mail,
    CheckCheck,
    Share2,
    CopyIcon,
    GraduationCap // Added for Qualification Icon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './LearnersView.css';
import type { DashboardLearner } from '../../../types';

interface LearnersViewProps {
    learners: DashboardLearner[];
    stagingLearners?: DashboardLearner[];
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
    const [selectedQualification, setSelectedQualification] = useState<string>('all'); // ✅ New Qualification State
    const [showArchived, setShowArchived] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Reset selection when switching tabs/filters
    useEffect(() => { setSelectedIds(new Set()); }, [viewMode, showArchived, selectedYear, selectedQualification]);

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

            // 4. Qualification Filter ✅
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

    // Available Qualifications (across both active and staging) ✅
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
            ["Full Name,ID Number,Status,Start Date,Auth Status"].concat(
                filteredLearners.map(l =>
                    `${l.fullName},${l.idNumber},${l.status},${l.trainingStartDate},${l.authStatus || 'pending'}`
                )
            ).join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `learners_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
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
                    Active Records
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

                {/* Qualification Filter (Applies to both Active & Staging) ✅ */}
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
                        {selectedIds.size} Selected
                    </span>
                    <div className="mlab-bulk-actions">

                        {viewMode === 'staging' && (
                            <>
                                <button
                                    className="mlab-btn mlab-btn--green"
                                    onClick={() => executeBulkAction('approve')}
                                >
                                    <ClipboardCheck size={15} /> Approve
                                </button>
                                <button
                                    className="mlab-btn mlab-btn--outline mlab-btn--outline-red"
                                    onClick={() => executeBulkAction('discard')}
                                >
                                    <Trash2 size={15} /> Discard Drafts
                                </button>
                            </>
                        )}

                        {viewMode === 'active' && (
                            showArchived ? (
                                <button
                                    className="mlab-btn mlab-btn--outline mlab-btn--outline-green"
                                    onClick={() => executeBulkAction('restore')}
                                >
                                    <RotateCcw size={15} /> Restore
                                </button>
                            ) : (
                                <button
                                    className="mlab-btn mlab-btn--outline mlab-btn--outline-amber"
                                    onClick={() => executeBulkAction('archive')}
                                >
                                    <ArchiveIcon size={15} /> Archive
                                </button>
                            )
                        )}
                    </div>
                </div>

            ) : (

                /* Standard actions (nothing selected) */
                <div className="mlab-standard-actions">
                    <button
                        className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
                        onClick={handleExport}
                    >
                        <Download size={15} /> Export
                    </button>
                    <button
                        className="mlab-btn mlab-btn--primary"
                        onClick={onUpload}
                    >
                        <Upload size={15} /> Import CSV
                    </button>
                    <button
                        className="mlab-btn mlab-btn--green"
                        onClick={onAdd}
                    >
                        <Plus size={15} /> Add Learner
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
                                    checked={
                                        filteredLearners.length > 0 &&
                                        selectedIds.size === filteredLearners.length
                                    }
                                />
                            </th>
                            <th>Learner</th>
                            <th>Qualification</th>
                            <th>Modules</th>
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
                                        {/* <div className="mlab-cell-name">{learner.fullName}</div>
                                        <div className="mlab-cell-sub">{learner.idNumber}</div> */}
                                        <div>
                                            <div style={{ fontWeight: 600 }}>
                                                {learner.fullName}
                                                {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#374151' }}>Archived</span>}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                                                {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Qualification */}
                                    <td>
                                        <div className="mlab-cell-qual">{learner.qualification.name}</div>
                                        <div className="mlab-cell-sub">{learner.qualification.saqaId}</div>
                                    </td>

                                    {/* Modules */}
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <span className="mlab-badge mlab-badge--active">K: {learner.knowledgeModules.length}</span>
                                            <span className="mlab-badge mlab-badge--active">P: {learner.practicalModules.length}</span>
                                            <span className="mlab-badge mlab-badge--active">W: {learner.workExperienceModules.length}</span>
                                        </div>
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
                                                title="Edit Details"
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
                                                        style={{ color: copiedId === learner.idNumber ? '#16a34a' : '' }} onClick={() => handleCopyLink(learner.idNumber)}>
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
                        <p className="mlab-empty__title">No Learners Found</p>
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



// // src/components/views/LearnersView.tsx

// import React, { useState, useMemo, useEffect } from 'react';
// import {
//     Plus, Upload, Download, Search, Edit, Trash2,
//     Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
//     Eye, Archive as ArchiveIcon, Mail,
//     CheckCheck,
//     Share2,
//     CopyIcon
// } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import './LearnersView.css';
// import type { DashboardLearner } from '../../../types';

// interface LearnersViewProps {
//     learners: DashboardLearner[];
//     stagingLearners?: DashboardLearner[];
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
//     const [showArchived, setShowArchived] = useState(false);
//     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

//     const [copiedId, setCopiedId] = useState<string | null>(null);


//     // Reset selection when switching tabs/filters
//     useEffect(() => { setSelectedIds(new Set()); }, [viewMode, showArchived, selectedYear]);

//     // ─── FILTER LOGIC ───
//     const filteredLearners = useMemo(() => {
//         const sourceData = viewMode === 'staging' ? stagingLearners : learners;
//         return sourceData.filter(learner => {
//             const isArchived = learner.isArchived === true;

//             if (viewMode === 'active') {
//                 if (showArchived && !isArchived) return false;
//                 if (!showArchived && isArchived) return false;
//             }

//             if (searchTerm) {
//                 const s = searchTerm.toLowerCase();
//                 if (!(
//                     learner.fullName?.toLowerCase().includes(s) ||
//                     learner.idNumber?.includes(searchTerm) ||
//                     learner.email?.toLowerCase().includes(s)
//                 )) return false;
//             }

//             if (viewMode === 'active' && selectedYear !== 'all') {
//                 const y = learner.trainingStartDate
//                     ? learner.trainingStartDate.substring(0, 4)
//                     : 'Unknown';
//                 if (y !== selectedYear) return false;
//             }

//             if (filterStatus !== 'all' && learner.status !== filterStatus) return false;

//             return true;
//         });
//     }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, showArchived]);

//     // Available cohort years (active data only)
//     const availableYears = useMemo(() => {
//         const years = new Set<string>();
//         learners.forEach(l => {
//             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
//         });
//         return Array.from(years).sort().reverse();
//     }, [learners]);

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
//             ["Full Name,ID Number,Status,Start Date,Auth Status"].concat(
//                 filteredLearners.map(l =>
//                     `${l.fullName},${l.idNumber},${l.status},${l.trainingStartDate},${l.authStatus || 'pending'}`
//                 )
//             ).join("\n");
//         const link = document.createElement("a");
//         link.setAttribute("href", encodeURI(csvContent));
//         link.setAttribute("download", `learners_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
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
//                     Active Records
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
//                         {selectedIds.size} Selected
//                     </span>
//                     <div className="mlab-bulk-actions">

//                         {viewMode === 'staging' && (
//                             <>
//                                 <button
//                                     className="mlab-btn mlab-btn--green"
//                                     onClick={() => executeBulkAction('approve')}
//                                 >
//                                     <ClipboardCheck size={15} /> Approve
//                                 </button>
//                                 <button
//                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-red"
//                                     onClick={() => executeBulkAction('discard')}
//                                 >
//                                     <Trash2 size={15} /> Discard Drafts
//                                 </button>
//                             </>
//                         )}

//                         {viewMode === 'active' && (
//                             showArchived ? (
//                                 <button
//                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-green"
//                                     onClick={() => executeBulkAction('restore')}
//                                 >
//                                     <RotateCcw size={15} /> Restore
//                                 </button>
//                             ) : (
//                                 <button
//                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-amber"
//                                     onClick={() => executeBulkAction('archive')}
//                                 >
//                                     <ArchiveIcon size={15} /> Archive
//                                 </button>
//                             )
//                         )}
//                     </div>
//                 </div>

//             ) : (

//                 /* Standard actions (nothing selected) */
//                 <div className="mlab-standard-actions">
//                     <button
//                         className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
//                         onClick={handleExport}
//                     >
//                         <Download size={15} /> Export
//                     </button>
//                     <button
//                         className="mlab-btn mlab-btn--primary"
//                         onClick={onUpload}
//                     >
//                         <Upload size={15} /> Import CSV
//                     </button>
//                     <button
//                         className="mlab-btn mlab-btn--green"
//                         onClick={onAdd}
//                     >
//                         <Plus size={15} /> Add Learner
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
//                                     checked={
//                                         filteredLearners.length > 0 &&
//                                         selectedIds.size === filteredLearners.length
//                                     }
//                                 />
//                             </th>
//                             <th>Learner</th>
//                             <th>Qualification</th>
//                             <th>Modules</th>
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
//                                         <div className="mlab-cell-name">{learner.fullName}</div>
//                                         <div className="mlab-cell-sub">{learner.idNumber}</div>
//                                     </td>

//                                     {/* Qualification */}
//                                     <td>
//                                         <div className="mlab-cell-qual">{learner.qualification.name}</div>
//                                         <div className="mlab-cell-sub">{learner.qualification.saqaId}</div>
//                                     </td>

//                                     {/* Modules */}
//                                     <td>
//                                         <div style={{ display: 'flex', gap: '0.5rem' }}>
//                                             <span className="mlab-badge mlab-badge--active">K: {learner.knowledgeModules.length}</span>
//                                             <span className="mlab-badge mlab-badge--active">P: {learner.practicalModules.length}</span>
//                                             <span className="mlab-badge mlab-badge--active">W: {learner.workExperienceModules.length}</span>
//                                         </div>
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
//                                                 title="Edit Details"
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
//                                                         style={{ color: copiedId === learner.idNumber ? '#16a34a' : '' }} onClick={() => handleCopyLink(learner.idNumber)}>
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
//                         <p className="mlab-empty__title">No Learners Found</p>
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
// //     Eye, Archive as ArchiveIcon, Mail
// // } from 'lucide-react';
// // import { useNavigate } from 'react-router-dom';
// // import type { DashboardLearner } from '../../types';

// // interface LearnersViewProps {
// //     learners: DashboardLearner[];           // Live Active Data
// //     stagingLearners?: DashboardLearner[];   // Draft Data from Staging Collection

// //     onAdd: () => void;
// //     onUpload: () => void;
// //     onEdit: (learner: DashboardLearner) => void;

// //     // Single Item Actions
// //     onArchive: (learner: DashboardLearner) => void;
// //     onRestore: (learner: DashboardLearner) => void;
// //     onDiscard: (learner: DashboardLearner) => void; // For Staging only
// //     onInvite: (learner: DashboardLearner) => void;

// //     // Bulk Actions
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
// //     const [showArchived, setShowArchived] = useState(false);
// //     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

// //     // Reset selection when switching tabs/filters
// //     useEffect(() => { setSelectedIds(new Set()); }, [viewMode, showArchived, selectedYear]);

// //     // ─── FILTER LOGIC ───
// //     const filteredLearners = useMemo(() => {
// //         // 1. SELECT SOURCE
// //         const sourceData = viewMode === 'staging' ? stagingLearners : learners;

// //         return sourceData.filter(learner => {
// //             const isArchived = learner.isArchived === true;

// //             // 2. ARCHIVE FILTER (Active Tab Only)
// //             if (viewMode === 'active') {
// //                 if (showArchived) {
// //                     if (!isArchived) return false; // Show ONLY archived
// //                 } else {
// //                     if (isArchived) return false;  // Show ONLY active
// //                 }
// //             }

// //             // 3. SEARCH FILTER
// //             if (searchTerm) {
// //                 const searchLower = searchTerm.toLowerCase();
// //                 const matches = (
// //                     learner.fullName?.toLowerCase().includes(searchLower) ||
// //                     learner.idNumber?.includes(searchTerm) ||
// //                     learner.email?.toLowerCase().includes(searchLower)
// //                 );
// //                 if (!matches) return false;
// //             }

// //             // 4. YEAR FILTER (Active Tab Only)
// //             if (viewMode === 'active' && selectedYear !== 'all') {
// //                 const y = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
// //                 if (y !== selectedYear) return false;
// //             }

// //             // 5. STATUS FILTER
// //             if (filterStatus !== 'all' && learner.status !== filterStatus) return false;

// //             return true;
// //         });
// //     }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, showArchived]);

// //     // Compute available years from Active data only
// //     const availableYears = useMemo(() => {
// //         const years = new Set<string>();
// //         learners.forEach(l => {
// //             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
// //         });
// //         return Array.from(years).sort().reverse();
// //     }, [learners]);

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
// //         const newSet = new Set(selectedIds);
// //         newSet.has(id) ? newSet.delete(id) : newSet.add(id);
// //         setSelectedIds(newSet);
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

// //     const handleExport = () => {
// //         const csvContent = "data:text/csv;charset=utf-8," +
// //             ["Full Name,ID Number,Status,Start Date,Auth Status"].concat(
// //                 filteredLearners.map(l => `${l.fullName},${l.idNumber},${l.status},${l.trainingStartDate},${l.authStatus || 'pending'}`)
// //             ).join("\n");
// //         const encodedUri = encodeURI(csvContent);
// //         const link = document.createElement("a");
// //         link.setAttribute("href", encodedUri);
// //         link.setAttribute("download", `learners_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
// //         document.body.appendChild(link);
// //         link.click();
// //     };

// //     return (
// //         <>
// //             {/* ─── TABS ─── */}
// //             <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
// //                 <button
// //                     onClick={() => { setViewMode('active'); setShowArchived(false); }}
// //                     style={{
// //                         padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
// //                         borderBottom: viewMode === 'active' ? '3px solid #6366f1' : '3px solid transparent',
// //                         color: viewMode === 'active' ? '#6366f1' : '#64748b', fontWeight: 600, transition: 'all 0.2s'
// //                     }}
// //                 >
// //                     Active Records ({activeCount})
// //                 </button>
// //                 <button
// //                     onClick={() => setViewMode('staging')}
// //                     style={{
// //                         padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
// //                         borderBottom: viewMode === 'staging' ? '3px solid #f59e0b' : '3px solid transparent',
// //                         color: viewMode === 'staging' ? '#f59e0b' : '#64748b', fontWeight: 600, transition: 'all 0.2s'
// //                     }}
// //                 >
// //                     Staging Area
// //                     {stagingCount > 0 && (
// //                         <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', marginLeft: '8px', fontWeight: 'bold' }}>
// //                             {stagingCount}
// //                         </span>
// //                     )}
// //                 </button>
// //             </div>

// //             {/* ─── TOOLBAR ─── */}
// //             <div className="edit-grid" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
// //                 {/* Search Bar */}
// //                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', flex: 2, minWidth: '250px' }}>
// //                     <Search size={20} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// //                     <input type="text" placeholder="Search by Name, ID, or Email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%' }} />
// //                 </div>

// //                 {viewMode === 'active' && (
// //                     <>
// //                         {/* Year Filter */}
// //                         <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
// //                             <Calendar size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// //                             <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ minWidth: '120px' }}>
// //                                 <option value="all">All Years</option>
// //                                 {availableYears.map(year => <option key={year} value={year}>{year} Cohort</option>)}
// //                             </select>
// //                         </div>

// //                         {/* Archive Toggle */}
// //                         <label style={{
// //                             display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
// //                             padding: '0.5rem 0.75rem', borderRadius: '6px',
// //                             background: showArchived ? '#fff7ed' : 'transparent',
// //                             border: showArchived ? '1px solid #fdba74' : '1px solid transparent',
// //                             transition: 'all 0.2s'
// //                         }}>
// //                             <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
// //                             <span style={{ color: showArchived ? '#c2410c' : 'inherit', fontWeight: showArchived ? 600 : 400 }}>
// //                                 Show Archived ({archivedCount})
// //                             </span>
// //                         </label>
// //                     </>
// //                 )}
// //             </div>

// //             {/* ─── ACTION BAR ─── */}
// //             {selectedIds.size > 0 ? (
// //                 // BULK ACTIONS (Items Selected)
// //                 <div style={{ background: '#f8fafc', padding: '10px 20px', borderRadius: '8px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s' }}>
// //                     <div style={{ fontWeight: 600, color: '#334155' }}>{selectedIds.size} Selected</div>
// //                     <div style={{ display: 'flex', gap: '10px' }}>

// //                         {/* Staging Bulk Actions */}
// //                         {viewMode === 'staging' && (
// //                             <>
// //                                 <button className="btn btn-primary" onClick={() => executeBulkAction('approve')} style={{ background: '#10b981', borderColor: '#10b981' }}>
// //                                     <ClipboardCheck size={16} style={{ marginRight: 5 }} /> Approve
// //                                 </button>
// //                                 <button className="btn btn-outline" onClick={() => executeBulkAction('discard')} style={{ color: '#ef4444', borderColor: '#ef4444' }}>
// //                                     <Trash2 size={16} style={{ marginRight: 5 }} /> Discard Drafts
// //                                 </button>
// //                             </>
// //                         )}

// //                         {/* Active Bulk Actions */}
// //                         {viewMode === 'active' && (
// //                             <>
// //                                 {showArchived ? (
// //                                     <button className="btn btn-outline" onClick={() => executeBulkAction('restore')} style={{ color: '#d97706', borderColor: '#d97706' }}>
// //                                         <RotateCcw size={16} style={{ marginRight: 5 }} /> Restore
// //                                     </button>
// //                                 ) : (
// //                                     <button className="btn btn-outline" onClick={() => executeBulkAction('archive')} style={{ color: '#d97706', borderColor: '#d97706' }}>
// //                                         <ArchiveIcon size={16} style={{ marginRight: 5 }} /> Archive
// //                                     </button>
// //                                 )}
// //                             </>
// //                         )}
// //                     </div>
// //                 </div>
// //             ) : (
// //                 // STANDARD ACTIONS (Nothing Selected)
// //                 <div className="admin-actions" style={{ marginBottom: '1rem', justifyContent: 'flex-end', display: 'flex', gap: '10px' }}>
// //                     <button className="btn btn-outline" onClick={handleExport}>
// //                         <Download size={18} style={{ marginRight: '8px' }} /> <span>Export</span>
// //                     </button>

// //                     <button className="btn btn-primary" onClick={onUpload}>
// //                         <Upload size={18} style={{ marginRight: '8px' }} /> <span>Import CSV</span>
// //                     </button>

// //                     <button className="btn btn-primary" onClick={onAdd}>
// //                         <Plus size={18} style={{ marginRight: '8px' }} /> <span>Add Learner</span>
// //                     </button>
// //                 </div>
// //             )}

// //             {/* ─── TABLE ─── */}
// //             <div className="list-view">
// //                 <table className="assessment-table">
// //                     <thead>
// //                         <tr>
// //                             <th style={{ width: '40px' }}><input type="checkbox" onChange={handleSelectAll} checked={filteredLearners.length > 0 && selectedIds.size === filteredLearners.length} /></th>
// //                             <th>Learner</th>
// //                             <th>Qualification</th>
// //                             <th>Status</th>
// //                             <th>Actions</th>
// //                         </tr>
// //                     </thead>
// //                     <tbody>
// //                         {filteredLearners.map(learner => (
// //                             <tr key={learner.id} style={{ opacity: learner.isArchived ? 0.7 : 1, background: selectedIds.has(learner.id) ? '#f1f5f9' : 'transparent', transition: 'background 0.2s' }}>
// //                                 <td><input type="checkbox" checked={selectedIds.has(learner.id)} onChange={() => handleSelectOne(learner.id)} /></td>
// //                                 <td>
// //                                     <div style={{ fontWeight: 600, color: '#0f172a' }}>{learner.fullName}</div>
// //                                     <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{learner.idNumber}</div>
// //                                 </td>
// //                                 <td>
// //                                     <div style={{ fontSize: '0.9rem' }}>{learner.qualification.name}</div>
// //                                     <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{learner.qualification.saqaId}</div>
// //                                 </td>
// //                                 <td>
// //                                     {learner.isArchived ?
// //                                         <span className="badge" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1' }}>Archived</span> :
// //                                         viewMode === 'staging' ?
// //                                             <span className="badge" style={{ background: '#fef08a', color: '#854d0e', border: '1px solid #fde047' }}>Draft</span> :
// //                                             <span className="badge" style={{ background: '#bbf7d0', color: '#166534', border: '1px solid #86efac' }}>Active</span>
// //                                     }
// //                                     {/* Optional: Show Inviting status badge if needed, e.g. Invited */}
// //                                 </td>
// //                                 <td>
// //                                     <div style={{ display: 'flex', gap: '8px' }}>

// //                                         {/* EDIT BUTTON (Always visible) */}
// //                                         <button className="icon-btn action-edit" onClick={() => onEdit(learner)} title="Edit Details">
// //                                             <Edit size={16} />
// //                                         </button>

// //                                         {/* VIEW MODE: ACTIVE & NOT ARCHIVED */}
// //                                         {viewMode === 'active' && !learner.isArchived && !showArchived && (
// //                                             <>
// //                                                 <button className="icon-btn action-view" onClick={() => navigate(`/sor/${learner.id}`)} title="View SOR">
// //                                                     <Eye size={16} />
// //                                                 </button>

// //                                                 <button
// //                                                     className="icon-btn"
// //                                                     onClick={() => onInvite(learner)}
// //                                                     title={learner.authStatus === 'active' ? "Resend Invite" : "Send Invite"}
// //                                                     style={{ color: learner.authStatus === 'active' ? '#10b981' : '#6366f1' }}
// //                                                 >
// //                                                     <Mail size={16} />
// //                                                 </button>

// //                                                 {/* ARCHIVE BUTTON (Box Icon) - Soft Delete */}
// //                                                 <button className="icon-btn" onClick={() => onArchive(learner)} title="Archive Record" style={{ color: '#d97706' }}>
// //                                                     <ArchiveIcon size={16} />
// //                                                 </button>
// //                                             </>
// //                                         )}

// //                                         {/* VIEW MODE: ARCHIVED (Restore Only, No Delete) */}
// //                                         {viewMode === 'active' && learner.isArchived && (
// //                                             <button className="icon-btn" onClick={() => onRestore(learner)} title="Restore" style={{ color: '#10b981' }}>
// //                                                 <RotateCcw size={16} />
// //                                             </button>
// //                                         )}

// //                                         {/* VIEW MODE: STAGING (Discard Only) */}
// //                                         {viewMode === 'staging' && (
// //                                             <button className="icon-btn delete" onClick={() => onDiscard(learner)} title="Discard Draft">
// //                                                 <Trash2 size={16} />
// //                                             </button>
// //                                         )}

// //                                     </div>
// //                                 </td>
// //                             </tr>
// //                         ))}
// //                     </tbody>
// //                 </table>

// //                 {filteredLearners.length === 0 && (
// //                     <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>
// //                         <AlertTriangle size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
// //                         <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>No learners found</p>
// //                         <p style={{ fontSize: '0.9rem' }}>
// //                             {viewMode === 'active'
// //                                 ? showArchived ? "No archived records found." : "No active learners found. Check the 'Staging Area' for imports."
// //                                 : "Staging area is empty. Import a CSV to get started."}
// //                         </p>
// //                     </div>
// //                 )}
// //             </div>
// //         </>
// //     );
// // };

// // // import React, { useState, useMemo, useEffect } from 'react';
// // // import {
// // //     Plus, Upload, Download, Search, Filter, Edit, Trash2,
// // //     Calendar, Archive, CheckCircle, XCircle, Check, Share2, Eye,
// // //     RotateCcw, CheckSquare, X, PlayCircle, ClipboardCheck
// // // } from 'lucide-react';
// // // import { useNavigate } from 'react-router-dom';
// // // import type { DashboardLearner } from '../../types';

// // // interface LearnersViewProps {
// // //     learners: DashboardLearner[];
// // //     onAdd: () => void;
// // //     onUpload: () => void;
// // //     onEdit: (learner: DashboardLearner) => void;
// // //     onDelete: (learner: DashboardLearner) => void;
// // //     onArchiveCohort: (year: string) => void;
// // //     onRestore: (learner: DashboardLearner) => void;
// // //     onBulkRestore?: (learners: DashboardLearner[]) => void;
// // //     onBulkDelete?: (learners: DashboardLearner[]) => void;
// // //     onBulkApprove?: (learners: DashboardLearner[]) => void; // New for Staging
// // // }

// // // export const LearnersView: React.FC<LearnersViewProps> = ({
// // //     learners, onAdd, onUpload, onEdit, onDelete, onArchiveCohort, onRestore,
// // //     onBulkRestore, onBulkDelete, onBulkApprove
// // // }) => {
// // //     const navigate = useNavigate();

// // //     // ─── VIEW STATE ───
// // //     const [viewMode, setViewMode] = useState<'active' | 'staging'>('active');
// // //     const [searchTerm, setSearchTerm] = useState('');
// // //     const [filterStatus, setFilterStatus] = useState('all');
// // //     const [selectedYear, setSelectedYear] = useState<string>('all');
// // //     const [showArchived, setShowArchived] = useState(false);
// // //     const [copiedId, setCopiedId] = useState<string | null>(null);
// // //     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

// // //     // Reset selection when switching tabs or filters
// // //     useEffect(() => {
// // //         setSelectedIds(new Set());
// // //     }, [showArchived, selectedYear, filterStatus, viewMode]);

// // //     // ─── COMPUTED DATA ───
// // //     const availableYears = useMemo(() => {
// // //         const years = new Set<string>();
// // //         learners.forEach(l => {
// // //             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
// // //         });
// // //         return Array.from(years).sort().reverse();
// // //     }, [learners]);

// // //     const filteredLearners = useMemo(() => {
// // //         return learners.filter(learner => {
// // //             // 1. Staging vs Active Filter
// // //             const isDraft = (learner as any).isDraft === true;
// // //             const matchesMode = viewMode === 'staging' ? isDraft : !isDraft;
// // //             if (!matchesMode) return false;

// // //             // 2. Search Filter
// // //             const matchesSearch = learner.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // //                 learner.idNumber.includes(searchTerm) ||
// // //                 learner.email.toLowerCase().includes(searchTerm.toLowerCase());

// // //             // 3. Status Filter
// // //             const matchesStatus = filterStatus === 'all' || learner.status === filterStatus;

// // //             // 4. Year Filter
// // //             // const learnerYear = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
// // //             // const matchesYear = selectedYear === 'all' || learnerYear === selectedYear;

// // //             const learnerYear = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
// // //             const matchesYear = viewMode === 'staging' ? true : (selectedYear === 'all' || learnerYear === selectedYear);

// // //             // 5. Archive Filter (Don't show archived in staging usually)
// // //             const matchesArchived = viewMode === 'staging' ? true : (showArchived ? learner.isArchived : !learner.isArchived);

// // //             return matchesSearch && matchesStatus && matchesYear && matchesArchived;
// // //         });
// // //     }, [learners, viewMode, searchTerm, filterStatus, selectedYear, showArchived]);

// // //     // ─── HANDLERS ───
// // //     const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         if (e.target.checked) {
// // //             setSelectedIds(new Set(filteredLearners.map(l => l.id)));
// // //         } else {
// // //             setSelectedIds(new Set());
// // //         }
// // //     };

// // //     const handleSelectOne = (id: string) => {
// // //         const newSet = new Set(selectedIds);
// // //         newSet.has(id) ? newSet.delete(id) : newSet.add(id);
// // //         setSelectedIds(newSet);
// // //     };

// // //     const executeBulkAction = (actionType: 'restore' | 'delete' | 'approve') => {
// // //         const selectedLearners = learners.filter(l => selectedIds.has(l.id));

// // //         if (actionType === 'approve') {
// // //             onBulkApprove?.(selectedLearners);
// // //         } else if (actionType === 'restore') {
// // //             onBulkRestore?.(selectedLearners);
// // //         } else {
// // //             onBulkDelete?.(selectedLearners);
// // //         }
// // //         setSelectedIds(new Set());
// // //     };

// // //     const handleCopyLink = (idNumber: string) => {
// // //         const link = `${window.location.origin}/portal?id=${idNumber}`;
// // //         navigator.clipboard.writeText(link).then(() => {
// // //             setCopiedId(idNumber);
// // //             setTimeout(() => setCopiedId(null), 2000);
// // //         });
// // //     };

// // //     const handleExport = () => {
// // //         const headers = ['Full Name', 'ID Number', 'Email', 'Start Date', 'Qualification', 'Status'];
// // //         const rows = filteredLearners.map(l => [
// // //             l.fullName, l.idNumber, l.email, l.trainingStartDate, l.qualification.name, l.status,
// // //         ]);
// // //         const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
// // //         const blob = new Blob([csvContent], { type: 'text/csv' });
// // //         const url = window.URL.createObjectURL(blob);
// // //         const a = document.createElement('a');
// // //         a.href = url; a.download = `learners-${viewMode}.csv`; a.click();
// // //     };

// // //     return (
// // //         <>
// // //             {/* ─── TABS ─── */}
// // //             <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
// // //                 <button
// // //                     onClick={() => setViewMode('active')}
// // //                     style={{
// // //                         padding: '0.75rem 1rem', border: 'none', background: 'none', cursor: 'pointer',
// // //                         borderBottom: viewMode === 'active' ? '3px solid #6366f1' : '3px solid transparent',
// // //                         color: viewMode === 'active' ? '#6366f1' : '#64748b', fontWeight: 600, transition: '0.2s'
// // //                     }}
// // //                 >
// // //                     Active Records ({learners.filter(l => !(l as any).isDraft).length})
// // //                 </button>
// // //                 <button
// // //                     onClick={() => setViewMode('staging')}
// // //                     style={{
// // //                         padding: '0.75rem 1rem', border: 'none', background: 'none', cursor: 'pointer',
// // //                         borderBottom: viewMode === 'staging' ? '3px solid #f59e0b' : '3px solid transparent',
// // //                         color: viewMode === 'staging' ? '#f59e0b' : '#64748b', fontWeight: 600, transition: '0.2s'
// // //                     }}
// // //                 >
// // //                     Staging Area ({learners.filter(l => (l as any).isDraft).length})
// // //                 </button>
// // //             </div>

// // //             {/* ─── TOOLBAR ─── */}
// // //             <div className="edit-grid" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
// // //                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', flex: 2, minWidth: '250px' }}>
// // //                     <Search size={20} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // //                     <input type="text" placeholder="Search by name, ID, or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%' }} />
// // //                 </div>

// // //                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
// // //                     <Calendar size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // //                     <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ minWidth: '120px' }}>
// // //                         <option value="all">All Years</option>
// // //                         {availableYears.map(year => <option key={year} value={year}>{year} Cohort</option>)}
// // //                     </select>
// // //                 </div>

// // //                 {viewMode === 'active' && (
// // //                     <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
// // //                         <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
// // //                         Show Archived
// // //                     </label>
// // //                 )}
// // //             </div>

// // //             {/* ─── ACTIONS / BULK BAR ─── */}
// // //             {selectedIds.size > 0 ? (
// // //                 <div style={{
// // //                     background: viewMode === 'staging' ? '#fffbeb' : (showArchived ? '#fff7ed' : '#f0f9ff'),
// // //                     border: `1px solid ${viewMode === 'staging' ? '#fcd34d' : (showArchived ? '#fb923c' : '#bae6fd')}`,
// // //                     padding: '0.75rem 1.5rem', borderRadius: '8px', marginBottom: '1rem',
// // //                     display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'fadeIn 0.2s ease'
// // //                 }}>
// // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: viewMode === 'staging' ? '#92400e' : '#0369a1' }}>
// // //                         <CheckSquare size={20} />
// // //                         <span>{selectedIds.size} Learners Selected</span>
// // //                     </div>
// // //                     <div style={{ display: 'flex', gap: '1rem' }}>
// // //                         {viewMode === 'staging' ? (
// // //                             <button className="btn btn-primary" onClick={() => executeBulkAction('approve')} style={{ background: '#10b981', borderColor: '#10b981' }}>
// // //                                 <ClipboardCheck size={16} style={{ marginRight: '6px' }} /> Approve & Activate
// // //                             </button>
// // //                         ) : showArchived ? (
// // //                             <button className="btn btn-primary" onClick={() => executeBulkAction('restore')} style={{ background: '#d97706', borderColor: '#d97706' }}>
// // //                                 <RotateCcw size={16} style={{ marginRight: '6px' }} /> Restore Selected
// // //                             </button>
// // //                         ) : null}
// // //                         <button className="btn btn-outline" onClick={() => executeBulkAction('delete')} style={{ color: '#dc2626', borderColor: '#dc2626' }}>
// // //                             <Trash2 size={16} style={{ marginRight: '6px' }} /> {viewMode === 'staging' ? 'Discard' : 'Archive'} Selected
// // //                         </button>
// // //                         <button className="icon-btn" onClick={() => setSelectedIds(new Set())}><X size={20} /></button>
// // //                     </div>
// // //                 </div>
// // //             ) : (
// // //                 <div className="admin-actions" style={{ marginBottom: '1rem', justifyContent: 'flex-end' }}>
// // //                     <button className="btn btn-outline" onClick={handleExport}><Download size={18} /> <span>Export</span></button>
// // //                     <button className="btn btn-primary" onClick={onUpload}><Upload size={18} /> <span>Import CSV</span></button>
// // //                     <button className="btn btn-primary" onClick={onAdd}><Plus size={18} /> <span>Add Learner</span></button>
// // //                 </div>
// // //             )}

// // //             {/* ─── DATA TABLE ─── */}
// // //             <div className="list-view">
// // //                 <table className="assessment-table">
// // //                     <thead>
// // //                         <tr>
// // //                             <th style={{ width: '40px' }}>
// // //                                 <input
// // //                                     type="checkbox"
// // //                                     checked={filteredLearners.length > 0 && selectedIds.size === filteredLearners.length}
// // //                                     onChange={handleSelectAll}
// // //                                     style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
// // //                                 />
// // //                             </th>
// // //                             <th>Learner Details</th>
// // //                             <th>Qualification</th>
// // //                             <th>Progress</th>
// // //                             <th>Actions</th>
// // //                         </tr>
// // //                     </thead>
// // //                     <tbody>
// // //                         {filteredLearners.map((learner) => (
// // //                             <tr key={learner.id} style={{
// // //                                 opacity: learner.isArchived ? 0.7 : 1,
// // //                                 background: selectedIds.has(learner.id) ? (viewMode === 'staging' ? '#fffbeb' : '#eff6ff') : 'transparent'
// // //                             }}>
// // //                                 <td>
// // //                                     <input
// // //                                         type="checkbox"
// // //                                         checked={selectedIds.has(learner.id)}
// // //                                         onChange={() => handleSelectOne(learner.id)}
// // //                                         style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
// // //                                     />
// // //                                 </td>
// // //                                 <td>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                                         <div style={{
// // //                                             width: '40px', height: '40px', borderRadius: '50%',
// // //                                             background: viewMode === 'staging' ? '#fef3c7' : '#e0f2fe',
// // //                                             display: 'flex', alignItems: 'center', justifyContent: 'center',
// // //                                             fontWeight: 'bold', color: viewMode === 'staging' ? '#d97706' : '#0369a1'
// // //                                         }}>
// // //                                             {learner.fullName.charAt(0)}
// // //                                         </div>
// // //                                         <div>
// // //                                             <div style={{ fontWeight: 600 }}>
// // //                                                 {learner.fullName}
// // //                                                 {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#374151' }}>Archived</span>}
// // //                                                 {(learner as any).isDraft && <span style={{ fontSize: '0.7rem', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#92400e' }}>Draft</span>}
// // //                                             </div>
// // //                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
// // //                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
// // //                                             </div>
// // //                                         </div>
// // //                                     </div>
// // //                                 </td>
// // //                                 <td>
// // //                                     <div style={{ fontWeight: 500 }}>{learner.qualification.name || "N/A"}</div>
// // //                                     <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>SAQA: {learner.qualification.saqaId}</div>
// // //                                 </td>
// // //                                 <td>
// // //                                     <div style={{ display: 'flex', gap: '0.5rem' }}>
// // //                                         <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>K: {learner.knowledgeModules.length}</span>
// // //                                         <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>P: {learner.practicalModules.length}</span>
// // //                                         <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>W: {learner.workExperienceModules.length}</span>
// // //                                     </div>
// // //                                 </td>
// // //                                 <td>
// // //                                     <div style={{ display: 'flex', gap: '0.5rem' }}>
// // //                                         {viewMode === 'staging' ? (
// // //                                             <button className="icon-btn action-view" style={{ color: '#10b981' }} onClick={() => onBulkApprove?.([learner])} title="Approve">
// // //                                                 <CheckCircle size={18} />
// // //                                             </button>
// // //                                         ) : learner.isArchived ? (
// // //                                             <button className="icon-btn action-view" title="Restore" onClick={() => onRestore(learner)} style={{ color: '#d97706' }}>
// // //                                                 <RotateCcw size={18} />
// // //                                             </button>
// // //                                         ) : (
// // //                                             <button className="icon-btn action-view" onClick={() => navigate(`/sor/${learner.id}`)} title="View"><Eye size={18} /></button>
// // //                                         )}

// // //                                         <button className="icon-btn action-edit" onClick={() => onEdit(learner)}><Edit size={18} /></button>
// // //                                         <button className="icon-btn delete" onClick={() => onDelete(learner)}><Trash2 size={18} /></button>
// // //                                     </div>
// // //                                 </td>
// // //                             </tr>
// // //                         ))}
// // //                     </tbody>
// // //                 </table>
// // //                 {filteredLearners.length === 0 && (
// // //                     <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
// // //                         <PlayCircle size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
// // //                         <p>No learners found in the {viewMode} area.</p>
// // //                     </div>
// // //                 )}
// // //             </div>
// // //         </>
// // //     );
// // // };

// // // // import React, { useState, useMemo } from 'react';
// // // // import {
// // // //     Plus, Upload, Download, Search, Filter, Edit, Trash2,
// // // //     Calendar, Archive, CheckCircle, XCircle, Check, Share2, Eye
// // // // } from 'lucide-react';
// // // // import { useNavigate } from 'react-router-dom';
// // // // import type { DashboardLearner } from '../../types';

// // // // interface LearnersViewProps {
// // // //     learners: DashboardLearner[];
// // // //     onAdd: () => void;
// // // //     onUpload: () => void;
// // // //     onEdit: (learner: DashboardLearner) => void;
// // // //     onDelete: (learner: DashboardLearner) => void;
// // // //     onArchiveCohort: (year: string) => void;
// // // // }

// // // // export const LearnersView: React.FC<LearnersViewProps> = ({ learners, onAdd, onUpload, onEdit, onDelete, onArchiveCohort }) => {
// // // //     const navigate = useNavigate();

// // // //     // Local Filter State
// // // //     const [searchTerm, setSearchTerm] = useState('');
// // // //     const [filterStatus, setFilterStatus] = useState('all');
// // // //     const [selectedYear, setSelectedYear] = useState<string>('all');
// // // //     const [showArchived, setShowArchived] = useState(false);
// // // //     const [copiedId, setCopiedId] = useState<string | null>(null);

// // // //     // Compute Years
// // // //     const availableYears = useMemo(() => {
// // // //         const years = new Set<string>();
// // // //         learners.forEach(l => {
// // // //             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
// // // //         });
// // // //         return Array.from(years).sort().reverse();
// // // //     }, [learners]);

// // // //     // Filter Logic
// // // //     const filteredLearners = learners.filter(learner => {
// // // //         const matchesSearch = learner.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // // //             learner.idNumber.includes(searchTerm) ||
// // // //             learner.email.toLowerCase().includes(searchTerm.toLowerCase());
// // // //         const matchesStatus = filterStatus === 'all' || learner.status === filterStatus;
// // // //         const learnerYear = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
// // // //         const matchesYear = selectedYear === 'all' || learnerYear === selectedYear;
// // // //         const matchesArchived = showArchived ? true : !learner.isArchived;

// // // //         return matchesSearch && matchesStatus && matchesYear && matchesArchived;
// // // //     });

// // // //     const handleCopyLink = (learnerIdNumber: string) => {
// // // //         const link = `${window.location.origin}/portal?id=${learnerIdNumber}`;
// // // //         navigator.clipboard.writeText(link).then(() => {
// // // //             setCopiedId(learnerIdNumber);
// // // //             setTimeout(() => setCopiedId(null), 2000);
// // // //         });
// // // //     };

// // // //     const handleExport = () => {
// // // //         const headers = ['Full Name', 'ID Number', 'Email', 'Start Date', 'Qualification', 'Status'];
// // // //         const rows = filteredLearners.map(l => [
// // // //             l.fullName, l.idNumber, l.email, l.trainingStartDate, l.qualification.name, l.status,
// // // //         ]);
// // // //         const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
// // // //         const blob = new Blob([csvContent], { type: 'text/csv' });
// // // //         const url = window.URL.createObjectURL(blob);
// // // //         const a = document.createElement('a');
// // // //         a.href = url; a.download = 'learners-export.csv'; a.click();
// // // //     };

// // // //     return (
// // // //         <>
// // // //             <div className="edit-grid" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
// // // //                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', flex: 2, minWidth: '250px' }}>
// // // //                     <Search size={20} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // // //                     <input type="text" placeholder="Search by name, ID, or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%' }} />
// // // //                 </div>
// // // //                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
// // // //                     <Calendar size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // // //                     <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ minWidth: '120px' }}>
// // // //                         <option value="all">All Years</option>
// // // //                         {availableYears.map(year => <option key={year} value={year}>{year} Cohort</option>)}
// // // //                     </select>
// // // //                 </div>
// // // //                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
// // // //                     <Filter size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // // //                     <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
// // // //                         <option value="all">All Status</option>
// // // //                         <option value="completed">Completed</option>
// // // //                         <option value="in-progress">In Progress</option>
// // // //                         <option value="pending">Pending</option>
// // // //                     </select>
// // // //                 </div>
// // // //                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
// // // //                     <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
// // // //                     Show Archived
// // // //                 </label>
// // // //                 {selectedYear !== 'all' && !showArchived && (
// // // //                     <button className="btn btn-outline" onClick={() => onArchiveCohort(selectedYear)} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
// // // //                         <Archive size={16} /> Archive {selectedYear}
// // // //                     </button>
// // // //                 )}
// // // //             </div>

// // // //             <div className="admin-actions" style={{ marginBottom: '1rem', justifyContent: 'flex-end' }}>
// // // //                 <button className="btn btn-outline" onClick={handleExport}><Download size={18} /> <span>Export</span></button>
// // // //                 <button className="btn btn-primary" onClick={onUpload}><Upload size={18} /> <span>Upload Master CSV</span></button>
// // // //                 <button className="btn btn-primary" onClick={onAdd}><Plus size={18} /> <span>Add Learner</span></button>
// // // //             </div>

// // // //             <div className="list-view">
// // // //                 <table className="assessment-table">
// // // //                     <thead>
// // // //                         <tr>
// // // //                             <th>Learner Details</th>
// // // //                             <th>Qualification</th>
// // // //                             <th>Progress</th>
// // // //                             <th>EISA Status</th>
// // // //                             <th>Actions</th>
// // // //                         </tr>
// // // //                     </thead>
// // // //                     <tbody>
// // // //                         {filteredLearners.map((learner) => (
// // // //                             <tr key={learner.id} style={{ opacity: learner.isArchived ? 0.6 : 1, background: learner.isArchived ? '#7d6939' : 'transparent' }}>
// // // //                                 <td>
// // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // // //                                         <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#0369a1' }}>
// // // //                                             {learner.fullName.charAt(0)}
// // // //                                         </div>
// // // //                                         <div>
// // // //                                             <div style={{ fontWeight: 600 }}>
// // // //                                                 {learner.fullName}
// // // //                                                 {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#374151' }}>Archived</span>}
// // // //                                             </div>
// // // //                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
// // // //                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
// // // //                                             </div>
// // // //                                         </div>
// // // //                                     </div>
// // // //                                 </td>
// // // //                                 <td>
// // // //                                     <div style={{ fontWeight: 500 }}>{learner.qualification.name || "N/A"}</div>
// // // //                                     <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>SAQA: {learner.qualification.saqaId}</div>
// // // //                                 </td>
// // // //                                 <td>
// // // //                                     <div style={{ display: 'flex', gap: '0.5rem' }}>
// // // //                                         <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#5277c1', borderRadius: '4px' }}>K: {learner.knowledgeModules.length}</span>
// // // //                                         <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#5277c1', borderRadius: '4px' }}>P: {learner.practicalModules.length}</span>
// // // //                                         <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#5277c1', borderRadius: '4px' }}>W: {learner.workExperienceModules.length}</span>
// // // //                                     </div>
// // // //                                 </td>
// // // //                                 <td>
// // // //                                     <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500, color: learner.eisaAdmission ? '#16a34a' : '#ef4444' }}>
// // // //                                         {learner.eisaAdmission ? <><CheckCircle size={16} /> Admitted</> : <><XCircle size={16} /> Pending</>}
// // // //                                     </span>
// // // //                                 </td>
// // // //                                 <td>
// // // //                                     <div style={{ display: 'flex', gap: '0.5rem' }}>
// // // //                                         <button className="icon-btn action-view" onClick={() => navigate(`/sor/${learner.id}`)}><Eye size={18} /></button>
// // // //                                         <button className="icon-btn" style={{ color: copiedId === learner.idNumber ? '#16a34a' : 'white' }} onClick={() => handleCopyLink(learner.idNumber)}>
// // // //                                             {copiedId === learner.idNumber ? <Check size={18} /> : <Share2 size={18} />}
// // // //                                         </button>
// // // //                                         <button className="icon-btn action-edit" onClick={() => onEdit(learner)}><Edit size={18} /></button>
// // // //                                         <button className="icon-btn delete" onClick={() => onDelete(learner)}><Trash2 size={18} /></button>
// // // //                                     </div>
// // // //                                 </td>
// // // //                             </tr>
// // // //                         ))}
// // // //                     </tbody>
// // // //                 </table>
// // // //             </div>
// // // //         </>
// // // //     );
// // // // };