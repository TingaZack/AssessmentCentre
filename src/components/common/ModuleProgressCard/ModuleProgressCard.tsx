// src/components/common/ModuleProgressCard/ModuleProgressCard.tsx

import React, { useState, useEffect } from 'react';
import {
    Info, Scale, MonitorPlay, BookOpen, Layers,
    MapPin, GraduationCap, AlertTriangle, ShieldCheck,
    Landmark, Wallet, Percent, User, Briefcase, CalendarCheck
} from 'lucide-react';

export type ModuleCardType =
    | 'Knowledge' | 'Practical' | 'Workplace'
    | 'Active Learners' | 'Workplace Placements' | 'Pending Marking' | 'Dropped / Exited'
    | 'Global Retention' | 'Pipeline Activation' | 'Active Attendance' | 'Attendance Ratio' | 'Total Training Time'
    | 'Active Appeals' | 'Live Classes' | 'Active Qualifications' | 'Active Cohorts'
    | 'Active Campuses' | 'EISA Readiness' | 'At-Risk Analytics' | 'Web3 Certificates'
    | 'ETI Tax Rebates' | 'Recognized Spend' | 'ACI Demographics' | 'Youth Representation'
    | 'Gender Diversity' | 'Performance Risk';

export interface ProgressSegment {
    label: string;
    value: number;
    color: string;
}

export interface ProgressLine {
    label: string;
    value: number;
    total: number;
    color: string;
    bg?: string;
}

export interface ModuleProgressCardProps {
    type: ModuleCardType;
    data: {
        total: number;
        logged: number;
        subValue?: string;
        segments?: ProgressSegment[];
        lines?: ProgressLine[];
    };
    orientation?: 'portrait' | 'landscape';
    onClick?: () => void;
}

