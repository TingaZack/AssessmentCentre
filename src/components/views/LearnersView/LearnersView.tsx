import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Plus, Upload, Download, Search, Edit, Trash2,
    Calendar, RotateCcw, ClipboardCheck, AlertTriangle,
    Eye, Archive as ArchiveIcon, Mail,
    Share2, GraduationCap, Users, History,
    ShieldCheck, X, AlertCircle, Check, CheckCircle,
    Loader2, MapPin, Award, FileSpreadsheet, FileText, Layers, Filter, CheckSquare, Square,
    UserCheck, MonitorOff, UserMinus, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
    onBulkApprove?: (learners: DashboardLearner[], mode: 'standard' | 'shadow' | 'offline') => void;
    onBulkDiscard?: (learners: DashboardLearner[]) => void;
}

const ITEMS_PER_PAGE = 15;

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
    const [searchParams, setSearchParams] = useSearchParams();

    const {
        user: currentUser, settings, programmes,
        fetchLearners, fetchProgrammes, fetchCohorts,
        cohorts: storeCohorts
    } = useStore();

    const activeCohorts = (cohorts && cohorts.length > 0) ? cohorts : (storeCohorts || []);

    const hasFetchedRef = useRef(false);

    useEffect(() => {
        if (hasFetchedRef.current) return;
        hasFetchedRef.current = true;

        if (!programmes?.length && fetchProgrammes) {
            fetchProgrammes();
        }
        if (!activeCohorts?.length && fetchCohorts) {
            fetchCohorts();
        }
    }, []);

    // ─── URL-BOUND VIEW & FILTER PARAMETERS ───
    const viewMode = (searchParams.get('view') as 'active' | 'bootcamp' | 'offline' | 'staging') || 'active';
    const urlSearchTerm = searchParams.get('q') || '';
    const filterStatus = searchParams.get('status') || 'all';
    const selectedYear = searchParams.get('year') || 'all';
    const selectedQualification = searchParams.get('qual') || 'all';
    const selectedCampus = searchParams.get('campus') || 'all';
    const showArchived = searchParams.get('archived') === 'true';
    const web3Status = (searchParams.get('web3') as 'all' | 'minted' | 'pending') || 'all';
    const currentPage = parseInt(searchParams.get('page') || '1', 10);

    const [localSearch, setLocalSearch] = useState(urlSearchTerm);

    useEffect(() => {
        if (localSearch !== urlSearchTerm) {
            setLocalSearch(urlSearchTerm);
        }
    }, [urlSearchTerm]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localSearch !== searchParams.get('q') && !(localSearch === '' && !searchParams.get('q'))) {
                updateUrlParam('q', localSearch);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [localSearch]);

    const hasActiveFilters = urlSearchTerm !== '' || filterStatus !== 'all' || selectedYear !== 'all' || selectedQualification !== 'all' || selectedCampus !== 'all' || showArchived !== false || web3Status !== 'all';

    const updateUrlParam = (key: string, value: string | boolean | number) => {
        const nextParams = new URLSearchParams(searchParams);

        const currentVal = nextParams.get(key);
        const newVal = (!value || value === 'all' || value === 'false') ? null : String(value);
        if (currentVal === newVal || (!currentVal && !newVal)) return;

        if (!newVal) {
            nextParams.delete(key);
        } else {
            nextParams.set(key, String(value));
        }
        if (key !== 'page') {
            nextParams.delete('page');
        }
        setSearchParams(nextParams, { replace: true });
    };

    const handleClearFilters = () => {
        const nextParams = new URLSearchParams(searchParams);
        ['q', 'status', 'year', 'qual', 'campus', 'archived', 'web3', 'page'].forEach(k => nextParams.delete(k));
        setLocalSearch('');
        setSearchParams(nextParams, { replace: true });
    };

    const handleViewModeChange = (newView: string) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('view', newView);
        nextParams.delete('archived');
        nextParams.delete('page');

        if (newView === 'bootcamp' || newView === 'staging') {
            nextParams.delete('web3');
            nextParams.delete('status');
        }
        if (newView === 'offline') {
            nextParams.delete('status');
        }

        setSelectedIds(new Set());
        setSearchParams(nextParams, { replace: true });
    };

    // ─── LOCAL STATE STORAGE ───
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [hiddenDraftIds, setHiddenDraftIds] = useState<Set<string>>(new Set());

    const [deletingLearner, setDeletingLearner] = useState<DashboardLearner | null>(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const [discardingLearner, setDiscardingLearner] = useState<DashboardLearner | null>(null);
    const [isDiscarding, setIsDiscarding] = useState(false);

    const [approvingLearners, setApprovingLearners] = useState<DashboardLearner[] | null>(null);
    const [isApproving, setIsApproving] = useState(false);

    const [approvalMode, setApprovalMode] = useState<'standard' | 'shadow' | 'offline'>('standard');
    const [certifyingLearner, setCertifyingLearner] = useState<DashboardLearner | null>(null);
    const [showBulkResultsImporter, setShowBulkResultsImporter] = useState(false);

    const cohortDict = useMemo(() => {
        const dict: Record<string, Cohort> = {};
        activeCohorts.forEach(c => { if (c.id) dict[c.id] = c; });
        return dict;
    }, [activeCohorts]);

    const progDict = useMemo(() => {
        const dict: Record<string, any> = {};
        programmes?.forEach(p => { if (p.id) dict[p.id] = p; });
        return dict;
    }, [programmes]);

    const campusDict = useMemo(() => {
        const dict: Record<string, any> = {};
        settings?.campuses?.forEach(c => { if (c.id) dict[c.id] = c; });
        return dict;
    }, [settings?.campuses]);

    const filteredLearners = useMemo(() => {
        let sourceData: DashboardLearner[] = [];

        if (viewMode === 'staging') sourceData = stagingLearners;
        else if (viewMode === 'bootcamp') sourceData = learners.filter(l => l.isBootcamp === true);
        else if (viewMode === 'offline') sourceData = learners.filter(l => l.isOffline === true && !l.isBootcamp);
        else sourceData = learners.filter(l => !l.isOffline && !l.isBootcamp);

        const s = urlSearchTerm.toLowerCase();

        return sourceData.filter(learner => {
            if (hiddenDraftIds.has(learner.id)) return false;

            const isArchived = learner.isArchived === true;
            const isDormant = !learner.enrollmentId;

            if (viewMode !== 'staging') {
                if (showArchived && !isArchived) return false;
                if (!showArchived && isArchived) return false;
            }

            if (s && !(
                learner.fullName?.toLowerCase().includes(s) ||
                learner.idNumber?.includes(s) ||
                learner.email?.toLowerCase().includes(s)
            )) return false;

            if (viewMode !== 'staging' && selectedYear !== 'all') {
                if (isDormant) return false;
                const y = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
                if (y !== selectedYear) return false;
            }

            if (selectedQualification !== 'all') {
                const activeProgId = isDormant ? null : ((learner as any).programmeId || (learner as any).qualificationId || cohortDict[learner.cohortId || '']?.programmeId || cohortDict[learner.cohortId || '']?.qualificationId);
                const progObj = activeProgId ? progDict[activeProgId] : null;
                const qualName = progObj ? progObj.name : learner.qualification?.name;
                if (qualName !== selectedQualification) return false;
            }

            if (viewMode === 'active' && filterStatus !== 'all') {
                if (filterStatus === 'pending_setup') {
                    if (learner.profileCompleted) return false;
                } else if (filterStatus === 'active') {
                    if (learner.status !== 'active' || !learner.profileCompleted) return false;
                } else {
                    if (learner.status !== filterStatus) return false;
                }
            }

            if ((viewMode === 'active' || viewMode === 'offline') && web3Status !== 'all') {
                if (web3Status === 'minted' && !learner.isBlockchainVerified) return false;
                if (web3Status === 'pending' && learner.isBlockchainVerified) return false;
            }

            if (selectedCampus !== 'all') {
                if (isDormant) return false;
                const learnerCohort = cohortDict[learner.cohortId || ''];
                const activeCampusId = learner.campusId || learnerCohort?.campusId;
                if (activeCampusId !== selectedCampus) return false;
            }

            return true;
        });
    }, [learners, stagingLearners, viewMode, urlSearchTerm, filterStatus, selectedYear, selectedQualification, selectedCampus, showArchived, web3Status, hiddenDraftIds, cohortDict, progDict]);

    const totalPages = Math.ceil(filteredLearners.length / ITEMS_PER_PAGE);
    const paginatedLearners = useMemo(() => {
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredLearners.slice(startIdx, startIdx + ITEMS_PER_PAGE);
    }, [filteredLearners, currentPage]);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        for (let i = 0; i < learners.length; i++) {
            const l = learners[i];
            if (l.trainingStartDate && l.enrollmentId) years.add(l.trainingStartDate.substring(0, 4));
        }
        return Array.from(years).sort().reverse();
    }, [learners]);

    const availableQualifications = useMemo(() => {
        const quals = new Set<string>();
        programmes?.forEach(p => { if (p.name) quals.add(p.name); });
        for (let i = 0; i < learners.length; i++) {
            if (learners[i].qualification?.name) quals.add(learners[i].qualification.name);
        }
        for (let i = 0; i < stagingLearners.length; i++) {
            if (stagingLearners[i].qualification?.name) quals.add(stagingLearners[i].qualification.name);
        }
        return Array.from(quals).sort();
    }, [learners, stagingLearners, programmes]);

    const activeCount = learners.filter(l => !l.isArchived && !l.isOffline && !l.isBootcamp).length;
    const bootcampCount = learners.filter(l => !l.isArchived && l.isBootcamp).length;
    const offlineCount = learners.filter(l => !l.isArchived && l.isOffline && !l.isBootcamp).length;
    const stagingCount = stagingLearners.filter(l => !hiddenDraftIds.has(l.id)).length;

    const archivedCount = viewMode === 'offline'
        ? learners.filter(l => l.isArchived && l.isOffline && !l.isBootcamp).length
        : viewMode === 'bootcamp'
            ? learners.filter(l => l.isArchived && l.isBootcamp).length
            : learners.filter(l => l.isArchived && !l.isOffline && !l.isBootcamp).length;

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            // 🚀 Safety Filter: Omit truncated/malformed scientific notation rows from global check actions
            const validIds = paginatedLearners
                .filter(l => viewMode !== 'staging' || (l.idNumber && l.idNumber.trim() !== "" && !/E\+/i.test(l.idNumber)))
                .map(l => l.id);
            setSelectedIds(new Set(validIds));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectOne = (learner: DashboardLearner) => {
        // Intercept action and prevent checkbox activation on corrupted layout shapes
        const isScientificNotation = /E\+/i.test(learner.idNumber || "");
        if (viewMode === 'staging' && (!learner.idNumber || learner.idNumber.trim() === "" || isScientificNotation)) {
            alert(`Action Blocked: This profile data is corrupt due to a missing ID or Excel float serialization (${learner.idNumber}). You must edit the field layout before approving.`);
            return;
        }
        const next = new Set(selectedIds);
        next.has(learner.id) ? next.delete(learner.id) : next.add(learner.id);
        setSelectedIds(next);
    };

    const executeBulkAction = (action: 'approve' | 'restore' | 'archive' | 'discard') => {
        const sourceList = viewMode === 'staging' ? stagingLearners : learners;
        const selected = sourceList.filter(l => selectedIds.has(l.id));

        if (action === 'approve') {
            setApprovalMode('standard');
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

    const handleForceActive = async (learner: DashboardLearner) => {
        if (!window.confirm(`Force ${learner.fullName} to Active status? This overrides the email invite requirement.`)) return;

        try {
            const batch = writeBatch(db);
            const timestamp = new Date().toISOString();

            const learnerRef = doc(db, "learners", learner.learnerId || learner.id);
            batch.set(learnerRef, {
                authStatus: "active",
                profileCompleted: true,
                status: "active",
                updatedAt: timestamp
            }, { merge: true });

            if (learner.enrollmentId) {
                const enrollmentRef = doc(db, "enrollments", learner.enrollmentId);
                batch.set(enrollmentRef, {
                    status: "active",
                    updatedAt: timestamp
                }, { merge: true });
            }

            await batch.commit();
            if (fetchLearners) await fetchLearners(true);
            alert(`${learner.fullName} has been forced Active.`);
        } catch (error) {
            console.error("Failed to force active:", error);
            alert("Failed to force active status.");
        }
    };

    const handleDownloadTemplate = (type: 'enrollment' | 'results', format: 'csv' | 'xlsx') => {
        const basePath = '/templates';
        const filePrefix = type === 'enrollment' ? '/learners/Learner_Enrolment_Template' : '/results/Statement_Of_Results _Template';
        const link = document.createElement("a");
        link.href = `${basePath}/${filePrefix}.${format}`;
        link.download = `${filePrefix}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExport = () => {
        const csvContent = "data:text/csv;charset=utf-8," +
            ["Full Name,ID Number,Class / Cohort,Campus,Qualification,Enrollment Status,Account Setup,Start Date,Auth Status,Web3 Verified"].concat(
                filteredLearners.map(l => {
                    const isDormant = !l.enrollmentId;
                    const cohortObj = isDormant ? null : cohortDict[l.cohortId || ''];
                    const cohortName = cohortObj?.name || 'Unassigned';

                    const activeCampusId = isDormant ? null : (l.campusId || cohortObj?.campusId);
                    const campusName = activeCampusId && campusDict[activeCampusId] ? campusDict[activeCampusId].name : 'Unassigned';

                    const activeProgId = isDormant ? null : ((l as any).programmeId || (l as any).qualificationId || cohortObj?.programmeId || cohortObj?.qualificationId);
                    const progObj = activeProgId ? progDict[activeProgId] : null;
                    const qualName = progObj ? progObj.name : (l.qualification?.name || 'N/A');

                    const accountStatus = (l.profileCompleted || l.isOffline || l.isBootcamp) ? 'Active' : 'Pending Setup';

                    return `"${l.fullName}","${l.idNumber}","${cohortName}","${campusName}","${qualName}","${l.status}","${accountStatus}","${l.trainingStartDate}","${l.profileCompleted ? 'Registered' : 'Pending'}","${l.isBlockchainVerified ? 'Yes' : 'No'}"`;
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
            const timestamp = new Date().toISOString();

            parsedLearners.forEach(learner => {
                if (learner.isUpdate && learner.existingId) {
                    const targetEnrollmentId = learner.enrollmentId || learner.existingId;
                    const ref = doc(db, "enrollments", targetEnrollmentId);

                    batch.set(ref, {
                        knowledgeModules: learner.knowledgeModules,
                        practicalModules: learner.practicalModules,
                        workExperienceModules: learner.workExperienceModules,
                        qualification: learner.qualification,
                        updatedAt: timestamp
                    }, { merge: true });
                } else {
                    const profileId = learner.idNumber || doc(collection(db, "learners")).id;
                    const targetCohortId = learner.cohortId || "Unassigned";

                    const learnerRef = doc(db, "learners", profileId);
                    batch.set(learnerRef, {
                        ...learner,
                        id: profileId,
                        learnerId: profileId,
                        authUid: profileId,
                        status: "active",
                        authStatus: "pending",
                        isDraft: false,
                        isOffline: true,
                        isBootcamp: false,
                        createdAt: timestamp,
                        createdBy: currentUser?.uid || "admin"
                    }, { merge: true });

                    const enrollmentId = targetCohortId !== "Unassigned" ? `${targetCohortId}_${profileId}` : `RPL_${profileId}`;
                    const enrollmentRef = doc(db, "enrollments", enrollmentId);

                    batch.set(enrollmentRef, {
                        id: enrollmentId,
                        learnerId: profileId,
                        cohortId: targetCohortId,
                        status: "active",
                        isOffline: true,
                        qualification: learner.qualification || {},
                        knowledgeModules: learner.knowledgeModules || [],
                        practicalModules: learner.practicalModules || [],
                        workExperienceModules: learner.workExperienceModules || [],
                        enrolledAt: timestamp,
                        updatedAt: timestamp,
                        assignedBy: currentUser?.uid || "admin"
                    }, { merge: true });
                }
            });

            await batch.commit();
            if (fetchLearners) await fetchLearners(true);
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
            if (onBulkApprove) await onBulkApprove(approvingLearners, approvalMode);
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
            setHiddenDraftIds(prev => { const next = new Set(prev); next.add(discardingLearner.id); return next; });
            setDiscardingLearner(null);
        } catch (err) {
            console.error("Failed to discard draft", err);
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

            {/* ── PAGE HEADER ── */}
            <div className="wm-page-header" style={{ marginBottom: 0 }}>
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><GraduationCap size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Learner Enrollments</h1>
                        <p className="wm-page-header__desc">Manage active students, staging drafts, and offline RPL records.</p>
                    </div>
                </div>
            </div>

            {/* ── TABS ── */}
            <div className="mlab-tab-bar" style={{ borderTop: 'none', background: 'white', marginTop: 16 }}>
                <button className={`mlab-tab ${viewMode === 'active' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`} onClick={() => handleViewModeChange('active')}>
                    Enrollments (Active) <span className="mlab-tab__count">{activeCount}</span>
                </button>
                <button className={`mlab-tab ${viewMode === 'bootcamp' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`} onClick={() => handleViewModeChange('bootcamp')}>
                    Bootcamp / Pre-selection <span className={`mlab-tab__count ${viewMode === 'bootcamp' ? 'mlab-tab__count--alt' : ''}`}>{bootcampCount}</span>
                </button>
                <button className={`mlab-tab ${viewMode === 'offline' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`} onClick={() => handleViewModeChange('offline')}>
                    Offline / RPL <span className={`mlab-tab__count ${viewMode === 'offline' ? 'mlab-tab__count--alt' : ''}`}>{offlineCount}</span>
                </button>
                <button className={`mlab-tab ${viewMode === 'staging' ? 'mlab-tab--staging-active' : 'mlab-tab--inactive'}`} onClick={() => handleViewModeChange('staging')}>
                    Staging Area {stagingCount > 0 && <span className="mlab-tab__badge">{stagingCount}</span>}
                </button>
            </div>

            {/* ── TOOLBAR ── */}
            <div className="wm-toolbar" style={{ flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
                <div className="wm-search" style={{ flex: '1 1 200px' }}>
                    <Search size={15} className="wm-search__icon" />
                    <input
                        type="text"
                        className="wm-search__input"
                        placeholder="Search by name, ID or email…"
                        value={localSearch}
                        onChange={e => setLocalSearch(e.target.value)}
                    />
                    {localSearch && (
                        <button className="wm-search__clear" onClick={() => updateUrlParam('q', '')}><X size={13} /></button>
                    )}
                </div>

                <div className="wm-search" style={{ flex: 'none' }}>
                    <GraduationCap size={15} className="wm-search__icon" />
                    <select className="wm-search__input" value={selectedQualification} onChange={e => updateUrlParam('qual', e.target.value)} style={{ cursor: 'pointer' }}>
                        <option value="all">All Qualifications</option>
                        {availableQualifications.map(qual => <option key={qual} value={qual}>{qual}</option>)}
                    </select>
                </div>

                <div className="wm-search" style={{ flex: 'none' }}>
                    <MapPin size={15} className="wm-search__icon" />
                    <select className="wm-search__input" value={selectedCampus} onChange={e => updateUrlParam('campus', e.target.value)} style={{ cursor: 'pointer' }}>
                        <option value="all">All Locations</option>
                        {settings?.campuses?.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                    </select>
                </div>

                {(viewMode === 'active' || viewMode === 'offline') && (
                    <>
                        <div className="wm-search" style={{ flex: 'none' }}>
                            <Calendar size={15} className="wm-search__icon" />
                            <select className="wm-search__input" value={selectedYear} onChange={e => updateUrlParam('year', e.target.value)} style={{ cursor: 'pointer' }}>
                                <option value="all">All Years</option>
                                {availableYears.map(year => <option key={year} value={year}>{year} Cohort</option>)}
                            </select>
                        </div>

                        <div className="wm-search" style={{ flex: 'none' }}>
                            <ShieldCheck size={15} className="wm-search__icon" />
                            <select className="wm-search__input" value={web3Status} onChange={e => updateUrlParam('web3', e.target.value)} style={{ cursor: 'pointer' }}>
                                <option value="all">All Web3 Status</option>
                                <option value="minted">✅ Minted (Secured)</option>
                                <option value="pending">⏳ Pending Issuance</option>
                            </select>
                        </div>

                        <div className="wm-search" style={{ flex: 'none' }}>
                            <Filter size={15} className="wm-search__icon" />
                            <select className="wm-search__input" value={filterStatus} onChange={e => updateUrlParam('status', e.target.value)} style={{ cursor: 'pointer' }}>
                                <option value="all">All Account Statuses</option>
                                <option value="active">Active (Fully Registered)</option>
                                <option value="pending_setup">Pending Setup (Needs to Register)</option>
                                <option value="dropped">Dropped / Withdrawn</option>
                            </select>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: showArchived ? 'var(--mlab-amber)' : 'var(--mlab-grey)', cursor: 'pointer', padding: '0.55rem 0.9rem', background: showArchived ? '#fffbeb' : 'white', border: `1px solid ${showArchived ? '#fcd34d' : 'var(--mlab-border)'}`, borderRadius: '4px' }}>
                            <input type="checkbox" checked={showArchived} onChange={e => updateUrlParam('archived', e.target.checked)} style={{ margin: 0 }} />
                            Show Archived ({archivedCount})
                        </label>
                    </>
                )}

                {hasActiveFilters && (
                    <button
                        className="mlab-btn mlab-btn--ghost"
                        onClick={handleClearFilters}
                        title="Clear all filters"
                        style={{ padding: '0.4rem 0.75rem', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}
                    >
                        <X size={14} /> Clear
                    </button>
                )}
            </div>

            {/* ── ACTION BAR ── */}
            {selectedIds.size > 0 ? (
                <div className="mlab-action-bar">
                    <span className="mlab-action-bar__label">{selectedIds.size} Enrollments Selected</span>
                    <div className="mlab-bulk-actions">
                        {viewMode === 'staging' && (
                            <>
                                <button className="wm-btn wm-btn--primary" style={{ background: 'var(--mlab-green)', borderColor: 'var(--mlab-green-dark)' }} onClick={() => executeBulkAction('approve')}><ClipboardCheck size={14} /> Approve</button>
                                <button className="wm-btn wm-btn--ghost" style={{ color: 'var(--mlab-red)', borderColor: 'var(--mlab-red)' }} onClick={() => executeBulkAction('discard')}><Trash2 size={14} /> Discard Drafts</button>
                            </>
                        )}
                        {viewMode !== 'staging' && (
                            showArchived ? (
                                <button className="wm-btn wm-btn--ghost" style={{ color: 'var(--mlab-green)', borderColor: 'var(--mlab-green)' }} onClick={() => executeBulkAction('restore')}><RotateCcw size={14} /> Restore</button>
                            ) : (
                                <button className="wm-btn wm-btn--ghost" style={{ color: 'var(--mlab-amber)', borderColor: 'var(--mlab-amber)' }} onClick={() => executeBulkAction('archive')}><ArchiveIcon size={14} /> Archive</button>
                            )
                        )}
                    </div>
                </div>
            ) : (
                <div className="mlab-standard-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.5rem' }}>
                    {viewMode !== 'active' && viewMode !== 'bootcamp' && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', paddingRight: '4px', borderRight: '1px solid #cbd5e1' }}>Profiles</span>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    <button type="button" className="wm-btn wm-btn--ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', border: 'none', background: 'transparent' }} onClick={() => handleDownloadTemplate('enrollment', 'xlsx')} title="Download Excel Profile Template"><FileSpreadsheet size={13} color="#0ea5e9" /> .XLSX</button>
                                    <button type="button" className="wm-btn wm-btn--ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', border: 'none', background: 'transparent' }} onClick={() => handleDownloadTemplate('enrollment', 'csv')} title="Download CSV Profile Template"><FileText size={13} color="#0ea5e9" /> .CSV</button>
                                </div>
                                <button className="wm-btn wm-btn--primary" onClick={onUpload} style={{ background: '#0ea5e9', borderColor: '#0ea5e9', padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} title="Import New Learner Profiles"><Upload size={13} /> Import</button>
                                <button className="wm-btn wm-btn--ghost" onClick={handleExport} style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'white' }}><Download size={13} /> Export</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px', paddingRight: '4px', borderRight: '1px solid #86efac' }}>Results</span>
                                <button type="button" className="wm-btn wm-btn--ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', color: '#15803d', border: 'none', background: 'transparent' }} onClick={() => handleDownloadTemplate('results', 'xlsx')} title="Download Results Template"><FileSpreadsheet size={13} color="#10b981" /> Template</button>
                                <button className="wm-btn wm-btn--primary" onClick={() => setShowBulkResultsImporter(true)} style={{ background: '#16a34a', borderColor: '#16a34a', padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} title="Import Competency Results"><Layers size={13} /> Bulk Import Results</button>
                            </div>
                        </>
                    )}
                    {viewMode === 'bootcamp' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                            <button className="wm-btn wm-btn--primary" onClick={onUpload} style={{ background: '#0ea5e9', borderColor: '#0ea5e9', padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} title="Import Bootcamp Applicants"><Upload size={13} /> Import Applicants</button>
                            <button className="wm-btn wm-btn--ghost" onClick={handleExport} style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'white' }}><Download size={13} /> Export List</button>
                        </div>
                    )}
                    <button className="wm-btn wm-btn--primary" onClick={onAdd} style={{ padding: '0.45rem 1rem', marginLeft: 'auto' }}><Plus size={14} /> Add Single</button>
                </div>
            )}

            {/* ── TABLE ── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                                <input type="checkbox" onChange={handleSelectAll} checked={paginatedLearners.length > 0 && selectedIds.size === paginatedLearners.filter(l => viewMode !== 'staging' || (l.idNumber && l.idNumber.trim() !== "" && !/E\+/i.test(l.idNumber))).length} />
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
                        {paginatedLearners.map(learner => {
                            const isSelected = selectedIds.has(learner.id);

                            // 🚀 PRE-CHECK SHIELD: Intercept floating point exponential string notations inside staging layers
                            const isStagingBroken = viewMode === 'staging' && (!learner.idNumber || learner.idNumber.trim() === "" || /E\+/i.test(learner.idNumber));
                            const rowClass = [
                                learner.isArchived ? 'mlab-tr--archived' : '',
                                isSelected ? 'mlab-tr--selected' : '',
                                isStagingBroken ? 'mlab-tr--broken-staging' : ''
                            ].filter(Boolean).join(' ');

                            const isDormant = !learner.enrollmentId;

                            const cohortObj = isDormant ? null : cohortDict[learner.cohortId || ''];
                            const cohortName = cohortObj ? cohortObj.name : 'Unassigned';

                            const activeCampusId = isDormant ? null : (learner.campusId || cohortObj?.campusId);
                            const campusName = activeCampusId && campusDict[activeCampusId] ? campusDict[activeCampusId].name : 'Location Pending';

                            const activeProgId = isDormant ? null : ((learner as any).programmeId || (learner as any).qualificationId || cohortObj?.programmeId || cohortObj?.qualificationId);
                            const progObj = activeProgId ? progDict[activeProgId] : null;

                            const qualName = progObj ? progObj.name : (learner.qualification?.name || 'No Qualification');
                            const saqaId = progObj ? progObj.saqaId : (learner.qualification?.saqaId || '');

                            const isPendingSetup = !learner.profileCompleted && !learner.isOffline && !learner.isBootcamp && viewMode !== 'staging';

                            const otherEnrollments = learner.idNumber ? learners.filter(l => l.idNumber === learner.idNumber && l.id !== learner.id) : [];
                            const isReturning = otherEnrollments.length > 0;
                            const multiCohortNames = otherEnrollments.map(l => {
                                const c = cohortDict[l.cohortId || ''];
                                return c ? c.name : (l.isBootcamp ? 'Bootcamp' : 'Unassigned Record');
                            }).filter(Boolean).join(' | ');

                            return (
                                <tr key={learner.id} className={rowClass} style={isStagingBroken ? { background: '#fff1f2', borderLeft: '4px solid var(--mlab-red)' } : {}}>
                                    <td style={{ textAlign: 'center' }}>
                                        <input type="checkbox" checked={isSelected} onChange={() => handleSelectOne(learner)} disabled={isStagingBroken} />
                                    </td>
                                    <td>
                                        <div className="mlab-cell-content">
                                            <div className="mlab-cell-header">
                                                <span className="mlab-cell-name">{learner.fullName}</span>
                                                {learner.isArchived && <span className="mlab-mini-badge mlab-mini-badge--archived">Archived</span>}

                                                {isReturning && (
                                                    <span className="mlab-mini-badge mlab-mini-badge--multi" title={`Also enrolled in: ${multiCohortNames}`}>
                                                        <History size={10} /> Multi-Course ({otherEnrollments.length + 1})
                                                    </span>
                                                )}
                                            </div>

                                            {/* Contextual warning badges notify the admin if data is corrupt */}
                                            <div className="mlab-cell-sub">
                                                {isStagingBroken ? (
                                                    /E\+/i.test(learner.idNumber || "") ? (
                                                        <span style={{ color: 'var(--mlab-red)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Excel stripped the trailing digits of this profile upon export. Wont pass DB security checks.">
                                                            <AlertTriangle size={12} /> Corrupted Key: Scientific Notation Truncation Error
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--mlab-red)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <AlertTriangle size={12} /> Missing ID Anchor — Cannot Import
                                                        </span>
                                                    )
                                                ) : (
                                                    `${learner.idNumber} • ${learner.trainingStartDate?.substring(0, 4) || "No Year"}`
                                                )}
                                            </div>

                                            {viewMode === 'staging' && (learner as any).isExistingUser && (
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px', padding: '2px 6px', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                                    <UserCheck size={10} /> Existing Profile
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="mlab-cell-cohort">
                                            <MapPin size={13} className="cohort-icon" style={{ color: isDormant ? 'var(--mlab-grey)' : 'var(--mlab-green)' }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isDormant ? 'var(--mlab-grey)' : 'var(--mlab-blue)' }}>{campusName}</span>
                                        </div>
                                        <div className="mlab-cell-cohort" style={{ marginTop: '2px' }}>
                                            <Users size={12} className="cohort-icon" style={{ color: isDormant ? 'var(--mlab-grey)' : '' }} />
                                            <span className={`mlab-cell-sub ${isDormant ? 'text-red' : ''}`}>{cohortName}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="mlab-cell-qual" title={qualName}>{qualName}</div>
                                        <div className="mlab-cell-sub">{saqaId}</div>
                                    </td>
                                    <td>
                                        {learner.isArchived ? <span className="mlab-badge mlab-badge--archived">Archived</span>
                                            : viewMode === 'staging' ? (
                                                isStagingBroken ? <span className="mlab-badge" style={{ background: '#fecdd3', color: '#9f1239', border: '1px solid #fda4af' }}>Corrupted</span>
                                                    : <span className="mlab-badge mlab-badge--draft">Draft</span>
                                            )
                                                : learner.isBootcamp ? <span className="mlab-badge" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>Applicant</span>
                                                    : learner.isOffline ? <span className="mlab-badge mlab-badge--offline">Offline / RPL</span>
                                                        : isPendingSetup ? <span className="mlab-badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>Pending Setup</span>
                                                            : learner.status === 'dropped' ? <span className="mlab-badge mlab-badge--archived">Dropped</span>
                                                                : isDormant ? <span className="mlab-badge" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>Unassigned</span>
                                                                    : <span className="mlab-badge mlab-badge--active">Active</span>
                                        }
                                    </td>
                                    <td>
                                        {viewMode === 'staging' ? <span className="web3-status pending">Awaiting Approval</span>
                                            : learner.isBlockchainVerified ? <div className="web3-status secured"><div className="status-dot green"></div> Secured</div>
                                                : <div className="web3-status pending"><div className="status-dot amber"></div> Pending Mint</div>
                                        }
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="mlab-icon-btn-group" style={{ justifyContent: 'flex-end' }}>
                                            {viewMode === 'staging' && (
                                                <button
                                                    className="mlab-icon-btn mlab-icon-btn--green"
                                                    style={isStagingBroken ? { opacity: 0.4, cursor: 'not-allowed', background: '#cbd5e1', color: '#94a3b8', border: 'none' } : {}}
                                                    onClick={() => { if (!isStagingBroken) { setApprovalMode('standard'); setApprovingLearners([learner]); } }}
                                                    disabled={isStagingBroken}
                                                    title={isStagingBroken ? "Approval Blocked: Structural validation failed" : "Approve & Import"}
                                                >
                                                    <ClipboardCheck size={14} />
                                                </button>
                                            )}
                                            <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => onEdit(learner)} title="Edit Details"><Edit size={14} /></button>
                                            {viewMode !== 'staging' && !learner.isArchived && !showArchived && (
                                                <>
                                                    <button className="mlab-icon-btn mlab-icon-btn--emerald" onClick={() => setCertifyingLearner(learner)} title="Issue Certificate"><Award size={14} /></button>
                                                    <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => navigate(`/sor/${learner.id}`)} title="View Results"><Eye size={14} /></button>
                                                    <button className="mlab-icon-btn mlab-icon-btn--blue" style={{ color: copiedId === learner.idNumber ? 'var(--mlab-emerald)' : '' }} onClick={() => handleCopyLink(learner.id, learner.idNumber)} title="Copy Public Verifier Link">{copiedId === learner.idNumber ? <ClipboardCheck size={14} /> : <Share2 size={14} />}</button>
                                                    {viewMode === 'active' && isPendingSetup && <button className="mlab-icon-btn" style={{ color: '#d97706', background: '#fef3c7', border: '1px solid #fde68a' }} onClick={() => handleForceActive(learner)} title="Force Active Status"><CheckSquare size={14} /></button>}
                                                    {viewMode === 'active' && <button className={`mlab-icon-btn ${learner.profileCompleted ? '' : 'mlab-icon-btn--green'}`} style={learner.profileCompleted ? { background: '#f8fafc', color: '#cbd5e1', cursor: 'not-allowed', border: '1px solid #e2e8f0' } : {}} onClick={() => !learner.profileCompleted && onInvite(learner)} disabled={learner.profileCompleted} title={learner.profileCompleted ? 'Learner registered' : 'Send Invite'}>{learner.profileCompleted ? <UserCheck size={14} /> : <Mail size={14} />}</button>}
                                                    <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => onArchive(learner)} title="Archive Record"><ArchiveIcon size={14} /></button>
                                                </>
                                            )}
                                            {(viewMode === 'offline' || viewMode === 'bootcamp' || learner.isArchived) && <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => setDeletingLearner(learner)} title="Delete Permanently"><Trash2 size={14} /></button>}
                                            {viewMode !== 'staging' && learner.isArchived && <button className="mlab-icon-btn mlab-icon-btn--emerald" onClick={() => onRestore(learner)} title="Restore"><RotateCcw size={14} /></button>}
                                            {viewMode === 'staging' && <button className="mlab-icon-btn mlab-icon-btn--red" onClick={() => setDiscardingLearner(learner)} title="Discard Draft"><X size={14} /></button>}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* ── EMPTY STATE ── */}
                {filteredLearners.length === 0 && (
                    <div className="wm-empty" style={{ margin: '3rem auto', maxWidth: '600px', border: 'none', background: 'transparent' }}>
                        <div className="wm-empty__icon"><AlertTriangle size={36} color="var(--mlab-amber)" /></div>
                        <p className="wm-empty__title">No Enrollments Found</p>
                        <p className="wm-empty__desc">
                            {viewMode === 'active' ? (showArchived ? "No archived records found." : "No active learners found matching your criteria.") : viewMode === 'bootcamp' ? (showArchived ? "No archived bootcamp records found." : "No bootcamp applicants found.") : viewMode === 'offline' ? (showArchived ? "No archived offline records found." : "No offline learners found. Upload an SoR CSV to import one.") : "Staging area is empty. Import a CSV to get started."}
                        </p>
                    </div>
                )}
            </div>

            {/* ── PAGINATION PANEL CONTROLS ── */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '1.5rem', borderTop: '1px solid var(--mlab-border)', background: 'white' }}>
                    <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => updateUrlParam('page', currentPage - 1)} disabled={currentPage === 1}>
                        <ChevronLeft size={16} /> Prev
                    </button>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>
                        Page {currentPage} of {totalPages} (Total: {filteredLearners.length})
                    </span>
                    <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => updateUrlParam('page', currentPage + 1)} disabled={currentPage === totalPages}>
                        Next <ChevronRight size={16} />
                    </button>
                </div>
            )}

            {showBulkResultsImporter && createPortal(<BulkResultsImportModal existingLearners={learners} cohorts={activeCohorts || []} programmes={programmes || []} onClose={() => setShowBulkResultsImporter(false)} onSaveAll={handleSaveBulkResults} />, document.body)}
            {approvingLearners && approvingLearners.length > 0 && createPortal(
                <div className="wm-overlay animate-fade-in" onClick={() => setApprovingLearners(null)} style={{ zIndex: 99999 }}>
                    <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                            <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><CheckSquare size={20} /></div>
                            <div>
                                <h2 className="wm-modal__title">Approve {approvingLearners.length} Enrollment{approvingLearners.length > 1 ? 's' : ''}</h2>
                                <p className="wm-modal__subtitle">Select how these profiles should be activated in the system.</p>
                            </div>
                            <button className="wm-modal__close" onClick={() => setApprovingLearners(null)} disabled={isApproving}><X size={18} /></button>
                        </div>
                        <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', background: approvalMode === 'standard' ? '#f0fdf4' : '#f8fafc', border: `2px solid ${approvalMode === 'standard' ? '#22c55e' : '#cbd5e1'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}>
                                <input type="radio" name="approval_mode" value="standard" checked={approvalMode === 'standard'} onChange={() => setApprovalMode('standard')} style={{ marginTop: '4px', width: '18px', height: '18px', accentColor: '#22c55e' }} />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-midnight)', fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}><Mail size={16} color={approvalMode === 'standard' ? '#16a34a' : 'var(--mlab-grey)'} /> Standard Activation</div>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>Creates live Firebase Auth accounts. Learners will receive an email invitation to set up their password and access the platform.</p>
                                </div>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', background: approvalMode === 'shadow' ? '#eff6ff' : '#f8fafc', border: `2px solid ${approvalMode === 'shadow' ? '#3b82f6' : '#cbd5e1'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}>
                                <input type="radio" name="approval_mode" value="shadow" checked={approvalMode === 'shadow'} onChange={() => setApprovalMode('shadow')} style={{ marginTop: '4px', width: '18px', height: '18px', accentColor: '#3b82f6' }} />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-midnight)', fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}><MonitorOff size={16} color={approvalMode === 'shadow' ? '#2563eb' : 'var(--mlab-grey)'} /> Shadow Profiles (Bootcamp)</div>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>Enrolls them in the active cohort for attendance tracking <strong>without</strong> creating a login account or sending emails.</p>
                                </div>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', background: approvalMode === 'offline' ? '#fdf4ff' : '#f8fafc', border: `2px solid ${approvalMode === 'offline' ? '#d946ef' : '#cbd5e1'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}>
                                <input type="radio" name="approval_mode" value="offline" checked={approvalMode === 'offline'} onChange={() => setApprovalMode('offline')} style={{ marginTop: '4px', width: '18px', height: '18px', accentColor: '#d946ef' }} />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-midnight)', fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}><UserMinus size={16} color={approvalMode === 'offline' ? '#c026d3' : 'var(--mlab-grey)'} /> Offline / RPL</div>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>Flags records as purely offline. Skips authentication completely and maps them to the legacy Offline/RPL ledger view.</p>
                                </div>
                            </label>
                        </div>
                        <div className="wm-modal__footer">
                            <button className="wm-btn wm-btn--ghost" onClick={() => setApprovingLearners(null)} disabled={isApproving}>Cancel</button>
                            <button className="wm-btn wm-btn--primary" onClick={handleConfirmApprove} disabled={isApproving}>
                                {isApproving ? <><Loader2 className="spin" size={16} /> Processing...</> : <><CheckCircle size={16} /> Confirm Import</>}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {discardingLearner && createPortal(<StatusModal type="error" title="Discard Staged Record" message={`Are you sure you want to discard the draft for ${discardingLearner.fullName}? This action will permanently remove them from the Staging Area.`} confirmText={isDiscarding ? "Discarding..." : "Yes, Discard It"} onClose={handleConfirmDiscard} onCancel={() => setDiscardingLearner(null)} />, document.body)}
            {deletingLearner && createPortal(
                <div className="mlab-modal-overlay">
                    <div className="mlab-modal mlab-modal--sm">
                        <div className="mlab-modal__header">
                            <div className="mlab-modal__title-group"><AlertCircle size={20} color="var(--mlab-red)" /><h2>Permanent Deletion</h2></div>
                            <button className="mlab-modal__close" onClick={() => setDeletingLearner(null)}><X size={20} /></button>
                        </div>
                        <div className="mlab-modal__body">
                            <p className="mlab-modal__warning">You are about to permanently delete <strong>{deletingLearner.fullName}</strong>. This action is recorded in the audit logs and cannot be undone.</p>
                            <div className="mlab-form-group">
                                <label>Reason for Deletion <span className="text-red">*</span></label>
                                <textarea className="mlab-input" placeholder="e.g., Duplicate entry, incorrect SAQA mapping, learner withdrew..." value={deleteReason} onChange={e => setDeleteReason(e.target.value)} rows={3} />
                            </div>
                            <div className="mlab-modal__audit-log"><strong>Logged Action:</strong> Admin {currentUser?.fullName || 'User'} is performing this delete.</div>
                        </div>
                        <div className="mlab-modal__footer">
                            <button className="wm-btn wm-btn--ghost" onClick={() => setDeletingLearner(null)}>Cancel</button>
                            <button className="mlab-btn mlab-btn--red" disabled={!deleteReason.trim() || isDeleting} onClick={handleConfirmDelete}>{isDeleting ? <Loader2 className="spin" size={16} /> : "Confirm Delete"}</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {certifyingLearner && createPortal(<CertificateGenerator learner={certifyingLearner} onClose={() => setCertifyingLearner(null)} />, document.body)}
        </div>
    );
};