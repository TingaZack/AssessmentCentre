// src/pages/LearnerPortal/LearnerContentHub/types.ts

import React from 'react';
import {
    Code, Braces, FileCode, Terminal, GitBranch, Webhook, Globe, Laptop, Bug,
    Cpu, Cloud, Server, HardDrive, Boxes, Network, CircuitBoard,
    Bot, Brain, Sparkles, Database, BarChart3, PieChart, TrendingUp, Table,
    Smartphone, Tablet, Monitor,
    Shield, Lock, Key, Fingerprint,
    Layout, Palette, Paintbrush, PenTool, VectorSquare,
    Kanban, Target, Rocket, Briefcase, DollarSign, Compass,
    BookOpen, GraduationCap, Award, Lightbulb, Workflow, Video
} from 'lucide-react';
import type { LearningUnit } from '../../../types/content.types';

export type HubView = 'catalog' | 'overview' | 'player';

export type CohortRunStatus =
    | 'active'
    | 'open_for_applications'
    | 'applications_closed'
    | 'upcoming'
    | 'ended'
    | 'draft';

export interface ThemeStyles {
    gradient: string;
    primaryBox: string;
    accentBox: string;
    borderTopColor: string;
    badgeText: string;
    badgeBg?: string;
}

export interface CourseInstructor {
    name: string;
    role: string;
    avatarUrl?: string;
    initials?: string;
}

export interface PacingMilestone {
    moduleOrSprintTitle?: string;
    title?: string;
    targetDate?: string;
    targetHours?: number;
}

export interface TimeBoundConfig {
    isTimeBound?: boolean;
    startDate?: string;
    endDate?: string;
    enforceStrictDeadline?: boolean;
}

export interface SecamDayStructure {
    id?: string;
    title?: string;
    dayCheckpoint?: Record<string, unknown>;
}

export interface SecamSprintStructure {
    id?: string;
    title?: string;
    days?: SecamDayStructure[];
    sprintCheckpoint?: Record<string, unknown>;
}

export interface CoursePackage {
    id: string;
    title: string;
    description: string;
    framework: 'qcto' | 'secam';
    referenceId: string;
    level?: string;
    tags?: string[];
    status?: string;

    // Workload & Hours
    contentHours?: number;
    courseworkHours?: number;
    estimatedTotalHours?: number;
    totalHours?: number;
    totalNotionalHours?: number;

    // Cohort Run & Instance Identifiers
    cohortRunId?: string;
    cohortRunName?: string | null;
    timelineId?: string;
    placementId?: string;
    containerId?: string;

    // Status & Lifecycle
    runStatus?: CohortRunStatus | string;
    startDate?: string | null;
    endDate?: string | null;
    applicationStartDate?: string | null;
    applicationEndDate?: string | null;
    start?: string | null;
    end?: string | null;
    timelineStartDate?: string | null;
    timelineEndDate?: string | null;
    runStartDate?: string | null;
    runEndDate?: string | null;

    openingDateLabel?: string;
    statusLabel?: string;
    isEvergreen?: boolean;
    cohortDurationLabel?: string;
    hasStarted?: boolean;

    // Counts & Progress Stats
    totalUnitsCount: number;
    completedUnitsCount?: number;
    lastActiveUnitId?: string;
    isBookmarked?: boolean;
    isComingSoon?: boolean;
    enrolledCount?: number;

    // Visual Branding
    illustrationType?: string;
    themeColor?: string;

    // Additional Details & Metadata
    rating?: number;
    previewVideoUrl?: string;
    lastUpdatedLabel?: string;
    hasCertificate?: boolean;
    instructors?: CourseInstructor[];

    // Curricular Lists
    whatYouWillLearn?: string[];
    prerequisites?: string[];
    requirements?: string[];
    targetAudience?: string[];
    materialIncludes?: string[];

    // Accreditation & SETA Specs
    accreditationBody?: string;
    customAccreditationText?: string;
    saqaId?: string;
    nqfLevel?: string | number;
    credits?: number;

    // Pacing & Delivery
    timeBoundConfig?: TimeBoundConfig;
    pacingModel?: 'cohort_scheduled' | 'individual_self_paced';
    pacingScheduleBreakdown?: PacingMilestone[];

    // Certificate Issuance Config
    isCertificateAwarded?: boolean;
    certificateIssuerMode?: 'mlab_internal' | 'external_authority';
    certificateTemplateId?: string;
    externalIssuerName?: string;
    awaitingExternalNotice?: string;

    // Blueprint Snapshots
    checkpointMetadata?: Record<string, unknown>;
    secamStructure?: SecamSprintStructure[];
    allowedProgressKeys?: string[];
}

