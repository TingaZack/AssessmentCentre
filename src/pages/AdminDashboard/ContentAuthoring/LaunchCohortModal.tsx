// src/pages/AdminDashboard/ContentAuthoring/LaunchCohortModal.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import {
    X, Rocket, Calendar, Award, Loader2, CheckCircle2, AlertTriangle,
    ListChecks, Layers, Rows3, Settings2, ArrowRight, Eye, Users, Infinity, Search, ChevronDown, Check,
    Palette, Send, Layout, RefreshCw, Info, Lock, Target, Tag, BookOpen, ExternalLink, ShieldCheck, FileCheck
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import { finalizeCohortRunLaunch } from '../../../services/contentService';
import type { CohortRun, AccreditationConfig, AccreditationBody, RunScheduleEntry } from '../../../types/content.types';
import type { ExtendedLearningUnit } from './ContentAuthoring';
import { countDistinctDueDates, generatePacingSchedule, type PacingGranularity } from '../../utils/pacingSchedule';
import { CourseIllustrationGraphic, getThemeStyles } from '../../LearnerPortal/LearnerContentHub/types';
import { COURSE_LEVELS, DynamicListEditor, STANDARD_ACCREDITATIONS, TagSelector } from '../../../components/common/CourseMetadataSettingsPanel/CourseMetadataSettingsPanel';
import { createPortal } from 'react-dom';

export const THEME_COLOR_OPTIONS = [
    { hex: '#0284c7', label: 'Ocean Blue' },
    { hex: '#059669', label: 'Emerald Green' },
    { hex: '#7c3aed', label: 'Royal Purple' },
    { hex: '#d97706', label: 'Amber Gold' },
    { hex: '#be123c', label: 'Rose Red' },
    { hex: '#0d9488', label: 'Teal Cyan' },
    { hex: '#0f172a', label: 'Dark Slate' }
];

export const ILLUSTRATION_OPTIONS = [
    { value: 'code', label: 'Source Code' },
    { value: 'braces', label: 'Code Braces' },
    { value: 'terminal', label: 'Developer Terminal' },
    { value: 'git', label: 'Git Branching' },
    { value: 'ai', label: 'AI & Machine Learning' },
    { value: 'database', label: 'SQL & Database' },
    { value: 'mobile', label: 'Mobile App Dev' },
    { value: 'degree', label: 'Academic Qualification' },
    { value: 'qcto_systems', label: 'QCTO Logbook' },
    { value: 'cloud', label: 'Cloud Infrastructure' },
    { value: 'security', label: 'Cybersecurity' },
    { value: 'agile', label: 'Agile Kanban' },
    { value: 'design', label: 'UI/UX Design' }
];

export interface CohortRunSettingsData {
    runName: string;
    description: string;
    themeColor: string;
    illustrationType: string;
    applicationStartDate: string;
    applicationEndDate: string;
    level: string;
    isCertificateAwarded: boolean;
    certificateIssuerMode: 'mlab_internal' | 'external_authority';
    certificateTemplateId: string;
    externalIssuerName: string;
    awaitingExternalNotice: string;
    learningOutcomes: string[];
    prerequisites: string[];
    targetAudience: string[];
    materialIncludes?: string[];
    tags: string[];
    isAccredited: boolean;
    accreditationBody: AccreditationBody | string;
    customAccreditationText: string;
    saqaId: string;
    nqfLevel: string | number;
    credits: number;
}

interface CohortRunSettingsFormProps {
    data: CohortRunSettingsData;
    onChange: (field: keyof CohortRunSettingsData, value: any) => void;
    onResetToBlueprintDefaults: () => void;
    framework?: 'qcto' | 'secam';
}

const QUILL_MODULES = {
    toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link', 'clean']
    ]
};

