// src/components/common/ModuleProgressCard/ModuleProgressCard.tsx

import React, { useState, useEffect } from 'react';
import { Info } from 'lucide-react';

export interface ModuleProgressCardProps {
    type: 'Knowledge' | 'Practical' | 'Workplace' | 'Active Learners' | 'Workplace Placements' | 'Pending Marking' | 'Dropped / Exited' | 'Global Retention' | 'Pipeline Activation' | 'Active Attendance' | 'Total Training Time';
    data: {
        total: number;
        logged: number;
    };
}

export const ModuleProgressCard: React.FC<ModuleProgressCardProps> = ({ type, data }) => {
    const [animatedPct, setAnimatedPct] = useState(0);
    const [showTooltip, setShowTooltip] = useState(false);

    const targetPct = data.total > 0 ? Math.round((data.logged / data.total) * 100) : 0;
    const remaining = Math.max(0, data.total - data.logged);
    const remainingPct = data.total > 0 ? Math.round((remaining / data.total) * 100) : (data.total === 0 ? 0 : 100);

    useEffect(() => {
        const t = setTimeout(() => setAnimatedPct(targetPct), 150);
        return () => clearTimeout(t);
    }, [targetPct]);

    const C = 282.6; // Circumference for r=45
    const offset = C - (C * animatedPct / 100);

    const isStarted = data.logged > 0;
    const isComplete = data.total > 0 && data.logged >= data.total;
    const isKPI = ['Active Learners', 'Workplace Placements', 'Pending Marking', 'Dropped / Exited', 'Global Retention', 'Pipeline Activation', 'Active Attendance', 'Total Training Time'].includes(type);

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
            color: '#94c73d', bg: '#f0f7e1', title: 'Workplace Placements', unit: 'learners', label: 'Cohort KPI', bar1: 'Placed', bar2: 'Unplaced',
            description: 'Percentage of active learners successfully placed with host companies for workplace experience.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#94c73d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="3"></rect><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"></path></svg>
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
            color: '#073f4e', bg: '#e8f0f3', title: 'Active Attendance', unit: 'avg %', label: 'Bootcamp KPI', bar1: 'Attended', bar2: 'Missed',
            description: 'Average attendance percentage calculated across all active learners for recorded class sessions.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#073f4e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
        },
        'Total Training Time': {
            color: '#94c73d', bg: '#f0f7e1', title: 'Total Training Time', unit: 'hours', label: 'Bootcamp KPI', bar1: 'Logged', bar2: 'Target',
            description: 'Cumulative training and lecture hours recorded for this cohort across all attendance logs.',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#94c73d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        }
    };

    const { color, bg, title, icon, unit, label, bar1, bar2, description } = config[type] || config['Knowledge'];

    return (
        <div style={{ background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', transition: 'transform 0.2s ease', position: 'relative', cursor: 'default' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', borderBottom: '1px solid var(--mlab-border)', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ color }}>{icon}</div>
                    <div>
                        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--mlab-grey)', marginBottom: '4px' }}>
                            {label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--mlab-blue)', letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.2 }}>
                                {title}
                            </div>

                            {/* 🚀 EXPLAINER TOOLTIP TRIGGER */}
                            <div
                                style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
                                onMouseEnter={() => setShowTooltip(true)}
                                onMouseLeave={() => setShowTooltip(false)}
                            >
                                <Info size={13} color="var(--mlab-grey)" />

                                {/* Popover Tooltip Box */}
                                {showTooltip && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        marginTop: '6px',
                                        width: '210px',
                                        padding: '10px 12px',
                                        background: 'var(--mlab-blue)',
                                        color: 'var(--mlab-white)',
                                        fontSize: '0.725rem',
                                        fontFamily: 'var(--font-body)',
                                        fontWeight: 500,
                                        lineHeight: 1.4,
                                        borderRadius: 0,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                        zIndex: 99,
                                        border: '1px solid var(--mlab-green)'
                                    }}>
                                        {description}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--mlab-blue)', flexShrink: 0 }}>{targetPct}%</div>
            </div>

            {/* Circular Ring SVG */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '1rem 0' }}>
                <svg width="110" height="110" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                    {/* Background Track Circle */}
                    <circle cx="50" cy="50" r="45" fill="transparent" stroke="var(--mlab-border)" strokeWidth="8" />
                    {/* Animated Fill Circle */}
                    <circle
                        cx="50" cy="50" r="45"
                        fill="transparent"
                        stroke={color}
                        strokeWidth="8"
                        strokeLinecap="butt"
                        strokeDasharray="282.6"
                        style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1) 0.15s' }}
                    />
                </svg>
                {/* Center Text Wrapper */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, lineHeight: 1, color: 'var(--mlab-blue)' }}>{data.logged}</div>
                    <div style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700, color: 'var(--mlab-grey)', textAlign: 'center' }}>of {data.total} <br /> {unit}</div>
                </div>
            </div>

            {/* Bar Charts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>{bar1}</span>
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{data.logged} {unit}</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'var(--mlab-border)' }}>
                        <div style={{ height: '100%', width: `${animatedPct}%`, background: color, transition: 'width 1.4s cubic-bezier(0.4, 0, 0.2, 1) 0.35s' }}></div>
                    </div>
                </div>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>{bar2}</span>
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{remaining} {unit}</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'var(--mlab-border)' }}>
                        <div style={{ height: '100%', width: `${data.total === 0 ? 0 : remainingPct}%`, background: bg, transition: 'width 1.4s cubic-bezier(0.4, 0, 0.2, 1) 0.35s' }}></div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid var(--mlab-border)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}><strong style={{ fontWeight: 700, color: 'var(--mlab-blue)' }}>{data.total}</strong> total {unit}</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: color, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {isComplete ? (isKPI ? 'Target Reached' : 'Complete') : isStarted ? <><span style={{ width: '6px', height: '6px', background: color, flexShrink: 0 }}></span>{isKPI ? 'Tracking' : 'In Progress'}</> : 'Not Started'}
                </span>
            </div>
        </div>
    );
};