// src/pages/AdminDashboard/ContentAuthoring/CohortRunsDrawer.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { createPortal } from 'react-dom';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
import {
    createDraftCohortRun,
    updateCohortRunStatus,
    deleteCohortRun
} from '../../../services/contentService';
import {
    X, Calendar, PlayCircle, Ban, Clock, Users, ArrowRight, Settings2,
    Trash2, Rocket, Plus, AlertTriangle, BarChart3, Infinity, Search, ChevronDown
} from 'lucide-react';
import type { CohortRun } from '../../../types/content.types';
import { CohortRunSettingsForm, type CohortRunSettingsData } from './LaunchCohortModal';

interface CohortRunsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    containerId: string;
    containerName: string;
    containerData?: any; // Optional parent container metadata
    cohorts: { id: string; name: string }[];
    onLaunchNew?: (run: CohortRun, containerData?: any) => void;
    onAnalyticsClick?: (runId: string) => void;
}

export const CohortRunsDrawer: React.FC<CohortRunsDrawerProps> = ({
    isOpen,
    onClose,
    containerId,
    containerName,
    containerData: propContainerData,
    cohorts = [],
    onLaunchNew,
    onAnalyticsClick
}) => {
    const toast = useToast();
    const [runs, setRuns] = useState<CohortRun[]>([]);
    const [fetchedContainerData, setFetchedContainerData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [editingRunId, setEditingRunId] = useState<string | null>(null);

    // Active master container blueprint data (prioritizes props, falls back to live Firestore snapshot)
    const masterContainer = propContainerData || fetchedContainerData || {};

    // Full Cohort Run Configuration State for Drawer Editing (Includes materialIncludes)
    const [editConfig, setEditConfig] = useState<CohortRunSettingsData & {
        start: string;
        end: string;
        isTimeBound: boolean;
        cohortIds: string[];
    }>({
        runName: '',
        description: '',
        themeColor: '#0284c7',
        illustrationType: 'code',
        applicationStartDate: '',
        applicationEndDate: '',
        level: 'beginner',
        isCertificateAwarded: true,
        learningOutcomes: [],
        prerequisites: [],
        targetAudience: [],
        materialIncludes: [
            'Hands-on Video Tutorials & Source Code',
            'Downloadable Lab Guides & Asset Packs',
            'Interactive AI Peer Reviews & Quizzes',
            'Industry Certificate of Completion'
        ],
        tags: [],
        isAccredited: true,
        accreditationBody: 'qcto',
        customAccreditationText: '',
        saqaId: '',
        nqfLevel: 5,
        credits: 120,
        start: '',
        end: '',
        isTimeBound: true,
        cohortIds: []
    });

    const [newTimelineName, setNewTimelineName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Target Cohorts Multi-Select Dropdown State
    const [isCohortDropdownOpen, setIsCohortDropdownOpen] = useState(false);
    const [cohortSearchQuery, setCohortSearchQuery] = useState('');
    const cohortDropdownRef = useRef<HTMLDivElement>(null);

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
    }>({ isOpen: false, type: 'warning', title: '', message: '' });

    // 1. Click outside listener to auto-close the custom cohort dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (cohortDropdownRef.current && !cohortDropdownRef.current.contains(event.target as Node)) {
                setIsCohortDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 2. Live Firestore Listener for Parent Content Container (Master Blueprint Defaults)
    useEffect(() => {
        if (!isOpen || !containerId || propContainerData) return;

        const containerRef = doc(db, 'content_containers', containerId);
        const unsubContainer = onSnapshot(containerRef, (docSnap) => {
            if (docSnap.exists()) {
                setFetchedContainerData({ id: docSnap.id, ...docSnap.data() });
            }
        }, (err) => {
            console.warn("Error fetching parent content container defaults:", err);
        });

        return () => unsubContainer();
    }, [isOpen, containerId, propContainerData]);

    // 3. Live Firestore Listener for Cohort Timeline Runs
    useEffect(() => {
        if (!isOpen || !containerId) return;

        setLoading(true);
        const q = query(collection(db, 'cohort_runs'), where('containerId', '==', containerId));

        const unsub = onSnapshot(q, (snap) => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as CohortRun));
            fetched.sort((a, b) => {
                const dateA = a.timeBoundConfig?.startDate ? new Date(a.timeBoundConfig.startDate).getTime() : 0;
                const dateB = b.timeBoundConfig?.startDate ? new Date(b.timeBoundConfig.startDate).getTime() : 0;
                return dateB - dateA;
            });
            setRuns(fetched);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching cohort runs:", err);
            toast.error("Failed to load timeline runs.");
            setLoading(false);
        });

        return () => unsub();
    }, [isOpen, containerId]);

    const filteredCohortsForDrawer = useMemo(() => {
        if (!cohortSearchQuery.trim()) return cohorts;
        const lower = cohortSearchQuery.toLowerCase().trim();
        return cohorts.filter(c => c.name.toLowerCase().includes(lower));
    }, [cohorts, cohortSearchQuery]);

    const toggleTargetCohort = (cohortId: string) => {
        if (cohortId === 'ALL') {
            setEditConfig(prev => ({
                ...prev,
                cohortIds: prev.cohortIds.includes('ALL') ? [] : ['ALL']
            }));
            return;
        }

        let next = editConfig.cohortIds.filter(id => id !== 'ALL');
        if (next.includes(cohortId)) {
            next = next.filter(id => id !== cohortId);
        } else {
            next.push(cohortId);
        }

        setEditConfig(prev => ({ ...prev, cohortIds: next }));
    };

    const handleCreateTimeline = async () => {
        if (!newTimelineName.trim()) return;
        setIsCreating(true);

        try {
            await createDraftCohortRun(containerId, newTimelineName.trim());
            toast.success("Timeline drafted successfully!");
            setNewTimelineName('');
        } catch (error) {
            console.error("Error creating timeline:", error);
            toast.error("Failed to create timeline.");
        } finally {
            setIsCreating(false);
        }
    };

    const handleUpdateStatus = async (runId: string, newStatus: CohortRun['status']) => {
        try {
            await updateCohortRunStatus(runId, newStatus);
            toast.success(`Run status updated to ${newStatus.toUpperCase()}`);
        } catch (error) {
            toast.error("Failed to update status.");
        }
    };

    const requestDeleteRun = (run: CohortRun) => {
        setConfirmModal({
            isOpen: true,
            type: 'warning',
            title: 'Delete Timeline',
            message: `Are you sure you want to permanently delete "${run.cohortName}"? This cannot be undone.`,
            confirmText: 'Delete Timeline',
            cancelText: 'Cancel',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await deleteCohortRun(run.id);
                    toast.success("Timeline deleted.");
                } catch (error) {
                    toast.error("Failed to delete timeline.");
                }
            }
        });
    };

    const handleStartEditing = (run: CohortRun) => {
        const linkedCohortIds: string[] = (run as any).cohortIds || (run.cohortId ? [run.cohortId] : []);

        setEditConfig({
            runName: run.name || run.cohortName || masterContainer.title || '',
            description: (run as any).description || masterContainer.description || masterContainer.checkpointMetadata?.courseDescription || '',
            themeColor: (run as any).themeColor || masterContainer.themeColor || masterContainer.checkpointMetadata?.themeColor || '#0284c7',
            illustrationType: (run as any).illustrationType || masterContainer.illustrationType || masterContainer.checkpointMetadata?.illustrationType || 'code',
            applicationStartDate: (run as any).applicationStartDate || '',
            applicationEndDate: (run as any).applicationEndDate || '',
            level: (run as any).level || masterContainer.level || masterContainer.checkpointMetadata?.courseLevel || 'beginner',
            isCertificateAwarded: (run as any).isCertificateAwarded ?? masterContainer.isCertificateAwarded ?? masterContainer.checkpointMetadata?.isCertificateAwarded ?? true,
            learningOutcomes: (run as any).learningOutcomes || masterContainer.learningOutcomes || masterContainer.checkpointMetadata?.learningOutcomes || [],
            prerequisites: (run as any).prerequisites || masterContainer.prerequisites || masterContainer.checkpointMetadata?.prerequisites || [],
            targetAudience: (run as any).targetAudience || masterContainer.targetAudience || masterContainer.checkpointMetadata?.targetAudience || [],
            materialIncludes: (run as any).materialIncludes || masterContainer.materialIncludes || masterContainer.checkpointMetadata?.materialIncludes || [
                'Hands-on Video Tutorials & Source Code',
                'Downloadable Lab Guides & Asset Packs',
                'Interactive AI Peer Reviews & Quizzes',
                'Industry Certificate of Completion'
            ],
            tags: (run as any).tags || masterContainer.tags || masterContainer.checkpointMetadata?.courseTags || [],
            isAccredited: (run as any).isAccredited ?? masterContainer.defaultAccreditation?.isAccredited ?? true,
            accreditationBody: run.accreditation?.body || masterContainer.defaultAccreditation?.body || 'qcto',
            customAccreditationText: run.accreditation?.customText || masterContainer.defaultAccreditation?.customText || '',
            saqaId: (run as any).saqaId || masterContainer.defaultAccreditation?.saqaId || '',
            nqfLevel: (run as any).nqfLevel || masterContainer.defaultAccreditation?.nqfLevel || 5,
            credits: (run as any).credits || masterContainer.defaultAccreditation?.credits || 120,
            start: run.timeBoundConfig?.startDate || '',
            end: run.timeBoundConfig?.endDate || '',
            isTimeBound: run.timeBoundConfig?.isTimeBound ?? true,
            cohortIds: linkedCohortIds
        });
        setEditingRunId(run.id);
    };

    const handleSettingChange = (field: keyof CohortRunSettingsData, value: any) => {
        setEditConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleResetDefaults = (run: CohortRun) => {
        setEditConfig(prev => ({
            ...prev,
            runName: masterContainer.title || run.cohortName || '',
            description: masterContainer.description || masterContainer.checkpointMetadata?.courseDescription || '',
            themeColor: masterContainer.themeColor || masterContainer.checkpointMetadata?.themeColor || '#0284c7',
            illustrationType: masterContainer.illustrationType || masterContainer.checkpointMetadata?.illustrationType || 'code',
            applicationStartDate: '',
            applicationEndDate: '',
            level: masterContainer.level || masterContainer.checkpointMetadata?.courseLevel || 'beginner',
            isCertificateAwarded: masterContainer.isCertificateAwarded ?? masterContainer.checkpointMetadata?.isCertificateAwarded ?? true,
            learningOutcomes: masterContainer.learningOutcomes || masterContainer.checkpointMetadata?.learningOutcomes || [],
            prerequisites: masterContainer.prerequisites || masterContainer.checkpointMetadata?.prerequisites || [],
            targetAudience: masterContainer.targetAudience || masterContainer.checkpointMetadata?.targetAudience || [],
            materialIncludes: masterContainer.materialIncludes || masterContainer.checkpointMetadata?.materialIncludes || [
                'Hands-on Video Tutorials & Source Code',
                'Downloadable Lab Guides & Asset Packs',
                'Interactive AI Peer Reviews & Quizzes',
                'Industry Certificate of Completion'
            ],
            tags: masterContainer.tags || masterContainer.checkpointMetadata?.courseTags || [],
            isAccredited: masterContainer.defaultAccreditation?.isAccredited ?? true,
            accreditationBody: masterContainer.defaultAccreditation?.body || 'qcto',
            customAccreditationText: masterContainer.defaultAccreditation?.customText || '',
            saqaId: masterContainer.defaultAccreditation?.saqaId || '',
            nqfLevel: masterContainer.defaultAccreditation?.nqfLevel || 5,
            credits: masterContainer.defaultAccreditation?.credits || 120
        }));
        toast.info("Inline settings reset to Master Blueprint defaults.");
    };

    const handleSaveConfig = async (run: CohortRun) => {
        if (!editConfig.runName.trim()) {
            toast.warning("Please enter a Title for this cohort batch.");
            return;
        }

        if (editConfig.isTimeBound && editConfig.start && editConfig.end && new Date(editConfig.end) <= new Date(editConfig.start)) {
            toast.warning("End date must be after the start date.");
            return;
        }

        const hasExistingSchedule = run.generatedSchedule && run.generatedSchedule.length > 0;

        const doSave = async () => {
            try {
                const runRef = doc(db, 'cohort_runs', run.id);
                await updateDoc(runRef, {
                    name: editConfig.runName.trim(),
                    cohortName: editConfig.runName.trim(),
                    description: editConfig.description.trim(),
                    themeColor: editConfig.themeColor,
                    illustrationType: editConfig.illustrationType,
                    applicationStartDate: editConfig.applicationStartDate,
                    applicationEndDate: editConfig.applicationEndDate,
                    level: editConfig.level,
                    isCertificateAwarded: editConfig.isCertificateAwarded,
                    learningOutcomes: editConfig.learningOutcomes,
                    prerequisites: editConfig.prerequisites,
                    targetAudience: editConfig.targetAudience,
                    materialIncludes: editConfig.materialIncludes, // 👈 Saved directly to Firestore
                    tags: editConfig.tags,
                    isAccredited: editConfig.isAccredited,
                    accreditationBody: editConfig.accreditationBody,
                    customAccreditationText: editConfig.customAccreditationText,
                    saqaId: editConfig.saqaId,
                    nqfLevel: editConfig.nqfLevel,
                    credits: editConfig.credits,
                    cohortIds: editConfig.cohortIds,
                    cohortId: editConfig.cohortIds.length > 0 ? editConfig.cohortIds[0] : null,
                    "timeBoundConfig.isTimeBound": editConfig.isTimeBound,
                    "timeBoundConfig.startDate": editConfig.isTimeBound ? editConfig.start : "",
                    "timeBoundConfig.endDate": editConfig.isTimeBound ? editConfig.end : "",
                    updatedAt: new Date().toISOString()
                });
                toast.success("Timeline settings, material includes & branding updated!");
                setEditingRunId(null);
            } catch (error: any) {
                toast.error(error?.message || "Failed to update settings.");
            }
        };

        if (hasExistingSchedule) {
            setConfirmModal({
                isOpen: true,
                type: 'warning',
                title: 'This Will Clear the Generated Schedule',
                message: `"${run.cohortName}" already has a lesson schedule generated. Changing these settings will clear it — you'll need to regenerate it in Launch Cohort before this run can go active.`,
                confirmText: 'Update Settings',
                cancelText: 'Cancel',
                onConfirm: () => {
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    doSave();
                }
            });
        } else {
            await doSave();
        }
    };

    const handleLaunchRun = (run: CohortRun) => {
        const enrichedRun: CohortRun = {
            ...run,
            description: (run as any).description || masterContainer.description || masterContainer.checkpointMetadata?.courseDescription || '',
            themeColor: (run as any).themeColor || masterContainer.themeColor || masterContainer.checkpointMetadata?.themeColor || '#0284c7',
            illustrationType: (run as any).illustrationType || masterContainer.illustrationType || masterContainer.checkpointMetadata?.illustrationType || 'code',
            materialIncludes: (run as any).materialIncludes || masterContainer.materialIncludes || masterContainer.checkpointMetadata?.materialIncludes || [],
            accreditation: run.accreditation || masterContainer.defaultAccreditation || masterContainer.checkpointMetadata?.defaultAccreditation || null
        } as any;

        onLaunchNew?.(enrichedRun, masterContainer);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return { bg: 'var(--mlab-green-bg)', text: 'var(--mlab-green-dark)', border: 'var(--mlab-green)' };
            case 'completed': return { bg: '#f3e8ff', text: '#6d28d9', border: '#e9d5ff' };
            case 'archived': return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
            case 'draft': return { bg: 'var(--mlab-light-blue)', text: 'var(--mlab-blue)', border: 'var(--mlab-border)' };
            default: return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }; // paused
        }
    };

    if (!isOpen) return null;

    return (
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 99999, justifyContent: 'flex-end', padding: 0 }}>

            {/* CONFIRMATION MODAL PORTAL */}
            {confirmModal.isOpen && createPortal(
                <StatusModal
                    type={confirmModal.type}
                    title={confirmModal.title}
                    message={confirmModal.message}
                    confirmText={confirmModal.confirmText}
                    cancelText={confirmModal.cancelText}
                    onClose={() => {
                        if (confirmModal.onConfirm) confirmModal.onConfirm();
                        else setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    }}
                    onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                />,
                document.body
            )}

            <div
                className="animate-slide-in-right"
                style={{
                    width: '620px',
                    height: '100vh',
                    background: 'var(--mlab-bg)',
                    borderLeft: '2px solid var(--mlab-blue)',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '-4px 0 25px rgba(0,0,0,0.2)'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── DRAWER HEADER ── */}
                <div className="lfm-header">
                    <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--mlab-green)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Delivery Timelines Ledger
                        </div>
                        <h2 className="lfm-header__title" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                            {containerName}
                        </h2>
                    </div>
                    <button type="button" className="lfm-close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* ── DRAWER BODY ── */}
                <div className="lfm-body" style={{ padding: '1.5rem', overflowY: 'auto' }}>

                    {/* CREATE NEW TIMELINE ACTION BAR */}
                    <div style={{ background: 'var(--mlab-white)', border: '2px solid var(--mlab-blue)', padding: '1.25rem', marginBottom: '1rem' }}>
                        <div className="lfm-section-hdr" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '0.75rem' }}>
                            <Plus size={13} /> Draft New Timeline Blueprint
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                className="lfm-input"
                                style={{ flex: 1 }}
                                placeholder="e.g. Spring 2026 Intake"
                                value={newTimelineName}
                                onChange={(e) => setNewTimelineName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateTimeline()}
                            />
                            <button
                                type="button"
                                className="lfm-btn lfm-btn--primary"
                                onClick={handleCreateTimeline}
                                disabled={!newTimelineName.trim() || isCreating}
                                style={{ minWidth: '100px', justifyContent: 'center' }}
                            >
                                {isCreating ? <Clock className="lfm-spin" size={14} /> : 'Create'}
                            </button>
                        </div>
                    </div>

                    {/* TIMELINES LIST */}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                            <Clock className="lfm-spin" size={24} style={{ marginBottom: '10px', color: 'var(--mlab-blue)' }} />
                            <div>Loading active timelines...</div>
                        </div>
                    ) : runs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--mlab-grey)', background: 'var(--mlab-white)', border: '1px dashed var(--mlab-border)', fontFamily: 'var(--font-body)' }}>
                            <Calendar size={32} style={{ opacity: 0.5, margin: '0 auto 10px', display: 'block' }} />
                            <p style={{ margin: 0, fontSize: '0.85rem' }}>No timelines drafted for this package yet.</p>
                        </div>
                    ) : (
                        runs.map(run => {
                            const colors = getStatusColor(run.status);
                            const isEditing = editingRunId === run.id;
                            const hasSchedule = run.generatedSchedule && run.generatedSchedule.length > 0;

                            const linkedCohortIds: string[] = (run as any).cohortIds || (run.cohortId ? [run.cohortId] : []);

                            const linkedCohortNames = linkedCohortIds.includes('ALL')
                                ? 'All Active Cohorts'
                                : linkedCohortIds.length > 0
                                    ? linkedCohortIds.map(id => {
                                        if (id === 'Unassigned') return 'General Pool (Unassigned)';
                                        return cohorts.find(c => c.id === id)?.name || id;
                                    }).join(', ')
                                    : 'None';

                            return (
                                <div key={run.id} style={{ background: 'var(--mlab-white)', border: '2px solid var(--mlab-blue)', borderLeft: '5px solid var(--mlab-green)', marginBottom: '1rem' }}>

                                    {/* Run Header */}
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--mlab-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mlab-light-blue)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <PlayCircle size={16} color="var(--mlab-blue)" />
                                            <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>{run.cohortName}</strong>
                                        </div>
                                        <span style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-body)' }}>
                                            {run.status}
                                        </span>
                                    </div>

                                    {/* Run Details */}
                                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                        {/* Full Configuration & Editing Panel */}
                                        {isEditing ? (
                                            <div style={{ background: '#f8fafc', padding: '16px', border: '1px solid var(--mlab-border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                                {/* REUSABLE BRANDING, TITLE, RICH DESCRIPTION, ARTWORK & MATERIAL INCLUDED FORM */}
                                                <CohortRunSettingsForm
                                                    data={editConfig}
                                                    onChange={handleSettingChange}
                                                    onResetToBlueprintDefaults={() => handleResetDefaults(run)}
                                                    framework={(run as any).framework || 'secam'}
                                                />

                                                {/* MULTI-SELECT DROPDOWN FOR TARGET COHORTS */}
                                                <div className="lfm-fg lfm-fg--full" style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1rem' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '8px', color: 'var(--mlab-blue)' }}>
                                                        <Users size={14} color="var(--mlab-green)" /> Target Cohort Availability
                                                    </label>

                                                    <div style={{ position: 'relative', width: '100%' }} ref={cohortDropdownRef}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsCohortDropdownOpen(!isCohortDropdownOpen)}
                                                            className="lfm-input"
                                                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: '#fff', borderRadius: 0 }}
                                                        >
                                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>
                                                                {editConfig.cohortIds.includes('ALL')
                                                                    ? 'All Active Cohorts'
                                                                    : editConfig.cohortIds.length === 0
                                                                        ? '-- Select Cohorts --'
                                                                        : `${editConfig.cohortIds.length} Cohort(s) Selected`}
                                                            </span>
                                                            <ChevronDown size={14} color="var(--mlab-grey)" />
                                                        </button>

                                                        {isCohortDropdownOpen && (
                                                            <div className="sm-dropdown" style={{ width: '100%', position: 'absolute', top: '100%', left: 0, zIndex: 60, background: '#fff', border: '1px solid var(--mlab-border)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxHeight: '220px', overflowY: 'auto' }}>
                                                                <div className="sm-dropdown-search" style={{ position: 'sticky', top: 0, background: '#f8fafc', padding: '8px 10px', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 2 }}>
                                                                    <Search size={14} color="var(--mlab-grey)" />
                                                                    <input
                                                                        autoFocus
                                                                        type="text"
                                                                        value={cohortSearchQuery}
                                                                        onChange={e => setCohortSearchQuery(e.target.value)}
                                                                        placeholder="Search cohorts..."
                                                                        style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                                                                    />
                                                                </div>

                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <div
                                                                        className={`sm-dropdown-item ${editConfig.cohortIds.includes('ALL') ? 'active' : ''}`}
                                                                        onClick={() => toggleTargetCohort('ALL')}
                                                                        style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.85rem' }}
                                                                    >
                                                                        <input type="checkbox" checked={editConfig.cohortIds.includes('ALL')} readOnly style={{ accentColor: 'var(--mlab-green)' }} />
                                                                        All Active Cohorts
                                                                    </div>

                                                                    <div
                                                                        className={`sm-dropdown-item ${editConfig.cohortIds.includes('Unassigned') ? 'active' : ''}`}
                                                                        onClick={() => toggleTargetCohort('Unassigned')}
                                                                        style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.85rem' }}
                                                                    >
                                                                        <input type="checkbox" checked={editConfig.cohortIds.includes('Unassigned')} readOnly style={{ accentColor: 'var(--mlab-green)' }} />
                                                                        General Pool (Unassigned)
                                                                    </div>

                                                                    {filteredCohortsForDrawer.length > 0 ? (
                                                                        filteredCohortsForDrawer.map(c => {
                                                                            const isSelected = editConfig.cohortIds.includes(c.id);
                                                                            return (
                                                                                <div
                                                                                    key={c.id}
                                                                                    className={`sm-dropdown-item ${isSelected ? 'active' : ''}`}
                                                                                    onClick={() => toggleTargetCohort(c.id)}
                                                                                    style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
                                                                                >
                                                                                    <input type="checkbox" checked={isSelected} readOnly style={{ accentColor: 'var(--mlab-blue)' }} />
                                                                                    <span>{c.name}</span>
                                                                                </div>
                                                                            );
                                                                        })
                                                                    ) : (
                                                                        <div style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--mlab-grey)', textAlign: 'center' }}>No cohorts found.</div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {!editConfig.cohortIds.includes('ALL') && editConfig.cohortIds.length > 0 && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                                            {editConfig.cohortIds.map(id => {
                                                                const match = cohorts.find(c => c.id === id);
                                                                const displayLabel = id === 'Unassigned' ? 'General Pool (Unassigned)' : (match?.name || id);
                                                                return (
                                                                    <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', border: '1px solid var(--mlab-border)', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                                                                        {displayLabel}
                                                                        <X size={12} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => toggleTargetCohort(id)} />
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* TIME-BOUND PACING WINDOW DATES */}
                                                <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1rem' }}>
                                                    <label className="lfm-checkbox-row" style={{ margin: '0 0 12px 0', fontWeight: 700, fontSize: '0.8rem' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={editConfig.isTimeBound}
                                                            onChange={e => setEditConfig({ ...editConfig, isTimeBound: e.target.checked })}
                                                        />
                                                        Time-Bound Delivery Mode
                                                    </label>

                                                    {editConfig.isTimeBound && (
                                                        <div className="lfm-grid" style={{ gap: '1rem', marginBottom: '12px' }}>
                                                            <div className="lfm-fg">
                                                                <label>Batch Start Date</label>
                                                                <input type="date" value={editConfig.start} onChange={e => setEditConfig({ ...editConfig, start: e.target.value })} className="lfm-input" />
                                                            </div>
                                                            <div className="lfm-fg">
                                                                <label>Batch End Date</label>
                                                                <input type="date" value={editConfig.end} onChange={e => setEditConfig({ ...editConfig, end: e.target.value })} className="lfm-input" />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {hasSchedule && editConfig.isTimeBound && (
                                                        <div className="lfm-error-banner" style={{ marginTop: '0', padding: '10px', fontSize: '0.75rem', background: '#fffbeb', borderColor: '#f59e0b', color: '#92400e' }}>
                                                            <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                                                            <span>This run already has a generated schedule. Changing settings will clear it.</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                                                    <button type="button" onClick={() => setEditingRunId(null)} className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 12px' }}>Cancel</button>
                                                    <button type="button" onClick={() => handleSaveConfig(run)} className="lfm-btn lfm-btn--primary" style={{ padding: '6px 12px' }}>Save Settings</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {run.timeBoundConfig?.isTimeBound ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Calendar size={14} color="var(--mlab-blue)" />
                                                            <span>{run.timeBoundConfig?.startDate || 'Dates not set'}</span>
                                                        </div>
                                                        <ArrowRight size={14} color="var(--mlab-border)" />
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Clock size={14} color="var(--mlab-blue)" />
                                                            <span>{run.timeBoundConfig?.endDate || 'Dates not set'}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-green-dark)', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
                                                        <Infinity size={16} /> Self-Paced (Evergreen)
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }}>
                                                    <Users size={14} color="var(--mlab-blue)" style={{ marginTop: '2px' }} />
                                                    <span>Linked Cohorts: <strong style={{ color: 'var(--mlab-blue)' }}>{linkedCohortNames}</strong></span>
                                                </div>
                                            </>
                                        )}

                                        {/* Action Bar */}
                                        <div style={{ borderTop: '1px dashed var(--mlab-border)', paddingTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>

                                            <button
                                                type="button"
                                                onClick={() => onAnalyticsClick?.(run.id)}
                                                className="lfm-btn"
                                                style={{ background: 'var(--mlab-light-blue)', border: '1px solid var(--mlab-border)', color: 'var(--mlab-blue)', padding: '4px 10px', fontSize: '0.68rem' }}
                                            >
                                                <BarChart3 size={13} /> Analytics
                                            </button>

                                            {!isEditing && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleStartEditing(run)}
                                                    className="lfm-btn lfm-btn--ghost"
                                                    style={{ padding: '4px 10px', fontSize: '0.68rem' }}
                                                >
                                                    <Settings2 size={13} /> Config
                                                </button>
                                            )}

                                            {/* Dynamic Status Action Button */}
                                            {run.status === 'draft' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleLaunchRun(run)}
                                                    className="lfm-btn lfm-btn--primary"
                                                    style={{ padding: '4px 10px', fontSize: '0.68rem' }}
                                                >
                                                    <Rocket size={13} /> Launch
                                                </button>
                                            ) : run.status === 'active' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateStatus(run.id, 'paused')}
                                                    className="lfm-btn"
                                                    style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', padding: '4px 10px', fontSize: '0.68rem' }}
                                                >
                                                    <Ban size={13} /> Pause
                                                </button>
                                            ) : run.status === 'paused' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateStatus(run.id, 'active')}
                                                    className="lfm-btn"
                                                    style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '4px 10px', fontSize: '0.68rem' }}
                                                >
                                                    <PlayCircle size={13} /> Resume
                                                </button>
                                            ) : null}

                                            <button
                                                type="button"
                                                onClick={() => requestDeleteRun(run)}
                                                className="lfm-btn lfm-btn--ghost"
                                                style={{ border: 'none', color: 'var(--mlab-grey-lt)', padding: '4px 8px', marginLeft: 'auto' }}
                                                title="Delete Timeline"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};