export interface InteractiveCheckDetails {
    checkType: 'spot_the_bug' | 'socratic_dialogue' | 'oral_defense' | 'quiz' | 'none' | string;
    instructions?: string;
    isRequiredForCompletion?: boolean;
    timeLimitSeconds?: number;
    buggyCode?: string;
    solutionCode?: string;
    aiPersonaRole?: string;
    defenseQuestion?: string;
}

export interface LearnerUnitProgress extends Omit<
    Partial<LearningUnit>,
    'id' | 'containerId' | 'framework' | 'title' | 'unitType' | 'estimatedMinutes' | 'isRequired' | 'orderIndex' | 'interactiveCheck' | 'moduleType'
> {
    id: string;
    containerId: string;
    framework: 'qcto' | 'secam';
    title: string;
    unitType: 'video' | 'reading' | 'interactive_code' | string;
    estimatedMinutes: number;
    isRequired: boolean;
    orderIndex: number;
    isCompleted: boolean;
    isLocked: boolean;
    watchPercentage?: number;
    progressPercent?: number;
    quizScore?: number;
    sprintTitle?: string;
    dayOrLessonTitle?: string;
    moduleCode?: string;
    moduleType?: 'knowledge' | 'practical' | 'workplace' | string;
    topicId?: string;
    videoUrl?: string;
    contentHtml?: string;
    requiredWatchPercentage?: number;
    isRequiredForNextUnit?: boolean;
    linkedAssessmentId?: string | null;
    unlinkedPolicy?: 'soft_gate' | 'hard_gate';
    interactiveCheck?: InteractiveCheckDetails;
    createdAt?: string;
    updatedAt?: string;
}

const hexToRgb = (hex: string) => {
    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
        clean = clean.split('').map(c => c + c).join('');
    }
    const num = parseInt(clean, 16);
    if (isNaN(num)) return { r: 2, g: 132, b: 199 };
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
};