export const CohortRunSettingsForm: React.FC<CohortRunSettingsFormProps> = ({
    data,
    onChange,
    onResetToBlueprintDefaults,
    framework = 'secam'
}) => {
    const activeTheme = getThemeStyles(data.themeColor, framework);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* INHERITANCE INFO BANNER */}
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderLeft: '4px solid #0284c7', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '0px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0369a1', fontSize: '0.78rem', fontWeight: 600 }}>
                    <Info size={16} color="#0284c7" />
                    <span>Pre-filled with <strong>Master Blueprint</strong> defaults. Customizations apply exclusively to this batch.</span>
                </div>
                <button
                    type="button"
                    onClick={onResetToBlueprintDefaults}
                    style={{ background: '#ffffff', border: '1px solid #7dd3fc', color: '#0284c7', padding: '4px 10px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}
                >
                    <RefreshCw size={12} /> Reset Defaults
                </button>
            </div>

            {/* RUN IDENTITY & RICH TEXT DESCRIPTION */}
            <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="lfm-section-hdr" style={{ margin: 0, paddingBottom: '6px' }}>
                    <Layout size={14} /> Cohort Run Identity &amp; Overview
                </div>

                <div className="lfm-fg lfm-fg--full">
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                        Cohort Batch Title *
                    </label>
                    <input
                        className="lfm-input"
                        type="text"
                        value={data.runName}
                        onChange={e => onChange('runName', e.target.value)}
                        placeholder="e.g. Spring 2026 Batch - Gautrain Cohort"
                        style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--mlab-blue)' }}
                    />
                </div>

                <div className="lfm-fg lfm-fg--full">
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', marginBottom: '4px', display: 'block' }}>
                        Batch Summary / Custom Description (Rich Text)
                    </label>
                    <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', color: '#0f172a' }}>
                        <ReactQuill
                            theme="snow"
                            value={data.description || ''}
                            onChange={val => onChange('description', val)}
                            modules={QUILL_MODULES}
                            placeholder="Provide batch-specific instructions, guidelines or schedule notes for learners..."
                        />
                    </div>
                </div>
            </div>

            {/* DIFFICULTY LEVEL */}
            <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1rem' }}>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'block', marginBottom: '4px' }}>
                    Course Difficulty Level
                </label>
                <select
                    className="lfm-input lfm-select"
                    value={data.level}
                    onChange={e => onChange('level', e.target.value)}
                    style={{ padding: '8px 12px', fontWeight: 700 }}
                >
                    {COURSE_LEVELS.map(lvl => (
                        <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                    ))}
                </select>
            </div>

            {/* CURRICULAR METADATA: OUTCOMES, PREREQUISITES, TARGET AUDIENCE, MATERIAL INCLUDED & TAGS */}
            <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="lfm-section-hdr" style={{ margin: 0, paddingBottom: '6px' }}>
                    <BookOpen size={14} /> Outcomes, Prerequisites, Audience &amp; Material Included
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <ListChecks size={13} /> What You Will Learn (Outcomes)
                        </label>
                        <DynamicListEditor
                            items={data.learningOutcomes}
                            placeholder="e.g. Build React component trees..."
                            buttonLabel="+ Outcome"
                            onChange={newList => onChange('learningOutcomes', newList)}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <Lock size={13} /> Course Prerequisites
                        </label>
                        <DynamicListEditor
                            items={data.prerequisites}
                            placeholder="e.g. Basic HTML/CSS knowledge..."
                            buttonLabel="+ Req"
                            onChange={newList => onChange('prerequisites', newList)}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <Target size={13} /> Target Audience
                        </label>
                        <DynamicListEditor
                            items={data.targetAudience}
                            placeholder="e.g. Aspiring Full-Stack Developers..."
                            buttonLabel="+ Audience"
                            onChange={newList => onChange('targetAudience', newList)}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <Check size={13} color="var(--mlab-green-dark)" /> Material Included
                        </label>
                        <DynamicListEditor
                            items={data.materialIncludes || []}
                            placeholder="e.g. Downloadable lab guides & assets..."
                            buttonLabel="+ Item"
                            onChange={newList => onChange('materialIncludes', newList)}
                        />
                    </div>
                </div>

                <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                        <Tag size={13} /> Batch Tags &amp; Keywords
                    </label>
                    <TagSelector
                        selectedTags={data.tags}
                        onChange={newTags => onChange('tags', newTags)}
                    />
                </div>
            </div>

            {/* THEME & GRAPHIC OVERRIDE */}
            <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="lfm-section-hdr" style={{ margin: 0, paddingBottom: '6px' }}>
                    <Palette size={14} /> Batch Theme &amp; Visual Branding Override
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'block', marginBottom: '6px' }}>
                                Theme Accent Color
                            </label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {THEME_COLOR_OPTIONS.map(opt => {
                                    const isSelected = data.themeColor === opt.hex;
                                    return (
                                        <button
                                            key={opt.hex}
                                            type="button"
                                            title={opt.label}
                                            onClick={() => onChange('themeColor', opt.hex)}
                                            style={{
                                                width: '28px',
                                                height: '28px',
                                                background: opt.hex,
                                                border: isSelected ? '3px solid #0f172a' : '1px solid #cbd5e1',
                                                boxShadow: isSelected ? '0 0 0 2px #38bdf8' : 'none',
                                                cursor: 'pointer',
                                                borderRadius: '0px'
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'block', marginBottom: '4px' }}>
                                Illustration Graphic Preset
                            </label>
                            <select
                                className="lfm-input lfm-select"
                                value={data.illustrationType}
                                onChange={e => onChange('illustrationType', e.target.value)}
                                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                            >
                                {ILLUSTRATION_OPTIONS.map(ill => (
                                    <option key={ill.value} value={ill.value}>{ill.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ border: '2px solid #0f172a', overflow: 'hidden', background: '#ffffff' }}>
                        <div style={{ background: activeTheme.gradient, padding: '12px', height: '110px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderBottom: '2px solid #0f172a' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.6rem', fontWeight: 900, background: '#ffffff', color: activeTheme.badgeText, border: '1px solid #0f172a', padding: '1px 5px', fontFamily: 'var(--font-heading)' }}>
                                    {framework.toUpperCase()}
                                </span>
                                <span style={{ fontSize: '0.6rem', fontWeight: 800, background: '#ffffff', border: '1px solid #0f172a', padding: '1px 5px' }}>
                                    BATCH CARD
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <CourseIllustrationGraphic type={data.illustrationType} themeColor={data.themeColor} framework={framework} size={18} />
                            </div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: activeTheme.primaryBox, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-heading)' }}>
                                {data.runName || 'Run Title Preview'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* APPLICATION / INTAKE DATES */}
            <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="lfm-section-hdr" style={{ margin: 0, paddingBottom: '6px' }}>
                    <Send size={14} /> Application &amp; Intake Window
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="lfm-fg">
                        <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                            Applications Open Date
                        </label>
                        <input
                            type="date"
                            className="lfm-input"
                            value={data.applicationStartDate}
                            onChange={e => onChange('applicationStartDate', e.target.value)}
                        />
                    </div>
                    <div className="lfm-fg">
                        <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                            Applications Close Date
                        </label>
                        <input
                            type="date"
                            className="lfm-input"
                            value={data.applicationEndDate}
                            onChange={e => onChange('applicationEndDate', e.target.value)}
                        />
                    </div>
                </div>
            </div>

        </div>
    );
};

interface LaunchCohortModalProps {
    isOpen: boolean;
    onClose: () => void;
    run: CohortRun;
    containerTitle: string;
    containerDescription?: string;
    containerThemeColor?: string;
    containerIllustrationType?: string;
    containerData?: any;
    containerDefaultAccreditation?: AccreditationConfig;
    units: ExtendedLearningUnit[];
    cohorts: { id: string; name: string }[];
    onLaunched?: () => void;
}

export const LaunchCohortModal: React.FC<LaunchCohortModalProps> = ({
    isOpen,
    onClose,
    run,
    containerTitle,
    containerDescription = '',
    containerThemeColor = '#0284c7',
    containerIllustrationType = 'code',
    containerData,
    containerDefaultAccreditation,
    units,
    cohorts = [],
    onLaunched
}) => {
    const toast = useToast();

    // 🚀 SAVED STUDIO TEMPLATES STATE
    const [savedStudioTemplates, setSavedStudioTemplates] = useState<any[]>([]);

    useEffect(() => {
        const fetchSavedTemplates = async () => {
            try {
                const snap = await getDocs(collection(db, 'certificate_templates'));
                setSavedStudioTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            } catch (err: any) {
                console.warn("Could not fetch certificate_templates for launch modal:", err?.message || err);
            }
        };
        fetchSavedTemplates();
    }, []);

    const blueprintDefaults = useMemo(() => ({
        runName: run.name || run.cohortName || containerTitle || '',
        description: (run as any).description || containerDescription || containerData?.description || containerData?.checkpointMetadata?.courseDescription || '',
        themeColor: (run as any).themeColor || containerThemeColor || containerData?.themeColor || containerData?.checkpointMetadata?.themeColor || '#0284c7',
        illustrationType: (run as any).illustrationType || containerIllustrationType || containerData?.illustrationType || containerData?.checkpointMetadata?.illustrationType || 'code',
        applicationStartDate: (run as any).applicationStartDate || '',
        applicationEndDate: (run as any).applicationEndDate || '',
        level: (run as any).level || containerData?.level || containerData?.checkpointMetadata?.courseLevel || 'beginner',
        isCertificateAwarded: (run as any).isCertificateAwarded ?? containerData?.isCertificateAwarded ?? containerData?.checkpointMetadata?.isCertificateAwarded ?? true,
        certificateIssuerMode: ((run as any).certificateIssuerMode || 'mlab_internal') as 'mlab_internal' | 'external_authority',
        certificateTemplateId: (run as any).certificateTemplateId || 'default_completion_template',
        externalIssuerName: (run as any).externalIssuerName || 'QCTO / SETA Authorized Body',
        awaitingExternalNotice: (run as any).awaitingExternalNotice || 'Your learner transcript and mLab completion statement have been verified. You will receive an official notification once your parchment is released by the external authorized body.',
        learningOutcomes: (run as any).learningOutcomes || containerData?.learningOutcomes || containerData?.checkpointMetadata?.learningOutcomes || [],
        prerequisites: (run as any).prerequisites || containerData?.prerequisites || containerData?.checkpointMetadata?.prerequisites || [],
        targetAudience: (run as any).targetAudience || containerData?.targetAudience || containerData?.checkpointMetadata?.targetAudience || [],
        materialIncludes: (run as any).materialIncludes || containerData?.materialIncludes || containerData?.checkpointMetadata?.materialIncludes || [
            'Hands-on Video Tutorials & Source Code',
            'Downloadable Lab Guides & Asset Packs',
            'Interactive AI Peer Reviews & Quizzes',
            'Industry Certificate of Completion'
        ],
        tags: (run as any).tags || containerData?.tags || containerData?.checkpointMetadata?.courseTags || [],
        isAccredited: (run as any).isAccredited ?? containerDefaultAccreditation?.isAccredited ?? containerData?.defaultAccreditation?.isAccredited ?? true,
        accreditationBody: run.accreditation?.body || containerDefaultAccreditation?.body || containerData?.defaultAccreditation?.body || 'qcto',
        customAccreditationText: run.accreditation?.customText || containerDefaultAccreditation?.customText || containerData?.defaultAccreditation?.customText || '',
        saqaId: (run as any).saqaId || containerDefaultAccreditation?.saqaId || containerData?.defaultAccreditation?.saqaId || '',
        nqfLevel: (run as any).nqfLevel || containerDefaultAccreditation?.nqfLevel || containerData?.defaultAccreditation?.nqfLevel || 5,
        credits: (run as any).credits || containerDefaultAccreditation?.credits || containerData?.defaultAccreditation?.credits || 120
    }), [run, containerTitle, containerDescription, containerThemeColor, containerIllustrationType, containerData, containerDefaultAccreditation]);

    const [settingsData, setSettingsData] = useState<CohortRunSettingsData>(blueprintDefaults);

    useEffect(() => {
        setSettingsData(blueprintDefaults);
    }, [blueprintDefaults]);

    const handleSettingChange = (field: keyof CohortRunSettingsData, value: any) => {
        setSettingsData(prev => ({ ...prev, [field]: value }));
    };

    const handleResetToBlueprintDefaults = () => {
        setSettingsData(blueprintDefaults);
        toast.info("Settings reset to Master Blueprint defaults.");
    };

    const initialCohortIds = (run as any).cohortIds || (run.cohortId ? [run.cohortId] : []);
    const [selectedCohortIds, setSelectedCohortIds] = useState<string[]>(initialCohortIds);

    const [isCohortDropdownOpen, setIsCohortDropdownOpen] = useState(false);
    const [cohortSearchQuery, setCohortSearchQuery] = useState('');
    const cohortDropdownRef = useRef<HTMLDivElement>(null);

    const seedAccreditation = run.accreditation ?? containerDefaultAccreditation ?? { body: 'qcto' as AccreditationBody };
    const isSeedStandard = STANDARD_ACCREDITATIONS.some(a => a.value === seedAccreditation.body);

    const [isTimeBound, setIsTimeBound] = useState<boolean>(run.timeBoundConfig?.isTimeBound ?? true);
    const [startDate, setStartDate] = useState(run.timeBoundConfig?.startDate || '');
    const [endDate, setEndDate] = useState(run.timeBoundConfig?.endDate || '');
    const [enforceStrictDeadline, setEnforceStrictDeadline] = useState(run.timeBoundConfig?.enforceStrictDeadline ?? true);
    const [isEditingDates, setIsEditingDates] = useState(!run.timeBoundConfig?.startDate || !run.timeBoundConfig?.endDate);

    const [activeTab, setActiveTab] = useState<'branding' | 'targeting' | 'schedule'>('branding');

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
        setStartDate(run.timeBoundConfig?.startDate || '');
        setEndDate(run.timeBoundConfig?.endDate || '');
        setIsTimeBound(run.timeBoundConfig?.isTimeBound ?? true);
        if (run.timeBoundConfig?.startDate && run.timeBoundConfig?.endDate) {
            setIsEditingDates(false);
        }
    }, [run.timeBoundConfig]);

    const [accreditationBody, setAccreditationBody] = useState<AccreditationBody>(isSeedStandard ? seedAccreditation.body : 'other');
    const [customAccreditationText, setCustomAccreditationText] = useState(
        isSeedStandard ? '' : (seedAccreditation.customText || '')
    );

    const [granularity, setGranularity] = useState<PacingGranularity>('group');
    const [previewSchedule, setPreviewSchedule] = useState<RunScheduleEntry[] | null>(
        run.generatedSchedule && run.generatedSchedule.length > 0 ? run.generatedSchedule : null
    );
    const [scheduleError, setScheduleError] = useState<string | null>(null);
    const [launching, setLaunching] = useState(false);
    const [showScheduleDetails, setShowScheduleDetails] = useState(true);

    const distinctDueDates = useMemo(() => previewSchedule ? countDistinctDueDates(previewSchedule) : 0, [previewSchedule]);

    const filteredCohortsForModal = useMemo(() => {
        if (!cohortSearchQuery.trim()) return cohorts;
        const lower = cohortSearchQuery.toLowerCase().trim();
        return cohorts.filter(c => c.name.toLowerCase().includes(lower));
    }, [cohorts, cohortSearchQuery]);

    const toggleTargetCohort = (cohortId: string) => {
        if (cohortId === 'ALL') {
            setSelectedCohortIds(prev => prev.includes('ALL') ? [] : ['ALL']);
            return;
        }
        let next = selectedCohortIds.filter(id => id !== 'ALL');
        if (next.includes(cohortId)) {
            next = next.filter(id => id !== cohortId);
        } else {
            next.push(cohortId);
        }
        setSelectedCohortIds(next);
    };

    const handleGeneratePreview = () => {
        setScheduleError(null);
        try {
            const schedule = generatePacingSchedule(units, startDate, endDate, granularity);
            setPreviewSchedule(schedule);
            setShowScheduleDetails(true);
            toast.success(`Schedule generated across ${countDistinctDueDates(schedule)} due date(s).`);
        } catch (err: any) {
            setPreviewSchedule(null);
            setScheduleError(err?.message || 'Could not generate a schedule from these dates.');
        }
    };

    const handleOverrideDueDate = (unitId: string, newDueDate: string) => {
        if (!previewSchedule) return;
        setPreviewSchedule(prev => prev ? prev.map(entry => entry.unitId === unitId ? { ...entry, dueDate: newDueDate } : entry) : null);
        toast.info("Manual date override applied.");
    };

    const handleLaunch = async () => {
        if (!settingsData.runName.trim()) {
            toast.warning("Please provide a name for this cohort run.");
            return;
        }
        if (selectedCohortIds.length === 0) {
            toast.warning("You must select at least one Target Cohort before launching.");
            return;
        }
        if (isTimeBound && (!previewSchedule || previewSchedule.length === 0)) {
            toast.warning("Generate a pacing schedule preview before launching.");
            return;
        }

        setLaunching(true);
        try {
            const accreditation: AccreditationConfig = {
                body: accreditationBody,
                customText: accreditationBody === 'other' ? customAccreditationText.trim() : undefined
            };

            await finalizeCohortRunLaunch(run.id, {
                name: settingsData.runName.trim(),
                description: settingsData.description.trim(),
                themeColor: settingsData.themeColor,
                illustrationType: settingsData.illustrationType,
                applicationStartDate: settingsData.applicationStartDate,
                applicationEndDate: settingsData.applicationEndDate,
                cohortIds: selectedCohortIds,
                isTimeBound: isTimeBound,
                startDate: startDate,
                endDate: endDate,
                accreditation: accreditation,
                enforceStrictDeadline: enforceStrictDeadline,
                schedule: previewSchedule || [],
                // DUAL CERTIFICATE FULFILLMENT PAYLOAD
                isCertificateAwarded: settingsData.isCertificateAwarded,
                certificateIssuerMode: settingsData.certificateIssuerMode,
                certificateTemplateId: settingsData.certificateTemplateId,
                externalIssuerName: settingsData.externalIssuerName,
                awaitingExternalNotice: settingsData.awaitingExternalNotice
            });

            toast.success(`"${settingsData.runName}" is now live and assigned!`);
            onLaunched?.();
            onClose();
        } catch (err: any) {
            toast.error(err?.message || "Failed to launch cohort run.");
        } finally {
            setLaunching(false);
        }
    };

    if (!isOpen) return null;

    const canLaunch = settingsData.runName.trim() && selectedCohortIds.length > 0 && (!isTimeBound || (previewSchedule && previewSchedule.length > 0));

    return createPortal(
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 100000 }}>
            <div
                className="lfm-modal animate-fade-in"
                onClick={e => e.stopPropagation()}
                style={{
                    maxWidth: '820px',
                    width: '96vw',
                    height: '740px',
                    maxHeight: '94vh',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#ffffff',
                    overflow: 'hidden'
                }}
            >
                {/* HEADER */}
                <div className="lfm-header" style={{ padding: '1.25rem 1.5rem', background: 'var(--mlab-blue)', borderBottom: '3px solid var(--mlab-green)' }}>
                    <div>
                        <h2 className="lfm-header__title" style={{ fontSize: '1rem', letterSpacing: '0.08em' }}>
                            <Rocket size={18} color="var(--mlab-green)" /> Finalize &amp; Launch Cohort Run
                        </h2>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', marginTop: '4px', textTransform: 'none', letterSpacing: 'normal', fontFamily: 'var(--font-body)' }}>
                            Blueprint: {containerTitle} • <strong style={{ color: '#fff' }}>{units.length}</strong> master lesson{units.length === 1 ? '' : 's'}
                        </div>
                    </div>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={launching}>
                        <X size={20} />
                    </button>
                </div>

                {/* TAB BAR */}
                <div style={{ display: 'flex', background: '#f1f5f9', borderBottom: '1px solid var(--mlab-border)', padding: '0 1.5rem' }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('branding')}
                        style={{
                            padding: '10px 16px', border: 'none',
                            background: activeTab === 'branding' ? '#ffffff' : 'transparent',
                            color: activeTab === 'branding' ? 'var(--mlab-blue)' : '#64748b',
                            fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                            borderBottom: activeTab === 'branding' ? '3px solid var(--mlab-blue)' : '3px solid transparent',
                            fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
                        }}
                    >
                        <Palette size={14} /> 1. Identity &amp; Branding
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('targeting')}
                        style={{
                            padding: '10px 16px', border: 'none',
                            background: activeTab === 'targeting' ? '#ffffff' : 'transparent',
                            color: activeTab === 'targeting' ? 'var(--mlab-blue)' : '#64748b',
                            fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                            borderBottom: activeTab === 'targeting' ? '3px solid var(--mlab-blue)' : '3px solid transparent',
                            fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
                        }}
                    >
                        <Users size={14} /> 2. Target &amp; Certification
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('schedule')}
                        style={{
                            padding: '10px 16px', border: 'none',
                            background: activeTab === 'schedule' ? '#ffffff' : 'transparent',
                            color: activeTab === 'schedule' ? 'var(--mlab-blue)' : '#64748b',
                            fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                            borderBottom: activeTab === 'schedule' ? '3px solid var(--mlab-blue)' : '3px solid transparent',
                            fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
                        }}
                    >
                        <Calendar size={14} /> 3. Delivery &amp; Schedule
                    </button>
                </div>

                {/* SCROLLABLE BODY */}
                <div className="lfm-body" style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', background: '#f8fafc' }}>

                    {activeTab === 'branding' && (
                        <CohortRunSettingsForm
                            data={settingsData}
                            onChange={handleSettingChange}
                            onResetToBlueprintDefaults={handleResetToBlueprintDefaults}
                            framework={(run as any).framework || 'secam'}
                        />
                    )}

                    {activeTab === 'targeting' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                {/* TARGET COHORTS */}
                                <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                                    <div className="lfm-section-hdr" style={{ marginBottom: '10px', paddingBottom: '6px' }}>
                                        <Users size={14} /> Target System Cohorts *
                                    </div>

                                    <div className="lfm-fg lfm-fg--full" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ position: 'relative', width: '100%' }} ref={cohortDropdownRef}>
                                            <button
                                                type="button"
                                                onClick={() => setIsCohortDropdownOpen(!isCohortDropdownOpen)}
                                                className="lfm-input"
                                                style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                                                    background: '#fff', borderRadius: 0,
                                                    borderColor: selectedCohortIds.length === 0 ? 'var(--mlab-red)' : 'var(--mlab-border)',
                                                    padding: '8px 12px'
                                                }}
                                            >
                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--mlab-blue)' }}>
                                                    {selectedCohortIds.includes('ALL')
                                                        ? 'All Active Cohorts'
                                                        : selectedCohortIds.length === 0
                                                            ? '-- Select Cohorts --'
                                                            : `${selectedCohortIds.length} Cohort(s) Selected`}
                                                </span>
                                                <ChevronDown size={14} color="var(--mlab-grey)" />
                                            </button>

                                            {isCohortDropdownOpen && (
                                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: '#fff', border: '1px solid var(--mlab-border)', boxShadow: '0 10px 20px rgba(0,0,0,0.12)', maxHeight: '200px', overflowY: 'auto' }}>
                                                    <div style={{ position: 'sticky', top: 0, background: '#f8fafc', padding: '6px 10px', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 2 }}>
                                                        <Search size={13} color="var(--mlab-grey)" />
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            value={cohortSearchQuery}
                                                            onChange={e => setCohortSearchQuery(e.target.value)}
                                                            placeholder="Search cohorts..."
                                                            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.8rem' }}
                                                        />
                                                    </div>

                                                    <div style={{ display: 'flex', flexDirection: 'column', color: 'var(--mlab-blue)' }}>
                                                        <div
                                                            onClick={() => toggleTargetCohort('ALL')}
                                                            style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.8rem', background: selectedCohortIds.includes('ALL') ? 'var(--mlab-light-blue)' : '#fff' }}
                                                        >
                                                            <input type="checkbox" checked={selectedCohortIds.includes('ALL')} readOnly style={{ accentColor: 'var(--mlab-green)' }} />
                                                            All Active Cohorts
                                                        </div>

                                                        <div
                                                            onClick={() => toggleTargetCohort('Unassigned')}
                                                            style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.8rem', background: selectedCohortIds.includes('Unassigned') ? 'var(--mlab-light-blue)' : '#fff' }}
                                                        >
                                                            <input type="checkbox" checked={selectedCohortIds.includes('Unassigned')} readOnly style={{ accentColor: 'var(--mlab-green)' }} />
                                                            General Pool (Unassigned)
                                                        </div>

                                                        {filteredCohortsForModal.length > 0 ? (
                                                            filteredCohortsForModal.map(c => {
                                                                const isSelected = selectedCohortIds.includes(c.id);
                                                                return (
                                                                    <div
                                                                        key={c.id}
                                                                        onClick={() => toggleTargetCohort(c.id)}
                                                                        style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', background: isSelected ? 'var(--mlab-light-blue)' : '#fff' }}
                                                                    >
                                                                        <input type="checkbox" checked={isSelected} readOnly style={{ accentColor: 'var(--mlab-blue)' }} />
                                                                        <span>{c.name}</span>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <div style={{ padding: '10px', fontSize: '0.75rem', color: 'var(--mlab-grey)', textAlign: 'center' }}>No cohorts found.</div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ marginTop: '8px', minHeight: '32px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {!selectedCohortIds.includes('ALL') && selectedCohortIds.length > 0 ? (
                                                selectedCohortIds.map(id => {
                                                    const match = cohorts.find(c => c.id === id);
                                                    const displayLabel = id === 'Unassigned' ? 'General Pool' : (match?.name || id);
                                                    return (
                                                        <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', border: '1px solid var(--mlab-border)', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                                                            {displayLabel}
                                                            <X size={12} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => toggleTargetCohort(id)} />
                                                        </span>
                                                    );
                                                })
                                            ) : selectedCohortIds.includes('ALL') ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', border: '1px solid var(--mlab-green)', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                                                    <Check size={12} /> All Active System Cohorts
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.72rem', color: 'var(--mlab-red)', marginTop: '2px', fontStyle: 'italic' }}>
                                                    * Select at least one cohort
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* CERTIFICATE ACCREDITATION */}
                                <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                                    <div className="lfm-section-hdr" style={{ marginBottom: '10px', paddingBottom: '6px' }}>
                                        <Award size={14} /> Certificate Accreditation &amp; Endorsement
                                    </div>
                                    <div className="lfm-fg" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-heading)' }}>
                                            Endorsing / Accrediting Body
                                        </label>
                                        <select
                                            className="lfm-input lfm-select"
                                            value={accreditationBody}
                                            onChange={e => {
                                                const body = e.target.value as AccreditationBody;
                                                setAccreditationBody(body);
                                                handleSettingChange('accreditationBody', body);
                                            }}
                                            style={{ padding: '8px 12px' }}
                                        >
                                            {STANDARD_ACCREDITATIONS.map(acc => <option key={acc.value} value={acc.value}>{acc.label}</option>)}
                                            <option value="other">Other (Custom Free Text)...</option>
                                        </select>

                                        {accreditationBody === 'other' && (
                                            <div style={{ marginTop: '4px' }}>
                                                <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-heading)', display: 'block', marginBottom: '4px' }}>
                                                    Custom Accreditation Title
                                                </label>
                                                <input
                                                    className="lfm-input"
                                                    type="text"
                                                    placeholder="e.g. AWS Certified + mLab"
                                                    value={customAccreditationText}
                                                    onChange={e => {
                                                        setCustomAccreditationText(e.target.value);
                                                        handleSettingChange('customAccreditationText', e.target.value);
                                                    }}
                                                />
                                            </div>
                                        )}

                                        <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', marginTop: 'auto', paddingTop: '6px', borderTop: '1px dashed var(--mlab-border)' }}>
                                            Appears directly on student completion certificates &amp; transcripts.
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 🚀 DUAL CERTIFICATE ISSUER & FULFILLMENT STRATEGY */}
                            <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className="lfm-section-hdr" style={{ margin: 0, paddingBottom: 0, border: 'none' }}>
                                        <Award size={16} color="var(--mlab-blue)" /> Certificate Distribution &amp; Issuing Strategy
                                    </div>

                                    <label style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--mlab-blue)', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                                        <input
                                            type="checkbox"
                                            checked={settingsData.isCertificateAwarded}
                                            onChange={e => handleSettingChange('isCertificateAwarded', e.target.checked)}
                                            style={{ accentColor: 'var(--mlab-green)', width: '16px', height: '16px' }}
                                        />
                                        Award Certificates for this Run
                                    </label>
                                </div>

                                {settingsData.isCertificateAwarded && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>

                                        {/* ISSUER MODE TOGGLE */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleSettingChange('certificateIssuerMode', 'mlab_internal')}
                                                style={{
                                                    padding: '12px',
                                                    border: settingsData.certificateIssuerMode === 'mlab_internal' ? '2px solid var(--mlab-blue)' : '1px solid var(--mlab-border)',
                                                    background: settingsData.certificateIssuerMode === 'mlab_internal' ? 'var(--mlab-light-blue)' : '#f8fafc',
                                                    textAlign: 'left',
                                                    cursor: 'pointer',
                                                    borderRadius: '0px'
                                                }}
                                            >
                                                <div style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                                    <ShieldCheck size={15} color="#0284c7" /> mLab Auto-Issued Digital Cert
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
                                                    Instant digital parchment generated via <strong>Certificate Studio</strong> upon 100% completion &amp; competency sign-off.
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleSettingChange('certificateIssuerMode', 'external_authority')}
                                                style={{
                                                    padding: '12px',
                                                    border: settingsData.certificateIssuerMode === 'external_authority' ? '2px solid #7c3aed' : '1px solid var(--mlab-border)',
                                                    background: settingsData.certificateIssuerMode === 'external_authority' ? '#f3e8ff' : '#f8fafc',
                                                    textAlign: 'left',
                                                    cursor: 'pointer',
                                                    borderRadius: '0px'
                                                }}
                                            >
                                                <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                                    <FileCheck size={15} color="#7c3aed" /> External Authorized Body (QCTO/SETA/Vendor)
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
                                                    Learners receive immediate mLab Completion Transcripts while flagged as <em>"Awaiting Official External Certificate"</em>.
                                                </div>
                                            </button>
                                        </div>

                                        {/* MODE A: MLAB INTERNAL CERTIFICATE STUDIO LINK */}
                                        {settingsData.certificateIssuerMode === 'mlab_internal' && (
                                            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                        Certificate Studio Template Selection
                                                    </label>

                                                    <button
                                                        type="button"
                                                        onClick={() => window.open('/admin?tab=studio', '_blank')}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            color: '#0284c7',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 800,
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            fontFamily: 'var(--font-heading)',
                                                            textTransform: 'uppercase',
                                                            padding: 0
                                                        }}
                                                    >
                                                        <ExternalLink size={12} /> Open Certificate Studio
                                                    </button>
                                                </div>

                                                {/* 🚀 DYNAMIC CERTIFICATE STUDIO TEMPLATE DROPDOWN */}
                                                <select
                                                    className="lfm-input lfm-select"
                                                    value={settingsData.certificateTemplateId}
                                                    onChange={e => handleSettingChange('certificateTemplateId', e.target.value)}
                                                    style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--mlab-blue)', background: '#ffffff' }}
                                                >
                                                    <option value="default_completion_template">Default mLab Standard Certificate Template</option>

                                                    {savedStudioTemplates.length > 0 && (
                                                        <optgroup label="Saved Certificate Studio Templates">
                                                            {savedStudioTemplates.map((tmpl: any) => (
                                                                <option key={tmpl.id} value={tmpl.id}>
                                                                    {tmpl.title || tmpl.programmeName || tmpl.id} ({tmpl.certType || 'Certificate'})
                                                                </option>
                                                            ))}
                                                        </optgroup>
                                                    )}

                                                    <optgroup label="System Preset Templates">
                                                        <option value="secam_bootcamp_template">SECAM Agile Bootcamp High-Honors Template</option>
                                                        <option value="qcto_occupational_template">QCTO Occupational Skills Certificate Template</option>
                                                        <option value="custom_partner_template">Custom Sponsor / Employer Partner Template</option>
                                                    </optgroup>
                                                </select>

                                                <span style={{ fontSize: '0.7rem', color: '#0284c7' }}>
                                                    ✓ System will automatically verify project competency and email PDF certificates to learners.
                                                </span>
                                            </div>
                                        )}

                                        {/* MODE B: EXTERNAL AUTHORITY ISSUANCE NOTICES */}
                                        {settingsData.certificateIssuerMode === 'external_authority' && (
                                            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'block', marginBottom: '4px' }}>
                                                        Authorized External Body Title
                                                    </label>
                                                    <input
                                                        className="lfm-input"
                                                        type="text"
                                                        value={settingsData.externalIssuerName}
                                                        onChange={e => handleSettingChange('externalIssuerName', e.target.value)}
                                                        placeholder="e.g. QCTO Council / MICT SETA / AWS Academy"
                                                        style={{ padding: '8px 12px', background: '#ffffff', fontWeight: 700, color: '#4c1d95' }}
                                                    />
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'block', marginBottom: '4px' }}>
                                                        Student Status Notice (Displayed while awaiting external parchment)
                                                    </label>
                                                    <textarea
                                                        className="lfm-input"
                                                        rows={2}
                                                        value={settingsData.awaitingExternalNotice}
                                                        onChange={e => handleSettingChange('awaitingExternalNotice', e.target.value)}
                                                        style={{ padding: '8px 12px', background: '#ffffff', fontSize: '0.78rem' }}
                                                    />
                                                </div>

                                                <div style={{ fontSize: '0.72rem', color: '#6d28d9', background: '#ede9fe', padding: '8px 10px', borderLeft: '3px solid #7c3aed' }}>
                                                    <strong>Hybrid Fulfillment Note:</strong> Learners will be able to download their immediate mLab Verification Statement while staff track external certification issuance in the Admin Dashboard.
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                )}
                            </div>

                        </div>
                    )}

                    {activeTab === 'schedule' && (
                        <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '1.25rem' }}>

                            <div className="lfm-section-hdr" style={{ marginBottom: '12px' }}>
                                <Calendar size={14} /> Delivery Mode &amp; Pacing Strategy
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsTimeBound(true)}
                                    style={{
                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        background: isTimeBound ? 'var(--mlab-blue)' : 'var(--mlab-bg)',
                                        color: isTimeBound ? 'var(--mlab-white)' : 'var(--mlab-grey)',
                                        border: `2px solid ${isTimeBound ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`,
                                        padding: '10px 14px', fontSize: '0.75rem', fontFamily: 'var(--font-heading)',
                                        textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease'
                                    }}
                                >
                                    <Calendar size={14} color={isTimeBound ? 'var(--mlab-green)' : 'currentColor'} />
                                    Time-Bound Cohort
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsTimeBound(false)}
                                    style={{
                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        background: !isTimeBound ? 'var(--mlab-green)' : 'var(--mlab-bg)',
                                        color: !isTimeBound ? 'var(--mlab-blue)' : 'var(--mlab-grey)',
                                        border: `2px solid ${!isTimeBound ? 'var(--mlab-green)' : 'var(--mlab-border)'}`,
                                        padding: '10px 14px', fontSize: '0.75rem', fontFamily: 'var(--font-heading)',
                                        textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease'
                                    }}
                                >
                                    <Infinity size={15} />
                                    Self-Paced (Evergreen)
                                </button>
                            </div>

                            {isTimeBound ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', letterSpacing: '0.08em' }}>
                                                Batch Schedule Window
                                            </label>
                                            {!isEditingDates && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingDates(true)}
                                                    style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: 0, textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}
                                                >
                                                    <Settings2 size={12} /> Edit Dates
                                                </button>
                                            )}
                                        </div>

                                        {!isEditingDates ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--mlab-light-blue)', padding: '10px 14px', border: '1px solid var(--mlab-border)' }}>
                                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{startDate}</span>
                                                <ArrowRight size={14} color="var(--mlab-grey-lt)" />
                                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{endDate}</span>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '12px', background: 'var(--mlab-bg)', padding: '12px', border: '1px solid var(--mlab-border)' }}>
                                                <div className="lfm-fg" style={{ flex: 1 }}>
                                                    <label>Batch Start Date</label>
                                                    <input type="date" className="lfm-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                                </div>
                                                <div className="lfm-fg" style={{ flex: 1 }}>
                                                    <label>Batch End Date</label>
                                                    <input type="date" className="lfm-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                                                </div>
                                                {(startDate && endDate) && (
                                                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                                        <button type="button" onClick={() => setIsEditingDates(false)} className="lfm-btn lfm-btn--primary">Done</button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="lfm-flags-panel" style={{ marginTop: '10px', padding: '8px 12px' }}>
                                            <label className="lfm-checkbox-row" style={{ margin: 0, fontSize: '0.8rem' }}>
                                                <input type="checkbox" checked={enforceStrictDeadline} onChange={e => setEnforceStrictDeadline(e.target.checked)} />
                                                Enforce strict deadline (Lock lessons after due date)
                                            </label>
                                        </div>
                                    </div>

                                    <div style={{ borderTop: '1px dashed var(--mlab-border)', paddingTop: '1rem' }}>
                                        <div className="lfm-section-hdr" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '8px' }}>
                                            <ListChecks size={13} /> Lesson Pacing Schedule
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setGranularity('group')}
                                                style={{
                                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                    background: granularity === 'group' ? 'var(--mlab-blue)' : 'var(--mlab-bg)',
                                                    color: granularity === 'group' ? 'var(--mlab-white)' : 'var(--mlab-grey)',
                                                    border: '1px solid var(--mlab-border)', padding: '8px 12px', fontSize: '0.72rem',
                                                    fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer'
                                                }}
                                            >
                                                <Layers size={13} /> Group by Topic
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setGranularity('lesson')}
                                                style={{
                                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                    background: granularity === 'lesson' ? 'var(--mlab-blue)' : 'var(--mlab-bg)',
                                                    color: granularity === 'lesson' ? 'var(--mlab-white)' : 'var(--mlab-grey)',
                                                    border: '1px solid var(--mlab-border)', padding: '8px 12px', fontSize: '0.72rem',
                                                    fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer'
                                                }}
                                            >
                                                <Rows3 size={13} /> Per Lesson
                                            </button>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleGeneratePreview}
                                            disabled={!startDate || !endDate || units.length === 0}
                                            style={{
                                                width: '100%',
                                                background: (!startDate || !endDate) ? 'var(--mlab-border)' : 'var(--mlab-blue-dark)',
                                                color: (!startDate || !endDate) ? 'var(--mlab-grey-lt)' : 'white',
                                                border: 'none', padding: '10px 14px', fontSize: '0.78rem', fontFamily: 'var(--font-heading)',
                                                textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700,
                                                cursor: (!startDate || !endDate) ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            Generate Schedule Preview
                                        </button>

                                        {scheduleError && (
                                            <div className="lfm-error-banner" style={{ marginTop: '10px' }}>
                                                <AlertTriangle size={14} /> {scheduleError}
                                            </div>
                                        )}

                                        {previewSchedule && previewSchedule.length > 0 && !scheduleError && (
                                            <div style={{ marginTop: '10px', background: 'var(--mlab-green-bg)', border: '1px solid var(--mlab-green)', padding: '10px 12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-green-dark)', fontSize: '0.78rem', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
                                                        <CheckCircle2 size={16} />
                                                        <span>{previewSchedule.length} lesson(s) mapped across {distinctDueDates} distinct date(s).</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowScheduleDetails(!showScheduleDetails)}
                                                        style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}
                                                    >
                                                        <Eye size={12} /> {showScheduleDetails ? 'Hide' : 'Inspect'}
                                                    </button>
                                                </div>

                                                {showScheduleDetails && (
                                                    <div style={{ marginTop: '10px', borderTop: '1px dashed var(--mlab-green)', paddingTop: '10px' }}>
                                                        <div style={{ maxHeight: '160px', overflowY: 'auto', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)' }}>
                                                            <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--font-body)' }}>
                                                                <thead>
                                                                    <tr style={{ background: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', color: 'var(--mlab-grey)' }}>
                                                                        <th style={{ padding: '6px 10px', width: '60%' }}>Lesson Title</th>
                                                                        <th style={{ padding: '6px 10px', width: '40%' }}>Due Date Override</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {previewSchedule.map((entry, idx) => {
                                                                        const matchedUnit = units.find(u => u.id === entry.unitId) || units[idx];
                                                                        return (
                                                                            <tr key={entry.unitId} style={{ borderBottom: '1px solid var(--mlab-border)' }}>
                                                                                <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
                                                                                    #{matchedUnit?.orderIndex || idx + 1} • {matchedUnit?.title}
                                                                                </td>
                                                                                <td style={{ padding: '4px 10px' }}>
                                                                                    <input
                                                                                        type="date"
                                                                                        className="lfm-input"
                                                                                        value={entry.dueDate}
                                                                                        onChange={e => handleOverrideDueDate(entry.unitId, e.target.value)}
                                                                                        style={{ padding: '2px 6px', fontSize: '0.72rem', width: '100%' }}
                                                                                    />
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: '24px 20px', background: 'var(--mlab-green-bg)', border: '2px solid var(--mlab-green)', color: 'var(--mlab-green-dark)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px' }}>
                                    <Infinity size={36} color="var(--mlab-green-dark)" />
                                    <strong style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Evergreen Mode Active
                                    </strong>
                                    <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-body)', maxWidth: '420px', lineHeight: 1.4 }}>
                                        Learners will gain immediate, unrestricted access to all <strong>{units.length}</strong> master lessons upon enrollment without hard expiry deadlines.
                                    </span>
                                </div>
                            )}

                        </div>
                    )}

                </div>

                {/* FOOTER */}
                <div className="lfm-footer" style={{ padding: '1rem 1.5rem', background: 'var(--mlab-bg)', borderTop: '2px solid var(--mlab-border)' }}>
                    <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={launching}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleLaunch}
                        disabled={!canLaunch || launching}
                        className="lfm-btn lfm-btn--primary"
                        style={{ minWidth: '160px', justifyContent: 'center' }}
                    >
                        {launching ? (
                            <><Loader2 size={14} className="lfm-spin" /> Launching…</>
                        ) : (
                            <><Rocket size={14} /> Launch This Run</>
                        )}
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};