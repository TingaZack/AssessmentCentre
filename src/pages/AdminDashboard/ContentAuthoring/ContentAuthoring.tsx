// src/pages/AdminDashboard/ContentAuthoring/ContentAuthoring.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
    collection, query, where, onSnapshot,
    doc, setDoc, serverTimestamp,
    updateDoc
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../components/common/Toast/Toast';
import { createPortal } from 'react-dom';
import Tooltip from '../../../components/common/Tooltip/Tooltip';
import {
    Video, FileText, Code,
    PlayCircle, Bot, Sparkles,
    Bug, Search, BookOpen, Clock, Layers, Zap, GraduationCap,
    ChevronDown, FolderOpen, Bookmark, Briefcase, Award, Building2, FolderPlus, BarChart3, Trash2, X,
    Calendar, Package
} from 'lucide-react';
import type { LearningUnit, ContentContainer, CohortRun, AccreditationConfig, TimeBoundConfig, AccreditationBody } from '../../../types/content.types';
import type { ProgrammeTemplate, Cohort } from '../../../types';
import { ContentBuilderModal } from './ContentBuilderModal';
import { LaunchCohortModal } from './LaunchCohortModal';
import { CohortRunsDrawer } from './CohortRunsDrawer';
import { saveLearningUnit, deleteLearningUnit } from '../../../services/contentService';

import '../../../components/admin/ProgrammeFormModal/ProgrammeFormModal.css';
import './ContentAuthoring.css';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
import { CourseIllustrationGraphic } from '../../LearnerPortal/LearnerContentHub/types';
import { CurriculumAnalyticsDashboard } from './LessonAnalyticsModal';
import type { FacilitatorInfo } from '../../../components/common/CourseMetadataSettingsPanel/CourseMetadataSettingsPanel';

export interface ExtendedLearningUnit extends LearningUnit {
    containerName?: string;
    referenceId?: string;
    _isDraft?: boolean;
    _expanded?: boolean;
    _isSaving?: boolean;
}

export interface EnrichedContentContainer extends Omit<ContentContainer, 'accreditationBody'> {
    defaultAccreditation?: AccreditationConfig;
    accreditationBody?: AccreditationBody | string;
    courseworkHours?: number;
    contentHours?: number;
    estimatedTotalHours?: number;
    defaultTimeBoundConfig?: TimeBoundConfig;
    timeBoundConfig?: TimeBoundConfig;
    illustrationType?: string;
    themeColor?: string;
    description?: string;
    level?: string;
    prerequisites?: string[];
    learningOutcomes?: string[];
    targetAudience?: string[];
    isCertificateAwarded?: boolean;
    tags?: string[];
    instructors?: FacilitatorInfo[];
    materialIncludes?: string[];
    previewVideoUrl?: string;
    checkpointScope?: 'per_lesson' | 'per_day' | 'per_sprint';
    checkpointMetadata?: {
        secamStructure?: Array<{ title?: string;[key: string]: unknown }>;
        [key: string]: unknown;
    };
}

