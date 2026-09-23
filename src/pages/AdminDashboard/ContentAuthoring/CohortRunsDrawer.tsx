// src/pages/AdminDashboard/ContentAuthoring/CohortRunsDrawer.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { createPortal } from 'react-dom';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
import Tooltip from '../../../components/common/Tooltip/Tooltip';
import {
    createDraftCohortRun,
    updateCohortRunStatus,
    deleteCohortRun
} from '../../../services/contentService';
import {
    X, Calendar, PlayCircle, Ban, Clock, Users, ArrowRight, Settings2,
    Trash2, Rocket, Plus, AlertTriangle, BarChart3, Infinity as InfinityIcon, Search, ChevronDown
} from 'lucide-react';
import type { CohortRun } from '../../../types/content.types';
import type { EnrichedContentContainer } from './ContentAuthoring';
import { CohortRunSettingsForm, type CohortRunSettingsData, type ExtendedCohortRun } from './LaunchCohortModal';

interface CohortRunsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    containerId: string;
    containerName: string;
    containerData?: EnrichedContentContainer;
    cohorts: { id: string; name: string }[];
    onLaunchNew?: (run: ExtendedCohortRun, containerData?: EnrichedContentContainer) => void;
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
    const [runs, setRuns] = useState<ExtendedCohortRun[]>([]);
    const [fetchedContainerData, setFetchedContainerData] = useState<EnrichedContentContainer | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingRunId, setEditingRunId] = useState<string | null>(null);

    const masterContainer: Partial<EnrichedContentContainer> = propContainerData || fetchedContainerData || {};

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
        certificateIssuerMode: 'mlab_internal',
        certificateTemplateId: '',
        externalIssuerName: '',
        awaitingExternalNotice: '',
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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (cohortDropdownRef.current && !cohortDropdownRef.current.contains(event.target as Node)) {
                setIsCohortDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen || !containerId || propContainerData) return;

        const containerRef = doc(db, 'content_containers', containerId);
        const unsubContainer = onSnapshot(containerRef, (docSnap) => {
            if (docSnap.exists()) {
                setFetchedContainerData({ id: docSnap.id, ...docSnap.data() } as EnrichedContentContainer);
            }
        }, (err) => {
            console.warn("Error fetching parent content container defaults:", err);
        });

        return () => unsubContainer();
    }, [isOpen, containerId, propContainerData]);

    useEffect(() => {
        if (!isOpen || !containerId) return;

        setLoading(true);
        const q = query(collection(db, 'cohort_runs'), where('containerId', '==', containerId));

        const unsub = onSnapshot(q, (snap) => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExtendedCohortRun));
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

    const requestDeleteRun = (run: ExtendedCohortRun) => {
        setConfirmModal({
            isOpen: true,
            type: 'warning',
            title: 'Delete Timeline',
            message: `Are you sure you want to permanently delete "${run.cohortName || run.name}"? This cannot be undone.`,
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

    const handleStartEditing = (run: ExtendedCohortRun) => {
        const linkedCohortIds: string[] = run.cohortIds || (run.cohortId ? [run.cohortId] : []);
        const rawIssuerMode = run.certificateIssuerMode || (masterContainer.checkpointMetadata?.certificateIssuerMode as string);
        const normalizedMode: 'mlab_internal' | 'external_authority' = rawIssuerMode === 'external_authority' ? 'external_authority' : 'mlab_internal';

        setEditConfig({
            runName: run.name || run.cohortName || masterContainer.title || '',
            description: run.description || masterContainer.description || (masterContainer.checkpointMetadata?.courseDescription as string) || '',
            themeColor: run.themeColor || masterContainer.themeColor || (masterContainer.checkpointMetadata?.themeColor as string) || '#0284c7',
            illustrationType: run.illustrationType || masterContainer.illustrationType || (masterContainer.checkpointMetadata?.illustrationType as string) || 'code',
            applicationStartDate: run.applicationStartDate || '',
            applicationEndDate: run.applicationEndDate || '',
            level: run.level || masterContainer.level || (masterContainer.checkpointMetadata?.courseLevel as string) || 'beginner',
            isCertificateAwarded: run.isCertificateAwarded ?? masterContainer.isCertificateAwarded ?? (masterContainer.checkpointMetadata?.isCertificateAwarded as boolean) ?? true,
            certificateIssuerMode: normalizedMode,
            certificateTemplateId: run.certificateTemplateId || '',
            externalIssuerName: run.externalIssuerName || '',
            awaitingExternalNotice: run.awaitingExternalNotice || '',
            learningOutcomes: run.learningOutcomes || masterContainer.learningOutcomes || (masterContainer.checkpointMetadata?.learningOutcomes as string[]) || [],
            prerequisites: run.prerequisites || masterContainer.prerequisites || (masterContainer.checkpointMetadata?.prerequisites as string[]) || [],
            targetAudience: run.targetAudience || masterContainer.targetAudience || (masterContainer.checkpointMetadata?.targetAudience as string[]) || [],
            materialIncludes: run.materialIncludes || masterContainer.materialIncludes || (masterContainer.checkpointMetadata?.materialIncludes as string[]) || [
                'Hands-on Video Tutorials & Source Code',
                'Downloadable Lab Guides & Asset Packs',
                'Interactive AI Peer Reviews & Quizzes',
                'Industry Certificate of Completion'
            ],
            tags: run.tags || masterContainer.tags || (masterContainer.checkpointMetadata?.courseTags as string[]) || [],
            isAccredited: run.isAccredited ?? masterContainer.defaultAccreditation?.isAccredited ?? true,
            accreditationBody: run.accreditation?.body || masterContainer.defaultAccreditation?.body || 'qcto',
            customAccreditationText: run.accreditation?.customText || masterContainer.defaultAccreditation?.customText || '',
            saqaId: run.saqaId || masterContainer.defaultAccreditation?.saqaId || '',
            nqfLevel: run.nqfLevel || masterContainer.defaultAccreditation?.nqfLevel || 5,
            credits: run.credits || masterContainer.defaultAccreditation?.credits || 120,
            start: run.timeBoundConfig?.startDate || '',
            end: run.timeBoundConfig?.endDate || '',
            isTimeBound: run.timeBoundConfig?.isTimeBound ?? true,
            cohortIds: linkedCohortIds
        });
        setEditingRunId(run.id);
    };

    const handleSettingChange = <K extends keyof CohortRunSettingsData>(
        field: K,
        value: CohortRunSettingsData[K]
    ) => {
        setEditConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleResetDefaults = (run: ExtendedCohortRun) => {
        const rawIssuerMode = masterContainer.checkpointMetadata?.certificateIssuerMode as string;
        const normalizedMode: 'mlab_internal' | 'external_authority' = rawIssuerMode === 'external_authority' ? 'external_authority' : 'mlab_internal';

        setEditConfig(prev => ({
            ...prev,
            runName: masterContainer.title || run.cohortName || '',
            description: masterContainer.description || (masterContainer.checkpointMetadata?.courseDescription as string) || '',
            themeColor: masterContainer.themeColor || (masterContainer.checkpointMetadata?.themeColor as string) || '#0284c7',
            illustrationType: masterContainer.illustrationType || (masterContainer.checkpointMetadata?.illustrationType as string) || 'code',
            applicationStartDate: '',
            applicationEndDate: '',
            level: masterContainer.level || (masterContainer.checkpointMetadata?.courseLevel as string) || 'beginner',
            isCertificateAwarded: masterContainer.isCertificateAwarded ?? (masterContainer.checkpointMetadata?.isCertificateAwarded as boolean) ?? true,
            certificateIssuerMode: normalizedMode,
            certificateTemplateId: '',
            externalIssuerName: '',
            awaitingExternalNotice: '',
            learningOutcomes: masterContainer.learningOutcomes || (masterContainer.checkpointMetadata?.learningOutcomes as string[]) || [],
            prerequisites: masterContainer.prerequisites || (masterContainer.checkpointMetadata?.prerequisites as string[]) || [],
            targetAudience: masterContainer.targetAudience || (masterContainer.checkpointMetadata?.targetAudience as string[]) || [],
            materialIncludes: masterContainer.materialIncludes || (masterContainer.checkpointMetadata?.materialIncludes as string[]) || [
                'Hands-on Video Tutorials & Source Code',
                'Downloadable Lab Guides & Asset Packs',
                'Interactive AI Peer Reviews & Quizzes',
                'Industry Certificate of Completion'
            ],
            tags: masterContainer.tags || (masterContainer.checkpointMetadata?.courseTags as string[]) || [],
            isAccredited: masterContainer.defaultAccreditation?.isAccredited ?? true,
            accreditationBody: masterContainer.defaultAccreditation?.body || 'qcto',
            customAccreditationText: masterContainer.defaultAccreditation?.customText || '',
            saqaId: masterContainer.defaultAccreditation?.saqaId || '',
            nqfLevel: masterContainer.defaultAccreditation?.nqfLevel || 5,
            credits: masterContainer.defaultAccreditation?.credits || 120
        }));
        toast.info("Inline settings reset to Master Blueprint defaults.");
    };

    const handleSaveConfig = async (run: ExtendedCohortRun) => {
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
                    certificateIssuerMode: editConfig.certificateIssuerMode,
                    certificateTemplateId: editConfig.certificateTemplateId,
                    externalIssuerName: editConfig.externalIssuerName,
                    awaitingExternalNotice: editConfig.awaitingExternalNotice,
                    learningOutcomes: editConfig.learningOutcomes,
                    prerequisites: editConfig.prerequisites,
                    targetAudience: editConfig.targetAudience,
                    materialIncludes: editConfig.materialIncludes,
                    tags: editConfig.tags,
                    isAccredited: editConfig.isAccredited,
                    accreditationBody: editConfig.accreditationBody,
                    customAccreditationText: editConfig.customAccreditationText,
                    saqaId: editConfig.saqaId,
                    nqfLevel: editConfig.nqfLevel,
                    credits: editConfig.credits,
                    cohortIds: editConfig.cohortIds,
                    cohortId: editConfig.cohortIds.length > 0 ? editConfig.cohortIds[0] : null,
                    timeBoundConfig: {
                        ...(run.timeBoundConfig || {}),
                        isTimeBound: editConfig.isTimeBound,
                        startDate: editConfig.isTimeBound ? editConfig.start : '',
                        endDate: editConfig.isTimeBound ? editConfig.end : ''
                    },
                    updatedAt: new Date().toISOString()
                });
                toast.success("Timeline settings, material includes & branding updated!");
                setEditingRunId(null);
            } catch (error: unknown) {
                const errorMsg = error instanceof Error ? error.message : "Failed to update settings.";
                toast.error(errorMsg);
            }
        };

        if (hasExistingSchedule) {
            setConfirmModal({
                isOpen: true,
                type: 'warning',
                title: 'This Will Clear the Generated Schedule',
                message: `"${run.cohortName || run.name}" already has a lesson schedule generated. Changing these settings will clear it — you'll need to regenerate it in Launch Cohort before this run can go active.`,
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

    const handleLaunchRun = (run: ExtendedCohortRun) => {
        const enrichedRun: ExtendedCohortRun = {
            ...run,
            description: run.description || masterContainer.description || (masterContainer.checkpointMetadata?.courseDescription as string) || '',
            themeColor: run.themeColor || masterContainer.themeColor || (masterContainer.checkpointMetadata?.themeColor as string) || '#0284c7',
            illustrationType: run.illustrationType || masterContainer.illustrationType || (masterContainer.checkpointMetadata?.illustrationType as string) || 'code',
            materialIncludes: run.materialIncludes || masterContainer.materialIncludes || (masterContainer.checkpointMetadata?.materialIncludes as string[]) || [],
            accreditation: run.accreditation || masterContainer.defaultAccreditation || (masterContainer.checkpointMetadata?.defaultAccreditation as any) || null
        };

        onLaunchNew?.(enrichedRun, masterContainer as EnrichedContentContainer);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return { bg: 'var(--mlab-green-bg)', text: 'var(--mlab-green-dark)', border: 'var(--mlab-green)' };
            case 'completed': return { bg: '#f3e8ff', text: '#6d28d9', border: '#e9d5ff' };
            case 'archived': return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
            case 'draft': return { bg: 'var(--mlab-light-blue)', text: 'var(--mlab-blue)', border: 'var(--mlab-border)' };
            default: return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
        }
    };

    if (!isOpen) return null;

    return (
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 99999, justifyContent: 'flex-end', padding: 0 }}>

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
                {/* DRAWER HEADER */}
                <div className="lfm-header">
                    <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--mlab-green)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Delivery Timelines Ledger
                        </div>
                        <h2 className="lfm-header__title" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                            {containerName}
                        </h2>
                    </div>
                    <Tooltip content="Close drawer" placement="left">
                        <button type="button" className="lfm-close-btn" onClick={onClose}>
                            <X size={20} />
                        </button>
                    </Tooltip>
                </div>

                {/* DRAWER BODY */}
                <div className="lfm-body" style={{ padding: '1.5rem', overflowY: 'auto' }}>

                    {/* CREATE NEW TIMELINE ACTION BAR */}
                    <div style={{ background: 'var(--mlab-white)', border: '2px solid var(--mlab-blue)', padding: '1.25rem', marginBottom: '1rem' }}>
                        <div className="lfm-section-hdr" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '0.75rem' }}>
                            <Plus size={13} /> Draft New Timeline Blueprint
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Tooltip content="Enter a title for this delivery run (e.g., 'Spring 2026 Cohort Intake')." placement="top">
                                <input
                                    type="text"
                                    className="lfm-input"
                                    style={{ flex: 1 }}
                                    placeholder="e.g. Spring 2026 Intake"
                                    value={newTimelineName}
                                    onChange={(e) => setNewTimelineName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTimeline()}
                                />
                            </Tooltip>
                            <Tooltip content="Draft a new timeline run linked to this master package." placement="top">
                                <button
                                    type="button"
                                    className="lfm-btn lfm-btn--primary"
                                    onClick={handleCreateTimeline}
                                    disabled={!newTimelineName.trim() || isCreating}
                                    style={{ minWidth: '100px', justifyContent: 'center' }}
                                >
                                    {isCreating ? <Clock className="lfm-spin" size={14} /> : 'Create'}
                                </button>
                            </Tooltip>
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

                            const linkedCohortIds: string[] = run.cohortIds || (run.cohortId ? [run.cohortId] : []);

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
                                            <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>{run.cohortName || run.name}</strong>
                                        </div>
                                        <Tooltip content={`Current status: ${run.status.toUpperCase()}`} placement="left">
                                            <span style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-body)' }}>
                                                {run.status}
                                            </span>
                                        </Tooltip>
                                    </div>

                                    {/* Run Details */}
                                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                        {/* Full Configuration & Editing Panel */}
                                        {isEditing ? (
                                            <div style={{ background: '#f8fafc', padding: '16px', border: '1px solid var(--mlab-border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                                <CohortRunSettingsForm
                                                    data={editConfig}
                                                    onChange={handleSettingChange}
                                                    onResetToBlueprintDefaults={() => handleResetDefaults(run)}
                                                    framework={run.framework || 'secam'}
                                                />

                                                {/* MULTI-SELECT DROPDOWN FOR TARGET COHORTS */}
                                                <div className="lfm-fg lfm-fg--full" style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1rem' }}>
                                                    <Tooltip content="Select specific learner cohorts that can access this run." placement="top">
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '8px', color: 'var(--mlab-blue)' }}>
                                                            <Users size={14} color="var(--mlab-green)" /> Target Cohort Availability
                                                        </label>
                                                    </Tooltip>

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
                                                    <Tooltip content="Toggle between fixed start/end date pacing or open self-paced learning access." placement="top">
                                                        <label className="lfm-checkbox-row" style={{ margin: '0 0 12px 0', fontWeight: 700, fontSize: '0.8rem' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={editConfig.isTimeBound}
                                                                onChange={e => setEditConfig({ ...editConfig, isTimeBound: e.target.checked })}
                                                            />
                                                            Time-Bound Delivery Mode
                                                        </label>
                                                    </Tooltip>

                                                    {editConfig.isTimeBound && (
                                                        <div className="lfm-grid" style={{ gap: '1rem', marginBottom: '12px' }}>
                                                            <div className="lfm-fg">
                                                                <Tooltip content="The starting date of this delivery timeline." placement="top">
                                                                    <label>Batch Start Date</label>
                                                                </Tooltip>
                                                                <input type="date" value={editConfig.start} onChange={e => setEditConfig({ ...editConfig, start: e.target.value })} className="lfm-input" />
                                                            </div>
                                                            <div className="lfm-fg">
                                                                <Tooltip content="The target completion date of this delivery timeline." placement="top">
                                                                    <label>Batch End Date</label>
                                                                </Tooltip>
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
                                                    <Tooltip content="Save all run configuration updates to Firestore." placement="top">
                                                        <button type="button" onClick={() => handleSaveConfig(run)} className="lfm-btn lfm-btn--primary" style={{ padding: '6px 12px' }}>Save Settings</button>
                                                    </Tooltip>
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
                                                        <InfinityIcon size={16} /> Self-Paced (Evergreen)
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

                                            <Tooltip content="View analytics and learner submission stats for this run." placement="top">
                                                <button
                                                    type="button"
                                                    onClick={() => onAnalyticsClick?.(run.id)}
                                                    className="lfm-btn"
                                                    style={{ background: 'var(--mlab-light-blue)', border: '1px solid var(--mlab-border)', color: 'var(--mlab-blue)', padding: '4px 10px', fontSize: '0.68rem' }}
                                                >
                                                    <BarChart3 size={13} /> Analytics
                                                </button>
                                            </Tooltip>

                                            {!isEditing && (
                                                <Tooltip content="Edit runtime branding, metadata, assigned cohorts, and pacing dates." placement="top">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleStartEditing(run)}
                                                        className="lfm-btn lfm-btn--ghost"
                                                        style={{ padding: '4px 10px', fontSize: '0.68rem' }}
                                                    >
                                                        <Settings2 size={13} /> Config
                                                    </button>
                                                </Tooltip>
                                            )}

                                            {/* Dynamic Status Action Button */}
                                            {run.status === 'draft' ? (
                                                <Tooltip content="Generate lesson schedules and launch this timeline into active production." placement="top">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleLaunchRun(run)}
                                                        className="lfm-btn lfm-btn--primary"
                                                        style={{ padding: '4px 10px', fontSize: '0.68rem' }}
                                                    >
                                                        <Rocket size={13} /> Launch
                                                    </button>
                                                </Tooltip>
                                            ) : run.status === 'active' ? (
                                                <Tooltip content="Temporarily pause learner progression for this run." placement="top">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateStatus(run.id, 'paused')}
                                                        className="lfm-btn"
                                                        style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', padding: '4px 10px', fontSize: '0.68rem' }}
                                                    >
                                                        <Ban size={13} /> Pause
                                                    </button>
                                                </Tooltip>
                                            ) : run.status === 'paused' ? (
                                                <Tooltip content="Resume active learner progression for this run." placement="top">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateStatus(run.id, 'active')}
                                                        className="lfm-btn"
                                                        style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '4px 10px', fontSize: '0.68rem' }}
                                                    >
                                                        <PlayCircle size={13} /> Resume
                                                    </button>
                                                </Tooltip>
                                            ) : null}

                                            <Tooltip content="Permanently delete this timeline run." placement="top">
                                                <button
                                                    type="button"
                                                    onClick={() => requestDeleteRun(run)}
                                                    className="lfm-btn lfm-btn--ghost"
                                                    style={{ border: 'none', color: 'var(--mlab-grey-lt)', padding: '4px 8px', marginLeft: 'auto' }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </Tooltip>
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