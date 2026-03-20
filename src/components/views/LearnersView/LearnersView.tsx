// src/components/views/LearnersView.tsx


import React, { useState, useMemo, useEffect } from 'react';
import {
    Plus, Upload, Download, Search, Edit, Trash2,
    Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
    Eye, Archive as ArchiveIcon, Mail,
    Share2, GraduationCap, Users, History,
    ShieldCheck, X, AlertCircle,
    Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './LearnersView.css';
import type { DashboardLearner, Cohort } from '../../../types';
import { useStore } from '../../../store/useStore';

interface LearnersViewProps {
    learners: DashboardLearner[];
    stagingLearners?: DashboardLearner[];
    cohorts?: Cohort[];
    onAdd: () => void;
    onUpload: () => void;
    onEdit: (learner: DashboardLearner) => void;
    onArchive: (learner: DashboardLearner) => void;
    onRestore: (learner: DashboardLearner) => void;
    onDiscard: (learner: DashboardLearner) => void;
    onInvite: (learner: DashboardLearner) => void;
    onArchiveCohort: (year: string) => void;
    onDeletePermanent?: (learner: DashboardLearner, audit: { reason: string; adminId: string; adminName: string }) => Promise<void>;
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
    onBulkRestore, onBulkArchive, onBulkApprove, onBulkDiscard,
    onDeletePermanent
}) => {
    const navigate = useNavigate();
    const currentUser = useStore((state) => state.user);

    // ─── VIEW STATE ───
    const [viewMode, setViewMode] = useState<'active' | 'staging' | 'offline'>('active');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedYear, setSelectedYear] = useState<string>('all');
    const [selectedQualification, setSelectedQualification] = useState<string>('all');
    const [showArchived, setShowArchived] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [web3Status, setWeb3Status] = useState<'all' | 'minted' | 'pending'>('all');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const [deletingLearner, setDeletingLearner] = useState<DashboardLearner | null>(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        setSelectedIds(new Set());
    }, [viewMode, showArchived, selectedYear, selectedQualification, web3Status]);

    const learnerCountsById = useMemo(() => {
        const counts: Record<string, number> = {};
        [...learners, ...stagingLearners].forEach(l => {
            if (l.idNumber) {
                counts[l.idNumber] = (counts[l.idNumber] || 0) + 1;
            }
        });
        return counts;
    }, [learners, stagingLearners]);

    const filteredLearners = useMemo(() => {
        let sourceData: DashboardLearner[] = [];

        if (viewMode === 'staging') sourceData = stagingLearners;
        else if (viewMode === 'offline') sourceData = learners.filter(l => l.isOffline === true);
        else sourceData = learners.filter(l => !l.isOffline);

        return sourceData.filter(learner => {
            const isArchived = learner.isArchived === true;

            if (viewMode === 'active' || viewMode === 'offline') {
                if (showArchived && !isArchived) return false;
                if (!showArchived && isArchived) return false;
            }

            if (searchTerm) {
                const s = searchTerm.toLowerCase();
                if (!(
                    learner.fullName?.toLowerCase().includes(s) ||
                    learner.idNumber?.includes(searchTerm) ||
                    learner.email?.toLowerCase().includes(s)
                )) return false;
            }

            if ((viewMode === 'active' || viewMode === 'offline') && selectedYear !== 'all') {
                const y = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
                if (y !== selectedYear) return false;
            }

            if (selectedQualification !== 'all' && learner.qualification?.name !== selectedQualification) return false;
            if (filterStatus !== 'all' && learner.status !== filterStatus) return false;
            if (web3Status === 'minted' && !learner.isBlockchainVerified) return false;
            if (web3Status === 'pending' && learner.isBlockchainVerified) return false;

            return true;
        });
    }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, selectedQualification, showArchived, web3Status]);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        learners.forEach(l => {
            if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
        });
        return Array.from(years).sort().reverse();
    }, [learners]);

    const availableQualifications = useMemo(() => {
        const quals = new Set<string>();
        const allLearners = [...learners, ...stagingLearners];
        allLearners.forEach(l => {
            if (l.qualification?.name) quals.add(l.qualification.name);
        });
        return Array.from(quals).sort();
    }, [learners, stagingLearners]);

    const activeCount = learners.filter(l => !l.isArchived && !l.isOffline).length;
    const offlineCount = learners.filter(l => !l.isArchived && l.isOffline).length;
    const stagingCount = stagingLearners.length;

    const archivedCount = viewMode === 'offline'
        ? learners.filter(l => l.isArchived && l.isOffline).length
        : learners.filter(l => l.isArchived && !l.isOffline).length;

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

    const handleCopyLink = (learnerId: string, idNumber: string) => {
        const link = `${window.location.origin}/sor/${learnerId}`;
        navigator.clipboard.writeText(link).then(() => {
            setCopiedId(idNumber);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    const handleExport = () => {
        const csvContent = "data:text/csv;charset=utf-8," +
            ["Full Name,ID Number,Class / Cohort,Qualification,Status,Start Date,Auth Status,Web3 Verified"].concat(
                filteredLearners.map(l => {
                    const cohortName = cohorts.find(c => c.id === l.cohortId)?.name || 'Unassigned';
                    return `"${l.fullName}","${l.idNumber}","${cohortName}","${l.qualification?.name || 'N/A'}","${l.status}","${l.trainingStartDate}","${l.authStatus || 'pending'}","${l.isBlockchainVerified ? 'Yes' : 'No'}"`;
                })
            ).join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `learners_enrollments_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
    };

    const handleConfirmDelete = async () => {
        if (!deletingLearner || !deleteReason.trim()) return;
        setIsDeleting(true);
        try {
            if (onDeletePermanent) {
                await onDeletePermanent(deletingLearner, {
                    reason: deleteReason,
                    adminId: currentUser?.uid || 'unknown',
                    adminName: currentUser?.fullName || 'Anonymous Admin'
                });
            }
            setDeletingLearner(null);
            setDeleteReason('');
        } catch (err) {
            console.error("Delete failed", err);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="mlab-learners">
            {/* ── TABS ── */}
            <div className="mlab-tab-bar">
                <button
                    className={`mlab-tab ${viewMode === 'active' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
                    onClick={() => { setViewMode('active'); setShowArchived(false); }}
                >
                    Enrollments (Active)
                    <span className="mlab-tab__count">{activeCount}</span>
                </button>

                <button
                    className={`mlab-tab ${viewMode === 'offline' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
                    onClick={() => { setViewMode('offline'); setShowArchived(false); }}
                >
                    Offline / RPL
                    <span className={`mlab-tab__count ${viewMode === 'offline' ? 'mlab-tab__count--alt' : ''}`}>
                        {offlineCount}
                    </span>
                </button>

                <button
                    className={`mlab-tab ${viewMode === 'staging' ? 'mlab-tab--staging-active' : 'mlab-tab--inactive'}`}
                    onClick={() => setViewMode('staging')}
                >
                    Staging Area
                    {stagingCount > 0 && <span className="mlab-tab__badge">{stagingCount}</span>}
                </button>
            </div>

            {/* ── TOOLBAR ── */}
            <div className="mlab-toolbar">
                <div className="mlab-search">
                    <Search size={18} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder="Search by name, ID or email…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="mlab-select-wrap">
                    <GraduationCap size={16} color="var(--mlab-grey)" />
                    <select value={selectedQualification} onChange={e => setSelectedQualification(e.target.value)}>
                        <option value="all">All Qualifications</option>
                        {availableQualifications.map(qual => (
                            <option key={qual} value={qual}>{qual}</option>
                        ))}
                    </select>
                </div>

                {(viewMode === 'active' || viewMode === 'offline') && (
                    <>
                        <div className="mlab-select-wrap">
                            <Calendar size={16} color="var(--mlab-grey)" />
                            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                                <option value="all">All Years</option>
                                {availableYears.map(year => (
                                    <option key={year} value={year}>{year} Cohort</option>
                                ))}
                            </select>
                        </div>

                        <div className="mlab-select-wrap mlab-select-wrap--web3">
                            <ShieldCheck size={16} className="web3-icon" />
                            <select value={web3Status} onChange={e => setWeb3Status(e.target.value as any)}>
                                <option value="all">All Web3 Status</option>
                                <option value="minted">✅ Minted (Secured)</option>
                                <option value="pending">⏳ Pending Issuance</option>
                            </select>
                        </div>

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

            {/* ── ACTION BAR ── */}
            {selectedIds.size > 0 ? (
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
                        {(viewMode === 'active' || viewMode === 'offline') && (
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

            {/* ── TABLE ── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                                <input
                                    type="checkbox"
                                    onChange={handleSelectAll}
                                    checked={filteredLearners.length > 0 && selectedIds.size === filteredLearners.length}
                                />
                            </th>
                            <th>Learner</th>
                            <th>Class / Cohort</th>
                            <th>Qualification</th>
                            <th>Status</th>
                            <th>Web3 Status</th>
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

                            const cohortObj = cohorts.find(c => c.id === learner.cohortId);
                            const cohortName = cohortObj ? cohortObj.name : (learner.cohortId === 'Unassigned' ? 'Unassigned' : 'Unknown Class');
                            const isReturning = learner.idNumber && (learnerCountsById[learner.idNumber] > 1);

                            return (
                                <tr key={learner.id} className={rowClass}>
                                    <td style={{ textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleSelectOne(learner.id)}
                                        />
                                    </td>

                                    <td>
                                        <div className="mlab-cell-content">
                                            <div className="mlab-cell-header">
                                                <span className="mlab-cell-name">{learner.fullName}</span>
                                                {learner.isArchived && <span className="mlab-mini-badge mlab-mini-badge--archived">Archived</span>}
                                                {isReturning && (
                                                    <span className="mlab-mini-badge mlab-mini-badge--multi" title="Enrolled in multiple classes">
                                                        <History size={10} /> Multi-Course
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mlab-cell-sub">
                                                {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
                                            </div>
                                        </div>
                                    </td>

                                    <td>
                                        <div className="mlab-cell-cohort">
                                            <Users size={14} className="cohort-icon" />
                                            <span className={cohortName === 'Unassigned' ? 'text-red' : ''}>
                                                {cohortName}
                                            </span>
                                        </div>
                                    </td>

                                    <td>
                                        <div className="mlab-cell-qual" title={learner.qualification?.name}>{learner.qualification?.name || 'No Qualification'}</div>
                                        <div className="mlab-cell-sub">{learner.qualification?.saqaId}</div>
                                    </td>

                                    <td>
                                        {learner.isArchived ? <span className="mlab-badge mlab-badge--archived">Archived</span>
                                            : viewMode === 'staging' ? <span className="mlab-badge mlab-badge--draft">Draft</span>
                                                : learner.isOffline ? <span className="mlab-badge mlab-badge--offline">Offline / RPL</span>
                                                    : <span className="mlab-badge mlab-badge--active">Active</span>
                                        }
                                    </td>

                                    <td>
                                        {viewMode === 'staging' ? (
                                            <span className="web3-status pending">Awaiting Approval</span>
                                        ) : learner.isBlockchainVerified ? (
                                            <div className="web3-status secured">
                                                <div className="status-dot green"></div> Secured
                                            </div>
                                        ) : (
                                            <div className="web3-status pending">
                                                <div className="status-dot amber"></div> Pending Mint
                                            </div>
                                        )}
                                    </td>

                                    <td>
                                        <div className="mlab-icon-btn-group">
                                            <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => onEdit(learner)} title="Edit Enrollment Details">
                                                <Edit size={14} />
                                            </button>

                                            {viewMode !== 'staging' && !learner.isArchived && !showArchived && (
                                                <>
                                                    <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => navigate(`/sor/${learner.id}`)} title="View Statement of Results">
                                                        <Eye size={14} />
                                                    </button>
                                                    <button className="mlab-icon-btn mlab-icon-btn--blue" style={{ color: copiedId === learner.idNumber ? 'var(--mlab-emerald)' : '' }} onClick={() => handleCopyLink(learner.id, learner.idNumber)} title="Copy Shareable Link">
                                                        {copiedId === learner.idNumber ? <ClipboardCheck size={14} /> : <Share2 size={14} />}
                                                    </button>
                                                    {viewMode === 'active' && (
                                                        <button className={`mlab-icon-btn ${learner.authStatus === 'active' ? 'mlab-icon-btn--emerald' : 'mlab-icon-btn--green'}`} onClick={() => onInvite(learner)} title={learner.authStatus === 'active' ? 'Resend Invite' : 'Send Invite'}>
                                                            <Mail size={14} />
                                                        </button>
                                                    )}
                                                    <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => onArchive(learner)} title="Archive Record">
                                                        <ArchiveIcon size={14} />
                                                    </button>
                                                </>
                                            )}

                                            {(viewMode === 'offline' || learner.isArchived) && (
                                                <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => setDeletingLearner(learner)} title="Delete Permanently">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}

                                            {(viewMode === 'active' || viewMode === 'offline') && learner.isArchived && (
                                                <button className="mlab-icon-btn mlab-icon-btn--emerald" onClick={() => onRestore(learner)} title="Restore">
                                                    <RotateCcw size={14} />
                                                </button>
                                            )}

                                            {viewMode === 'staging' && (
                                                <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => onDiscard(learner)} title="Discard Draft">
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {filteredLearners.length === 0 && (
                    <div className="mlab-empty">
                        <AlertTriangle size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
                        <p className="mlab-empty__title">No Enrollments Found</p>
                        <p className="mlab-empty__desc">
                            {viewMode === 'active'
                                ? showArchived ? "No archived records found." : "No active learners found matching your criteria."
                                : viewMode === 'offline'
                                    ? showArchived ? "No archived offline records found." : "No offline learners found. Upload an SoR CSV to import one."
                                    : "Staging area is empty. Import a CSV to get started."}
                        </p>
                    </div>
                )}
            </div>

            {/* 🚀 PERMANENT DELETE CONFIRMATION MODAL */}
            {deletingLearner && (
                <div className="mlab-modal-overlay">
                    <div className="mlab-modal mlab-modal--sm">
                        <div className="mlab-modal__header">
                            <div className="mlab-modal__title-group">
                                <AlertCircle size={20} color="var(--mlab-red)" />
                                <h2>Permanent Deletion</h2>
                            </div>
                            <button className="mlab-modal__close" onClick={() => setDeletingLearner(null)}><X size={20} /></button>
                        </div>
                        <div className="mlab-modal__body">
                            <p className="mlab-modal__warning">
                                You are about to permanently delete <strong>{deletingLearner.fullName}</strong>. This action is recorded in the audit logs and cannot be undone.
                            </p>

                            <div className="mlab-form-group">
                                <label>Reason for Deletion <span className="text-red">*</span></label>
                                <textarea
                                    className="mlab-input"
                                    placeholder="e.g., Duplicate entry, incorrect SAQA mapping, learner withdrew..."
                                    value={deleteReason}
                                    onChange={e => setDeleteReason(e.target.value)}
                                    rows={3}
                                />
                            </div>

                            <div className="mlab-modal__audit-log">
                                <strong>Logged Action:</strong> Admin {currentUser?.fullName || 'User'} is performing this delete.
                            </div>
                        </div>
                        <div className="mlab-modal__footer">
                            <button className="mlab-btn mlab-btn--ghost" onClick={() => setDeletingLearner(null)}>Cancel</button>
                            <button
                                className="mlab-btn mlab-btn--red"
                                disabled={!deleteReason.trim() || isDeleting}
                                onClick={handleConfirmDelete}
                            >
                                {isDeleting ? <Loader2 className="spin" size={16} /> : "Confirm Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};



// // src/components/views/LearnersView.tsx

// import React, { useState, useMemo, useEffect } from 'react';
// import {
//     Plus, Upload, Download, Search, Edit, Trash2,
//     Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
//     Eye, Archive as ArchiveIcon, Mail,
//     Share2, GraduationCap, Users, History,
//     ShieldCheck, X, AlertCircle,
//     Loader2
// } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import './LearnersView.css';
// import type { DashboardLearner, Cohort } from '../../../types';
// import { useStore } from '../../../store/useStore';

// interface LearnersViewProps {
//     learners: DashboardLearner[];
//     stagingLearners?: DashboardLearner[];
//     cohorts?: Cohort[];
//     onAdd: () => void;
//     onUpload: () => void;
//     onEdit: (learner: DashboardLearner) => void;
//     onArchive: (learner: DashboardLearner) => void;
//     onRestore: (learner: DashboardLearner) => void;
//     onDiscard: (learner: DashboardLearner) => void;
//     onInvite: (learner: DashboardLearner) => void;
//     onArchiveCohort: (year: string) => void;
//     // 🚀 NEW: Permanent Delete handler expecting an audit object
//     onDeletePermanent?: (learner: DashboardLearner, audit: { reason: string; adminId: string; adminName: string }) => Promise<void>;
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
//     onBulkRestore, onBulkArchive, onBulkApprove, onBulkDiscard,
//     onDeletePermanent
// }) => {
//     const navigate = useNavigate();
//     const currentUser = useStore((state) => state.user); // 🚀 Admin info for logging

//     // ─── VIEW STATE ───
//     const [viewMode, setViewMode] = useState<'active' | 'staging' | 'offline'>('active');
//     const [searchTerm, setSearchTerm] = useState('');
//     const [filterStatus, setFilterStatus] = useState('all');
//     const [selectedYear, setSelectedYear] = useState<string>('all');
//     const [selectedQualification, setSelectedQualification] = useState<string>('all');
//     const [showArchived, setShowArchived] = useState(false);
//     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
//     const [web3Status, setWeb3Status] = useState<'all' | 'minted' | 'pending'>('all');
//     const [copiedId, setCopiedId] = useState<string | null>(null);

//     // 🚀 DELETE MODAL STATE 🚀
//     const [deletingLearner, setDeletingLearner] = useState<DashboardLearner | null>(null);
//     const [deleteReason, setDeleteReason] = useState('');
//     const [isDeleting, setIsDeleting] = useState(false);

//     // Reset selection when switching tabs/filters
//     useEffect(() => {
//         setSelectedIds(new Set());
//     }, [viewMode, showArchived, selectedYear, selectedQualification, web3Status]);

//     // ─── SMART MULTI-COURSE DETECTION ───
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
//         let sourceData: DashboardLearner[] = [];

//         if (viewMode === 'staging') {
//             sourceData = stagingLearners;
//         } else if (viewMode === 'offline') {
//             sourceData = learners.filter(l => l.isOffline === true);
//         } else {
//             sourceData = learners.filter(l => !l.isOffline);
//         }

//         return sourceData.filter(learner => {
//             const isArchived = learner.isArchived === true;

//             if (viewMode === 'active' || viewMode === 'offline') {
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

//             if ((viewMode === 'active' || viewMode === 'offline') && selectedYear !== 'all') {
//                 const y = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
//                 if (y !== selectedYear) return false;
//             }

//             if (selectedQualification !== 'all' && learner.qualification?.name !== selectedQualification) return false;
//             if (filterStatus !== 'all' && learner.status !== filterStatus) return false;
//             if (web3Status === 'minted' && !learner.isBlockchainVerified) return false;
//             if (web3Status === 'pending' && learner.isBlockchainVerified) return false;

//             return true;
//         });
//     }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, selectedQualification, showArchived, web3Status]);

//     // Available cohort years
//     const availableYears = useMemo(() => {
//         const years = new Set<string>();
//         learners.forEach(l => {
//             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
//         });
//         return Array.from(years).sort().reverse();
//     }, [learners]);

//     // Available Qualifications
//     const availableQualifications = useMemo(() => {
//         const quals = new Set<string>();
//         const allLearners = [...learners, ...stagingLearners];
//         allLearners.forEach(l => {
//             if (l.qualification?.name) quals.add(l.qualification.name);
//         });
//         return Array.from(quals).sort();
//     }, [learners, stagingLearners]);

//     // ─── COUNTERS ───
//     const activeCount = learners.filter(l => !l.isArchived && !l.isOffline).length;
//     const offlineCount = learners.filter(l => !l.isArchived && l.isOffline).length;
//     const stagingCount = stagingLearners.length;

//     const archivedCount = viewMode === 'offline'
//         ? learners.filter(l => l.isArchived && l.isOffline).length
//         : learners.filter(l => l.isArchived && !l.isOffline).length;

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

//     const handleCopyLink = (learnerId: string, idNumber: string) => {
//         const link = `${window.location.origin}/sor/${learnerId}`;
//         navigator.clipboard.writeText(link).then(() => {
//             setCopiedId(idNumber);
//             setTimeout(() => setCopiedId(null), 2000);
//         });
//     };

//     const handleExport = () => {
//         const csvContent = "data:text/csv;charset=utf-8," +
//             ["Full Name,ID Number,Class / Cohort,Qualification,Status,Start Date,Auth Status,Web3 Verified"].concat(
//                 filteredLearners.map(l => {
//                     const cohortName = cohorts.find(c => c.id === l.cohortId)?.name || 'Unassigned';
//                     return `"${l.fullName}","${l.idNumber}","${cohortName}","${l.qualification?.name || 'N/A'}","${l.status}","${l.trainingStartDate}","${l.authStatus || 'pending'}","${l.isBlockchainVerified ? 'Yes' : 'No'}"`;
//                 })
//             ).join("\n");
//         const link = document.createElement("a");
//         link.setAttribute("href", encodeURI(csvContent));
//         link.setAttribute("download", `learners_enrollments_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
//         document.body.appendChild(link);
//         link.click();
//     };

//     // 🚀 NEW: Permanent Delete Confirmation Executer
//     const handleConfirmDelete = async () => {
//         if (!deletingLearner || !deleteReason.trim()) return;
//         setIsDeleting(true);
//         try {
//             if (onDeletePermanent) {
//                 await onDeletePermanent(deletingLearner, {
//                     reason: deleteReason,
//                     adminId: currentUser?.uid || 'unknown',
//                     adminName: currentUser?.fullName || 'Anonymous Admin'
//                 });
//             }
//             setDeletingLearner(null);
//             setDeleteReason('');
//         } catch (err) {
//             console.error("Delete failed", err);
//         } finally {
//             setIsDeleting(false);
//         }
//     };

//     // ─── RENDER ───
//     return (
//         <div className="mlab-learners">

//             {/* ── TABS ── */}
//             <div className="mlab-tab-bar">
//                 <button
//                     className={`mlab-tab ${viewMode === 'active' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
//                     onClick={() => { setViewMode('active'); setShowArchived(false); }}
//                 >
//                     Enrollments (Active)
//                     <span className="mlab-tab__count">{activeCount}</span>
//                 </button>

//                 <button
//                     className={`mlab-tab ${viewMode === 'offline' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
//                     onClick={() => { setViewMode('offline'); setShowArchived(false); }}
//                 >
//                     Offline / RPL
//                     <span className="mlab-tab__count" style={{ background: viewMode === 'offline' ? '#e2e8f0' : '#f1f5f9', color: '#475569' }}>
//                         {offlineCount}
//                     </span>
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

//             {/* ── TOOLBAR ── */}
//             <div className="mlab-toolbar" style={{ flexWrap: 'wrap' }}>

//                 <div className="mlab-search">
//                     <Search size={18} color="var(--mlab-grey)" />
//                     <input
//                         type="text"
//                         placeholder="Search by name, ID or email…"
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                     />
//                 </div>

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

//                 {(viewMode === 'active' || viewMode === 'offline') && (
//                     <>
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

//                         <div className="mlab-select-wrap" style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}>
//                             <ShieldCheck size={16} color="#0ea5e9" />
//                             <select
//                                 value={web3Status}
//                                 onChange={e => setWeb3Status(e.target.value as any)}
//                                 style={{ color: '#0369a1', fontWeight: 500 }}
//                             >
//                                 <option value="all">All Web3 Status</option>
//                                 <option value="minted">✅ Minted (Secured)</option>
//                                 <option value="pending">⏳ Pending Issuance</option>
//                             </select>
//                         </div>

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

//             {/* ── ACTION BAR ── */}
//             {selectedIds.size > 0 ? (
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

//                         {(viewMode === 'active' || viewMode === 'offline') && (
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

//             {/* ── TABLE ── */}
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
//                             <th>Class / Cohort</th>
//                             <th>Qualification</th>
//                             <th>Status</th>
//                             <th>Web3 Status</th>
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

//                             const cohortObj = cohorts.find(c => c.id === learner.cohortId);
//                             const cohortName = cohortObj ? cohortObj.name : (learner.cohortId === 'Unassigned' ? 'Unassigned' : 'Unknown Class');
//                             const isReturning = learner.idNumber && (learnerCountsById[learner.idNumber] > 1);

//                             return (
//                                 <tr key={learner.id} className={rowClass}>
//                                     <td>
//                                         <input
//                                             type="checkbox"
//                                             checked={isSelected}
//                                             onChange={() => handleSelectOne(learner.id)}
//                                         />
//                                     </td>

//                                     <td>
//                                         <div>
//                                             <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                 {learner.fullName}
//                                                 {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', color: '#374151' }}>Archived</span>}

//                                                 {isReturning && (
//                                                     <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }} title="Enrolled in multiple classes">
//                                                         <History size={10} /> Multi-Course
//                                                     </span>
//                                                 )}
//                                             </div>
//                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
//                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
//                                             </div>
//                                         </div>
//                                     </td>

//                                     <td>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <Users size={14} color="#64748b" />
//                                             <span style={{ fontWeight: 500, color: cohortName === 'Unassigned' ? '#ef4444' : '#334155' }}>
//                                                 {cohortName}
//                                             </span>
//                                         </div>
//                                     </td>

//                                     <td>
//                                         <div className="mlab-cell-qual" title={learner.qualification?.name}>{learner.qualification?.name || 'No Qualification'}</div>
//                                         <div className="mlab-cell-sub">{learner.qualification?.saqaId}</div>
//                                     </td>

//                                     <td>
//                                         {learner.isArchived
//                                             ? <span className="mlab-badge mlab-badge--archived">Archived</span>
//                                             : viewMode === 'staging'
//                                                 ? <span className="mlab-badge mlab-badge--draft">Draft</span>
//                                                 : learner.isOffline
//                                                     ? <span className="mlab-badge" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>Offline / RPL</span>
//                                                     : <span className="mlab-badge mlab-badge--active">Active</span>
//                                         }
//                                     </td>

//                                     <td>
//                                         {viewMode === 'staging' ? (
//                                             <span style={{ color: '#94a3b8', fontSize: '12px' }}>Awaiting Approval</span>
//                                         ) : learner.isBlockchainVerified ? (
//                                             <div className="web3-status web3-status--secured">
//                                                 <span className="web3-status__dot"></span>
//                                                 Secured
//                                             </div>
//                                         ) : (
//                                             <div className="web3-status web3-status--pending">
//                                                 <span className="web3-status__dot"></span>
//                                                 Pending Mint
//                                             </div>
//                                         )}
//                                     </td>

//                                     <td>
//                                         <div className="mlab-icon-btn-group">
//                                             <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => onEdit(learner)} title="Edit Enrollment Details">
//                                                 <Edit size={14} />
//                                             </button>

//                                             {viewMode !== 'staging' && !learner.isArchived && !showArchived && (
//                                                 <>
//                                                     <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => navigate(`/sor/${learner.id}`)} title="View Statement of Results">
//                                                         <Eye size={14} />
//                                                     </button>
//                                                     <button className="mlab-icon-btn mlab-icon-btn--blue" style={{ color: copiedId === learner.idNumber ? '#16a34a' : '' }} onClick={() => handleCopyLink(learner.id, learner.idNumber)} title="Copy Shareable Link">
//                                                         {copiedId === learner.idNumber ? <ClipboardCheck size={14} /> : <Share2 size={14} />}
//                                                     </button>
//                                                     {viewMode === 'active' && (
//                                                         <button className={`mlab-icon-btn ${learner.authStatus === 'active' ? 'mlab-icon-btn--emerald' : 'mlab-icon-btn--green'}`} onClick={() => onInvite(learner)} title={learner.authStatus === 'active' ? 'Resend Invite' : 'Send Invite'}>
//                                                             <Mail size={14} />
//                                                         </button>
//                                                     )}
//                                                     <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => onArchive(learner)} title="Archive Record">
//                                                         <ArchiveIcon size={14} />
//                                                     </button>
//                                                 </>
//                                             )}

//                                             {/* 🚀 PERMANENT DELETE FOR OFFLINE OR ARCHIVED */}
//                                             {(viewMode === 'offline' || learner.isArchived) && (
//                                                 <button
//                                                     className="mlab-icon-btn mlab-icon-btn--red"
//                                                     onClick={() => setDeletingLearner(learner)}
//                                                     title="Delete Permanently"
//                                                 >
//                                                     <Trash2 size={14} />
//                                                 </button>
//                                             )}

//                                             {(viewMode === 'active' || viewMode === 'offline') && learner.isArchived && (
//                                                 <button className="mlab-icon-btn mlab-icon-btn--emerald" onClick={() => onRestore(learner)} title="Restore">
//                                                     <RotateCcw size={14} />
//                                                 </button>
//                                             )}

//                                             {viewMode === 'staging' && (
//                                                 <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => onDiscard(learner)} title="Discard Draft">
//                                                     <X size={14} />
//                                                 </button>
//                                             )}
//                                         </div>
//                                     </td>
//                                 </tr>
//                             );
//                         })}
//                     </tbody>
//                 </table>

//                 {filteredLearners.length === 0 && (
//                     <div className="mlab-empty">
//                         <AlertTriangle size={40} color="var(--mlab-green)" style={{ opacity: 0.6 }} />
//                         <p className="mlab-empty__title">No Enrollments Found</p>
//                         <p className="mlab-empty__desc">
//                             {viewMode === 'active'
//                                 ? showArchived ? "No archived records found." : "No active learners found matching your criteria."
//                                 : viewMode === 'offline'
//                                     ? showArchived ? "No archived offline records found." : "No offline learners found. Upload an SoR CSV to import one."
//                                     : "Staging area is empty. Import a CSV to get started."}
//                         </p>
//                     </div>
//                 )}
//             </div>

//             {/* 🚀 PERMANENT DELETE CONFIRMATION MODAL 🚀 */}
//             {deletingLearner && (
//                 <div className="mlab-modal-overlay">
//                     <div className="mlab-modal mlab-modal--sm">
//                         <div className="mlab-modal__header" style={{ borderBottom: '1px solid #fee2e2' }}>
//                             <div className="mlab-modal__title-group" style={{ color: '#dc2626' }}>
//                                 <AlertCircle size={20} />
//                                 <h2 style={{ color: '#991b1b', margin: 0, fontSize: '1.25rem' }}>Permanent Deletion</h2>
//                             </div>
//                             <button className="mlab-modal__close" onClick={() => setDeletingLearner(null)}><X size={20} /></button>
//                         </div>
//                         <div className="mlab-modal__body">
//                             <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '1rem', lineHeight: '1.5' }}>
//                                 You are about to permanently delete <strong>{deletingLearner.fullName}</strong>. This action is recorded in the audit logs and cannot be undone.
//                             </p>

//                             <div className="mlab-form-group">
//                                 <label style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>Reason for Deletion *</label>
//                                 <textarea
//                                     className="mlab-input"
//                                     placeholder="e.g., Duplicate entry, incorrect SAQA mapping, learner withdrew..."
//                                     value={deleteReason}
//                                     onChange={e => setDeleteReason(e.target.value)}
//                                     rows={3}
//                                     style={{ width: '100%', resize: 'none', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
//                                 />
//                             </div>

//                             <div style={{ marginTop: '1rem', padding: '10px', background: '#fef2f2', borderRadius: '6px', fontSize: '0.75rem', color: '#991b1b' }}>
//                                 <strong>Logged Action:</strong> Admin {currentUser?.fullName || 'User'} is performing this delete.
//                             </div>
//                         </div>
//                         <div className="mlab-modal__footer" style={{ borderTop: 'none', paddingTop: '1.5rem' }}>
//                             <button className="mlab-btn mlab-btn--ghost" onClick={() => setDeletingLearner(null)}>Cancel</button>
//                             <button
//                                 className="mlab-btn mlab-btn--red"
//                                 disabled={!deleteReason.trim() || isDeleting}
//                                 onClick={handleConfirmDelete}
//                                 style={{ background: '#dc2626', color: 'white', opacity: (!deleteReason.trim() || isDeleting) ? 0.5 : 1 }}
//                             >
//                                 {isDeleting ? <Loader2 className="spin" size={16} /> : "Confirm Delete"}
//                             </button>
//                         </div>
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };


// // import React, { useState, useMemo, useEffect } from 'react';
// // import {
// //     Plus, Upload, Download, Search, Edit, Trash2,
// //     Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
// //     Eye, Archive as ArchiveIcon, Mail,
// //     Share2, GraduationCap, Users, History,
// //     ShieldCheck, X, AlertCircle,
// //     Loader2
// // } from 'lucide-react';
// // import { useNavigate } from 'react-router-dom';
// // import './LearnersView.css';
// // import type { DashboardLearner, Cohort } from '../../../types';
// // import { useStore } from '../../../store/useStore';

// // interface LearnersViewProps {
// //     learners: DashboardLearner[];
// //     stagingLearners?: DashboardLearner[];
// //     cohorts?: Cohort[];
// //     onAdd: () => void;
// //     onUpload: () => void;
// //     onEdit: (learner: DashboardLearner) => void;
// //     onArchive: (learner: DashboardLearner) => void;
// //     onRestore: (learner: DashboardLearner) => void;
// //     onDiscard: (learner: DashboardLearner) => void;
// //     onInvite: (learner: DashboardLearner) => void;
// //     onArchiveCohort: (year: string) => void;
// //     // 🚀 NEW: Permanent Delete handler expecting an audit object
// //     onDeletePermanent?: (learner: DashboardLearner, audit: { reason: string; adminId: string; adminName: string }) => Promise<void>;
// //     onBulkRestore?: (learners: DashboardLearner[]) => void;
// //     onBulkArchive?: (learners: DashboardLearner[]) => void;
// //     onBulkApprove?: (learners: DashboardLearner[]) => void;
// //     onBulkDiscard?: (learners: DashboardLearner[]) => void;
// // }

// // export const LearnersView: React.FC<LearnersViewProps> = ({
// //     learners,
// //     stagingLearners = [],
// //     cohorts = [],
// //     onAdd, onUpload, onEdit,
// //     onArchive, onRestore, onDiscard, onInvite,
// //     onBulkRestore, onBulkArchive, onBulkApprove, onBulkDiscard,
// //     onDeletePermanent
// // }) => {
// //     const navigate = useNavigate();
// //     const currentUser = useStore((state) => state.user); // 🚀 Admin info for logging

// //     // ─── VIEW STATE ───
// //     const [viewMode, setViewMode] = useState<'active' | 'staging' | 'offline'>('active');
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [filterStatus, setFilterStatus] = useState('all');
// //     const [selectedYear, setSelectedYear] = useState<string>('all');
// //     const [selectedQualification, setSelectedQualification] = useState<string>('all');
// //     const [showArchived, setShowArchived] = useState(false);
// //     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
// //     const [web3Status, setWeb3Status] = useState<'all' | 'minted' | 'pending'>('all');
// //     const [copiedId, setCopiedId] = useState<string | null>(null);

// //     // 🚀 DELETE MODAL STATE 🚀
// //     const [deletingLearner, setDeletingLearner] = useState<DashboardLearner | null>(null);
// //     const [deleteReason, setDeleteReason] = useState('');
// //     const [isDeleting, setIsDeleting] = useState(false);

// //     // Reset selection when switching tabs/filters
// //     useEffect(() => {
// //         setSelectedIds(new Set());
// //     }, [viewMode, showArchived, selectedYear, selectedQualification, web3Status]);

// //     // ─── SMART MULTI-COURSE DETECTION ───
// //     const learnerCountsById = useMemo(() => {
// //         const counts: Record<string, number> = {};
// //         [...learners, ...stagingLearners].forEach(l => {
// //             if (l.idNumber) {
// //                 counts[l.idNumber] = (counts[l.idNumber] || 0) + 1;
// //             }
// //         });
// //         return counts;
// //     }, [learners, stagingLearners]);

// //     // ─── FILTER LOGIC ───
// //     const filteredLearners = useMemo(() => {
// //         let sourceData: DashboardLearner[] = [];

// //         if (viewMode === 'staging') {
// //             sourceData = stagingLearners;
// //         } else if (viewMode === 'offline') {
// //             sourceData = learners.filter(l => l.isOffline === true);
// //         } else {
// //             sourceData = learners.filter(l => !l.isOffline);
// //         }

// //         return sourceData.filter(learner => {
// //             const isArchived = learner.isArchived === true;

// //             if (viewMode === 'active' || viewMode === 'offline') {
// //                 if (showArchived && !isArchived) return false;
// //                 if (!showArchived && isArchived) return false;
// //             }

// //             if (searchTerm) {
// //                 const s = searchTerm.toLowerCase();
// //                 if (!(
// //                     learner.fullName?.toLowerCase().includes(s) ||
// //                     learner.idNumber?.includes(searchTerm) ||
// //                     learner.email?.toLowerCase().includes(s)
// //                 )) return false;
// //             }

// //             if ((viewMode === 'active' || viewMode === 'offline') && selectedYear !== 'all') {
// //                 const y = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
// //                 if (y !== selectedYear) return false;
// //             }

// //             if (selectedQualification !== 'all' && learner.qualification?.name !== selectedQualification) return false;
// //             if (filterStatus !== 'all' && learner.status !== filterStatus) return false;
// //             if (web3Status === 'minted' && !learner.isBlockchainVerified) return false;
// //             if (web3Status === 'pending' && learner.isBlockchainVerified) return false;

// //             return true;
// //         });
// //     }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, selectedQualification, showArchived, web3Status]);

// //     // Available cohort years
// //     const availableYears = useMemo(() => {
// //         const years = new Set<string>();
// //         learners.forEach(l => {
// //             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
// //         });
// //         return Array.from(years).sort().reverse();
// //     }, [learners]);

// //     // Available Qualifications
// //     const availableQualifications = useMemo(() => {
// //         const quals = new Set<string>();
// //         const allLearners = [...learners, ...stagingLearners];
// //         allLearners.forEach(l => {
// //             if (l.qualification?.name) quals.add(l.qualification.name);
// //         });
// //         return Array.from(quals).sort();
// //     }, [learners, stagingLearners]);

// //     // ─── COUNTERS ───
// //     const activeCount = learners.filter(l => !l.isArchived && !l.isOffline).length;
// //     const offlineCount = learners.filter(l => !l.isArchived && l.isOffline).length;
// //     const stagingCount = stagingLearners.length;

// //     const archivedCount = viewMode === 'offline'
// //         ? learners.filter(l => l.isArchived && l.isOffline).length
// //         : learners.filter(l => l.isArchived && !l.isOffline).length;

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

// //     const handleCopyLink = (learnerId: string, idNumber: string) => {
// //         const link = `${window.location.origin}/sor/${learnerId}`;
// //         navigator.clipboard.writeText(link).then(() => {
// //             setCopiedId(idNumber);
// //             setTimeout(() => setCopiedId(null), 2000);
// //         });
// //     };

// //     const handleExport = () => {
// //         const csvContent = "data:text/csv;charset=utf-8," +
// //             ["Full Name,ID Number,Class / Cohort,Qualification,Status,Start Date,Auth Status,Web3 Verified"].concat(
// //                 filteredLearners.map(l => {
// //                     const cohortName = cohorts.find(c => c.id === l.cohortId)?.name || 'Unassigned';
// //                     return `"${l.fullName}","${l.idNumber}","${cohortName}","${l.qualification?.name || 'N/A'}","${l.status}","${l.trainingStartDate}","${l.authStatus || 'pending'}","${l.isBlockchainVerified ? 'Yes' : 'No'}"`;
// //                 })
// //             ).join("\n");
// //         const link = document.createElement("a");
// //         link.setAttribute("href", encodeURI(csvContent));
// //         link.setAttribute("download", `learners_enrollments_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
// //         document.body.appendChild(link);
// //         link.click();
// //     };

// //     // 🚀 NEW: Permanent Delete Confirmation Executer
// //     const handleConfirmDelete = async () => {
// //         if (!deletingLearner || !deleteReason.trim()) return;
// //         setIsDeleting(true);
// //         try {
// //             if (onDeletePermanent) {
// //                 await onDeletePermanent(deletingLearner, {
// //                     reason: deleteReason,
// //                     adminId: currentUser?.uid || 'unknown',
// //                     adminName: currentUser?.fullName || 'Anonymous Admin'
// //                 });
// //             }
// //             setDeletingLearner(null);
// //             setDeleteReason('');
// //         } catch (err) {
// //             console.error("Delete failed", err);
// //         } finally {
// //             setIsDeleting(false);
// //         }
// //     };

// //     // ─── RENDER ───
// //     return (
// //         <div className="mlab-learners">

// //             {/* ── TABS ── */}
// //             <div className="mlab-tab-bar">
// //                 <button
// //                     className={`mlab-tab ${viewMode === 'active' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
// //                     onClick={() => { setViewMode('active'); setShowArchived(false); }}
// //                 >
// //                     Enrollments (Active)
// //                     <span className="mlab-tab__count">{activeCount}</span>
// //                 </button>

// //                 <button
// //                     className={`mlab-tab ${viewMode === 'offline' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
// //                     onClick={() => { setViewMode('offline'); setShowArchived(false); }}
// //                 >
// //                     Offline / RPL
// //                     <span className="mlab-tab__count" style={{ background: viewMode === 'offline' ? '#e2e8f0' : '#f1f5f9', color: '#475569' }}>
// //                         {offlineCount}
// //                     </span>
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

// //             {/* ── TOOLBAR ── */}
// //             <div className="mlab-toolbar" style={{ flexWrap: 'wrap' }}>

// //                 <div className="mlab-search">
// //                     <Search size={18} color="var(--mlab-grey)" />
// //                     <input
// //                         type="text"
// //                         placeholder="Search by name, ID or email…"
// //                         value={searchTerm}
// //                         onChange={e => setSearchTerm(e.target.value)}
// //                     />
// //                 </div>

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

// //                 {(viewMode === 'active' || viewMode === 'offline') && (
// //                     <>
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

// //                         <div className="mlab-select-wrap" style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}>
// //                             <ShieldCheck size={16} color="#0ea5e9" />
// //                             <select
// //                                 value={web3Status}
// //                                 onChange={e => setWeb3Status(e.target.value as any)}
// //                                 style={{ color: '#0369a1', fontWeight: 500 }}
// //                             >
// //                                 <option value="all">All Web3 Status</option>
// //                                 <option value="minted">✅ Minted (Secured)</option>
// //                                 <option value="pending">⏳ Pending Issuance</option>
// //                             </select>
// //                         </div>

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

// //             {/* ── ACTION BAR ── */}
// //             {selectedIds.size > 0 ? (
// //                 <div className="mlab-action-bar">
// //                     <span className="mlab-action-bar__label">
// //                         {selectedIds.size} Enrollments Selected
// //                     </span>
// //                     <div className="mlab-bulk-actions">

// //                         {viewMode === 'staging' && (
// //                             <>
// //                                 <button className="mlab-btn mlab-btn--green" onClick={() => executeBulkAction('approve')}>
// //                                     <ClipboardCheck size={15} /> Approve
// //                                 </button>
// //                                 <button className="mlab-btn mlab-btn--outline mlab-btn--outline-red" onClick={() => executeBulkAction('discard')}>
// //                                     <Trash2 size={15} /> Discard Drafts
// //                                 </button>
// //                             </>
// //                         )}

// //                         {(viewMode === 'active' || viewMode === 'offline') && (
// //                             showArchived ? (
// //                                 <button className="mlab-btn mlab-btn--outline mlab-btn--outline-green" onClick={() => executeBulkAction('restore')}>
// //                                     <RotateCcw size={15} /> Restore
// //                                 </button>
// //                             ) : (
// //                                 <button className="mlab-btn mlab-btn--outline mlab-btn--outline-amber" onClick={() => executeBulkAction('archive')}>
// //                                     <ArchiveIcon size={15} /> Archive
// //                                 </button>
// //                             )
// //                         )}
// //                     </div>
// //                 </div>

// //             ) : (

// //                 <div className="mlab-standard-actions">
// //                     <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue" onClick={handleExport}>
// //                         <Download size={15} /> Export
// //                     </button>
// //                     <button className="mlab-btn mlab-btn--primary" onClick={onUpload}>
// //                         <Upload size={15} /> Import CSV
// //                     </button>
// //                     <button className="mlab-btn mlab-btn--green" onClick={onAdd}>
// //                         <Plus size={15} /> Add Enrollment
// //                     </button>
// //                 </div>
// //             )}

// //             {/* ── TABLE ── */}
// //             <div className="mlab-table-wrap">
// //                 <table className="mlab-table">
// //                     <thead>
// //                         <tr>
// //                             <th style={{ width: '40px' }}>
// //                                 <input
// //                                     type="checkbox"
// //                                     onChange={handleSelectAll}
// //                                     checked={filteredLearners.length > 0 && selectedIds.size === filteredLearners.length}
// //                                 />
// //                             </th>
// //                             <th>Learner</th>
// //                             <th>Class / Cohort</th>
// //                             <th>Qualification</th>
// //                             <th>Status</th>
// //                             <th>Web3 Status</th>
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

// //                             const cohortObj = cohorts.find(c => c.id === learner.cohortId);
// //                             const cohortName = cohortObj ? cohortObj.name : (learner.cohortId === 'Unassigned' ? 'Unassigned' : 'Unknown Class');
// //                             const isReturning = learner.idNumber && (learnerCountsById[learner.idNumber] > 1);

// //                             return (
// //                                 <tr key={learner.id} className={rowClass}>
// //                                     <td>
// //                                         <input
// //                                             type="checkbox"
// //                                             checked={isSelected}
// //                                             onChange={() => handleSelectOne(learner.id)}
// //                                         />
// //                                     </td>

// //                                     <td>
// //                                         <div>
// //                                             <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                 {learner.fullName}
// //                                                 {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', color: '#374151' }}>Archived</span>}

// //                                                 {isReturning && (
// //                                                     <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }} title="Enrolled in multiple classes">
// //                                                         <History size={10} /> Multi-Course
// //                                                     </span>
// //                                                 )}
// //                                             </div>
// //                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
// //                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
// //                                             </div>
// //                                         </div>
// //                                     </td>

// //                                     <td>
// //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                             <Users size={14} color="#64748b" />
// //                                             <span style={{ fontWeight: 500, color: cohortName === 'Unassigned' ? '#ef4444' : '#334155' }}>
// //                                                 {cohortName}
// //                                             </span>
// //                                         </div>
// //                                     </td>

// //                                     <td>
// //                                         <div className="mlab-cell-qual" title={learner.qualification?.name}>{learner.qualification?.name || 'No Qualification'}</div>
// //                                         <div className="mlab-cell-sub">{learner.qualification?.saqaId}</div>
// //                                     </td>

// //                                     <td>
// //                                         {learner.isArchived
// //                                             ? <span className="mlab-badge mlab-badge--archived">Archived</span>
// //                                             : viewMode === 'staging'
// //                                                 ? <span className="mlab-badge mlab-badge--draft">Draft</span>
// //                                                 : learner.isOffline
// //                                                     ? <span className="mlab-badge" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>Offline / RPL</span>
// //                                                     : <span className="mlab-badge mlab-badge--active">Active</span>
// //                                         }
// //                                     </td>

// //                                     <td>
// //                                         {viewMode === 'staging' ? (
// //                                             <span style={{ color: '#94a3b8', fontSize: '12px' }}>Awaiting Approval</span>
// //                                         ) : learner.isBlockchainVerified ? (
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontSize: '12px', fontWeight: 600 }}>
// //                                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.2)' }}></div>
// //                                                 Secured
// //                                             </div>
// //                                         ) : (
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#d97706', fontSize: '12px', fontWeight: 600 }}>
// //                                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }}></div>
// //                                                 Pending Mint
// //                                             </div>
// //                                         )}
// //                                     </td>

// //                                     <td>
// //                                         <div className="mlab-icon-btn-group">
// //                                             <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => onEdit(learner)} title="Edit Enrollment Details">
// //                                                 <Edit size={14} />
// //                                             </button>

// //                                             {viewMode !== 'staging' && !learner.isArchived && !showArchived && (
// //                                                 <>
// //                                                     <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => navigate(`/sor/${learner.id}`)} title="View Statement of Results">
// //                                                         <Eye size={14} />
// //                                                     </button>
// //                                                     <button className="mlab-icon-btn mlab-icon-btn--blue" style={{ color: copiedId === learner.idNumber ? '#16a34a' : '' }} onClick={() => handleCopyLink(learner.id, learner.idNumber)} title="Copy Shareable Link">
// //                                                         {copiedId === learner.idNumber ? <ClipboardCheck size={14} /> : <Share2 size={14} />}
// //                                                     </button>
// //                                                     {viewMode === 'active' && (
// //                                                         <button className={`mlab-icon-btn ${learner.authStatus === 'active' ? 'mlab-icon-btn--emerald' : 'mlab-icon-btn--green'}`} onClick={() => onInvite(learner)} title={learner.authStatus === 'active' ? 'Resend Invite' : 'Send Invite'}>
// //                                                             <Mail size={14} />
// //                                                         </button>
// //                                                     )}
// //                                                     <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => onArchive(learner)} title="Archive Record">
// //                                                         <ArchiveIcon size={14} />
// //                                                     </button>
// //                                                 </>
// //                                             )}

// //                                             {/* 🚀 PERMANENT DELETE FOR OFFLINE OR ARCHIVED */}
// //                                             {(viewMode === 'offline' || learner.isArchived) && (
// //                                                 <button
// //                                                     className="mlab-icon-btn mlab-icon-btn--red"
// //                                                     onClick={() => setDeletingLearner(learner)}
// //                                                     title="Delete Permanently"
// //                                                 >
// //                                                     <Trash2 size={14} />
// //                                                 </button>
// //                                             )}

// //                                             {(viewMode === 'active' || viewMode === 'offline') && learner.isArchived && (
// //                                                 <button className="mlab-icon-btn mlab-icon-btn--emerald" onClick={() => onRestore(learner)} title="Restore">
// //                                                     <RotateCcw size={14} />
// //                                                 </button>
// //                                             )}

// //                                             {viewMode === 'staging' && (
// //                                                 <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => onDiscard(learner)} title="Discard Draft">
// //                                                     <X size={14} />
// //                                                 </button>
// //                                             )}
// //                                         </div>
// //                                     </td>
// //                                 </tr>
// //                             );
// //                         })}
// //                     </tbody>
// //                 </table>

// //                 {filteredLearners.length === 0 && (
// //                     <div className="mlab-empty">
// //                         <AlertTriangle size={40} color="var(--mlab-green)" style={{ opacity: 0.6 }} />
// //                         <p className="mlab-empty__title">No Enrollments Found</p>
// //                         <p className="mlab-empty__desc">
// //                             {viewMode === 'active'
// //                                 ? showArchived ? "No archived records found." : "No active learners found matching your criteria."
// //                                 : viewMode === 'offline'
// //                                     ? showArchived ? "No archived offline records found." : "No offline learners found. Upload an SoR CSV to import one."
// //                                     : "Staging area is empty. Import a CSV to get started."}
// //                         </p>
// //                     </div>
// //                 )}
// //             </div>

// //             {/* 🚀 PERMANENT DELETE CONFIRMATION MODAL 🚀 */}
// //             {deletingLearner && (
// //                 <div className="mlab-modal-overlay">
// //                     <div className="mlab-modal mlab-modal--sm">
// //                         <div className="mlab-modal__header" style={{ borderBottom: '1px solid #fee2e2' }}>
// //                             <div className="mlab-modal__title-group" style={{ color: '#dc2626' }}>
// //                                 <AlertCircle size={20} />
// //                                 <h2 style={{ color: '#991b1b', margin: 0, fontSize: '1.25rem' }}>Permanent Deletion</h2>
// //                             </div>
// //                             <button className="mlab-modal__close" onClick={() => setDeletingLearner(null)}><X size={20} /></button>
// //                         </div>
// //                         <div className="mlab-modal__body">
// //                             <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '1rem', lineHeight: '1.5' }}>
// //                                 You are about to permanently delete <strong>{deletingLearner.fullName}</strong>. This action is recorded in the audit logs and cannot be undone.
// //                             </p>

// //                             <div className="mlab-form-group">
// //                                 <label style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>Reason for Deletion *</label>
// //                                 <textarea
// //                                     className="mlab-input"
// //                                     placeholder="e.g., Duplicate entry, incorrect SAQA mapping, learner withdrew..."
// //                                     value={deleteReason}
// //                                     onChange={e => setDeleteReason(e.target.value)}
// //                                     rows={3}
// //                                     style={{ width: '100%', resize: 'none', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
// //                                 />
// //                             </div>

// //                             <div style={{ marginTop: '1rem', padding: '10px', background: '#fef2f2', borderRadius: '6px', fontSize: '0.75rem', color: '#991b1b' }}>
// //                                 <strong>Logged Action:</strong> Admin {currentUser?.fullName || 'User'} is performing this delete.
// //                             </div>
// //                         </div>
// //                         <div className="mlab-modal__footer" style={{ borderTop: 'none', paddingTop: '1.5rem' }}>
// //                             <button className="mlab-btn mlab-btn--ghost" onClick={() => setDeletingLearner(null)}>Cancel</button>
// //                             <button
// //                                 className="mlab-btn mlab-btn--red"
// //                                 disabled={!deleteReason.trim() || isDeleting}
// //                                 onClick={handleConfirmDelete}
// //                                 style={{ background: '#dc2626', color: 'white', opacity: (!deleteReason.trim() || isDeleting) ? 0.5 : 1 }}
// //                             >
// //                                 {isDeleting ? <Loader2 className="spin" size={16} /> : "Confirm Delete"}
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };



// // // import React, { useState, useMemo, useEffect } from 'react';
// // // import {
// // //     Plus, Upload, Download, Search, Edit, Trash2,
// // //     Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
// // //     Eye, Archive as ArchiveIcon, Mail,
// // //     Share2, GraduationCap, Users, History,
// // //     ShieldCheck // 🚀 Added icon for Web3
// // // } from 'lucide-react';
// // // import { useNavigate } from 'react-router-dom';
// // // import './LearnersView.css';
// // // import type { DashboardLearner, Cohort } from '../../../types';

// // // interface LearnersViewProps {
// // //     learners: DashboardLearner[];
// // //     stagingLearners?: DashboardLearner[];
// // //     cohorts?: Cohort[];
// // //     onAdd: () => void;
// // //     onUpload: () => void;
// // //     onEdit: (learner: DashboardLearner) => void;
// // //     onArchive: (learner: DashboardLearner) => void;
// // //     onRestore: (learner: DashboardLearner) => void;
// // //     onDiscard: (learner: DashboardLearner) => void;
// // //     onInvite: (learner: DashboardLearner) => void;
// // //     onArchiveCohort: (year: string) => void;
// // //     onBulkRestore?: (learners: DashboardLearner[]) => void;
// // //     onBulkArchive?: (learners: DashboardLearner[]) => void;
// // //     onBulkApprove?: (learners: DashboardLearner[]) => void;
// // //     onBulkDiscard?: (learners: DashboardLearner[]) => void;
// // // }

// // // export const LearnersView: React.FC<LearnersViewProps> = ({
// // //     learners,
// // //     stagingLearners = [],
// // //     cohorts = [],
// // //     onAdd, onUpload, onEdit,
// // //     onArchive, onRestore, onDiscard, onInvite,
// // //     onBulkRestore, onBulkArchive, onBulkApprove, onBulkDiscard
// // // }) => {
// // //     const navigate = useNavigate();

// // //     // ─── VIEW STATE ───
// // //     const [viewMode, setViewMode] = useState<'active' | 'staging' | 'offline'>('active');
// // //     const [searchTerm, setSearchTerm] = useState('');
// // //     const [filterStatus, setFilterStatus] = useState('all');
// // //     const [selectedYear, setSelectedYear] = useState<string>('all');
// // //     const [selectedQualification, setSelectedQualification] = useState<string>('all');
// // //     const [showArchived, setShowArchived] = useState(false);
// // //     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

// // //     // 🚀 NEW: Filter for Web3 Status
// // //     const [web3Status, setWeb3Status] = useState<'all' | 'minted' | 'pending'>('all');

// // //     const [copiedId, setCopiedId] = useState<string | null>(null);

// // //     // Reset selection when switching tabs/filters
// // //     useEffect(() => {
// // //         setSelectedIds(new Set());
// // //     }, [viewMode, showArchived, selectedYear, selectedQualification, web3Status]);

// // //     // ─── SMART MULTI-COURSE DETECTION ───
// // //     const learnerCountsById = useMemo(() => {
// // //         const counts: Record<string, number> = {};
// // //         [...learners, ...stagingLearners].forEach(l => {
// // //             if (l.idNumber) {
// // //                 counts[l.idNumber] = (counts[l.idNumber] || 0) + 1;
// // //             }
// // //         });
// // //         return counts;
// // //     }, [learners, stagingLearners]);


// // //     // ─── FILTER LOGIC ───
// // //     const filteredLearners = useMemo(() => {
// // //         let sourceData: DashboardLearner[] = [];

// // //         if (viewMode === 'staging') {
// // //             sourceData = stagingLearners;
// // //         } else if (viewMode === 'offline') {
// // //             sourceData = learners.filter(l => l.isOffline === true);
// // //         } else {
// // //             sourceData = learners.filter(l => !l.isOffline);
// // //         }

// // //         return sourceData.filter(learner => {
// // //             const isArchived = learner.isArchived === true;

// // //             // 1. Archive Filter
// // //             if (viewMode === 'active' || viewMode === 'offline') {
// // //                 if (showArchived && !isArchived) return false;
// // //                 if (!showArchived && isArchived) return false;
// // //             }

// // //             // 2. Search Filter
// // //             if (searchTerm) {
// // //                 const s = searchTerm.toLowerCase();
// // //                 if (!(
// // //                     learner.fullName?.toLowerCase().includes(s) ||
// // //                     learner.idNumber?.includes(searchTerm) ||
// // //                     learner.email?.toLowerCase().includes(s)
// // //                 )) return false;
// // //             }

// // //             // 3. Year Filter 
// // //             if ((viewMode === 'active' || viewMode === 'offline') && selectedYear !== 'all') {
// // //                 const y = learner.trainingStartDate
// // //                     ? learner.trainingStartDate.substring(0, 4)
// // //                     : 'Unknown';
// // //                 if (y !== selectedYear) return false;
// // //             }

// // //             // 4. Qualification Filter
// // //             if (selectedQualification !== 'all') {
// // //                 if (learner.qualification?.name !== selectedQualification) return false;
// // //             }

// // //             // 5. Status Filter
// // //             if (filterStatus !== 'all' && learner.status !== filterStatus) return false;

// // //             // 🚀 6. Web3 Status Filter
// // //             if (web3Status === 'minted' && !learner.isBlockchainVerified) return false;
// // //             if (web3Status === 'pending' && learner.isBlockchainVerified) return false;

// // //             return true;
// // //         });
// // //     }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, selectedQualification, showArchived, web3Status]);

// // //     // Available cohort years
// // //     const availableYears = useMemo(() => {
// // //         const years = new Set<string>();
// // //         learners.forEach(l => {
// // //             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
// // //         });
// // //         return Array.from(years).sort().reverse();
// // //     }, [learners]);

// // //     // Available Qualifications
// // //     const availableQualifications = useMemo(() => {
// // //         const quals = new Set<string>();
// // //         const allLearners = [...learners, ...stagingLearners];
// // //         allLearners.forEach(l => {
// // //             if (l.qualification?.name) quals.add(l.qualification.name);
// // //         });
// // //         return Array.from(quals).sort();
// // //     }, [learners, stagingLearners]);

// // //     // ─── COUNTERS ───
// // //     const activeCount = learners.filter(l => !l.isArchived && !l.isOffline).length;
// // //     const offlineCount = learners.filter(l => !l.isArchived && l.isOffline).length;
// // //     const stagingCount = stagingLearners.length;

// // //     const archivedCount = viewMode === 'offline'
// // //         ? learners.filter(l => l.isArchived && l.isOffline).length
// // //         : learners.filter(l => l.isArchived && !l.isOffline).length;

// // //     // ─── HANDLERS ───
// // //     const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         if (e.target.checked) setSelectedIds(new Set(filteredLearners.map(l => l.id)));
// // //         else setSelectedIds(new Set());
// // //     };

// // //     const handleSelectOne = (id: string) => {
// // //         const next = new Set(selectedIds);
// // //         next.has(id) ? next.delete(id) : next.add(id);
// // //         setSelectedIds(next);
// // //     };

// // //     const executeBulkAction = (action: 'approve' | 'restore' | 'archive' | 'discard') => {
// // //         const sourceList = viewMode === 'staging' ? stagingLearners : learners;
// // //         const selected = sourceList.filter(l => selectedIds.has(l.id));
// // //         if (action === 'approve') onBulkApprove?.(selected);
// // //         if (action === 'restore') onBulkRestore?.(selected);
// // //         if (action === 'archive') onBulkArchive?.(selected);
// // //         if (action === 'discard') onBulkDiscard?.(selected);
// // //         setSelectedIds(new Set());
// // //     };

// // //     const handleCopyLink = (learnerId: string, idNumber: string) => {
// // //         const link = `${window.location.origin}/sor/${learnerId}`;
// // //         navigator.clipboard.writeText(link).then(() => {
// // //             setCopiedId(idNumber);
// // //             setTimeout(() => setCopiedId(null), 2000);
// // //         });
// // //     };

// // //     const handleExport = () => {
// // //         const csvContent = "data:text/csv;charset=utf-8," +
// // //             ["Full Name,ID Number,Class / Cohort,Qualification,Status,Start Date,Auth Status,Web3 Verified"].concat(
// // //                 filteredLearners.map(l => {
// // //                     const cohortName = cohorts.find(c => c.id === l.cohortId)?.name || 'Unassigned';
// // //                     return `"${l.fullName}","${l.idNumber}","${cohortName}","${l.qualification?.name || 'N/A'}","${l.status}","${l.trainingStartDate}","${l.authStatus || 'pending'}","${l.isBlockchainVerified ? 'Yes' : 'No'}"`;
// // //                 })
// // //             ).join("\n");
// // //         const link = document.createElement("a");
// // //         link.setAttribute("href", encodeURI(csvContent));
// // //         link.setAttribute("download", `learners_enrollments_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
// // //         document.body.appendChild(link);
// // //         link.click();
// // //     };

// // //     // ─── RENDER ───
// // //     return (
// // //         <div className="mlab-learners">

// // //             {/* ── TABS ── */}
// // //             <div className="mlab-tab-bar">
// // //                 <button
// // //                     className={`mlab-tab ${viewMode === 'active' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
// // //                     onClick={() => { setViewMode('active'); setShowArchived(false); }}
// // //                 >
// // //                     Enrollments (Active)
// // //                     <span className="mlab-tab__count">{activeCount}</span>
// // //                 </button>

// // //                 <button
// // //                     className={`mlab-tab ${viewMode === 'offline' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
// // //                     onClick={() => { setViewMode('offline'); setShowArchived(false); }}
// // //                 >
// // //                     Offline / RPL
// // //                     <span className="mlab-tab__count" style={{ background: viewMode === 'offline' ? '#e2e8f0' : '#f1f5f9', color: '#475569' }}>
// // //                         {offlineCount}
// // //                     </span>
// // //                 </button>

// // //                 <button
// // //                     className={`mlab-tab ${viewMode === 'staging' ? 'mlab-tab--staging-active' : 'mlab-tab--inactive'}`}
// // //                     onClick={() => setViewMode('staging')}
// // //                 >
// // //                     Staging Area
// // //                     {stagingCount > 0 && (
// // //                         <span className="mlab-tab__badge">{stagingCount}</span>
// // //                     )}
// // //                 </button>
// // //             </div>

// // //             {/* ── TOOLBAR ── */}
// // //             <div className="mlab-toolbar" style={{ flexWrap: 'wrap' }}>

// // //                 <div className="mlab-search">
// // //                     <Search size={18} color="var(--mlab-grey)" />
// // //                     <input
// // //                         type="text"
// // //                         placeholder="Search by name, ID or email…"
// // //                         value={searchTerm}
// // //                         onChange={e => setSearchTerm(e.target.value)}
// // //                     />
// // //                 </div>

// // //                 <div className="mlab-select-wrap">
// // //                     <GraduationCap size={16} color="var(--mlab-grey)" />
// // //                     <select
// // //                         value={selectedQualification}
// // //                         onChange={e => setSelectedQualification(e.target.value)}
// // //                     >
// // //                         <option value="all">All Qualifications</option>
// // //                         {availableQualifications.map(qual => (
// // //                             <option key={qual} value={qual}>{qual}</option>
// // //                         ))}
// // //                     </select>
// // //                 </div>

// // //                 {(viewMode === 'active' || viewMode === 'offline') && (
// // //                     <>
// // //                         {/* Year filter */}
// // //                         <div className="mlab-select-wrap">
// // //                             <Calendar size={16} color="var(--mlab-grey)" />
// // //                             <select
// // //                                 value={selectedYear}
// // //                                 onChange={e => setSelectedYear(e.target.value)}
// // //                             >
// // //                                 <option value="all">All Years</option>
// // //                                 {availableYears.map(year => (
// // //                                     <option key={year} value={year}>{year} Cohort</option>
// // //                                 ))}
// // //                             </select>
// // //                         </div>

// // //                         {/* 🚀 WEB3 FILTER */}
// // //                         <div className="mlab-select-wrap" style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}>
// // //                             <ShieldCheck size={16} color="#0ea5e9" />
// // //                             <select
// // //                                 value={web3Status}
// // //                                 onChange={e => setWeb3Status(e.target.value as any)}
// // //                                 style={{ color: '#0369a1', fontWeight: 500 }}
// // //                             >
// // //                                 <option value="all">All Web3 Status</option>
// // //                                 <option value="minted">✅ Minted (Secured)</option>
// // //                                 <option value="pending">⏳ Pending Issuance</option>
// // //                             </select>
// // //                         </div>

// // //                         <label className={`mlab-archive-toggle ${showArchived ? 'mlab-archive-toggle--on' : ''}`}>
// // //                             <input
// // //                                 type="checkbox"
// // //                                 checked={showArchived}
// // //                                 onChange={e => setShowArchived(e.target.checked)}
// // //                             />
// // //                             Show Archived ({archivedCount})
// // //                         </label>
// // //                     </>
// // //                 )}
// // //             </div>

// // //             {/* ── ACTION BAR ── */}
// // //             {selectedIds.size > 0 ? (
// // //                 <div className="mlab-action-bar">
// // //                     <span className="mlab-action-bar__label">
// // //                         {selectedIds.size} Enrollments Selected
// // //                     </span>
// // //                     <div className="mlab-bulk-actions">

// // //                         {viewMode === 'staging' && (
// // //                             <>
// // //                                 <button className="mlab-btn mlab-btn--green" onClick={() => executeBulkAction('approve')}>
// // //                                     <ClipboardCheck size={15} /> Approve
// // //                                 </button>
// // //                                 <button className="mlab-btn mlab-btn--outline mlab-btn--outline-red" onClick={() => executeBulkAction('discard')}>
// // //                                     <Trash2 size={15} /> Discard Drafts
// // //                                 </button>
// // //                             </>
// // //                         )}

// // //                         {(viewMode === 'active' || viewMode === 'offline') && (
// // //                             showArchived ? (
// // //                                 <button className="mlab-btn mlab-btn--outline mlab-btn--outline-green" onClick={() => executeBulkAction('restore')}>
// // //                                     <RotateCcw size={15} /> Restore
// // //                                 </button>
// // //                             ) : (
// // //                                 <button className="mlab-btn mlab-btn--outline mlab-btn--outline-amber" onClick={() => executeBulkAction('archive')}>
// // //                                     <ArchiveIcon size={15} /> Archive
// // //                                 </button>
// // //                             )
// // //                         )}
// // //                     </div>
// // //                 </div>

// // //             ) : (

// // //                 <div className="mlab-standard-actions">
// // //                     <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue" onClick={handleExport}>
// // //                         <Download size={15} /> Export
// // //                     </button>
// // //                     <button className="mlab-btn mlab-btn--primary" onClick={onUpload}>
// // //                         <Upload size={15} /> Import CSV
// // //                     </button>
// // //                     <button className="mlab-btn mlab-btn--green" onClick={onAdd}>
// // //                         <Plus size={15} /> Add Enrollment
// // //                     </button>
// // //                 </div>
// // //             )}

// // //             {/* ── TABLE ── */}
// // //             <div className="mlab-table-wrap">
// // //                 <table className="mlab-table">
// // //                     <thead>
// // //                         <tr>
// // //                             <th style={{ width: '40px' }}>
// // //                                 <input
// // //                                     type="checkbox"
// // //                                     onChange={handleSelectAll}
// // //                                     checked={filteredLearners.length > 0 && selectedIds.size === filteredLearners.length}
// // //                                 />
// // //                             </th>
// // //                             <th>Learner</th>
// // //                             <th>Class / Cohort</th>
// // //                             <th>Qualification</th>
// // //                             <th>Status</th>
// // //                             <th>Web3 Status</th> {/* 🚀 Added Column */}
// // //                             <th>Actions</th>
// // //                         </tr>
// // //                     </thead>
// // //                     <tbody>
// // //                         {filteredLearners.map(learner => {
// // //                             const isSelected = selectedIds.has(learner.id);
// // //                             const rowClass = [
// // //                                 learner.isArchived ? 'mlab-tr--archived' : '',
// // //                                 isSelected ? 'mlab-tr--selected' : '',
// // //                             ].filter(Boolean).join(' ');

// // //                             const cohortObj = cohorts.find(c => c.id === learner.cohortId);
// // //                             const cohortName = cohortObj ? cohortObj.name : (learner.cohortId === 'Unassigned' ? 'Unassigned' : 'Unknown Class');

// // //                             const isReturning = learner.idNumber && (learnerCountsById[learner.idNumber] > 1);

// // //                             return (
// // //                                 <tr key={learner.id} className={rowClass}>
// // //                                     <td>
// // //                                         <input
// // //                                             type="checkbox"
// // //                                             checked={isSelected}
// // //                                             onChange={() => handleSelectOne(learner.id)}
// // //                                         />
// // //                                     </td>

// // //                                     <td>
// // //                                         <div>
// // //                                             <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                                 {learner.fullName}
// // //                                                 {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', color: '#374151' }}>Archived</span>}

// // //                                                 {isReturning && (
// // //                                                     <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }} title="Enrolled in multiple classes">
// // //                                                         <History size={10} /> Multi-Course
// // //                                                     </span>
// // //                                                 )}
// // //                                             </div>
// // //                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
// // //                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
// // //                                             </div>
// // //                                         </div>
// // //                                     </td>

// // //                                     <td>
// // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                             <Users size={14} color="#64748b" />
// // //                                             <span style={{ fontWeight: 500, color: cohortName === 'Unassigned' ? '#ef4444' : '#334155' }}>
// // //                                                 {cohortName}
// // //                                             </span>
// // //                                         </div>
// // //                                     </td>

// // //                                     <td>
// // //                                         <div className="mlab-cell-qual" title={learner.qualification?.name}>{learner.qualification?.name || 'No Qualification'}</div>
// // //                                         <div className="mlab-cell-sub">{learner.qualification?.saqaId}</div>
// // //                                     </td>

// // //                                     <td>
// // //                                         {learner.isArchived
// // //                                             ? <span className="mlab-badge mlab-badge--archived">Archived</span>
// // //                                             : viewMode === 'staging'
// // //                                                 ? <span className="mlab-badge mlab-badge--draft">Draft</span>
// // //                                                 : learner.isOffline
// // //                                                     ? <span className="mlab-badge" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>Offline / RPL</span>
// // //                                                     : <span className="mlab-badge mlab-badge--active">Active</span>
// // //                                         }
// // //                                     </td>

// // //                                     {/* 🚀 WEB3 STATUS COLUMN */}
// // //                                     <td>
// // //                                         {viewMode === 'staging' ? (
// // //                                             <span style={{ color: '#94a3b8', fontSize: '12px' }}>Awaiting Approval</span>
// // //                                         ) : learner.isBlockchainVerified ? (
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontSize: '12px', fontWeight: 600 }}>
// // //                                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.2)' }}></div>
// // //                                                 Secured
// // //                                             </div>
// // //                                         ) : (
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#d97706', fontSize: '12px', fontWeight: 600 }}>
// // //                                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }}></div>
// // //                                                 Pending Mint
// // //                                             </div>
// // //                                         )}
// // //                                     </td>