export const ContentAuthoring: React.FC = () => {
    const toast = useToast();

    const {
        programmes = [],
        cohorts = [],
        fetchProgrammes,
        fetchCohorts
    } = useStore() as {
        programmes: ProgrammeTemplate[];
        cohorts: Cohort[];
        fetchProgrammes: () => Promise<void>;
        fetchCohorts: () => Promise<void>;
    };

    const [containers, setContainers] = useState<EnrichedContentContainer[]>([]);
    const [selectedContainerId, setSelectedContainerId] = useState<string>('all');
    const [units, setUnits] = useState<ExtendedLearningUnit[]>([]);
    const [loadingContainers, setLoadingContainers] = useState(true);
    const [loadingUnits, setLoadingUnits] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [deletingUnitIds, setDeletingUnitIds] = useState<Set<string>>(new Set());

    const [activeFramework, setActiveFramework] = useState<'qcto' | 'secam'>('secam');

    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set([
        'Knowledge Modules (KM)',
        'Practical Skill Modules (PM)',
        'Work Experience Modules (WM)',
        'Bootcamp Agile Sprints'
    ]));
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

    const [showRootModal, setShowRootModal] = useState(false);
    const [rootTitle, setRootTitle] = useState('');
    const [rootRefId, setRootRefId] = useState('');
    const [rootFramework, setRootFramework] = useState<'qcto' | 'secam'>('secam');
    const [rootTemplateId, setRootTemplateId] = useState('');

    const [showBuilder, setShowBuilder] = useState(false);

    const [showLaunchCohortModal, setShowLaunchCohortModal] = useState(false);
    const [launchModalRun, setLaunchModalRun] = useState<CohortRun | null>(null);

    const [showRunsDrawer, setShowRunsDrawer] = useState(false);

    const [showPackageAnalytics, setShowPackageAnalytics] = useState(false);
    const [analyticsUnit, setAnalyticsUnit] = useState<ExtendedLearningUnit | null>(null);
    const [selectedAnalyticsCohortId, setSelectedAnalyticsCohortId] = useState<string | null>(null);

    const [statusModal, setStatusModal] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
    }>({ isOpen: false, type: 'info', title: '', message: '' });

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const fwParam = searchParams.get('framework') as 'qcto' | 'secam' | null;
        const containerParam = searchParams.get('containerId');
        const modalParam = searchParams.get('modal');

        if (fwParam === 'qcto' || fwParam === 'secam') {
            setActiveFramework(fwParam);
        }
        if (containerParam) {
            setSelectedContainerId(containerParam);
        }
        if (modalParam === 'builder') {
            setShowBuilder(true);
        } else if (modalParam === 'launch') {
            setShowLaunchCohortModal(true);
        } else if (modalParam === 'package_analytics') {
            setShowPackageAnalytics(true);
        } else if (modalParam === 'root') {
            setShowRootModal(true);
        }
    }, []);

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);

        if (activeFramework) searchParams.set('framework', activeFramework);
        else searchParams.delete('framework');

        if (selectedContainerId) searchParams.set('containerId', selectedContainerId);
        else searchParams.delete('containerId');

        if (showBuilder) {
            searchParams.set('modal', 'builder');
            searchParams.delete('unitId');
        } else if (showLaunchCohortModal || launchModalRun) {
            searchParams.set('modal', 'launch');
            searchParams.delete('unitId');
        } else if (showPackageAnalytics) {
            searchParams.set('modal', 'package_analytics');
            searchParams.delete('unitId');
        } else if (analyticsUnit) {
            searchParams.set('modal', 'analytics');
            searchParams.set('unitId', analyticsUnit.id);
        } else if (showRootModal) {
            searchParams.set('modal', 'root');
            searchParams.delete('unitId');
        } else {
            searchParams.delete('modal');
            searchParams.delete('unitId');
        }

        const newRelativePathQuery = window.location.pathname + '?' + searchParams.toString();
        window.history.replaceState(null, '', newRelativePathQuery);
    }, [activeFramework, selectedContainerId, showBuilder, showLaunchCohortModal, launchModalRun, showPackageAnalytics, analyticsUnit, showRootModal]);

    useEffect(() => {
        if (!programmes.length && fetchProgrammes) {
            fetchProgrammes();
        }
        if (!cohorts.length && fetchCohorts) {
            fetchCohorts();
        }
    }, [programmes.length, cohorts.length, fetchProgrammes, fetchCohorts]);

    useEffect(() => {
        setLoadingContainers(true);
        const unsub = onSnapshot(collection(db, 'content_containers'), (snap) => {
            const fetchedContainers = snap.docs.map(d => ({ id: d.id, ...d.data() } as EnrichedContentContainer));
            setContainers(fetchedContainers);
            setLoadingContainers(false);
        }, (err) => {
            console.error("Firestore content_containers query error:", err);
            toast.error("Failed to load content packages.");
            setLoadingContainers(false);
        });

        return () => unsub();
    }, []);

    const filteredContainers = useMemo(() => {
        return containers.filter(c => c.framework === activeFramework);
    }, [containers, activeFramework]);

    const catalogStats = useMemo(() => {
        const totalPackages = containers.length;
        const secamPackages = containers.filter(c => c.framework === 'secam').length;
        const qctoPackages = containers.filter(c => c.framework === 'qcto').length;
        const activeFrameworkPackages = filteredContainers.length;

        const totalUnitsCount = units.length;
        const totalNotionalMins = units.reduce((acc, u) => acc + (Number(u.estimatedMinutes) || 0), 0);
        const totalNotionalHours = Math.round((totalNotionalMins / 60) * 10) / 10;

        return {
            totalPackages,
            secamPackages,
            qctoPackages,
            activeFrameworkPackages,
            totalUnitsCount,
            totalNotionalHours
        };
    }, [containers, filteredContainers, units]);

    const activeContainer = useMemo<EnrichedContentContainer | null>(() => {
        if (selectedContainerId === 'all') {
            return {
                id: 'all',
                title: `All ${activeFramework.toUpperCase()} Content Packages`,
                referenceId: 'GLOBAL-FRAMEWORK-VIEW',
                framework: activeFramework,
                createdAt: new Date().toISOString()
            } as EnrichedContentContainer;
        }
        return filteredContainers.find(c => c.id === selectedContainerId) || filteredContainers[0] || null;
    }, [filteredContainers, selectedContainerId, activeFramework]);

    const linkedTemplate = useMemo(() => {
        if (activeFramework !== 'qcto' || !activeContainer?.programmeTemplateId) return null;
        return programmes.find((t: ProgrammeTemplate) => t.id === activeContainer.programmeTemplateId) || null;
    }, [activeFramework, activeContainer, programmes]);

    useEffect(() => {
        if (filteredContainers.length === 0) {
            setUnits([]);
            setLoadingUnits(false);
            return;
        }

        let isMounted = true;
        setLoadingUnits(true);

        const containerIds = filteredContainers.map(c => c.id);

        const q = (selectedContainerId === 'all' || !selectedContainerId)
            ? query(collection(db, 'learning_units'), where('framework', '==', activeFramework))
            : query(collection(db, 'learning_units'), where('containerId', '==', selectedContainerId));

        const unsub = onSnapshot(q,
            (snap) => {
                if (!isMounted) return;
                const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExtendedLearningUnit));

                const validContainerIds = new Set(containerIds);
                const finalUnits = (selectedContainerId === 'all' || !selectedContainerId)
                    ? fetched.filter(u => validContainerIds.has(u.containerId))
                    : fetched;

                setUnits(finalUnits);
                setLoadingUnits(false);

                const searchParams = new URLSearchParams(window.location.search);
                const modalParam = searchParams.get('modal');
                const unitIdParam = searchParams.get('unitId');
                if (modalParam === 'analytics' && unitIdParam && !analyticsUnit) {
                    const target = finalUnits.find(u => u.id === unitIdParam);
                    if (target) setAnalyticsUnit(target);
                }
            },
            (err) => {
                if (!isMounted) return;
                console.error("Firestore learning_units query error:", err);
                toast.error("Failed to load learning units.");
                setLoadingUnits(false);
            }
        );

        return () => {
            isMounted = false;
            try { unsub(); } catch (e) { }
        };
    }, [selectedContainerId, activeFramework, filteredContainers]);

    const handleFrameworkChange = (framework: 'qcto' | 'secam') => {
        setActiveFramework(framework);
        setSelectedContainerId('all');
    };

    const handleOpenRootModal = () => {
        setRootTitle('');
        setRootRefId('');
        setRootFramework(activeFramework);
        setRootTemplateId('');
        setShowRootModal(true);
    };

    const handleSaveRootContainer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rootTitle.trim() || !rootRefId.trim()) {
            toast.warning("Root Container Name and Reference ID are required.");
            return;
        }

        try {
            const newRef = doc(collection(db, 'content_containers'));
            const payload: ContentContainer = {
                id: newRef.id,
                title: rootTitle.trim(),
                referenceId: rootRefId.trim(),
                framework: rootFramework,
                accreditationBody: (rootFramework === 'qcto' ? 'qcto' : 'secam') as AccreditationBody,
                ...(rootFramework === 'qcto' && rootTemplateId ? { programmeTemplateId: rootTemplateId } : {}),
                createdAt: new Date().toISOString()
            };

            await setDoc(newRef, payload);
            setActiveFramework(rootFramework);
            setSelectedContainerId(newRef.id);
            toast.success(`Root Content "${rootTitle}" created successfully!`);
        } catch (err) {
            console.error("Error creating root container:", err);
            toast.error("Failed to create root content container.");
        } finally {
            setShowRootModal(false);
            setRootTitle('');
            setRootRefId('');
            setRootTemplateId('');
        }
    };

    const handleDeleteUnit = (unitId: string) => {
        setStatusModal({
            isOpen: true,
            type: 'warning',
            title: 'Delete Learning Unit',
            message: 'Are you sure you want to delete this learning unit? This action cannot be undone.',
            confirmText: 'Yes, Delete',
            cancelText: 'Cancel',
            onConfirm: () => {
                setStatusModal(prev => ({ ...prev, isOpen: false }));
                setDeletingUnitIds(prev => new Set(prev).add(unitId));

                setTimeout(async () => {
                    try {
                        await deleteLearningUnit(unitId);
                        setUnits(prev => prev.filter(u => u.id !== unitId));
                        toast.success("Learning unit deleted.");
                    } catch (err) {
                        toast.error("Failed to delete unit.");
                    } finally {
                        setDeletingUnitIds(prev => {
                            const next = new Set(prev);
                            next.delete(unitId);
                            return next;
                        });
                    }
                }, 320);
            }
        });
    };

    const handleDeleteSprintGroup = (sprintName: string) => {
        setStatusModal({
            isOpen: true,
            type: 'warning',
            title: `Delete Sprint: ${sprintName}`,
            message: `Are you sure you want to delete "${sprintName}" and all of its contained lessons? This action cannot be undone.`,
            confirmText: 'Yes, Delete Sprint',
            cancelText: 'Cancel',
            onConfirm: () => {
                setStatusModal(prev => ({ ...prev, isOpen: false }));
                const unitsToDelete = units.filter(u =>
                    (selectedContainerId === 'all' || u.containerId === selectedContainerId) && u.sprintTitle === sprintName
                );

                setDeletingUnitIds(prev => {
                    const next = new Set(prev);
                    unitsToDelete.forEach(u => next.add(u.id));
                    return next;
                });

                setTimeout(async () => {
                    try {
                        for (const u of unitsToDelete) {
                            await deleteLearningUnit(u.id);
                        }

                        if (activeContainer?.id && activeContainer.id !== 'all') {
                            const currentMeta = activeContainer.checkpointMetadata || {};
                            const currentSecamStructure = currentMeta.secamStructure || [];
                            const updatedSecamStructure = currentSecamStructure.filter(s => s.title !== sprintName);

                            const containerRef = doc(db, 'content_containers', activeContainer.id);
                            await updateDoc(containerRef, {
                                'checkpointMetadata.secamStructure': updatedSecamStructure,
                                updatedAt: serverTimestamp()
                            }).catch(async () => {
                                await setDoc(containerRef, { checkpointMetadata: { ...currentMeta, secamStructure: updatedSecamStructure }, updatedAt: new Date().toISOString() }, { merge: true });
                            });
                        }

                        setUnits(prev => prev.filter(u => !(unitsToDelete.some(del => del.id === u.id))));
                        toast.success(`Deleted "${sprintName}" and all its lessons.`);
                    } catch (err) {
                        console.error("Error deleting sprint group:", err);
                        toast.error(`Failed to delete "${sprintName}".`);
                    } finally {
                        setDeletingUnitIds(prev => {
                            const next = new Set(prev);
                            unitsToDelete.forEach(u => next.delete(u.id));
                            return next;
                        });
                    }
                }, 320);
            }
        });
    };

    const handleDeleteModuleGroup = (moduleCode: string) => {
        setStatusModal({
            isOpen: true,
            type: 'warning',
            title: `Delete Module: ${moduleCode}`,
            message: `Are you sure you want to delete module "${moduleCode}" and all of its contained lessons? This action cannot be undone.`,
            confirmText: 'Yes, Delete Module',
            cancelText: 'Cancel',
            onConfirm: () => {
                setStatusModal(prev => ({ ...prev, isOpen: false }));
                const unitsToDelete = units.filter(u =>
                    (selectedContainerId === 'all' || u.containerId === selectedContainerId) && u.moduleCode === moduleCode
                );

                setDeletingUnitIds(prev => {
                    const next = new Set(prev);
                    unitsToDelete.forEach(u => next.add(u.id));
                    return next;
                });

                setTimeout(async () => {
                    try {
                        for (const u of unitsToDelete) {
                            await deleteLearningUnit(u.id);
                        }

                        setUnits(prev => prev.filter(u => !(unitsToDelete.some(del => del.id === u.id))));
                        toast.success(`Deleted module "${moduleCode}" and its lessons.`);
                    } catch (err) {
                        console.error("Error deleting module group:", err);
                        toast.error(`Failed to delete module "${moduleCode}".`);
                    } finally {
                        setDeletingUnitIds(prev => {
                            const next = new Set(prev);
                            unitsToDelete.forEach(u => next.delete(u.id));
                            return next;
                        });
                    }
                }, 320);
            }
        });
    };

    const toggleType = (key: string) => {
        setExpandedTypes(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const toggleModule = (id: string) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleTopic = (id: string) => {
        setExpandedTopics(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const contentTree = useMemo(() => {
        const filtered = selectedContainerId === 'all'
            ? units
            : units.filter(u => u.containerId === selectedContainerId);

        const searched = searchTerm.trim()
            ? filtered.filter(u =>
                u.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (u.moduleCode && u.moduleCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (u.sprintTitle && u.sprintTitle.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (u.containerName && u.containerName.toLowerCase().includes(searchTerm.toLowerCase()))
            )
            : filtered;

        if (!activeContainer) return {};

        const rootHeaderKey = activeContainer.referenceId === 'GLOBAL-FRAMEWORK-VIEW'
            ? activeContainer.title
            : `${activeContainer.title} [Ref ID: ${activeContainer.referenceId}]`;

        const tree: Record<string, Record<string, Record<string, Record<string, ExtendedLearningUnit[]>>>> = {
            [rootHeaderKey]: {}
        };

        searched.forEach(unit => {
            if (activeFramework === 'qcto') {
                let typeKey = 'Knowledge Modules (KM)';
                if (unit.moduleType === 'practical') typeKey = 'Practical Skill Modules (PM)';
                else if (unit.moduleType === 'workplace') typeKey = 'Work Experience Modules (WM)';

                if (!tree[rootHeaderKey][typeKey]) tree[rootHeaderKey][typeKey] = {};

                const modKey = unit.moduleCode || 'Unassigned Module';
                if (!tree[rootHeaderKey][typeKey][modKey]) tree[rootHeaderKey][typeKey][modKey] = {};

                const topKey = unit.topicId || 'General Logbook Topics';
                if (!tree[rootHeaderKey][typeKey][modKey][topKey]) tree[rootHeaderKey][typeKey][modKey][topKey] = [];

                (tree[rootHeaderKey][typeKey][modKey][topKey] as unknown as ExtendedLearningUnit[]).push(unit);
            } else {
                const sprintKey = unit.sprintTitle || 'Unassigned Sprint';
                if (!tree[rootHeaderKey][sprintKey]) tree[rootHeaderKey][sprintKey] = {};

                const dayKey = unit.dayOrLessonTitle || 'General Lessons';
                if (!tree[rootHeaderKey][sprintKey][dayKey]) tree[rootHeaderKey][sprintKey][dayKey] = {};

                if (!tree[rootHeaderKey][sprintKey][dayKey]['_units']) {
                    (tree[rootHeaderKey][sprintKey][dayKey]['_units'] as unknown as ExtendedLearningUnit[]) = [];
                }

                (tree[rootHeaderKey][sprintKey][dayKey]['_units'] as unknown as ExtendedLearningUnit[]).push(unit);
            }
        });

        if (expandedModules.size === 0) {
            Object.values(tree[rootHeaderKey] || {}).forEach((mods) => {
                Object.keys(mods).forEach(mKey => expandedModules.add(mKey));
            });
        }
        if (expandedTopics.size === 0) {
            Object.values(tree[rootHeaderKey] || {}).forEach((mods) => {
                Object.values(mods).forEach((tops) => {
                    Object.keys(tops).forEach(tKey => expandedTopics.add(tKey));
                });
            });
        }

        return tree;
    }, [units, selectedContainerId, activeContainer, activeFramework, searchTerm]);

    const getTypeColor = (typeLabel: string) => {
        if (typeLabel.includes('Knowledge')) return { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' };
        if (typeLabel.includes('Practical')) return { bg: '#f3e8ff', text: '#6d28d9', border: '#e9d5ff' };
        if (typeLabel.includes('Work Experience')) return { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' };
        return { bg: '#f0f9ff', text: '#0284c7', border: '#bae6fd' };
    };

    const calculateTimeLabel = (unitList: ExtendedLearningUnit[]) => {
        const totalMins = unitList.reduce((acc, u) => acc + (Number(u.estimatedMinutes) || 0), 0);
        if (totalMins >= 60) {
            const hrs = Math.round((totalMins / 60) * 10) / 10;
            return `${hrs}h (${totalMins} mins)`;
        }
        return `${totalMins} mins`;
    };

    if ((showPackageAnalytics || analyticsUnit) && activeContainer) {
        return (
            <CurriculumAnalyticsDashboard
                container={activeContainer as ContentContainer}
                units={selectedContainerId === 'all' ? units : units.filter(u => u.containerId === selectedContainerId)}
                initialLesson={analyticsUnit}
                initialCohortId={selectedAnalyticsCohortId}
                onClose={() => {
                    setShowPackageAnalytics(false);
                    setAnalyticsUnit(null);
                    setSelectedAnalyticsCohortId(null);
                }}
                onSelectLesson={(u) => setAnalyticsUnit(u)}
            />
        );
    }

    return (
        <div className="mlab-staff animate-fade-in" style={{ padding: '1.5rem', background: 'var(--mlab-bg, #f8fafc)' }}>

            {statusModal.isOpen && createPortal(
                <StatusModal
                    type={statusModal.type}
                    title={statusModal.title}
                    message={statusModal.message}
                    confirmText={statusModal.confirmText}
                    cancelText={statusModal.cancelText}
                    onClose={() => {
                        if (statusModal.onConfirm) statusModal.onConfirm();
                        else setStatusModal(prev => ({ ...prev, isOpen: false }));
                    }}
                    onCancel={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
                />,
                document.body
            )}

            <div className="qcto-card" style={{ marginBottom: '1rem' }}>
                <div className="qcto-hdr" style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <PlayCircle size={22} color="var(--mlab-green)" />
                        <span style={{ fontSize: '1.05rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Content Authoring Studio</span>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Tooltip content="Create a new root content container to group units and modules." placement="left">
                            <button
                                type="button"
                                className="lfm-btn lfm-btn--ghost"
                                style={{ background: 'white', color: 'var(--mlab-blue)', borderColor: 'var(--mlab-border)' }}
                                onClick={handleOpenRootModal}
                            >
                                <FolderPlus size={15} /> New Root Package
                            </button>
                        </Tooltip>
                    </div>
                </div>

                <div style={{ padding: '1.25rem', background: 'var(--mlab-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderTop: '1px solid var(--mlab-border)' }}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-grey)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            Active {activeFramework.toUpperCase()} Package:
                        </span>
                        <Tooltip content="Select a specific package or view all packages globally." placement="top">
                            <select
                                className="pfm-input"
                                value={selectedContainerId}
                                onChange={e => setSelectedContainerId(e.target.value)}
                                disabled={loadingContainers || filteredContainers.length === 0}
                                style={{ minWidth: '320px', fontWeight: 700, color: 'var(--mlab-blue)' }}
                            >
                                <option value="all">🌍 All {activeFramework.toUpperCase()} Packages (Global View)</option>
                                {filteredContainers.map((c: EnrichedContentContainer) => (
                                    <option key={c.id} value={c.id}>
                                        {c.title} [{c.referenceId}]
                                    </option>
                                ))}
                            </select>
                        </Tooltip>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'inline-flex', border: '1px solid var(--mlab-border)', padding: '2px', background: 'var(--mlab-bg)' }}>
                            <Tooltip content="Switch to QCTO occupational qualifications." placement="top">
                                <button
                                    type="button"
                                    onClick={() => handleFrameworkChange('qcto')}
                                    style={{
                                        padding: '6px 14px',
                                        border: 'none',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        fontFamily: 'var(--font-heading)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        textTransform: 'uppercase',
                                        background: activeFramework === 'qcto' ? 'var(--mlab-blue)' : 'transparent',
                                        color: activeFramework === 'qcto' ? 'white' : 'var(--mlab-grey)'
                                    }}
                                >
                                    <GraduationCap size={14} /> QCTO Packages
                                </button>
                            </Tooltip>
                            <Tooltip content="Switch to SECAM Agile bootcamp tracks." placement="top">
                                <button
                                    type="button"
                                    onClick={() => handleFrameworkChange('secam')}
                                    style={{
                                        padding: '6px 14px',
                                        border: 'none',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        fontFamily: 'var(--font-heading)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        textTransform: 'uppercase',
                                        background: activeFramework === 'secam' ? 'var(--mlab-blue)' : 'transparent',
                                        color: activeFramework === 'secam' ? 'white' : 'var(--mlab-grey)'
                                    }}
                                >
                                    <Zap size={14} /> SECAM Bootcamp
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                </div>

                {activeContainer && selectedContainerId !== 'all' && (
                    <div style={{ padding: '10px 1.25rem', background: '#f0f9ff', borderTop: '1px solid #bae6fd', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', fontSize: '0.78rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0369a1', fontWeight: 700 }}>
                                <Award size={15} color="#0284c7" />
                                <span>Accreditation: <strong>{(activeContainer.defaultAccreditation?.body || activeContainer.accreditationBody || 'qcto').toUpperCase().replace('_', ' ')}</strong></span>
                                {activeContainer.defaultAccreditation?.saqaId && <span style={{ opacity: 0.8 }}>• SAQA ID: <strong>{activeContainer.defaultAccreditation.saqaId}</strong></span>}
                                {activeContainer.defaultAccreditation?.nqfLevel && <span style={{ opacity: 0.8 }}>• NQF {activeContainer.defaultAccreditation.nqfLevel}</span>}
                            </div>

                            <span style={{ color: '#cbd5e1' }}>|</span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0369a1', fontWeight: 700 }}>
                                <Clock size={15} color="#0284c7" />
                                <span>
                                    Workload: <strong>
                                        {activeContainer.courseworkHours && activeContainer.courseworkHours > 0 ? (
                                            <>{activeContainer.contentHours || Math.round(units.reduce((acc, u) => acc + (u.estimatedMinutes || 0), 0) / 60)}h lessons + {activeContainer.courseworkHours}h projects ({activeContainer.estimatedTotalHours || 0}h total)</>
                                        ) : (
                                            <>{activeContainer.estimatedTotalHours || Math.round(units.reduce((acc, u) => acc + (u.estimatedMinutes || 0), 0) / 60)} Hours Total</>
                                        )}
                                    </strong>
                                </span>
                            </div>

                            <span style={{ color: '#cbd5e1' }}>|</span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0369a1', fontWeight: 700 }}>
                                <Calendar size={15} color="#0284c7" />
                                {(activeContainer.defaultTimeBoundConfig?.isTimeBound || activeContainer.timeBoundConfig?.isTimeBound) ? (
                                    <span>Default Window: <strong>{activeContainer.defaultTimeBoundConfig?.startDate || activeContainer.timeBoundConfig?.startDate || 'Start TBD'}</strong> → <strong>{activeContainer.defaultTimeBoundConfig?.endDate || activeContainer.timeBoundConfig?.endDate || 'End TBD'}</strong></span>
                                ) : (
                                    <span style={{ color: '#64748b' }}>Schedule: <strong>Self-Paced / Flexible Blueprint</strong></span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <Tooltip content="Total root packages created across all frameworks." placement="top">
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderTop: '3px solid #0284c7', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Package size={14} /> Total Root Packages
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)' }}>
                            {catalogStats.totalPackages}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                            Across all frameworks
                        </div>
                    </div>
                </Tooltip>

                <Tooltip content="Total SECAM Agile Bootcamp packages authored." placement="top">
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderTop: '3px solid #6366f1', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Zap size={14} /> SECAM Bootcamps
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)' }}>
                            {catalogStats.secamPackages}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                            Agile Sprint Programs
                        </div>
                    </div>
                </Tooltip>

                <Tooltip content="Total QCTO qualification packages registered." placement="top">
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderTop: '3px solid #16a34a', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <GraduationCap size={14} /> QCTO Qualifications
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)' }}>
                            {catalogStats.qctoPackages}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                            Structured SETA Curricula
                        </div>
                    </div>
                </Tooltip>

                <Tooltip content="Total individual learning units built inside this framework view." placement="top">
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderTop: '3px solid #7c3aed', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Layers size={14} /> Authored Units
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)' }}>
                            {catalogStats.totalUnitsCount}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                            Active Learning Lessons
                        </div>
                    </div>
                </Tooltip>

                <Tooltip content="Sum of estimated learning time across all authored lessons." placement="top">
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderTop: '3px solid #f59e0b', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={14} /> Total Curriculum Hours
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)' }}>
                            {catalogStats.totalNotionalHours}h
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                            Estimated Learning Content
                        </div>
                    </div>
                </Tooltip>
            </div>

            <div className="qcto-card" style={{ padding: '12px 16px', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--mlab-border)', background: 'var(--mlab-white)', padding: '0 10px' }}>
                    <Search size={16} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        className="pfm-input"
                        placeholder={`Search ${activeFramework.toUpperCase()} units by lesson title, sprint, or module...`}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ border: 'none', flex: 1, height: '36px' }}
                    />
                </div>
            </div>

            <div className="qcto-card">
                <div className="qcto-hdr" style={{ fontSize: '0.78rem' }}>
                    <span>{activeContainer?.title || 'Package Hierarchy'} [{activeFramework.toUpperCase()}]</span>
                    <span>{units.length} UNITS</span>
                </div>

                <div className="mlab-table-wrap">
                    <table className="mlab-table">
                        <thead style={{ background: 'var(--mlab-light-blue)' }}>
                            <tr>
                                <th style={{ width: '80px', color: 'var(--mlab-grey)' }}>Order</th>
                                <th style={{ color: 'var(--mlab-grey)' }}>Lesson Title</th>
                                <th style={{ color: 'var(--mlab-grey)' }}>Topic / Day Specification</th>
                                <th style={{ color: 'var(--mlab-grey)' }}>Unit Format</th>
                                <th style={{ color: 'var(--mlab-grey)' }}>Verification Check</th>
                                <th style={{ textAlign: 'right', color: 'var(--mlab-grey)' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingContainers || loadingUnits ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                                        <div className="ap-spinner" style={{ margin: '0 auto 10px' }} />
                                        <span style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '0.8rem' }}>Loading Content Engine...</span>
                                    </td>
                                </tr>
                            ) : !activeContainer ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--mlab-grey)' }}>
                                        <FolderPlus size={36} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                        <p style={{ margin: '0 0 12px 0', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                            No {activeFramework.toUpperCase()} Root Content Packages Provisioned
                                        </p>
                                        <Tooltip content="Provision your first package to start authoring." placement="top">
                                            <button className="lfm-btn lfm-btn--green" onClick={handleOpenRootModal}>
                                                <FolderPlus size={14} /> Provision First {activeFramework.toUpperCase()} Package
                                            </button>
                                        </Tooltip>
                                    </td>
                                </tr>
                            ) : Object.keys(contentTree).length === 0 || units.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--mlab-grey)' }}>
                                        <BookOpen size={36} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                        <p style={{ margin: '0 0 12px 0' }}>No learning units authored for "{activeContainer.title}".</p>
                                        {selectedContainerId !== 'all' && (
                                            <Tooltip content="Open authoring modal to build modules and lessons." placement="top">
                                                <button className="lfm-btn lfm-btn--green" onClick={() => setShowBuilder(true)}>
                                                    <Layers size={14} /> Author Learning Units
                                                </button>
                                            </Tooltip>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                Object.entries(contentTree).map(([rootContainerHeader, subMap]) => {
                                    const isContainerExpanded = true;

                                    return (
                                        <React.Fragment key={rootContainerHeader}>
                                            <tr style={{ userSelect: 'none', cursor: 'default' }}>
                                                <th
                                                    colSpan={6}
                                                    style={{
                                                        padding: '12px 18px',
                                                        background: 'var(--mlab-blue)',
                                                        color: 'white',
                                                        borderBottom: '3px solid var(--mlab-green)',
                                                        textAlign: 'left',
                                                        fontWeight: 'normal'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                                                                <CourseIllustrationGraphic
                                                                    type={activeContainer.illustrationType || 'code'}
                                                                    themeColor={activeContainer.themeColor}
                                                                    framework={activeFramework}
                                                                    size={20}
                                                                />
                                                            </div>
                                                            <strong style={{ fontSize: '0.9rem', letterSpacing: '0.03em', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'white' }}>
                                                                {rootContainerHeader}
                                                            </strong>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            {selectedContainerId !== 'all' && (
                                                                <Tooltip content="Open the interactive curriculum builder modal." placement="top">
                                                                    <button
                                                                        type="button"
                                                                        className="lfm-btn lfm-btn--green"
                                                                        style={{ padding: '4px 10px', height: '28px', fontSize: '0.72rem' }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setShowBuilder(true);
                                                                        }}
                                                                    >
                                                                        <Layers size={13} /> Edit Curriculum
                                                                    </button>
                                                                </Tooltip>
                                                            )}

                                                            {selectedContainerId !== 'all' && (
                                                                <Tooltip content="Manage delivery timelines and intake batches for this package." placement="top">
                                                                    <button
                                                                        type="button"
                                                                        className="lfm-btn"
                                                                        style={{ padding: '4px 10px', height: '28px', fontSize: '0.72rem', background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setShowRunsDrawer(true);
                                                                        }}
                                                                    >
                                                                        <Calendar size={13} /> Manage Timelines
                                                                    </button>
                                                                </Tooltip>
                                                            )}

                                                            <Tooltip content="Open overall learner performance and completion stats." placement="top">
                                                                <button
                                                                    type="button"
                                                                    className="lfm-btn lfm-btn--ghost"
                                                                    style={{ padding: '4px 10px', height: '28px', fontSize: '0.72rem', background: 'white', color: 'var(--mlab-blue)' }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setShowPackageAnalytics(true);
                                                                    }}
                                                                >
                                                                    <BarChart3 size={13} /> Detailed Analytics
                                                                </button>
                                                            </Tooltip>
                                                        </div>
                                                    </div>
                                                </th>
                                            </tr>

                                            {activeFramework === 'qcto' ? (
                                                isContainerExpanded && Object.entries(subMap).map(([typeLabel, modulesMap]) => {
                                                    const isTypeExpanded = expandedTypes.has(typeLabel) || true;
                                                    const colors = getTypeColor(typeLabel);

                                                    return (
                                                        <React.Fragment key={typeLabel}>
                                                            <tr
                                                                className="row-animate-in"
                                                                style={{ background: colors.bg, borderTop: `1px solid ${colors.border}`, cursor: 'pointer' }}
                                                                onClick={() => toggleType(typeLabel)}
                                                            >
                                                                <td colSpan={6} style={{ padding: '10px 18px 10px 28px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            {typeLabel.includes('Work') ? <Briefcase size={16} color={colors.text} /> : typeLabel.includes('Practical') ? <Award size={16} color={colors.text} /> : <BookOpen size={16} color={colors.text} />}
                                                                            <strong style={{ color: colors.text, fontSize: '0.82rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                                                {typeLabel}
                                                                            </strong>
                                                                        </div>
                                                                        <ChevronDown size={16} color={colors.text} className={`chevron-rotate ${isTypeExpanded ? 'expanded' : ''}`} />
                                                                    </div>
                                                                </td>
                                                            </tr>

                                                            {isTypeExpanded && Object.entries(modulesMap as unknown as Record<string, Record<string, ExtendedLearningUnit[]>>)
                                                                .sort(([aKey], [bKey]) => aKey.localeCompare(bKey, undefined, { numeric: true, sensitivity: 'base' }))
                                                                .map(([modName, topicsMap]) => {
                                                                    const isModExpanded = expandedModules.has(modName);
                                                                    const moduleUnits = units.filter(u => (selectedContainerId === 'all' || u.containerId === selectedContainerId) && u.moduleCode === modName);
                                                                    const moduleDurationStr = calculateTimeLabel(moduleUnits);

                                                                    return (
                                                                        <React.Fragment key={modName}>
                                                                            <tr className="row-animate-in" style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => toggleModule(modName)}>
                                                                                <td colSpan={6} style={{ padding: '8px 18px 8px 44px' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                            <FolderOpen size={15} color="var(--mlab-blue)" />
                                                                                            <strong style={{ color: 'var(--mlab-blue)', fontSize: '0.8rem', fontFamily: 'var(--font-heading)' }}>{modName}</strong>
                                                                                            <span style={{ fontSize: '0.68rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 8px', fontWeight: 800, fontFamily: 'var(--font-heading)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                                                <Clock size={11} /> {moduleDurationStr} • {moduleUnits.length} lessons
                                                                                            </span>
                                                                                        </div>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                            <Tooltip content="Delete this module group and all its units." placement="top">
                                                                                                <button
                                                                                                    type="button"
                                                                                                    className="lfm-btn"
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        handleDeleteModuleGroup(modName);
                                                                                                    }}
                                                                                                    style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', padding: '3px 8px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                                                >
                                                                                                    <Trash2 size={12} /> Delete Module
                                                                                                </button>
                                                                                            </Tooltip>
                                                                                            <ChevronDown size={14} color="#64748b" className={`chevron-rotate ${isModExpanded ? 'expanded' : ''}`} />
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>

                                                                            {isModExpanded && Object.entries(topicsMap)
                                                                                .sort(([aKey], [bKey]) => aKey.localeCompare(bKey, undefined, { numeric: true, sensitivity: 'base' }))
                                                                                .map(([topName, topicUnits]) => {
                                                                                    const isTopExpanded = expandedTopics.has(topName);

                                                                                    return (
                                                                                        <React.Fragment key={topName}>
                                                                                            <tr className="row-animate-in" style={{ background: '#ffffff', borderTop: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => toggleTopic(topName)}>
                                                                                                <td colSpan={6} style={{ padding: '6px 18px 6px 60px' }}>
                                                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                                            <Bookmark size={13} color="#0284c7" />
                                                                                                            <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.78rem' }}>{topName}</span>
                                                                                                        </div>
                                                                                                        <ChevronDown size={13} color="#94a3b8" className={`chevron-rotate ${isTopExpanded ? 'expanded' : ''}`} />
                                                                                                    </div>
                                                                                                </td>
                                                                                            </tr>

                                                                                            {isTopExpanded && (topicUnits as ExtendedLearningUnit[])
                                                                                                .slice()
                                                                                                .sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0))
                                                                                                .map((unit) => {
                                                                                                    const ic = unit.interactiveCheck;
                                                                                                    const isDeleting = deletingUnitIds.has(unit.id);
                                                                                                    return (
                                                                                                        <tr key={unit.id} className={isDeleting ? 'row-animate-out' : 'row-animate-in'} style={{ background: '#f8fafc', borderLeft: '4px solid #38bdf8' }}>
                                                                                                            <td style={{ paddingLeft: '80px' }}>
                                                                                                                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, color: '#64748b', fontSize: '0.78rem' }}>#{unit.orderIndex}</span>
                                                                                                            </td>
                                                                                                            <td><strong>{unit.title}</strong></td>
                                                                                                            <td><span style={{ fontSize: '0.75rem', color: '#475569' }}>{unit.topicId}</span></td>
                                                                                                            <td><span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>{unit.unitType}</span></td>
                                                                                                            <td>
                                                                                                                {ic?.checkType === 'socratic_dialogue' && (
                                                                                                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#b45309', background: '#fffbeb', padding: '2px 8px', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
                                                                                                                        <Bot size={11} /> Socratic AI Chat
                                                                                                                    </span>
                                                                                                                )}
                                                                                                                {ic?.checkType === 'oral_defense' && (
                                                                                                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6d28d9', background: '#f3e8ff', padding: '2px 8px', border: '1px solid #e9d5ff', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
                                                                                                                        <Sparkles size={11} /> AI Oral Defense
                                                                                                                    </span>
                                                                                                                )}
                                                                                                                {ic?.checkType === 'spot_the_bug' && (
                                                                                                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#be123c', background: '#fff1f2', padding: '2px 8px', border: '1px solid #fecdd3', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
                                                                                                                        <Bug size={11} /> Spot-the-Bug
                                                                                                                    </span>
                                                                                                                )}
                                                                                                                {(!ic || ic.checkType === 'none') && (
                                                                                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>None</span>
                                                                                                                )}
                                                                                                            </td>
                                                                                                            <td style={{ textAlign: 'right' }}>
                                                                                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                                                                                    <Tooltip content="Inspect unit submissions and completion stats." placement="top">
                                                                                                                        <button
                                                                                                                            type="button"
                                                                                                                            onClick={(e) => {
                                                                                                                                e.stopPropagation();
                                                                                                                                setAnalyticsUnit(unit);
                                                                                                                            }}
                                                                                                                            className="lfm-btn lfm-btn--ghost"
                                                                                                                            style={{ padding: '3px 8px', fontSize: '0.68rem' }}
                                                                                                                        >
                                                                                                                            <BarChart3 size={12} /> Lesson Analytics
                                                                                                                        </button>
                                                                                                                    </Tooltip>
                                                                                                                    <Tooltip content="Delete this single lesson unit." placement="top">
                                                                                                                        <button type="button" onClick={() => handleDeleteUnit(unit.id)} className="lfm-btn" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', padding: '3px 8px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
                                                                                                                            <Trash2 size={12} />
                                                                                                                        </button>
                                                                                                                    </Tooltip>
                                                                                                                </div>
                                                                                                            </td>
                                                                                                        </tr>
                                                                                                    );
                                                                                                })
                                                                                            }
                                                                                        </React.Fragment>
                                                                                    );
                                                                                })
                                                                            }
                                                                        </React.Fragment>
                                                                    );
                                                                })
                                                            }
                                                        </React.Fragment>
                                                    );
                                                })
                                            ) : (
                                                /* SECAM Framework Mapping */
                                                isContainerExpanded && Object.entries(subMap)
                                                    .sort(([aKey], [bKey]) => aKey.localeCompare(bKey, undefined, { numeric: true, sensitivity: 'base' }))
                                                    .map(([sprintName, daysMap]) => {
                                                        const isModExpanded = expandedModules.has(sprintName);
                                                        const sprintUnits = units.filter(u => (selectedContainerId === 'all' || u.containerId === selectedContainerId) && u.sprintTitle === sprintName);
                                                        const sprintDurationStr = calculateTimeLabel(sprintUnits);

                                                        return (
                                                            <React.Fragment key={sprintName}>
                                                                <tr className="row-animate-in" style={{ background: '#f0f9ff', borderTop: '1px solid #bae6fd', cursor: 'pointer' }} onClick={() => toggleModule(sprintName)}>
                                                                    <td colSpan={6} style={{ padding: '10px 18px 10px 28px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                <Zap size={16} color="#0284c7" />
                                                                                <strong style={{ color: '#0369a1', fontSize: '0.85rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                                                    {sprintName}
                                                                                </strong>

                                                                                <span style={{ fontSize: '0.68rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 8px', fontWeight: 800, fontFamily: 'var(--font-heading)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <Clock size={11} /> {sprintDurationStr} • {sprintUnits.length} lessons
                                                                                </span>
                                                                            </div>

                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                <Tooltip content="Delete this entire sprint and all contained lessons." placement="top">
                                                                                    <button
                                                                                        type="button"
                                                                                        className="lfm-btn"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleDeleteSprintGroup(sprintName);
                                                                                        }}
                                                                                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', padding: '3px 8px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                                    >
                                                                                        <Trash2 size={12} /> Delete Sprint
                                                                                    </button>
                                                                                </Tooltip>
                                                                                <ChevronDown size={16} color="#0284c7" className={`chevron-rotate ${isModExpanded ? 'expanded' : ''}`} />
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>

                                                                {/* Day Iteration */}
                                                                {isModExpanded && Object.entries(daysMap as unknown as Record<string, { _units?: ExtendedLearningUnit[] }>)
                                                                    .sort(([aKey], [bKey]) => aKey.localeCompare(bKey, undefined, { numeric: true, sensitivity: 'base' }))
                                                                    .map(([dayName, unitObj]) => {
                                                                        const isTopExpanded = expandedTopics.has(dayName);
                                                                        const dayUnits = unitObj._units || [];
                                                                        const dayDurationStr = calculateTimeLabel(dayUnits);

                                                                        return (
                                                                            <React.Fragment key={dayName}>
                                                                                <tr className="row-animate-in" style={{ background: '#ffffff', borderTop: '1px solid #e0f2fe', cursor: 'pointer' }} onClick={() => toggleTopic(dayName)}>
                                                                                    <td colSpan={6} style={{ padding: '6px 18px 6px 44px' }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                                <Bookmark size={13} color="#0284c7" />
                                                                                                <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.78rem' }}>{dayName}</span>
                                                                                                <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '1px 6px', color: '#64748b' }}>
                                                                                                    {dayDurationStr} • {dayUnits.length} Lessons
                                                                                                </span>
                                                                                            </div>
                                                                                            <ChevronDown size={13} color="#94a3b8" className={`chevron-rotate ${isTopExpanded ? 'expanded' : ''}`} />
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>

                                                                                {/* Lesson Iteration */}
                                                                                {isTopExpanded && dayUnits
                                                                                    .slice()
                                                                                    .sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0))
                                                                                    .map((unit) => {
                                                                                        const ic = unit.interactiveCheck;
                                                                                        const isDeleting = deletingUnitIds.has(unit.id);
                                                                                        return (
                                                                                            <tr key={unit.id} className={isDeleting ? 'row-animate-out' : 'row-animate-in'} style={{ background: '#f8fafc', borderLeft: '4px solid #0284c7' }}>
                                                                                                <td style={{ paddingLeft: '64px' }}>
                                                                                                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, color: '#64748b', fontSize: '0.78rem' }}>#{unit.orderIndex}</span>
                                                                                                </td>
                                                                                                <td>
                                                                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                                                        <strong style={{ color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{unit.title}</strong>
                                                                                                        <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                                                                            <Clock size={10} /> ~{unit.estimatedMinutes} Mins {unit.isRequired && '• Mandatory'}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td><span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>{unit.dayOrLessonTitle}</span></td>
                                                                                                <td>
                                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, color: '#0284c7', fontFamily: 'var(--font-heading)' }}>
                                                                                                        {unit.unitType === 'video' && <Video size={12} />}
                                                                                                        {unit.unitType === 'reading' && <FileText size={12} />}
                                                                                                        {unit.unitType === 'interactive_code' && <Code size={12} />}
                                                                                                        {unit.unitType}
                                                                                                    </span>
                                                                                                </td>
                                                                                                <td>
                                                                                                    {ic?.checkType === 'socratic_dialogue' && (
                                                                                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#b45309', background: '#fffbeb', padding: '2px 8px', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
                                                                                                            <Bot size={11} /> Socratic AI Chat
                                                                                                        </span>
                                                                                                    )}
                                                                                                    {ic?.checkType === 'oral_defense' && (
                                                                                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6d28d9', background: '#f3e8ff', padding: '2px 8px', border: '1px solid #e9d5ff', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
                                                                                                            <Sparkles size={11} /> AI Oral Defense
                                                                                                        </span>
                                                                                                    )}
                                                                                                    {ic?.checkType === 'spot_the_bug' && (
                                                                                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#be123c', background: '#fff1f2', padding: '2px 8px', border: '1px solid #fecdd3', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
                                                                                                            <Bug size={11} /> Spot-the-Bug
                                                                                                        </span>
                                                                                                    )}
                                                                                                    {(!ic || ic.checkType === 'none') && (
                                                                                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>None</span>
                                                                                                    )}
                                                                                                </td>
                                                                                                <td style={{ textAlign: 'right' }}>
                                                                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                                                                        <Tooltip content="Inspect unit submissions and completion stats." placement="top">
                                                                                                            <button
                                                                                                                type="button"
                                                                                                                onClick={(e) => {
                                                                                                                    e.stopPropagation();
                                                                                                                    setAnalyticsUnit(unit);
                                                                                                                }}
                                                                                                                className="lfm-btn lfm-btn--ghost"
                                                                                                                style={{ padding: '3px 8px', fontSize: '0.68rem' }}
                                                                                                            >
                                                                                                                <BarChart3 size={12} /> Lesson Analytics
                                                                                                            </button>
                                                                                                        </Tooltip>
                                                                                                        <Tooltip content="Delete this single lesson unit." placement="top">
                                                                                                            <button type="button" onClick={() => handleDeleteUnit(unit.id)} className="lfm-btn" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', padding: '3px 8px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
                                                                                                                <Trash2 size={12} />
                                                                                                            </button>
                                                                                                        </Tooltip>
                                                                                                    </div>
                                                                                                </td>
                                                                                            </tr>
                                                                                        );
                                                                                    })
                                                                                }
                                                                            </React.Fragment>
                                                                        );
                                                                    })
                                                                }
                                                            </React.Fragment>
                                                        );
                                                    })
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL 1: NEW ROOT CONTAINER CREATION MODAL */}
            {showRootModal && createPortal(
                <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '0px', overflow: 'hidden' }}>
                        <div className="lfm-header" style={{ flexShrink: 0, borderRadius: '0px' }}>
                            <h2 className="lfm-header__title">
                                <FolderPlus size={18} /> Provision New Root Content Package
                            </h2>
                            <button className="lfm-close-btn" onClick={() => setShowRootModal(false)}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSaveRootContainer} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
                            <div className="lfm-body" style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0, padding: '20px' }}>
                                <div className="lfm-section-hdr"><Building2 size={13} /> Framework Target</div>

                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: rootFramework === 'secam' ? '#0284c7' : '#64748b', background: rootFramework === 'secam' ? '#e0f2fe' : '#f8fafc', padding: '10px 16px', borderRadius: '0px', border: `1px solid ${rootFramework === 'secam' ? '#bae6fd' : '#cbd5e1'}`, flex: 1 }}>
                                        <input type="radio" name="rootFramework" value="secam" checked={rootFramework === 'secam'} onChange={() => setRootFramework('secam')} />
                                        <Zap size={16} color="#0284c7" /> SECAM Bootcamp (CodeTribe)
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: rootFramework === 'qcto' ? '#15803d' : '#64748b', background: rootFramework === 'qcto' ? '#dcfce7' : '#f8fafc', padding: '10px 16px', borderRadius: '0px', border: `1px solid ${rootFramework === 'qcto' ? '#bbf7d0' : '#cbd5e1'}`, flex: 1 }}>
                                        <input type="radio" name="rootFramework" value="qcto" checked={rootFramework === 'qcto'} onChange={() => setRootFramework('qcto')} />
                                        <GraduationCap size={16} color="#15803d" /> QCTO Qualification
                                    </label>
                                </div>

                                <div className="lfm-grid">
                                    <div className="lfm-fg lfm-fg--full">
                                        <label>Root Content Package Name *</label>
                                        <input
                                            className="lfm-input"
                                            required
                                            value={rootTitle}
                                            onChange={e => setRootTitle(e.target.value)}
                                            placeholder={rootFramework === 'secam' ? 'e.g. CodeTribe Academy' : 'e.g. MICT SETA 12-Month Internship (2026/2027)'}
                                            style={{ borderRadius: '0px' }}
                                        />
                                    </div>
                                    <div className="lfm-fg lfm-fg--full">
                                        <label>Reference ID *</label>
                                        <input
                                            className="lfm-input"
                                            required
                                            value={rootRefId}
                                            onChange={e => setRootRefId(e.target.value)}
                                            placeholder={rootFramework === 'secam' ? 'e.g. REF-CTA-2026-BC01' : 'e.g. REF-QCTO-SD-2026'}
                                            style={{ borderRadius: '0px' }}
                                        />
                                    </div>

                                    {rootFramework === 'qcto' && (
                                        <div className="lfm-fg lfm-fg--full">
                                            <label>Guide Blueprint Template (Optional)</label>
                                            <select className="lfm-input" value={rootTemplateId} onChange={e => setRootTemplateId(e.target.value)} style={{ borderRadius: '0px' }}>
                                                <option value="">-- No Structural Template --</option>
                                                {programmes.map((t: ProgrammeTemplate) => (
                                                    <option key={t.id} value={t.id}>{t.name} [{t.saqaId || (t as { code?: string }).code || t.id}]</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="lfm-footer" style={{ flexShrink: 0, borderRadius: '0px' }}>
                                <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowRootModal(false)}>Cancel</button>
                                <button type="submit" className="lfm-btn lfm-btn--primary">
                                    Create Content Package
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL 2: CONTENT BUILDER MODAL */}
            {showBuilder && activeContainer && createPortal(
                <ContentBuilderModal
                    activeContainer={activeContainer}
                    activeFramework={activeFramework}
                    linkedTemplate={linkedTemplate}
                    initialUnits={selectedContainerId === 'all' ? units : units.filter(u => u.containerId === selectedContainerId)}
                    onClose={() => setShowBuilder(false)}
                    isMockMode={false}
                    onSaveBatch={async (drafts, toDeleteIds, checkpointMetadata) => {
                        try {
                            for (const idToDelete of toDeleteIds) {
                                if (!idToDelete.startsWith('draft_')) {
                                    await deleteLearningUnit(idToDelete);
                                }
                            }

                            const savedUnits: ExtendedLearningUnit[] = [];
                            for (const d of drafts) {
                                const isDraft = d.id.startsWith('draft_');
                                const targetId = isDraft ? undefined : d.id;

                                const { _isDraft, _expanded, _isSaving, id, ...cleanUnit } = d;

                                const unitPayload: Omit<LearningUnit, 'id'> = {
                                    ...cleanUnit,
                                    title: cleanUnit.title || 'Untitled Unit'
                                };

                                const savedId = await saveLearningUnit(unitPayload, targetId);
                                savedUnits.push({ ...d, id: savedId, _isDraft: false });
                            }
                            setUnits(savedUnits);

                            if (activeContainer?.id && activeContainer.id !== 'all' && checkpointMetadata) {
                                const containerRef = doc(db, 'content_containers', activeContainer.id);
                                await updateDoc(containerRef, {
                                    checkpointMetadata,
                                    updatedAt: serverTimestamp()
                                }).catch(async () => {
                                    await setDoc(containerRef, { checkpointMetadata, updatedAt: new Date().toISOString() }, { merge: true });
                                });
                            }

                            toast.success("Curriculum Structure Saved to Firestore!");
                            setShowBuilder(false);
                        } catch (err) {
                            console.error("Failed to save curriculum batch:", err);
                            toast.error("Failed to save curriculum structure.");
                        }
                    }}
                />,
                document.body
            )}

            {/* MODAL 3: LAUNCH COHORT RUN MODAL */}
            {showLaunchCohortModal && launchModalRun && activeContainer && createPortal(
                <LaunchCohortModal
                    isOpen={showLaunchCohortModal}
                    run={launchModalRun}
                    containerTitle={activeContainer.title}
                    containerDefaultAccreditation={activeContainer.defaultAccreditation}
                    units={selectedContainerId === 'all' ? units : units.filter(u => u.containerId === selectedContainerId)}
                    cohorts={cohorts}
                    onClose={() => {
                        setShowLaunchCohortModal(false);
                        setLaunchModalRun(null);
                    }}
                    onLaunched={() => { }}
                />,
                document.body
            )}

            {/* DRAWER: MANAGE TIMELINES / COHORT RUNS */}
            {showRunsDrawer && activeContainer && createPortal(
                <CohortRunsDrawer
                    isOpen={showRunsDrawer}
                    onClose={() => setShowRunsDrawer(false)}
                    containerId={selectedContainerId}
                    containerName={activeContainer.title || 'Unknown Package'}
                    cohorts={cohorts}
                    onLaunchNew={(run: CohortRun) => {
                        setLaunchModalRun(run);
                        setShowLaunchCohortModal(true);
                    }}
                    onAnalyticsClick={(runId) => {
                        setSelectedAnalyticsCohortId(runId);
                        setShowPackageAnalytics(true);
                        setShowRunsDrawer(false);
                    }}
                />,
                document.body
            )}
        </div>
    );
};