export const ModuleProgressCard: React.FC<ModuleProgressCardProps> = ({
    type,
    data,
    orientation = 'portrait',
    onClick
}) => {
    const [animatedPct, setAnimatedPct] = useState(0);
    const [isMounted, setIsMounted] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);

    const targetPct = data.total > 0 ? Math.round((data.logged / data.total) * 100) : 0;
    const remaining = Math.max(0, data.total - data.logged);
    const remainingPct = data.total > 0 ? Math.round((remaining / data.total) * 100) : (data.total === 0 ? 0 : 100);

    useEffect(() => {
        setIsMounted(true);
        const t = setTimeout(() => setAnimatedPct(targetPct), 150);
        return () => clearTimeout(t);
    }, [targetPct]);

    const isStarted = data.logged > 0;
    const isComplete = data.total > 0 && data.logged >= data.total;

    const config: Record<string, any> = {
        'Knowledge': {
            color: '#94c73d', bg: '#f0f7e1', title: 'Knowledge Modules', unit: 'topics', label: 'Module Type', bar1: 'Covered', bar2: 'Remaining',
            description: 'Tracks completed classroom topics vs remaining curriculum requirements across all Knowledge Modules.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#94c73d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>
        },
        'Practical': {
            color: '#073f4e', bg: '#e8f0f3', title: 'Practical Modules', unit: 'topics', label: 'Module Type', bar1: 'Covered', bar2: 'Remaining',
            description: 'Monitors hands-on lab exercises and practical demonstration tasks completed in class.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#073f4e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>
        },
        'Workplace': {
            color: '#f59e0b', bg: '#fef3c7', title: 'Workplace Modules', unit: 'topics', label: 'Module Type', bar1: 'Covered', bar2: 'Remaining',
            description: 'Measures workplace logbook signatures and host employer practical application milestones.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="3" /><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" /></svg>
        },
        'Active Learners': {
            color: '#073f4e', bg: '#e8f0f3', title: 'Active Learners', unit: 'learners', label: 'Cohort KPI', bar1: 'Active', bar2: 'Dropped',
            description: 'Total number of enrolled applicants currently participating and not marked as withdrawn.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#073f4e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        },
        'Workplace Placements': {
            color: '#94c73d', bg: '#f0f7e1', title: 'Workplace Placements', unit: 'learners', label: 'Ecosystem KPI', bar1: 'Placed', bar2: 'Open Seats',
            description: 'Percentage of ecosystem host company capacity currently filled by active learners.',
            icon: <Briefcase size={19} color="#94c73d" />
        },
        'Pending Marking': {
            color: '#f59e0b', bg: '#fef3c7', title: 'Pending Marking', unit: 'submissions', label: 'Operations KPI', bar1: 'Pending', bar2: 'Graded',
            description: 'Submitted learner assessments waiting for facilitator evaluation and grading.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        },
        'Dropped / Exited': {
            color: '#ef4444', bg: '#fef2f2', title: 'Dropped / Exited', unit: 'learners', label: 'Cohort KPI', bar1: 'Dropped', bar2: 'Active',
            description: 'Count and percentage of applicants who officially withdrew or were dropped from the cohort.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
        },
        'Global Retention': {
            color: '#073f4e', bg: '#e8f0f3', title: 'Global Retention', unit: 'learners', label: 'Bootcamp KPI', bar1: 'Retained', bar2: 'Withdrawn',
            description: 'Calculates the proportion of registered applicants who remain active vs those who dropped out.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#073f4e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        },
        'Pipeline Activation': {
            color: '#94c73d', bg: '#f0f7e1', title: 'Pipeline Activation', unit: 'learners', label: 'Bootcamp KPI', bar1: 'Started', bar2: 'Inactive',
            description: 'Measures learners who have attended at least one session vs those who enrolled but never joined.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#94c73d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        },
        'Active Attendance': {
            color: '#073f4e', bg: '#e8f0f3', title: 'Active Attendance', unit: 'sessions', label: 'Attendance KPI', bar1: 'Attended', bar2: 'Missed',
            description: 'Average attendance percentage calculated across all active learners for recorded class sessions.',
            icon: <CalendarCheck size={19} color="#073f4e" />
        },
        'Attendance Ratio': {
            color: '#073f4e', bg: '#e8f0f3', title: 'Attendance Ratio', unit: 'sessions', label: 'Attendance KPI', bar1: 'Present', bar2: 'Absent',
            description: 'Calculates overall compliance ratio broken down by full present, partial, and absent session records.',
            icon: <CalendarCheck size={19} color="#073f4e" />
        },
        'Total Training Time': {
            color: '#94c73d', bg: '#f0f7e1', title: 'Total Training Time', unit: 'hours', label: 'Bootcamp KPI', bar1: 'Logged', bar2: 'Target',
            description: 'Cumulative training and lecture hours recorded for this cohort across all attendance logs.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#94c73d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        },
        'Gender Diversity': {
            color: '#ec4899', bg: '#fdf2f8', title: 'Gender Diversity', unit: 'learners', label: 'Transformation KPI', bar1: 'Female', bar2: 'Male',
            description: 'Ratio of female to male candidates currently active in the pipeline.',
            icon: <User size={19} color="#ec4899" />
        },
        'Performance Risk': {
            color: '#f59e0b', bg: '#fef3c7', title: 'Performance Risk', unit: 'learners', label: 'Bootcamp KPI', bar1: 'At Risk', bar2: 'Safe',
            description: 'Identifies learners falling below the 50% attendance threshold or ghosting classes entirely.',
            icon: <AlertTriangle size={19} color="#f59e0b" />
        },
        'Active Appeals': {
            color: '#ef4444', bg: '#fef2f2', title: 'Active Appeals', unit: 'appeals', label: 'Operations KPI', bar1: 'Appealed', bar2: 'Resolved',
            description: 'Assessments currently under dispute or requiring moderation review.',
            icon: <Scale size={19} color="#ef4444" />
        },
        'Live Classes': {
            color: '#0ea5e9', bg: '#e0f2fe', title: 'Live Classes', unit: 'sessions', label: 'Operations KPI', bar1: 'Active Now', bar2: 'Scheduled',
            description: 'Kiosk sessions actively running today versus total active cohorts.',
            icon: <MonitorPlay size={19} color="#0ea5e9" />
        },
        'Active Qualifications': {
            color: '#0ea5e9', bg: '#e0f2fe', title: 'Active Qualifications', unit: 'programs', label: 'Capacity KPI', bar1: 'Active', bar2: 'Archived',
            description: 'Number of active qualification templates currently in use.',
            icon: <BookOpen size={19} color="#0ea5e9" />
        },
        'Active Cohorts': {
            color: '#8b5cf6', bg: '#f3e8ff', title: 'Active Cohorts', unit: 'classes', label: 'Capacity KPI', bar1: 'Ongoing', bar2: 'Inactive',
            description: 'Currently running classes versus total historical classes.',
            icon: <Layers size={19} color="#8b5cf6" />
        },
        'Active Campuses': {
            color: '#f59e0b', bg: '#fef3c7', title: 'Active Campuses', unit: 'locations', label: 'Capacity KPI', bar1: 'Active', bar2: 'Unused',
            description: 'Physical campus locations currently hosting active cohorts.',
            icon: <MapPin size={19} color="#f59e0b" />
        },
        'EISA Readiness': {
            color: '#94c73d', bg: '#f0f7e1', title: 'EISA Readiness', unit: 'learners', label: 'Quality KPI', bar1: 'Admitted', bar2: 'Pending',
            description: 'Learners who have completed all formative requirements and are ready for final exams.',
            icon: <GraduationCap size={19} color="#94c73d" />
        },
        'At-Risk Analytics': {
            color: '#ef4444', bg: '#fef2f2', title: 'At-Risk Analytics', unit: 'placements', label: 'Audit Risk KPI', bar1: 'Non-Compliant', bar2: 'Compliant',
            description: 'Placements with missing contracts, unassigned mentors, or overdue end dates.',
            icon: <AlertTriangle size={19} color="#ef4444" />
        },
        'Web3 Certificates': {
            color: '#8b5cf6', bg: '#f3e8ff', title: 'Web3 Certificates', unit: 'issued', label: 'Certification KPI', bar1: 'Secured', bar2: 'Pending',
            description: 'Official digital certificates successfully minted to the blockchain.',
            icon: <ShieldCheck size={19} color="#8b5cf6" />
        },
        'ETI Tax Rebates': {
            color: '#16a34a', bg: '#dcfce7', title: 'SARS ETI Rebates', unit: 'eligible', label: 'SARS Financial Auditor', bar1: 'Eligible', bar2: 'Ineligible',
            description: 'Evaluates active learners qualifying for SARS Employment Tax Incentive claims based on age and stipend.',
            icon: <Landmark size={19} color="#16a34a" />
        },
        'Recognized Spend': {
            color: '#4338ca', bg: '#e0e7ff', title: 'Recognized Spend', unit: 'funded', label: 'B-BBEE Auditor', bar1: 'Stipend Spend', bar2: 'Unallocated',
            description: 'Projected stipend capital allocated toward B-BBEE Skills Development spend targets across host companies.',
            icon: <Wallet size={19} color="#4338ca" />
        },
        'ACI Demographics': {
            color: '#b45309', bg: '#fef3c7', title: 'ACI Demographics', unit: 'learners', label: 'Transformation KPI', bar1: 'Black / ACI', bar2: 'Other',
            description: 'African, Coloured, and Indian representation percentage across all placed learners.',
            icon: <Percent size={19} color="#b45309" />
        },
        'Youth Representation': {
            color: '#4d7c0f', bg: '#ecfccb', title: 'Youth Employment', unit: 'learners', label: 'Transformation KPI', bar1: 'Youth (<35)', bar2: 'Over 35',
            description: 'Ratio of candidates under the age of 35 verified against National ID numbers.',
            icon: <User size={19} color="#4d7c0f" />
        }
    };

    const { color, bg, title, icon, unit, label, bar1, bar2, description } = config[type] || config['Knowledge'];

    // MULTI-SEGMENT RING GENERATOR
    const renderRingSVG = (radius: number, strokeW: number) => {
        const C = 2 * Math.PI * radius;
        const hasSegments = data.segments && data.segments.length > 0;

        if (hasSegments) {
            let cumulativePct = 0;
            return (
                <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
                    <circle cx="50" cy="50" r={radius} fill="transparent" stroke="var(--mlab-border)" strokeWidth={strokeW} />
                    {data.segments!.map((seg, i) => {
                        const pct = data.total > 0 ? (seg.value / data.total) * 100 : 0;
                        const length = (pct / 100) * C;
                        const rotation = (cumulativePct / 100) * 360;
                        cumulativePct += pct;

                        const animatedLength = isMounted ? length : 0;
                        const animatedOffset = C - animatedLength;

                        if (seg.value === 0) return null;

                        return (
                            <circle
                                key={i}
                                cx="50" cy="50" r={radius}
                                fill="transparent"
                                stroke={seg.color}
                                strokeWidth={strokeW}
                                strokeLinecap="butt"
                                strokeDasharray={C}
                                style={{
                                    strokeDashoffset: animatedOffset,
                                    transform: `rotate(${rotation}deg)`,
                                    transformOrigin: '50px 50px',
                                    transition: `stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1) ${0.15 + (i * 0.1)}s`
                                }}
                            />
                        );
                    })}
                </svg>
            );
        }

        const animatedOffset = C - (C * animatedPct / 100);
        return (
            <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
                <circle cx="50" cy="50" r={radius} fill="transparent" stroke="var(--mlab-border)" strokeWidth={strokeW} />
                <circle
                    cx="50" cy="50" r={radius}
                    fill="transparent"
                    stroke={color}
                    strokeWidth={strokeW}
                    strokeLinecap="butt"
                    strokeDasharray={C}
                    style={{ strokeDashoffset: animatedOffset, transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1) 0.15s' }}
                />
            </svg>
        );
    };

    const renderProgressSection = () => {
        const hasSegments = data.segments && data.segments.length > 0;
        const hasLines = data.lines && data.lines.length > 0;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: orientation === 'landscape' ? '450px' : '100%' }}>
                {hasSegments && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', width: '100%', height: '8px', overflow: 'hidden', background: 'var(--mlab-border)' }}>
                            {data.segments!.map((seg, i) => {
                                const w = data.total > 0 ? (seg.value / data.total) * 100 : 0;
                                return (
                                    <div
                                        key={i}
                                        style={{
                                            height: '100%',
                                            width: isMounted ? `${w}%` : '0%',
                                            background: seg.color,
                                            transition: `width 1.2s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.15}s`
                                        }}
                                        title={`${seg.label}: ${seg.value}`}
                                    />
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', rowGap: '4px', marginTop: '2px' }}>
                            {data.segments!.map((seg, i) => {
                                const pct = data.total > 0 ? Math.round((seg.value / data.total) * 100) : 0;
                                if (seg.value === 0) return null;
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--mlab-grey)' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: seg.color }} />
                                        {seg.label} ({pct}%)
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {hasLines && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {data.lines!.map((line, i) => {
                            const pct = line.total > 0 ? Math.round((line.value / line.total) * 100) : 0;
                            return (
                                <div key={i}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>{line.label}</span>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: line.color }}>{line.value} {unit}</span>
                                    </div>
                                    <div style={{ width: '100%', height: '6px', background: line.bg || 'var(--mlab-border)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: isMounted ? `${pct}%` : '0%', background: line.color, transition: `width 1.4s cubic-bezier(0.4, 0, 0.2, 1) ${0.3 + (i * 0.1)}s` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!hasSegments && !hasLines && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>{bar1}</span>
                                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{data.logged} {unit}</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'var(--mlab-border)' }}>
                                <div style={{ height: '100%', width: `${animatedPct}%`, background: color, transition: 'width 1.4s cubic-bezier(0.4, 0, 0.2, 1) 0.35s' }}></div>
                            </div>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>{bar2}</span>
                                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{remaining} {unit}</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'var(--mlab-border)' }}>
                                <div style={{ height: '100%', width: `${data.total === 0 ? 0 : remainingPct}%`, background: bg, transition: 'width 1.4s cubic-bezier(0.4, 0, 0.2, 1) 0.35s' }}></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (orientation === 'landscape') {
        return (
            <div
                onClick={onClick}
                style={{
                    background: 'var(--mlab-white)',
                    border: '1px solid var(--mlab-border)',
                    padding: '1.25rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1.5rem',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    position: 'relative',
                    cursor: onClick ? 'pointer' : 'default',
                    borderRadius: '0',
                    gridColumn: '1 / -1'
                }}
                onMouseOver={(e) => {
                    if (onClick) {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
                    }
                }}
                onMouseOut={(e) => {
                    if (onClick) {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = 'none';
                    }
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '240px' }}>
                    <div style={{ color, padding: '10px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {icon}
                    </div>
                    <div>
                        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
                            {label}
                        </div>
                        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {title}
                            <div
                                style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
                                onMouseEnter={() => setShowTooltip(true)}
                                onMouseLeave={() => setShowTooltip(false)}
                            >
                                <Info size={13} color="var(--mlab-grey)" />
                                {showTooltip && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: '0', marginTop: '6px', width: '220px',
                                        padding: '10px 12px', background: 'var(--mlab-blue)', color: 'var(--mlab-white)',
                                        fontSize: '0.725rem', fontFamily: 'var(--font-body)', fontWeight: 500, lineHeight: 1.4,
                                        zIndex: 99, border: '1px solid var(--mlab-green)'
                                    }}>
                                        {description}
                                    </div>
                                )}
                            </div>
                        </div>
                        {data.subValue && <div style={{ fontSize: '0.85rem', fontWeight: 800, color, marginTop: '2px' }}>{data.subValue}</div>}
                    </div>
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                    {renderProgressSection()}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                    <div style={{ position: 'relative', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {renderRingSVG(42, 10)}
                        <span style={{ position: 'absolute', fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-midnight)' }}>{targetPct}%</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={onClick}
            style={{
                background: 'var(--mlab-white)',
                border: '1px solid var(--mlab-border)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                position: 'relative',
                cursor: onClick ? 'pointer' : 'default',
                borderRadius: '0'
            }}
            onMouseOver={(e) => {
                if (onClick) {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
                }
            }}
            onMouseOut={(e) => {
                if (onClick) {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                }
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', borderBottom: '1px solid var(--mlab-border)', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ color }}>{icon}</div>
                    <div>
                        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--mlab-grey)', marginBottom: '4px' }}>
                            {label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 800, color: 'var(--mlab-blue)', letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.2 }}>
                                {title}
                            </div>

                            <div
                                style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
                                onMouseEnter={() => setShowTooltip(true)}
                                onMouseLeave={() => setShowTooltip(false)}
                            >
                                <Info size={13} color="var(--mlab-grey)" />

                                {showTooltip && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                                        marginTop: '6px', width: '210px', padding: '10px 12px', background: 'var(--mlab-blue)',
                                        color: 'var(--mlab-white)', fontSize: '0.725rem', fontFamily: 'var(--font-body)',
                                        fontWeight: 500, lineHeight: 1.4, borderRadius: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                        zIndex: 99, border: '1px solid var(--mlab-green)'
                                    }}>
                                        {description}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--mlab-blue)', flexShrink: 0 }}>{targetPct}%</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '0.5rem 0' }}>
                <div style={{ width: '100px', height: '100px', position: 'relative' }}>
                    {renderRingSVG(45, 8)}
                </div>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 800, lineHeight: 1, color: 'var(--mlab-midnight)' }}>{data.logged}</div>
                    <div style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '0.6rem', fontWeight: 700, color: 'var(--mlab-grey)', textAlign: 'center', marginTop: '2px' }}>of {data.total} <br /> {unit}</div>
                </div>
            </div>

            {renderProgressSection()}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid var(--mlab-border)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
                    {data.subValue ? <strong style={{ fontWeight: 800, color: color }}>{data.subValue}</strong> : <><strong style={{ fontWeight: 700, color: 'var(--mlab-blue)' }}>{data.total}</strong> total {unit}</>}
                </span>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isComplete ? 'Target Met' : isStarted ? <><span style={{ width: '6px', height: '6px', background: color, flexShrink: 0 }}></span>Tracking</> : 'Not Started'}
                </span>
            </div>
        </div>
    );
};