// // //                                     <td>
// // //                                         <div className="mlab-icon-btn-group">
// // //                                             <button
// // //                                                 className="mlab-icon-btn mlab-icon-btn--blue"
// // //                                                 onClick={() => onEdit(learner)}
// // //                                                 title="Edit Enrollment Details"
// // //                                             >
// // //                                                 <Edit size={14} />
// // //                                             </button>

// // //                                             {/* Action buttons visible if NOT staged and NOT archived */}
// // //                                             {viewMode !== 'staging' && !learner.isArchived && !showArchived && (
// // //                                                 <>
// // //                                                     <button
// // //                                                         className="mlab-icon-btn mlab-icon-btn--blue"
// // //                                                         onClick={() => navigate(`/sor/${learner.id}`)}
// // //                                                         title="View Statement of Results"
// // //                                                     >
// // //                                                         <Eye size={14} />
// // //                                                     </button>

// // //                                                     <button
// // //                                                         className="mlab-icon-btn mlab-icon-btn--blue"
// // //                                                         style={{ color: copiedId === learner.idNumber ? '#16a34a' : '' }}
// // //                                                         onClick={() => handleCopyLink(learner.id, learner.idNumber)}
// // //                                                         title="Copy Shareable Link"
// // //                                                     >
// // //                                                         {copiedId === learner.idNumber ? <ClipboardCheck size={14} /> : <Share2 size={14} />}
// // //                                                     </button>

