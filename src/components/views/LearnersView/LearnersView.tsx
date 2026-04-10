// src/components/views/LearnersView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import {
    Plus, Upload, Download, Search, Edit, Trash2,
    Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
    Eye, Archive as ArchiveIcon, Mail,
    Share2, GraduationCap, Users, History,
    ShieldCheck, X, AlertCircle, Check,
    Loader2, MapPin, Award, FileSpreadsheet, FileText, Layers, Filter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, deleteDoc, writeBatch, collection } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { DashboardLearner, Cohort } from '../../../types';
import { useStore } from '../../../store/useStore';
import { CertificateGenerator } from '../../common/CertificateGenerator/CertificateGenerator';
import { StatusModal } from '../../common/StatusModal/StatusModal';
import { BulkResultsImportModal } from '../../admin/BulkResultsImportModal/BulkResultsImportModal';
import '../../admin/WorkplacesManager/WorkplacesManager.css';
import './LearnersView.css';

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

    const { user: currentUser, settings, programmes, fetchLearners } = useStore();

    // ─── VIEW STATE ───
    const [viewMode, setViewMode] = useState<'active' | 'staging' | 'offline'>('active');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedYear, setSelectedYear] = useState<string>('all');
    const [selectedQualification, setSelectedQualification] = useState<string>('all');
    const [selectedCampus, setSelectedCampus] = useState<string>('all');
    const [showArchived, setShowArchived] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [web3Status, setWeb3Status] = useState<'all' | 'minted' | 'pending'>('all');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const [hiddenDraftIds, setHiddenDraftIds] = useState<Set<string>>(new Set());

    const [deletingLearner, setDeletingLearner] = useState<DashboardLearner | null>(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const [discardingLearner, setDiscardingLearner] = useState<DashboardLearner | null>(null);
    const [isDiscarding, setIsDiscarding] = useState(false);

    const [approvingLearners, setApprovingLearners] = useState<DashboardLearner[] | null>(null);
    const [isApproving, setIsApproving] = useState(false);

    const [certifyingLearner, setCertifyingLearner] = useState<DashboardLearner | null>(null);

    const [showBulkResultsImporter, setShowBulkResultsImporter] = useState(false);

    useEffect(() => {
        setSelectedIds(new Set());
    }, [viewMode, showArchived, selectedYear, selectedQualification, selectedCampus, web3Status]);

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
            if (hiddenDraftIds.has(learner.id)) return false;

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

            if (selectedCampus !== 'all') {
                const learnerCohort = cohorts.find(c => c.id === learner.cohortId);
                const activeCampusId = learner.campusId || learnerCohort?.campusId;

                if (activeCampusId !== selectedCampus) {
                    return false;
                }
            }

            return true;
        });
    }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, selectedQualification, selectedCampus, showArchived, web3Status, cohorts, hiddenDraftIds]);

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
    const stagingCount = stagingLearners.filter(l => !hiddenDraftIds.has(l.id)).length;

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

        if (action === 'approve') {
            setApprovingLearners(selected);
        } else if (action === 'restore') {
            onBulkRestore?.(selected);
        } else if (action === 'archive') {
            onBulkArchive?.(selected);
        } else if (action === 'discard') {
            onBulkDiscard?.(selected);
        }

        setSelectedIds(new Set());
    };

    const handleCopyLink = (learnerId: string, idNumber: string) => {
        const link = `${window.location.origin}/sor/${learnerId}`;
        navigator.clipboard.writeText(link).then(() => {
            setCopiedId(idNumber);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    // DYNAMIC TEMPLATE DOWNLOADER (Supports both Profiles & Results)
    const handleDownloadTemplate = (type: 'enrollment' | 'results', format: 'csv' | 'xlsx') => {
        const basePath = '/templates';
        const filePrefix = type === 'enrollment' ? '/learners/Learner_Enrolment_Template' : '/results/Statement_Of_Results _Template';

        const fileUrl = `${basePath}/${filePrefix}.${format}`;
        const fileName = `${filePrefix}.${format}`;

        const link = document.createElement("a");
        link.href = fileUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExport = () => {
        const csvContent = "data:text/csv;charset=utf-8," +
            ["Full Name,ID Number,Class / Cohort,Campus,Qualification,Status,Start Date,Auth Status,Web3 Verified"].concat(
                filteredLearners.map(l => {
                    const cohortObj = cohorts.find(c => c.id === l.cohortId);
                    const cohortName = cohortObj?.name || 'Unassigned';

                    const activeCampusId = l.campusId || cohortObj?.campusId;
                    const campusName = activeCampusId
                        ? settings?.campuses?.find(c => c.id === activeCampusId)?.name || 'Unknown'
                        : 'Unassigned';

                    return `"${l.fullName}","${l.idNumber}","${cohortName}","${campusName}","${l.qualification?.name || 'N/A'}","${l.status}","${l.trainingStartDate}","${l.authStatus || 'pending'}","${l.isBlockchainVerified ? 'Yes' : 'No'}"`;
                })
            ).join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `learners_enrollments_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
    };

    const handleSaveBulkResults = async (parsedLearners: any[]) => {
        try {
            const batch = writeBatch(db);

            parsedLearners.forEach(learner => {
                if (learner.isUpdate && learner.existingId) {
                    const ref = doc(db, "learners", learner.existingId);
                    batch.set(ref, {
                        knowledgeModules: learner.knowledgeModules,
                        practicalModules: learner.practicalModules,
                        workExperienceModules: learner.workExperienceModules,
                        qualification: learner.qualification
                    }, { merge: true });
                } else {
                    const newId = doc(collection(db, "staging_learners")).id;
                    const ref = doc(db, "staging_learners", newId);
                    batch.set(ref, {
                        ...learner,
                        id: newId,
                        learnerId: newId,
                        status: "active",
                        authStatus: "pending",
                        isDraft: true,
                        createdAt: new Date().toISOString(),
                        createdBy: currentUser?.uid || "admin"
                    });
                }
            });

            await batch.commit();
            if (fetchLearners) await fetchLearners();
            setShowBulkResultsImporter(false);

        } catch (error) {
            console.error("Batch Save Error", error);
            throw error;
        }
    };

    const handleConfirmApprove = async () => {
        if (!approvingLearners || approvingLearners.length === 0) return;
        setIsApproving(true);
        try {
            if (onBulkApprove) {
                await onBulkApprove(approvingLearners);
            }
            setApprovingLearners(null);
        } catch (err) {
            console.error("Approval failed", err);
        } finally {
            setIsApproving(false);
        }
    };

    const handleConfirmDiscard = async () => {
        if (!discardingLearner) return;

        setIsDiscarding(true);
        try {
            await deleteDoc(doc(db, "staging_learners", discardingLearner.id));

            setHiddenDraftIds(prev => {
                const next = new Set(prev);
                next.add(discardingLearner.id);
                return next;
            });

            setDiscardingLearner(null);
        } catch (err) {
            console.error("Failed to discard draft", err);
            alert("An error occurred while discarding the draft. Please check your connection.");
        } finally {
            setIsDiscarding(false);
        }
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
        <div className="wm-root animate-fade-in mlab-learners">

            {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
            <div className="wm-page-header" style={{ marginBottom: 0 }}>
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><GraduationCap size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Learner Enrollments</h1>
                        <p className="wm-page-header__desc">Manage active students, staging drafts, and offline RPL records.</p>
                    </div>
                </div>
            </div>

            {/* ── TABS (Sits directly under the new header) ── */}
            <div className="mlab-tab-bar" style={{ borderTop: 'none', background: 'white', marginTop: 16 }}>
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

            {/* ── TOOLBAR (Reusing wm-toolbar styling for sleek dropdowns) ── */}
            <div className="wm-toolbar" style={{ flexWrap: 'wrap', marginTop: '1rem' }}>
                <div className="wm-search" style={{ flex: '1 1 200px' }}>
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

                <div className="wm-search" style={{ flex: 'none' }}>
                    <GraduationCap size={15} className="wm-search__icon" />
                    <select className="wm-search__input" value={selectedQualification} onChange={e => setSelectedQualification(e.target.value)} style={{ cursor: 'pointer' }}>
                        <option value="all">All Qualifications</option>
                        {availableQualifications.map(qual => (
                            <option key={qual} value={qual}>{qual}</option>
                        ))}
                    </select>
                </div>

                <div className="wm-search" style={{ flex: 'none' }}>
                    <MapPin size={15} className="wm-search__icon" />
                    <select className="wm-search__input" value={selectedCampus} onChange={e => setSelectedCampus(e.target.value)} style={{ cursor: 'pointer' }}>
                        <option value="all">All Locations</option>
                        {settings?.campuses?.map(campus => (
                            <option key={campus.id} value={campus.id}>{campus.name}</option>
                        ))}
                    </select>
                </div>

                {(viewMode === 'active' || viewMode === 'offline') && (
                    <>
                        <div className="wm-search" style={{ flex: 'none' }}>
                            <Calendar size={15} className="wm-search__icon" />
                            <select className="wm-search__input" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ cursor: 'pointer' }}>
                                <option value="all">All Years</option>
                                {availableYears.map(year => (
                                    <option key={year} value={year}>{year} Cohort</option>
                                ))}
                            </select>
                        </div>

                        <div className="wm-search" style={{ flex: 'none' }}>
                            <ShieldCheck size={15} className="wm-search__icon" />
                            <select className="wm-search__input" value={web3Status} onChange={e => setWeb3Status(e.target.value as any)} style={{ cursor: 'pointer' }}>
                                <option value="all">All Web3 Status</option>
                                <option value="minted">✅ Minted (Secured)</option>
                                <option value="pending">⏳ Pending Issuance</option>
                            </select>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: showArchived ? 'var(--mlab-amber)' : 'var(--mlab-grey)', cursor: 'pointer', padding: '0.55rem 0.9rem', background: showArchived ? '#fffbeb' : 'white', border: `1px solid ${showArchived ? '#fcd34d' : 'var(--mlab-border)'}`, borderRadius: '4px' }}>
                            <input
                                type="checkbox"
                                checked={showArchived}
                                onChange={e => setShowArchived(e.target.checked)}
                                style={{ margin: 0 }}
                            />
                            Show Archived ({archivedCount})
                        </label>
                    </>
                )}
            </div>

            {/* ── ACTION BAR (For Bulk Selection or Import/Export) ── */}
            {selectedIds.size > 0 ? (
                <div className="mlab-action-bar">
                    <span className="mlab-action-bar__label">
                        {selectedIds.size} Enrollments Selected
                    </span>
                    <div className="mlab-bulk-actions">
                        {viewMode === 'staging' && (
                            <>
                                <button className="wm-btn wm-btn--primary" style={{ background: 'var(--mlab-green)', borderColor: 'var(--mlab-green-dark)' }} onClick={() => executeBulkAction('approve')}>
                                    <ClipboardCheck size={14} /> Approve
                                </button>
                                <button className="wm-btn wm-btn--ghost" style={{ color: 'var(--mlab-red)', borderColor: 'var(--mlab-red)' }} onClick={() => executeBulkAction('discard')}>
                                    <Trash2 size={14} /> Discard Drafts
                                </button>
                            </>
                        )}
                        {(viewMode === 'active' || viewMode === 'offline') && (
                            showArchived ? (
                                <button className="wm-btn wm-btn--ghost" style={{ color: 'var(--mlab-green)', borderColor: 'var(--mlab-green)' }} onClick={() => executeBulkAction('restore')}>
                                    <RotateCcw size={14} /> Restore
                                </button>
                            ) : (
                                <button className="wm-btn wm-btn--ghost" style={{ color: 'var(--mlab-amber)', borderColor: 'var(--mlab-amber)' }} onClick={() => executeBulkAction('archive')}>
                                    <ArchiveIcon size={14} /> Archive
                                </button>
                            )
                        )}
                    </div>
                </div>
            ) : (
                <div className="mlab-standard-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.5rem' }}>
                    {viewMode !== 'active' && (
                        <>
                            {/* ── PROFILES GROUP ── */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', paddingRight: '4px', borderRight: '1px solid #cbd5e1' }}>
                                    Profiles
                                </span>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    <button type="button" className="wm-btn wm-btn--ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', border: 'none', background: 'transparent' }} onClick={() => handleDownloadTemplate('enrollment', 'xlsx')} title="Download Excel Profile Template">
                                        <FileSpreadsheet size={13} color="#0ea5e9" /> .XLSX
                                    </button>
                                    <button type="button" className="wm-btn wm-btn--ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', border: 'none', background: 'transparent' }} onClick={() => handleDownloadTemplate('enrollment', 'csv')} title="Download CSV Profile Template">
                                        <FileText size={13} color="#0ea5e9" /> .CSV
                                    </button>
                                </div>
                                <button className="wm-btn wm-btn--primary" onClick={onUpload} style={{ background: '#0ea5e9', borderColor: '#0ea5e9', padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} title="Import New Learner Profiles">
                                    <Upload size={13} /> Import
                                </button>
                                <button className="wm-btn wm-btn--ghost" onClick={handleExport} style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'white' }}>
                                    <Download size={13} /> Export
                                </button>
                            </div>

                            {/* ── RESULTS GROUP ── */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px', paddingRight: '4px', borderRight: '1px solid #86efac' }}>
                                    Results
                                </span>
                                <button type="button" className="wm-btn wm-btn--ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', color: '#15803d', border: 'none', background: 'transparent' }} onClick={() => handleDownloadTemplate('results', 'xlsx')} title="Download Results Template">
                                    <FileSpreadsheet size={13} color="#10b981" /> Template
                                </button>
                                <button className="wm-btn wm-btn--primary" onClick={() => setShowBulkResultsImporter(true)} style={{ background: '#16a34a', borderColor: '#16a34a', padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} title="Import Competency Results">
                                    <Layers size={13} /> Bulk Import Results
                                </button>
                            </div>
                        </>
                    )}
                    <button className="wm-btn wm-btn--primary" onClick={onAdd} style={{ padding: '0.45rem 1rem', marginLeft: 'auto' }}>
                        <Plus size={14} /> Add Single
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
                            <th>Location / Cohort</th>
                            <th>Qualification</th>
                            <th>Status</th>
                            <th>Web3 Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
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

                            const activeCampusId = learner.campusId || cohortObj?.campusId;
                            const campusName = activeCampusId
                                ? settings?.campuses?.find(c => c.id === activeCampusId)?.name || 'Unknown Location'
                                : 'Location Pending';

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
                                                {learner.idNumber} • {learner.trainingStartDate?.substring(6, 10) || "No Year"}
                                            </div>
                                        </div>
                                    </td>

                                    <td>
                                        <div className="mlab-cell-cohort">
                                            <MapPin size={13} className="cohort-icon" style={{ color: 'var(--mlab-green)' }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
                                                {campusName}
                                            </span>
                                        </div>
                                        <div className="mlab-cell-cohort" style={{ marginTop: '2px' }}>
                                            <Users size={12} className="cohort-icon" />
                                            <span className={`mlab-cell-sub ${cohortName === 'Unassigned' ? 'text-red' : ''}`}>
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

                                    <td style={{ textAlign: 'right' }}>
                                        <div className="mlab-icon-btn-group" style={{ justifyContent: 'flex-end' }}>
                                            {viewMode === 'staging' && (
                                                <button
                                                    className="mlab-icon-btn mlab-icon-btn--green"
                                                    onClick={() => setApprovingLearners([learner])}
                                                    title="Approve & Import"
                                                >
                                                    <ClipboardCheck size={14} />
                                                </button>
                                            )}

                                            <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => onEdit(learner)} title="Edit Enrollment Details">
                                                <Edit size={14} />
                                            </button>

                                            {viewMode !== 'staging' && !learner.isArchived && !showArchived && (
                                                <>
                                                    <button className="mlab-icon-btn mlab-icon-btn--emerald" onClick={() => setCertifyingLearner(learner)} title="Issue Certificate">
                                                        <Award size={14} />
                                                    </button>
                                                    <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => navigate(`/sor/${learner.id}`)} title="View Statement of Results">
                                                        <Eye size={14} />
                                                    </button>
                                                    <button className="mlab-icon-btn mlab-icon-btn--blue" style={{ color: copiedId === learner.idNumber ? 'var(--mlab-emerald)' : '' }} onClick={() => handleCopyLink(learner.id, learner.idNumber)} title="Copy Public Verifier Link">
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
                                                <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => setDiscardingLearner(learner)} title="Discard Draft">
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

                {/* ── EMPTY STATE (Reusing wm-empty styling) ── */}
                {filteredLearners.length === 0 && (
                    <div className="wm-empty" style={{ margin: '3rem auto', maxWidth: '600px', border: 'none', background: 'transparent' }}>
                        <div className="wm-empty__icon"><AlertTriangle size={36} color="var(--mlab-amber)" /></div>
                        <p className="wm-empty__title">No Enrollments Found</p>
                        <p className="wm-empty__desc">
                            {viewMode === 'active'
                                ? showArchived ? "No archived records found." : "No active learners found matching your criteria."
                                : viewMode === 'offline'
                                    ? showArchived ? "No archived offline records found." : "No offline learners found. Upload an SoR CSV to import one."
                                    : "Staging area is empty. Import a CSV to get started."}
                        </p>
                    </div>
                )}
            </div>

            {/* MOUNT THE NEW BULK RESULTS REVIEW CENTER */}
            {showBulkResultsImporter && (
                <BulkResultsImportModal
                    existingLearners={learners}
                    cohorts={cohorts || []}
                    programmes={programmes || []}
                    onClose={() => setShowBulkResultsImporter(false)}
                    onSaveAll={handleSaveBulkResults}
                />
            )}

            {/* STATUS MODAL FOR APPROVAL */}
            {approvingLearners && approvingLearners.length > 0 && (
                <StatusModal
                    type="success"
                    title={`Approve ${approvingLearners.length} enrollment${approvingLearners.length > 1 ? 's' : ''}?`}
                    message={`These draft records will be moved from the Staging Area into your live database. The system will automatically create underlying user profiles and map all assigned qualifications. They will become fully Active.`}
                    confirmText={isApproving ? "Approving..." : "Yes, Approve"}
                    onClose={handleConfirmApprove}
                    onCancel={() => setApprovingLearners(null)}
                />
            )}

            {/* STATUS MODAL FOR DISCARD */}
            {discardingLearner && (
                <StatusModal
                    type="error"
                    title="Discard Staged Record"
                    message={`Are you sure you want to discard the draft for ${discardingLearner.fullName}? This action will permanently remove them from the Staging Area.`}
                    confirmText={isDiscarding ? "Discarding..." : "Yes, Discard It"}
                    onClose={handleConfirmDiscard}
                    onCancel={() => setDiscardingLearner(null)}
                />
            )}

            {/* PERMANENT DELETE CONFIRMATION MODAL */}
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

            {/* CERTIFICATE GENERATOR MODAL */}
            {certifyingLearner && (
                <CertificateGenerator
                    learner={certifyingLearner}
                    onClose={() => setCertifyingLearner(null)}
                />
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
//     ShieldCheck, X, AlertCircle, Check,
//     Loader2, MapPin, Award, FileSpreadsheet, FileText, Layers
// } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import { doc, deleteDoc, writeBatch, collection } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import './LearnersView.css';
// import type { DashboardLearner, Cohort } from '../../../types';
// import { useStore } from '../../../store/useStore';
// import { CertificateGenerator } from '../../common/CertificateGenerator/CertificateGenerator';
// import { StatusModal } from '../../common/StatusModal/StatusModal';
// import { BulkResultsImportModal } from '../../admin/BulkResultsImportModal/BulkResultsImportModal';

// // IMPORT THE NEW BULK RESULTS REVIEW CENTER

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

//     const { user: currentUser, settings, programmes, fetchLearners } = useStore();

//     // ─── VIEW STATE ───
//     const [viewMode, setViewMode] = useState<'active' | 'staging' | 'offline'>('active');
//     const [searchTerm, setSearchTerm] = useState('');
//     const [filterStatus, setFilterStatus] = useState('all');
//     const [selectedYear, setSelectedYear] = useState<string>('all');
//     const [selectedQualification, setSelectedQualification] = useState<string>('all');
//     const [selectedCampus, setSelectedCampus] = useState<string>('all');
//     const [showArchived, setShowArchived] = useState(false);
//     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
//     const [web3Status, setWeb3Status] = useState<'all' | 'minted' | 'pending'>('all');
//     const [copiedId, setCopiedId] = useState<string | null>(null);

//     const [hiddenDraftIds, setHiddenDraftIds] = useState<Set<string>>(new Set());

//     const [deletingLearner, setDeletingLearner] = useState<DashboardLearner | null>(null);
//     const [deleteReason, setDeleteReason] = useState('');
//     const [isDeleting, setIsDeleting] = useState(false);

//     const [discardingLearner, setDiscardingLearner] = useState<DashboardLearner | null>(null);
//     const [isDiscarding, setIsDiscarding] = useState(false);

//     const [approvingLearners, setApprovingLearners] = useState<DashboardLearner[] | null>(null);
//     const [isApproving, setIsApproving] = useState(false);

//     const [certifyingLearner, setCertifyingLearner] = useState<DashboardLearner | null>(null);

//     const [showBulkResultsImporter, setShowBulkResultsImporter] = useState(false);

//     useEffect(() => {
//         setSelectedIds(new Set());
//     }, [viewMode, showArchived, selectedYear, selectedQualification, selectedCampus, web3Status]);

//     const learnerCountsById = useMemo(() => {
//         const counts: Record<string, number> = {};
//         [...learners, ...stagingLearners].forEach(l => {
//             if (l.idNumber) {
//                 counts[l.idNumber] = (counts[l.idNumber] || 0) + 1;
//             }
//         });
//         return counts;
//     }, [learners, stagingLearners]);

//     const filteredLearners = useMemo(() => {
//         let sourceData: DashboardLearner[] = [];

//         if (viewMode === 'staging') sourceData = stagingLearners;
//         else if (viewMode === 'offline') sourceData = learners.filter(l => l.isOffline === true);
//         else sourceData = learners.filter(l => !l.isOffline);

//         return sourceData.filter(learner => {
//             if (hiddenDraftIds.has(learner.id)) return false;

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

//             if (selectedCampus !== 'all') {
//                 const learnerCohort = cohorts.find(c => c.id === learner.cohortId);
//                 const activeCampusId = learner.campusId || learnerCohort?.campusId;

//                 if (activeCampusId !== selectedCampus) {
//                     return false;
//                 }
//             }

//             return true;
//         });
//     }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, selectedQualification, selectedCampus, showArchived, web3Status, cohorts, hiddenDraftIds]);

//     const availableYears = useMemo(() => {
//         const years = new Set<string>();
//         learners.forEach(l => {
//             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
//         });
//         return Array.from(years).sort().reverse();
//     }, [learners]);

//     const availableQualifications = useMemo(() => {
//         const quals = new Set<string>();
//         const allLearners = [...learners, ...stagingLearners];
//         allLearners.forEach(l => {
//             if (l.qualification?.name) quals.add(l.qualification.name);
//         });
//         return Array.from(quals).sort();
//     }, [learners, stagingLearners]);

//     const activeCount = learners.filter(l => !l.isArchived && !l.isOffline).length;
//     const offlineCount = learners.filter(l => !l.isArchived && l.isOffline).length;
//     const stagingCount = stagingLearners.filter(l => !hiddenDraftIds.has(l.id)).length;

//     const archivedCount = viewMode === 'offline'
//         ? learners.filter(l => l.isArchived && l.isOffline).length
//         : learners.filter(l => l.isArchived && !l.isOffline).length;

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

//         if (action === 'approve') {
//             setApprovingLearners(selected);
//         } else if (action === 'restore') {
//             onBulkRestore?.(selected);
//         } else if (action === 'archive') {
//             onBulkArchive?.(selected);
//         } else if (action === 'discard') {
//             onBulkDiscard?.(selected);
//         }

//         setSelectedIds(new Set());
//     };

//     const handleCopyLink = (learnerId: string, idNumber: string) => {
//         const link = `${window.location.origin}/sor/${learnerId}`;
//         navigator.clipboard.writeText(link).then(() => {
//             setCopiedId(idNumber);
//             setTimeout(() => setCopiedId(null), 2000);
//         });
//     };

//     // DYNAMIC TEMPLATE DOWNLOADER (Supports both Profiles & Results)
//     const handleDownloadTemplate = (type: 'enrollment' | 'results', format: 'csv' | 'xlsx') => {
//         // const basePath = '/templates/learners';
//         const basePath = '/templates';
//         const filePrefix = type === 'enrollment' ? '/learners/Learner_Enrolment_Template' : '/results/Statement_Of_Results _Template';

//         const fileUrl = `${basePath}/${filePrefix}.${format}`;
//         const fileName = `${filePrefix}.${format}`;

//         const link = document.createElement("a");
//         link.href = fileUrl;
//         link.download = fileName;
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//     };

//     const handleExport = () => {
//         const csvContent = "data:text/csv;charset=utf-8," +
//             ["Full Name,ID Number,Class / Cohort,Campus,Qualification,Status,Start Date,Auth Status,Web3 Verified"].concat(
//                 filteredLearners.map(l => {
//                     const cohortObj = cohorts.find(c => c.id === l.cohortId);
//                     const cohortName = cohortObj?.name || 'Unassigned';

//                     const activeCampusId = l.campusId || cohortObj?.campusId;
//                     const campusName = activeCampusId
//                         ? settings?.campuses?.find(c => c.id === activeCampusId)?.name || 'Unknown'
//                         : 'Unassigned';

//                     return `"${l.fullName}","${l.idNumber}","${cohortName}","${campusName}","${l.qualification?.name || 'N/A'}","${l.status}","${l.trainingStartDate}","${l.authStatus || 'pending'}","${l.isBlockchainVerified ? 'Yes' : 'No'}"`;
//                 })
//             ).join("\n");
//         const link = document.createElement("a");
//         link.setAttribute("href", encodeURI(csvContent));
//         link.setAttribute("download", `learners_enrollments_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
//         document.body.appendChild(link);
//         link.click();
//     };

//     const handleSaveBulkResults = async (parsedLearners: any[]) => {
//         try {
//             const batch = writeBatch(db);

//             parsedLearners.forEach(learner => {
//                 if (learner.isUpdate && learner.existingId) {
//                     const ref = doc(db, "learners", learner.existingId);
//                     batch.set(ref, {
//                         knowledgeModules: learner.knowledgeModules,
//                         practicalModules: learner.practicalModules,
//                         workExperienceModules: learner.workExperienceModules,
//                         qualification: learner.qualification
//                     }, { merge: true });
//                 } else {
//                     const newId = doc(collection(db, "staging_learners")).id;
//                     const ref = doc(db, "staging_learners", newId);
//                     batch.set(ref, {
//                         ...learner,
//                         id: newId,
//                         learnerId: newId,
//                         status: "active",
//                         authStatus: "pending",
//                         isDraft: true,
//                         createdAt: new Date().toISOString(),
//                         createdBy: currentUser?.uid || "admin"
//                     });
//                 }
//             });

//             await batch.commit();
//             if (fetchLearners) await fetchLearners();
//             setShowBulkResultsImporter(false);

//         } catch (error) {
//             console.error("Batch Save Error", error);
//             throw error;
//         }
//     };

//     const handleConfirmApprove = async () => {
//         if (!approvingLearners || approvingLearners.length === 0) return;
//         setIsApproving(true);
//         try {
//             if (onBulkApprove) {
//                 await onBulkApprove(approvingLearners);
//             }
//             setApprovingLearners(null);
//         } catch (err) {
//             console.error("Approval failed", err);
//         } finally {
//             setIsApproving(false);
//         }
//     };

//     const handleConfirmDiscard = async () => {
//         if (!discardingLearner) return;

//         setIsDiscarding(true);
//         try {
//             await deleteDoc(doc(db, "staging_learners", discardingLearner.id));

//             setHiddenDraftIds(prev => {
//                 const next = new Set(prev);
//                 next.add(discardingLearner.id);
//                 return next;
//             });

//             setDiscardingLearner(null);
//         } catch (err) {
//             console.error("Failed to discard draft", err);
//             alert("An error occurred while discarding the draft. Please check your connection.");
//         } finally {
//             setIsDiscarding(false);
//         }
//     };

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
//                     <span className={`mlab-tab__count ${viewMode === 'offline' ? 'mlab-tab__count--alt' : ''}`}>
//                         {offlineCount}
//                     </span>
//                 </button>

//                 <button
//                     className={`mlab-tab ${viewMode === 'staging' ? 'mlab-tab--staging-active' : 'mlab-tab--inactive'}`}
//                     onClick={() => setViewMode('staging')}
//                 >
//                     Staging Area
//                     {stagingCount > 0 && <span className="mlab-tab__badge">{stagingCount}</span>}
//                 </button>
//             </div>

//             {/* ── TOOLBAR ── */}
//             <div className="mlab-toolbar">
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
//                     <select value={selectedQualification} onChange={e => setSelectedQualification(e.target.value)}>
//                         <option value="all">All Qualifications</option>
//                         {availableQualifications.map(qual => (
//                             <option key={qual} value={qual}>{qual}</option>
//                         ))}
//                     </select>
//                 </div>

//                 <div className="mlab-select-wrap">
//                     <MapPin size={16} color="var(--mlab-grey)" />
//                     <select value={selectedCampus} onChange={e => setSelectedCampus(e.target.value)}>
//                         <option value="all">All Locations</option>
//                         {settings?.campuses?.map(campus => (
//                             <option key={campus.id} value={campus.id}>{campus.name}</option>
//                         ))}
//                     </select>
//                 </div>

//                 {(viewMode === 'active' || viewMode === 'offline') && (
//                     <>
//                         <div className="mlab-select-wrap">
//                             <Calendar size={16} color="var(--mlab-grey)" />
//                             <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
//                                 <option value="all">All Years</option>
//                                 {availableYears.map(year => (
//                                     <option key={year} value={year}>{year} Cohort</option>
//                                 ))}
//                             </select>
//                         </div>

//                         <div className="mlab-select-wrap mlab-select-wrap--web3">
//                             <ShieldCheck size={16} className="web3-icon" />
//                             <select value={web3Status} onChange={e => setWeb3Status(e.target.value as any)}>
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
//                 <div className="mlab-standard-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
//                     {viewMode !== 'active' && (
//                         <>
//                             {/* ── PROFILES GROUP ── */}
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
//                                 <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', paddingRight: '4px', borderRight: '1px solid #cbd5e1' }}>
//                                     Profiles
//                                 </span>
//                                 <div style={{ display: 'flex', gap: '2px' }}>
//                                     <button type="button" className="mlab-btn mlab-btn--ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleDownloadTemplate('enrollment', 'xlsx')} title="Download Excel Profile Template">
//                                         <FileSpreadsheet size={14} color="#0ea5e9" /> .XLSX
//                                     </button>
//                                     <button type="button" className="mlab-btn mlab-btn--ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleDownloadTemplate('enrollment', 'csv')} title="Download CSV Profile Template">
//                                         <FileText size={14} color="#0ea5e9" /> .CSV
//                                     </button>
//                                 </div>
//                                 <button className="mlab-btn mlab-btn--primary" onClick={onUpload} style={{ background: '#0ea5e9', borderColor: '#0ea5e9', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} title="Import New Learner Profiles">
//                                     <Upload size={14} /> Import
//                                 </button>
//                                 <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue" onClick={handleExport} style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
//                                     <Download size={14} /> Export
//                                 </button>
//                             </div>

//                             {/* ── RESULTS GROUP ── */}
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
//                                 <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px', paddingRight: '4px', borderRight: '1px solid #86efac' }}>
//                                     Results
//                                 </span>
//                                 <button type="button" className="mlab-btn mlab-btn--ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', color: '#15803d' }} onClick={() => handleDownloadTemplate('results', 'xlsx')} title="Download Results Template">
//                                     <FileSpreadsheet size={14} color="#10b981" /> Template
//                                 </button>
//                                 <button className="mlab-btn mlab-btn--primary" onClick={() => setShowBulkResultsImporter(true)} style={{ background: '#16a34a', borderColor: '#16a34a', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} title="Import Competency Results">
//                                     <Layers size={14} /> Bulk Import Results
//                                 </button>
//                             </div>
//                         </>
//                     )}
//                     <button className="mlab-btn mlab-btn--green" onClick={onAdd} style={{ padding: '0.45rem 1rem' }}>
//                         <Plus size={15} /> Add Single
//                     </button>
//                 </div>
//             )}

//             {/* ── TABLE ── */}
//             <div className="mlab-table-wrap">
//                 <table className="mlab-table">
//                     <thead>
//                         <tr>
//                             <th style={{ width: '40px', textAlign: 'center' }}>
//                                 <input
//                                     type="checkbox"
//                                     onChange={handleSelectAll}
//                                     checked={filteredLearners.length > 0 && selectedIds.size === filteredLearners.length}
//                                 />
//                             </th>
//                             <th>Learner</th>
//                             <th>Location / Cohort</th>
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

//                             const activeCampusId = learner.campusId || cohortObj?.campusId;
//                             const campusName = activeCampusId
//                                 ? settings?.campuses?.find(c => c.id === activeCampusId)?.name || 'Unknown Location'
//                                 : 'Location Pending';

//                             const isReturning = learner.idNumber && (learnerCountsById[learner.idNumber] > 1);

//                             return (
//                                 <tr key={learner.id} className={rowClass}>
//                                     <td style={{ textAlign: 'center' }}>
//                                         <input
//                                             type="checkbox"
//                                             checked={isSelected}
//                                             onChange={() => handleSelectOne(learner.id)}
//                                         />
//                                     </td>

//                                     <td>
//                                         <div className="mlab-cell-content">
//                                             <div className="mlab-cell-header">
//                                                 <span className="mlab-cell-name">{learner.fullName}</span>
//                                                 {learner.isArchived && <span className="mlab-mini-badge mlab-mini-badge--archived">Archived</span>}
//                                                 {isReturning && (
//                                                     <span className="mlab-mini-badge mlab-mini-badge--multi" title="Enrolled in multiple classes">
//                                                         <History size={10} /> Multi-Course
//                                                     </span>
//                                                 )}
//                                             </div>
//                                             <div className="mlab-cell-sub">
//                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(6, 10) || "No Year"}
//                                             </div>
//                                         </div>
//                                     </td>

//                                     <td>
//                                         <div className="mlab-cell-cohort">
//                                             <MapPin size={13} className="cohort-icon" style={{ color: 'var(--mlab-green)' }} />
//                                             <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
//                                                 {campusName}
//                                             </span>
//                                         </div>
//                                         <div className="mlab-cell-cohort" style={{ marginTop: '2px' }}>
//                                             <Users size={12} className="cohort-icon" />
//                                             <span className={`mlab-cell-sub ${cohortName === 'Unassigned' ? 'text-red' : ''}`}>
//                                                 {cohortName}
//                                             </span>
//                                         </div>
//                                     </td>

//                                     <td>
//                                         <div className="mlab-cell-qual" title={learner.qualification?.name}>{learner.qualification?.name || 'No Qualification'}</div>
//                                         <div className="mlab-cell-sub">{learner.qualification?.saqaId}</div>
//                                     </td>

//                                     <td>
//                                         {learner.isArchived ? <span className="mlab-badge mlab-badge--archived">Archived</span>
//                                             : viewMode === 'staging' ? <span className="mlab-badge mlab-badge--draft">Draft</span>
//                                                 : learner.isOffline ? <span className="mlab-badge mlab-badge--offline">Offline / RPL</span>
//                                                     : <span className="mlab-badge mlab-badge--active">Active</span>
//                                         }
//                                     </td>

//                                     <td>
//                                         {viewMode === 'staging' ? (
//                                             <span className="web3-status pending">Awaiting Approval</span>
//                                         ) : learner.isBlockchainVerified ? (
//                                             <div className="web3-status secured">
//                                                 <div className="status-dot green"></div> Secured
//                                             </div>
//                                         ) : (
//                                             <div className="web3-status pending">
//                                                 <div className="status-dot amber"></div> Pending Mint
//                                             </div>
//                                         )}
//                                     </td>

//                                     <td>
//                                         <div className="mlab-icon-btn-group">
//                                             {viewMode === 'staging' && (
//                                                 <button
//                                                     className="mlab-icon-btn mlab-icon-btn--green"
//                                                     onClick={() => setApprovingLearners([learner])}
//                                                     title="Approve & Import"
//                                                 >
//                                                     <ClipboardCheck size={14} />
//                                                 </button>
//                                             )}

//                                             <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => onEdit(learner)} title="Edit Enrollment Details">
//                                                 <Edit size={14} />
//                                             </button>

//                                             {viewMode !== 'staging' && !learner.isArchived && !showArchived && (
//                                                 <>
//                                                     <button className="mlab-icon-btn mlab-icon-btn--emerald" onClick={() => setCertifyingLearner(learner)} title="Issue Certificate">
//                                                         <Award size={14} />
//                                                     </button>
//                                                     <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => navigate(`/sor/${learner.id}`)} title="View Statement of Results">
//                                                         <Eye size={14} />
//                                                     </button>
//                                                     <button className="mlab-icon-btn mlab-icon-btn--blue" style={{ color: copiedId === learner.idNumber ? 'var(--mlab-emerald)' : '' }} onClick={() => handleCopyLink(learner.id, learner.idNumber)} title="Copy Public Verifier Link">
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

//                                             {(viewMode === 'offline' || learner.isArchived) && (
//                                                 <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => setDeletingLearner(learner)} title="Delete Permanently">
//                                                     <Trash2 size={14} />
//                                                 </button>
//                                             )}

//                                             {(viewMode === 'active' || viewMode === 'offline') && learner.isArchived && (
//                                                 <button className="mlab-icon-btn mlab-icon-btn--emerald" onClick={() => onRestore(learner)} title="Restore">
//                                                     <RotateCcw size={14} />
//                                                 </button>
//                                             )}

//                                             {viewMode === 'staging' && (
//                                                 <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => setDiscardingLearner(learner)} title="Discard Draft">
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
//                         <AlertTriangle size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
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

//             {/* MOUNT THE NEW BULK RESULTS REVIEW CENTER */}
//             {showBulkResultsImporter && (
//                 <BulkResultsImportModal
//                     existingLearners={learners}
//                     cohorts={cohorts || []}
//                     programmes={programmes || []}
//                     onClose={() => setShowBulkResultsImporter(false)}
//                     onSaveAll={handleSaveBulkResults}
//                 />
//             )}

//             {/* STATUS MODAL FOR APPROVAL */}
//             {approvingLearners && approvingLearners.length > 0 && (
//                 <StatusModal
//                     type="success"
//                     title={`Approve ${approvingLearners.length} enrollment${approvingLearners.length > 1 ? 's' : ''}?`}
//                     message={`These draft records will be moved from the Staging Area into your live database. The system will automatically create underlying user profiles and map all assigned qualifications. They will become fully Active.`}
//                     confirmText={isApproving ? "Approving..." : "Yes, Approve"}
//                     onClose={handleConfirmApprove}
//                     onCancel={() => setApprovingLearners(null)}
//                 />
//             )}

//             {/* STATUS MODAL FOR DISCARD */}
//             {discardingLearner && (
//                 <StatusModal
//                     type="error"
//                     title="Discard Staged Record"
//                     message={`Are you sure you want to discard the draft for ${discardingLearner.fullName}? This action will permanently remove them from the Staging Area.`}
//                     confirmText={isDiscarding ? "Discarding..." : "Yes, Discard It"}
//                     onClose={handleConfirmDiscard}
//                     onCancel={() => setDiscardingLearner(null)}
//                 />
//             )}

//             {/* PERMANENT DELETE CONFIRMATION MODAL */}
//             {deletingLearner && (
//                 <div className="mlab-modal-overlay">
//                     <div className="mlab-modal mlab-modal--sm">
//                         <div className="mlab-modal__header">
//                             <div className="mlab-modal__title-group">
//                                 <AlertCircle size={20} color="var(--mlab-red)" />
//                                 <h2>Permanent Deletion</h2>
//                             </div>
//                             <button className="mlab-modal__close" onClick={() => setDeletingLearner(null)}><X size={20} /></button>
//                         </div>
//                         <div className="mlab-modal__body">
//                             <p className="mlab-modal__warning">
//                                 You are about to permanently delete <strong>{deletingLearner.fullName}</strong>. This action is recorded in the audit logs and cannot be undone.
//                             </p>

//                             <div className="mlab-form-group">
//                                 <label>Reason for Deletion <span className="text-red">*</span></label>
//                                 <textarea
//                                     className="mlab-input"
//                                     placeholder="e.g., Duplicate entry, incorrect SAQA mapping, learner withdrew..."
//                                     value={deleteReason}
//                                     onChange={e => setDeleteReason(e.target.value)}
//                                     rows={3}
//                                 />
//                             </div>

//                             <div className="mlab-modal__audit-log">
//                                 <strong>Logged Action:</strong> Admin {currentUser?.fullName || 'User'} is performing this delete.
//                             </div>
//                         </div>
//                         <div className="mlab-modal__footer">
//                             <button className="mlab-btn mlab-btn--ghost" onClick={() => setDeletingLearner(null)}>Cancel</button>
//                             <button
//                                 className="mlab-btn mlab-btn--red"
//                                 disabled={!deleteReason.trim() || isDeleting}
//                                 onClick={handleConfirmDelete}
//                             >
//                                 {isDeleting ? <Loader2 className="spin" size={16} /> : "Confirm Delete"}
//                             </button>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {/* CERTIFICATE GENERATOR MODAL */}
//             {certifyingLearner && (
//                 <CertificateGenerator
//                     learner={certifyingLearner}
//                     onClose={() => setCertifyingLearner(null)}
//                 />
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
// //     ShieldCheck, X, AlertCircle, Check,
// //     Loader2, MapPin, Award, FileSpreadsheet, FileText
// // } from 'lucide-react';
// // import { useNavigate } from 'react-router-dom';
// // import { doc, deleteDoc } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import './LearnersView.css';
// // import type { DashboardLearner, Cohort } from '../../../types';
// // import { useStore } from '../../../store/useStore';
// // import { CertificateGenerator } from '../../common/CertificateGenerator/CertificateGenerator';
// // import { StatusModal } from '../../common/StatusModal/StatusModal';

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
// //     const { user: currentUser, settings } = useStore();

// //     // ─── VIEW STATE ───
// //     const [viewMode, setViewMode] = useState<'active' | 'staging' | 'offline'>('active');
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [filterStatus, setFilterStatus] = useState('all');
// //     const [selectedYear, setSelectedYear] = useState<string>('all');
// //     const [selectedQualification, setSelectedQualification] = useState<string>('all');
// //     const [selectedCampus, setSelectedCampus] = useState<string>('all');
// //     const [showArchived, setShowArchived] = useState(false);
// //     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
// //     const [web3Status, setWeb3Status] = useState<'all' | 'minted' | 'pending'>('all');
// //     const [copiedId, setCopiedId] = useState<string | null>(null);

// //     // STATE TO INSTANTLY HIDE DELETED DRAFTS
// //     const [hiddenDraftIds, setHiddenDraftIds] = useState<Set<string>>(new Set());

// //     // DELETION & DISCARD STATES
// //     const [deletingLearner, setDeletingLearner] = useState<DashboardLearner | null>(null);
// //     const [deleteReason, setDeleteReason] = useState('');
// //     const [isDeleting, setIsDeleting] = useState(false);

// //     // DISCARD DRAFT STATE
// //     const [discardingLearner, setDiscardingLearner] = useState<DashboardLearner | null>(null);
// //     const [isDiscarding, setIsDiscarding] = useState(false);

// //     // APPROVE DRAFT STATE
// //     const [approvingLearners, setApprovingLearners] = useState<DashboardLearner[] | null>(null);
// //     const [isApproving, setIsApproving] = useState(false);

// //     // CERTIFICATE GENERATOR STATE
// //     const [certifyingLearner, setCertifyingLearner] = useState<DashboardLearner | null>(null);

// //     useEffect(() => {
// //         setSelectedIds(new Set());
// //     }, [viewMode, showArchived, selectedYear, selectedQualification, selectedCampus, web3Status]);

// //     const learnerCountsById = useMemo(() => {
// //         const counts: Record<string, number> = {};
// //         [...learners, ...stagingLearners].forEach(l => {
// //             if (l.idNumber) {
// //                 counts[l.idNumber] = (counts[l.idNumber] || 0) + 1;
// //             }
// //         });
// //         return counts;
// //     }, [learners, stagingLearners]);

// //     // FILTER LOGIC
// //     const filteredLearners = useMemo(() => {
// //         let sourceData: DashboardLearner[] = [];

// //         if (viewMode === 'staging') sourceData = stagingLearners;
// //         else if (viewMode === 'offline') sourceData = learners.filter(l => l.isOffline === true);
// //         else sourceData = learners.filter(l => !l.isOffline);

// //         return sourceData.filter(learner => {
// //             if (hiddenDraftIds.has(learner.id)) return false;

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

// //             if (selectedCampus !== 'all') {
// //                 const learnerCohort = cohorts.find(c => c.id === learner.cohortId);
// //                 const activeCampusId = learner.campusId || learnerCohort?.campusId;

// //                 if (activeCampusId !== selectedCampus) {
// //                     return false;
// //                 }
// //             }

// //             return true;
// //         });
// //     }, [learners, stagingLearners, viewMode, searchTerm, filterStatus, selectedYear, selectedQualification, selectedCampus, showArchived, web3Status, cohorts, hiddenDraftIds]);

// //     const availableYears = useMemo(() => {
// //         const years = new Set<string>();
// //         learners.forEach(l => {
// //             if (l.trainingStartDate) years.add(l.trainingStartDate.substring(0, 4));
// //         });
// //         return Array.from(years).sort().reverse();
// //     }, [learners]);

// //     const availableQualifications = useMemo(() => {
// //         const quals = new Set<string>();
// //         const allLearners = [...learners, ...stagingLearners];
// //         allLearners.forEach(l => {
// //             if (l.qualification?.name) quals.add(l.qualification.name);
// //         });
// //         return Array.from(quals).sort();
// //     }, [learners, stagingLearners]);

// //     const activeCount = learners.filter(l => !l.isArchived && !l.isOffline).length;
// //     const offlineCount = learners.filter(l => !l.isArchived && l.isOffline).length;
// //     const stagingCount = stagingLearners.filter(l => !hiddenDraftIds.has(l.id)).length;

// //     const archivedCount = viewMode === 'offline'
// //         ? learners.filter(l => l.isArchived && l.isOffline).length
// //         : learners.filter(l => l.isArchived && !l.isOffline).length;

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

// //         if (action === 'approve') {
// //             setApprovingLearners(selected);
// //         } else if (action === 'restore') {
// //             onBulkRestore?.(selected);
// //         } else if (action === 'archive') {
// //             onBulkArchive?.(selected);
// //         } else if (action === 'discard') {
// //             onBulkDiscard?.(selected);
// //         }

// //         setSelectedIds(new Set());
// //     };

// //     const handleCopyLink = (learnerId: string, idNumber: string) => {
// //         const link = `${window.location.origin}/sor/${learnerId}`;
// //         navigator.clipboard.writeText(link).then(() => {
// //             setCopiedId(idNumber);
// //             setTimeout(() => setCopiedId(null), 2000);
// //         });
// //     };

// //     // TRIGGER LOCAL FILE DOWNLOADS
// //     const handleDownloadTemplate = (format: 'csv' | 'xlsx') => {
// //         // Ensure files are placed in the public/templates/ directory
// //         const fileUrl = format === 'csv'
// //             ? '/templates/learners/Learner_Enrolment_Template.csv'
// //             : '/templates/learners/Learner_Enrolment_Template.xlsx';

// //         const link = document.createElement("a");
// //         link.href = fileUrl;
// //         link.download = `Learner_Enrolment_Template.${format}`;
// //         document.body.appendChild(link);
// //         link.click();
// //         document.body.removeChild(link);
// //     };

// //     const handleExport = () => {
// //         const csvContent = "data:text/csv;charset=utf-8," +
// //             ["Full Name,ID Number,Class / Cohort,Campus,Qualification,Status,Start Date,Auth Status,Web3 Verified"].concat(
// //                 filteredLearners.map(l => {
// //                     const cohortObj = cohorts.find(c => c.id === l.cohortId);
// //                     const cohortName = cohortObj?.name || 'Unassigned';

// //                     const activeCampusId = l.campusId || cohortObj?.campusId;
// //                     const campusName = activeCampusId
// //                         ? settings?.campuses?.find(c => c.id === activeCampusId)?.name || 'Unknown'
// //                         : 'Unassigned';

// //                     return `"${l.fullName}","${l.idNumber}","${cohortName}","${campusName}","${l.qualification?.name || 'N/A'}","${l.status}","${l.trainingStartDate}","${l.authStatus || 'pending'}","${l.isBlockchainVerified ? 'Yes' : 'No'}"`;
// //                 })
// //             ).join("\n");
// //         const link = document.createElement("a");
// //         link.setAttribute("href", encodeURI(csvContent));
// //         link.setAttribute("download", `learners_enrollments_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
// //         document.body.appendChild(link);
// //         link.click();
// //     };

// //     const handleConfirmApprove = async () => {
// //         if (!approvingLearners || approvingLearners.length === 0) return;
// //         setIsApproving(true);
// //         try {
// //             if (onBulkApprove) {
// //                 await onBulkApprove(approvingLearners);
// //             }
// //             setApprovingLearners(null);
// //         } catch (err) {
// //             console.error("Approval failed", err);
// //         } finally {
// //             setIsApproving(false);
// //         }
// //     };

// //     const handleConfirmDiscard = async () => {
// //         if (!discardingLearner) return;

// //         setIsDiscarding(true);
// //         try {
// //             await deleteDoc(doc(db, "staging_learners", discardingLearner.id));

// //             setHiddenDraftIds(prev => {
// //                 const next = new Set(prev);
// //                 next.add(discardingLearner.id);
// //                 return next;
// //             });

// //             setDiscardingLearner(null);
// //         } catch (err) {
// //             console.error("Failed to discard draft", err);
// //             alert("An error occurred while discarding the draft. Please check your connection.");
// //         } finally {
// //             setIsDiscarding(false);
// //         }
// //     };

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
// //                     <span className={`mlab-tab__count ${viewMode === 'offline' ? 'mlab-tab__count--alt' : ''}`}>
// //                         {offlineCount}
// //                     </span>
// //                 </button>

// //                 <button
// //                     className={`mlab-tab ${viewMode === 'staging' ? 'mlab-tab--staging-active' : 'mlab-tab--inactive'}`}
// //                     onClick={() => setViewMode('staging')}
// //                 >
// //                     Staging Area
// //                     {stagingCount > 0 && <span className="mlab-tab__badge">{stagingCount}</span>}
// //                 </button>
// //             </div>

// //             {/* ── TOOLBAR ── */}
// //             <div className="mlab-toolbar">
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
// //                     <select value={selectedQualification} onChange={e => setSelectedQualification(e.target.value)}>
// //                         <option value="all">All Qualifications</option>
// //                         {availableQualifications.map(qual => (
// //                             <option key={qual} value={qual}>{qual}</option>
// //                         ))}
// //                     </select>
// //                 </div>

// //                 {/* CAMPUS DROPDOWN FILTER */}
// //                 <div className="mlab-select-wrap">
// //                     <MapPin size={16} color="var(--mlab-grey)" />
// //                     <select value={selectedCampus} onChange={e => setSelectedCampus(e.target.value)}>
// //                         <option value="all">All Locations</option>
// //                         {settings?.campuses?.map(campus => (
// //                             <option key={campus.id} value={campus.id}>{campus.name}</option>
// //                         ))}
// //                     </select>
// //                 </div>

// //                 {(viewMode === 'active' || viewMode === 'offline') && (
// //                     <>
// //                         <div className="mlab-select-wrap">
// //                             <Calendar size={16} color="var(--mlab-grey)" />
// //                             <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
// //                                 <option value="all">All Years</option>
// //                                 {availableYears.map(year => (
// //                                     <option key={year} value={year}>{year} Cohort</option>
// //                                 ))}
// //                             </select>
// //                         </div>

// //                         <div className="mlab-select-wrap mlab-select-wrap--web3">
// //                             <ShieldCheck size={16} className="web3-icon" />
// //                             <select value={web3Status} onChange={e => setWeb3Status(e.target.value as any)}>
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
// //                     {/* HIDE EXPORT AND IMPORT IF VIEW MODE IS ACTIVE */}
// //                     {viewMode !== 'active' && (
// //                         <>
// //                             {/* TWO TEMPLATE DOWNLOAD OPTIONS (Static Files) */}
// //                             <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--mlab-border)', paddingRight: '8px', marginRight: '4px' }}>
// //                                 <button type="button" className="mlab-btn mlab-btn--ghost" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleDownloadTemplate('xlsx')}>
// //                                     <FileSpreadsheet size={14} color="#10b981" /> .XLSX Template
// //                                 </button>
// //                                 <button type="button" className="mlab-btn mlab-btn--ghost" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleDownloadTemplate('csv')}>
// //                                     <FileText size={14} color="#0ea5e9" /> .CSV
// //                                 </button>
// //                             </div>
// //                             <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue" onClick={handleExport}>
// //                                 <Download size={15} /> Export
// //                             </button>
// //                             <button className="mlab-btn mlab-btn--primary" onClick={onUpload}>
// //                                 <Upload size={15} /> Import File
// //                             </button>
// //                         </>
// //                     )}
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
// //                             <th style={{ width: '40px', textAlign: 'center' }}>
// //                                 <input
// //                                     type="checkbox"
// //                                     onChange={handleSelectAll}
// //                                     checked={filteredLearners.length > 0 && selectedIds.size === filteredLearners.length}
// //                                 />
// //                             </th>
// //                             <th>Learner</th>
// //                             <th>Location / Cohort</th>
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

// //                             const activeCampusId = learner.campusId || cohortObj?.campusId;
// //                             const campusName = activeCampusId
// //                                 ? settings?.campuses?.find(c => c.id === activeCampusId)?.name || 'Unknown Location'
// //                                 : 'Location Pending';

// //                             const isReturning = learner.idNumber && (learnerCountsById[learner.idNumber] > 1);

// //                             return (
// //                                 <tr key={learner.id} className={rowClass}>
// //                                     <td style={{ textAlign: 'center' }}>
// //                                         <input
// //                                             type="checkbox"
// //                                             checked={isSelected}
// //                                             onChange={() => handleSelectOne(learner.id)}
// //                                         />
// //                                     </td>

// //                                     <td>
// //                                         <div className="mlab-cell-content">
// //                                             <div className="mlab-cell-header">
// //                                                 <span className="mlab-cell-name">{learner.fullName}</span>
// //                                                 {learner.isArchived && <span className="mlab-mini-badge mlab-mini-badge--archived">Archived</span>}
// //                                                 {isReturning && (
// //                                                     <span className="mlab-mini-badge mlab-mini-badge--multi" title="Enrolled in multiple classes">
// //                                                         <History size={10} /> Multi-Course
// //                                                     </span>
// //                                                 )}
// //                                             </div>
// //                                             <div className="mlab-cell-sub">
// //                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
// //                                             </div>
// //                                         </div>
// //                                     </td>

// //                                     <td>
// //                                         <div className="mlab-cell-cohort">
// //                                             <MapPin size={13} className="cohort-icon" style={{ color: 'var(--mlab-green)' }} />
// //                                             <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
// //                                                 {campusName}
// //                                             </span>
// //                                         </div>
// //                                         <div className="mlab-cell-cohort" style={{ marginTop: '2px' }}>
// //                                             <Users size={12} className="cohort-icon" />
// //                                             <span className={`mlab-cell-sub ${cohortName === 'Unassigned' ? 'text-red' : ''}`}>
// //                                                 {cohortName}
// //                                             </span>
// //                                         </div>
// //                                     </td>

// //                                     <td>
// //                                         <div className="mlab-cell-qual" title={learner.qualification?.name}>{learner.qualification?.name || 'No Qualification'}</div>
// //                                         <div className="mlab-cell-sub">{learner.qualification?.saqaId}</div>
// //                                     </td>

// //                                     <td>
// //                                         {learner.isArchived ? <span className="mlab-badge mlab-badge--archived">Archived</span>
// //                                             : viewMode === 'staging' ? <span className="mlab-badge mlab-badge--draft">Draft</span>
// //                                                 : learner.isOffline ? <span className="mlab-badge mlab-badge--offline">Offline / RPL</span>
// //                                                     : <span className="mlab-badge mlab-badge--active">Active</span>
// //                                         }
// //                                     </td>

// //                                     <td>
// //                                         {viewMode === 'staging' ? (
// //                                             <span className="web3-status pending">Awaiting Approval</span>
// //                                         ) : learner.isBlockchainVerified ? (
// //                                             <div className="web3-status secured">
// //                                                 <div className="status-dot green"></div> Secured
// //                                             </div>
// //                                         ) : (
// //                                             <div className="web3-status pending">
// //                                                 <div className="status-dot amber"></div> Pending Mint
// //                                             </div>
// //                                         )}
// //                                     </td>

// //                                     <td>
// //                                         <div className="mlab-icon-btn-group">
// //                                             {viewMode === 'staging' && (
// //                                                 <button
// //                                                     className="mlab-icon-btn mlab-icon-btn--green"
// //                                                     onClick={() => setApprovingLearners([learner])}
// //                                                     title="Approve & Import"
// //                                                 >
// //                                                     <Check size={14} />
// //                                                 </button>
// //                                             )}

// //                                             <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => onEdit(learner)} title="Edit Enrollment Details">
// //                                                 <Edit size={14} />
// //                                             </button>

// //                                             {viewMode !== 'staging' && !learner.isArchived && !showArchived && (
// //                                                 <>
// //                                                     <button className="mlab-icon-btn mlab-icon-btn--emerald" onClick={() => setCertifyingLearner(learner)} title="Issue Certificate">
// //                                                         <Award size={14} />
// //                                                     </button>
// //                                                     <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => navigate(`/sor/${learner.id}`)} title="View Statement of Results">
// //                                                         <Eye size={14} />
// //                                                     </button>
// //                                                     <button className="mlab-icon-btn mlab-icon-btn--blue" style={{ color: copiedId === learner.idNumber ? 'var(--mlab-emerald)' : '' }} onClick={() => handleCopyLink(learner.id, learner.idNumber)} title="Copy Public Verifier Link">
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

// //                                             {(viewMode === 'offline' || learner.isArchived) && (
// //                                                 <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => setDeletingLearner(learner)} title="Delete Permanently">
// //                                                     <Trash2 size={14} />
// //                                                 </button>
// //                                             )}

// //                                             {(viewMode === 'active' || viewMode === 'offline') && learner.isArchived && (
// //                                                 <button className="mlab-icon-btn mlab-icon-btn--emerald" onClick={() => onRestore(learner)} title="Restore">
// //                                                     <RotateCcw size={14} />
// //                                                 </button>
// //                                             )}

// //                                             {viewMode === 'staging' && (
// //                                                 <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => setDiscardingLearner(learner)} title="Discard Draft">
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
// //                         <AlertTriangle size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
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

// //             {/* STATUS MODAL FOR APPROVAL */}
// //             {approvingLearners && approvingLearners.length > 0 && (
// //                 <StatusModal
// //                     type="success"
// //                     title={`Approve ${approvingLearners.length} enrollment${approvingLearners.length > 1 ? 's' : ''}?`}
// //                     message={`These draft records will be moved from the Staging Area into your live database. The system will automatically create underlying user profiles and map all assigned qualifications. They will become fully Active.`}
// //                     confirmText={isApproving ? "Approving..." : "Yes, Approve"}
// //                     onClose={handleConfirmApprove}
// //                     onCancel={() => setApprovingLearners(null)}
// //                 />
// //             )}

// //             {/* STATUS MODAL FOR DISCARD */}
// //             {discardingLearner && (
// //                 <StatusModal
// //                     type="error"
// //                     title="Discard Staged Record"
// //                     message={`Are you sure you want to discard the draft for ${discardingLearner.fullName}? This action will permanently remove them from the Staging Area.`}
// //                     confirmText={isDiscarding ? "Discarding..." : "Yes, Discard It"}
// //                     onClose={handleConfirmDiscard}
// //                     onCancel={() => setDiscardingLearner(null)}
// //                 />
// //             )}

// //             {/* PERMANENT DELETE CONFIRMATION MODAL */}
// //             {deletingLearner && (
// //                 <div className="mlab-modal-overlay">
// //                     <div className="mlab-modal mlab-modal--sm">
// //                         <div className="mlab-modal__header">
// //                             <div className="mlab-modal__title-group">
// //                                 <AlertCircle size={20} color="var(--mlab-red)" />
// //                                 <h2>Permanent Deletion</h2>
// //                             </div>
// //                             <button className="mlab-modal__close" onClick={() => setDeletingLearner(null)}><X size={20} /></button>
// //                         </div>
// //                         <div className="mlab-modal__body">
// //                             <p className="mlab-modal__warning">
// //                                 You are about to permanently delete <strong>{deletingLearner.fullName}</strong>. This action is recorded in the audit logs and cannot be undone.
// //                             </p>

// //                             <div className="mlab-form-group">
// //                                 <label>Reason for Deletion <span className="text-red">*</span></label>
// //                                 <textarea
// //                                     className="mlab-input"
// //                                     placeholder="e.g., Duplicate entry, incorrect SAQA mapping, learner withdrew..."
// //                                     value={deleteReason}
// //                                     onChange={e => setDeleteReason(e.target.value)}
// //                                     rows={3}
// //                                 />
// //                             </div>

// //                             <div className="mlab-modal__audit-log">
// //                                 <strong>Logged Action:</strong> Admin {currentUser?.fullName || 'User'} is performing this delete.
// //                             </div>
// //                         </div>
// //                         <div className="mlab-modal__footer">
// //                             <button className="mlab-btn mlab-btn--ghost" onClick={() => setDeletingLearner(null)}>Cancel</button>
// //                             <button
// //                                 className="mlab-btn mlab-btn--red"
// //                                 disabled={!deleteReason.trim() || isDeleting}
// //                                 onClick={handleConfirmDelete}
// //                             >
// //                                 {isDeleting ? <Loader2 className="spin" size={16} /> : "Confirm Delete"}
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* CERTIFICATE GENERATOR MODAL */}
// //             {certifyingLearner && (
// //                 <CertificateGenerator
// //                     learner={certifyingLearner}
// //                     onClose={() => setCertifyingLearner(null)}
// //                 />
// //             )}
// //         </div>
// //     );
// // };