export const getThemeStyles = (hexColor?: string, framework?: string): ThemeStyles => {
    const rawHex = (hexColor || (framework === 'qcto' ? '#059669' : '#0284c7')).trim().toLowerCase();

    switch (rawHex) {
        case '#059669':
        case 'green':
            return {
                gradient: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                primaryBox: '#059669',
                accentBox: '#86efac',
                borderTopColor: '#059669',
                badgeText: '#047857',
                badgeBg: '#dcfce7'
            };
        case '#7c3aed':
        case 'purple':
            return {
                gradient: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                primaryBox: '#7c3aed',
                accentBox: '#f59e0b',
                borderTopColor: '#7c3aed',
                badgeText: '#6d28d9',
                badgeBg: '#f3e8ff'
            };
        case '#d97706':
        case 'amber':
        case 'orange':
            return {
                gradient: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                primaryBox: '#d97706',
                accentBox: '#f97316',
                borderTopColor: '#d97706',
                badgeText: '#b45309',
                badgeBg: '#fef3c7'
            };
        case '#be123c':
        case 'red':
            return {
                gradient: 'linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%)',
                primaryBox: '#be123c',
                accentBox: '#fda4af',
                borderTopColor: '#be123c',
                badgeText: '#be123c',
                badgeBg: '#ffe4e6'
            };
        case '#0d9488':
        case 'teal':
            return {
                gradient: 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)',
                primaryBox: '#0d9488',
                accentBox: '#5eead4',
                borderTopColor: '#0d9488',
                badgeText: '#0f766e',
                badgeBg: '#ccfbf1'
            };
        case '#0f172a':
        case 'slate':
            return {
                gradient: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                primaryBox: '#0f172a',
                accentBox: '#38bdf8',
                borderTopColor: '#0f172a',
                badgeText: '#0f172a',
                badgeBg: '#f1f5f9'
            };
        case '#0284c7':
        case 'blue':
        default:
            if (rawHex.startsWith('#')) {
                const { r, g, b } = hexToRgb(rawHex);
                return {
                    gradient: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.18) 0%, rgba(${r}, ${g}, ${b}, 0.32) 100%)`,
                    primaryBox: rawHex,
                    accentBox: `rgba(${r}, ${g}, ${b}, 0.35)`,
                    borderTopColor: rawHex,
                    badgeText: rawHex,
                    badgeBg: `rgba(${r}, ${g}, ${b}, 0.1)`
                };
            }
            return {
                gradient: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
                primaryBox: '#0284c7',
                accentBox: '#86efac',
                borderTopColor: '#0284c7',
                badgeText: '#0369a1',
                badgeBg: '#e0f2fe'
            };
    }
};

export const getBannerBackground = (type?: string, customColor?: string) => {
    return getThemeStyles(customColor, type).gradient;
};

export const CourseIllustrationGraphic: React.FC<{
    type?: string;
    themeColor?: string;
    framework?: string;
    size?: number;
}> = ({ type = 'code', themeColor, framework, size = 22 }) => {
    const theme = getThemeStyles(themeColor, framework);

    const renderIcon = (iconType?: string) => {
        switch (iconType?.toLowerCase()) {
            case 'code':
            case 'fullstack':
                return <Code size={size} color="white" />;
            case 'braces':
                return <Braces size={size} color="white" />;
            case 'file_code':
                return <FileCode size={size} color="white" />;
            case 'terminal':
                return <Terminal size={size} color="white" />;
            case 'git':
                return <GitBranch size={size} color="white" />;
            case 'webhook':
                return <Webhook size={size} color="white" />;
            case 'globe':
                return <Globe size={size} color="white" />;
            case 'laptop':
                return <Laptop size={size} color="white" />;
            case 'bug_fix':
                return <Bug size={size} color="white" />;
            case 'cpu':
                return <Cpu size={size} color="white" />;
            case 'cloud':
                return <Cloud size={size} color="white" />;
            case 'server':
                return <Server size={size} color="white" />;
            case 'hard_drive':
                return <HardDrive size={size} color="white" />;
            case 'containers':
                return <Boxes size={size} color="white" />;
            case 'network':
                return <Network size={size} color="white" />;
            case 'circuit':
                return <CircuitBoard size={size} color="white" />;
            case 'ai':
            case 'ai_studio':
                return <Bot size={size} color="white" />;
            case 'brain':
                return <Brain size={size} color="white" />;
            case 'sparkles':
                return <Sparkles size={size} color="white" />;
            case 'database':
                return <Database size={size} color="white" />;
            case 'analytics':
                return <BarChart3 size={size} color="white" />;
            case 'pie_chart':
                return <PieChart size={size} color="white" />;
            case 'trends':
                return <TrendingUp size={size} color="white" />;
            case 'data_table':
                return <Table size={size} color="white" />;
            case 'mobile':
                return <Smartphone size={size} color="white" />;
            case 'tablet':
                return <Tablet size={size} color="white" />;
            case 'monitor':
                return <Monitor size={size} color="white" />;
            case 'security':
                return <Shield size={size} color="white" />;
            case 'lock':
                return <Lock size={size} color="white" />;
            case 'key':
                return <Key size={size} color="white" />;
            case 'fingerprint':
                return <Fingerprint size={size} color="white" />;
            case 'design':
                return <Layout size={size} color="white" />;
            case 'palette':
                return <Palette size={size} color="white" />;
            case 'paintbrush':
                return <Paintbrush size={size} color="white" />;
            case 'pentool':
                return <PenTool size={size} color="white" />;
            case 'vector':
                return <VectorSquare size={size} color="white" />;
            case 'agile':
                return <Kanban size={size} color="white" />;
            case 'target':
                return <Target size={size} color="white" />;
            case 'rocket':
                return <Rocket size={size} color="white" />;
            case 'briefcase':
                return <Briefcase size={size} color="white" />;
            case 'finance':
                return <DollarSign size={size} color="white" />;
            case 'compass':
                return <Compass size={size} color="white" />;
            case 'education':
                return <BookOpen size={size} color="white" />;
            case 'degree':
            case 'qcto_systems':
                return <GraduationCap size={size} color="white" />;
            case 'award':
                return <Award size={size} color="white" />;
            case 'idea':
                return <Lightbulb size={size} color="white" />;
            case 'devops':
                return <Workflow size={size} color="white" />;
            case 'live_class':
                return <Video size={size} color="white" />;
            default:
                return <Code size={size} color="white" />;
        }
    };

    return (
        <div style={{ position: 'relative', width: '68px', height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
                position: 'absolute',
                bottom: '2px',
                right: '4px',
                width: '38px',
                height: '38px',
                backgroundColor: theme.accentBox,
                border: '2px solid #0f172a',
                borderRadius: '0px'
            }} />
            <div style={{
                position: 'absolute',
                top: '0px',
                left: '4px',
                width: '48px',
                height: '42px',
                backgroundColor: theme.primaryBox,
                border: '2px solid #0f172a',
                borderRadius: '0px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '2px 2px 0px rgba(15,23,42,0.15)'
            }}>
                {renderIcon(type)}
            </div>
        </div>
    );
};

export const ProgressBar: React.FC<{ completed: number; total: number; trackColor?: string; fillColor?: string }> = ({
    completed, total, trackColor = '#e2e8f0', fillColor = 'var(--mlab-green, #94c73d)'
}) => {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ height: '6px', width: '100%', background: trackColor, position: 'relative', overflow: 'hidden', borderRadius: 0 }}>
                <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: fillColor,
                    transition: 'width 0.4s ease'
                }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 700, color: '#64748b', fontFamily: 'var(--font-heading)' }}>
                <span style={{ color: 'var(--mlab-green)' }}>{completed} OF {total} LESSONS</span>
                <span style={{ color: pct > 0 ? 'var(--mlab-green)' : '#94a3b8' }}>{pct}%</span>
            </div>
        </div>
    );
};