// // //                                                     {viewMode === 'active' && (
// // //                                                         <button
// // //                                                             className={`mlab-icon-btn ${learner.authStatus === 'active'
// // //                                                                 ? 'mlab-icon-btn--emerald'
// // //                                                                 : 'mlab-icon-btn--green'
// // //                                                                 }`}
// // //                                                             onClick={() => onInvite(learner)}
// // //                                                             title={learner.authStatus === 'active' ? 'Resend Invite' : 'Send Invite'}
// // //                                                         >
// // //                                                             <Mail size={14} />
// // //                                                         </button>
// // //                                                     )}

// // //                                                     <button
// // //                                                         className="mlab-icon-btn mlab-icon-btn--amber"
// // //                                                         onClick={() => onArchive(learner)}
// // //                                                         title="Archive Record"
// // //                                                     >
// // //                                                         <ArchiveIcon size={14} />
// // //                                                     </button>
// // //                                                 </>
// // //                                             )}

// // //                                             {(viewMode === 'active' || viewMode === 'offline') && learner.isArchived && (
// // //                                                 <button
// // //                                                     className="mlab-icon-btn mlab-icon-btn--emerald"
// // //                                                     onClick={() => onRestore(learner)}
// // //                                                     title="Restore"
// // //                                                 >
// // //                                                     <RotateCcw size={14} />
// // //                                                 </button>
// // //                                             )}

// // //                                             {viewMode === 'staging' && (
// // //                                                 <button
// // //                                                     className="mlab-icon-btn mlab-icon-btn--red"
// // //                                                     onClick={() => onDiscard(learner)}
// // //                                                     title="Discard Draft"
// // //                                                 >
// // //                                                     <Trash2 size={14} />
// // //                                                 </button>
// // //                                             )}
// // //                                         </div>
// // //                                     </td>
// // //                                 </tr>
// // //                             );
// // //                         })}
// // //                     </tbody>
// // //                 </table>

// // //                 {filteredLearners.length === 0 && (
// // //                     <div className="mlab-empty">
// // //                         <AlertTriangle size={40} color="var(--mlab-green)" style={{ opacity: 0.6 }} />
// // //                         <p className="mlab-empty__title">No Enrollments Found</p>
// // //                         <p className="mlab-empty__desc">
// // //                             {viewMode === 'active'
// // //                                 ? showArchived
// // //                                     ? "No archived records found."
// // //                                     : "No active learners found matching your criteria."
// // //                                 : viewMode === 'offline'
// // //                                     ? showArchived
// // //                                         ? "No archived offline records found."
// // //                                         : "No offline learners found. Upload an SoR CSV to import one."
// // //                                     : "Staging area is empty. Import a CSV to get started."}
// // //                         </p>
// // //                     </div>
// // //                 )}
// // //             </div>
// // //         </div>
// // //     );
// // // };
