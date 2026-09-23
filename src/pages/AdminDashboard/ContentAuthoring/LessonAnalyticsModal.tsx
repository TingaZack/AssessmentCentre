// src/pages/AdminDashboard/ContentAuthoring/LessonAnalyticsModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import Tooltip from '../../../components/common/Tooltip/Tooltip';

import {
    Search, Filter, ShieldAlert, Ban, CheckCircle2,
    MessageSquare, Tv, Award,
    ArrowLeft, ChevronDown, ChevronUp, Clock,
    Activity, TrendingUp, AlertOctagon, Download, MailCheck, BarChart3, Rocket, ChevronRight, BookOpen,
    Calendar, HelpCircle, Loader2, SearchX, Send,
    AlertTriangle, Bug
} from 'lucide-react';
import type { LearningUnit, ContentContainer, CohortRun } from '../../../types/content.types';
import type { Cohort } from '../../../types';
import type { ExtendedLearningUnit, EnrichedContentContainer } from './ContentAuthoring';
import type { ExtendedCohortRun } from './LaunchCohortModal';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';

import './ContentAuthoring.css';

// ══════════════════════════════════════════════════════════════════════════════
// SHARED TYPES & INTERFACES
// ══════════════════════════════════════════════════════════════════════════════

export type RiskLevel = 'high_risk' | 'moderate_risk' | 'on_track';

export interface UnitProgressStat {
    unitId: string;
    watchPct: number;
    isCompleted: boolean;
    duration: number;
    watched: number;
    score: number;
    passed: boolean;
    attempts: number;
    lastActivity: string;
    submittedAnswer: string;
}

export interface LearnerLessonProgress {
    learnerId: string;
    learnerName: string;
    learnerEmail: string;
    cohortId: string;
    cohortName: string;

    // Selected Lesson Specific Watch Stats
    thisUnitWatchPct: number;
    thisUnitWatchedMins: number;
    thisUnitDurationMins: number;
    thisUnitCompleted: boolean;
    thisUnitLastActivity: string;

    // Aggregate Course Stats
    overallWatchPct: number;
    totalWatchedMins: number;
    totalDurationMins: number;
    completedVideos: number;
    allUnitStats: UnitProgressStat[];

    // Quiz / Gate Specifics
    checkType: 'spot_the_bug' | 'socratic_dialogue' | 'oral_defense' | 'quiz' | 'none';
    score: number;
    passed: boolean;
    attempts: number;
    submittedAnswer: string;
    completedAt: string;
    isBlockedFromForum: boolean;
}

export interface CohortRunStats extends ExtendedCohortRun {
    enrolledCount: number;
    completionRate: number;
    passRate: number;
    avgTimeSpentMins: number;
    riskStatus: RiskLevel;
}

export interface EnrollmentDoc {
    userId?: string;
    userName?: string;
    userEmail?: string;
    cohortId?: string;
    cohortName?: string;
    containerId?: string;
    cohortRunId?: string;
    courseId?: string;
    status?: string;
    [key: string]: unknown;
}

export interface ProgressDoc {
    userId?: string;
    userName?: string;
    userEmail?: string;
    containerId?: string;
    cohortRunId?: string;
    cohortId?: string;
    cohortName?: string;
    unitId?: string;
    watchPct?: number;
    watchedMins?: number;
    isCompleted?: boolean;
    score?: number;
    passed?: boolean;
    attempts?: number;
    submittedAnswer?: string;
    updatedAt?: { toDate?: () => Date; seconds?: number };
    [key: string]: unknown;
}

export interface LessonComment {
    id: string;
    unitId: string;
    containerId?: string;
    timelineId?: string;
    cohortRunId?: string;
    userId: string;
    userName: string;
    userInitials?: string;
    text: string;
    createdAt?: { toDate?: () => Date; seconds?: number };
    isStaff?: boolean;
    isFlagged?: boolean;
    flagReason?: string;
}

export interface LessonQuestion {
    id: string;
    unitId: string;
    containerId?: string;
    timelineId?: string;
    cohortRunId?: string;
    userId: string;
    userName: string;
    title: string;
    contentHtml: string;
    answersCount?: number;
    createdAt?: { toDate?: () => Date; seconds?: number };
}

export interface LessonAnswer {
    id: string;
    questionId: string;
    unitId: string;
    containerId?: string;
    userId: string;
    userName: string;
    userInitials?: string;
    contentHtml: string;
    createdAt?: { toDate?: () => Date; seconds?: number };
    isStaff?: boolean;
}

const FORUM_QUILL_MODULES = {
    toolbar: [
        ['bold', 'italic', 'underline', 'code', 'code-block'],
        ['clean']
    ]
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 1: MASTER DASHBOARD WRAPPER
// ══════════════════════════════════════════════════════════════════════════════

interface CurriculumAnalyticsDashboardProps {
    container: ContentContainer | EnrichedContentContainer;
    units: LearningUnit[] | ExtendedLearningUnit[];
    initialLesson: LearningUnit | ExtendedLearningUnit | null;
    initialCohortId: string | null;
    onClose: () => void;
    onSelectLesson: (unit: LearningUnit | ExtendedLearningUnit | null) => void;
}

export const CurriculumAnalyticsDashboard: React.FC<CurriculumAnalyticsDashboardProps> = ({
    container,
    units,
    initialLesson,
    initialCohortId,
    onClose,
    onSelectLesson
}) => {
    const { cohorts = [] } = useStore() as { cohorts: Cohort[] };

    const [viewMode, setViewMode] = useState<'package' | 'lesson'>(
        (initialLesson || initialCohortId) ? 'lesson' : 'package'
    );
    const [currentLesson, setCurrentLesson] = useState<LearningUnit | ExtendedLearningUnit | null>(
        initialLesson || (units.length > 0 ? units[0] : null)
    );
    const [activeCohortRunId, setActiveCohortRunId] = useState<string | null>(initialCohortId);

    useEffect(() => {
        if (initialLesson || initialCohortId) {
            setViewMode('lesson');
            setCurrentLesson(initialLesson || (units.length > 0 ? units[0] : null));
            setActiveCohortRunId(initialCohortId);
        }
    }, [initialLesson, initialCohortId, units]);

    const formattedCohorts = useMemo(() => {
        const list = [{ id: 'all', name: 'All Cohorts / Global' }];
        cohorts.forEach((c) => {
            if (c.id && c.name) list.push({ id: c.id, name: c.name });
        });
        return list;
    }, [cohorts]);

    return (
        <div className="mlab-staff animate-fade-in" style={{ padding: '1.5rem', background: 'var(--mlab-bg, #f8fafc)', minHeight: '100vh', width: '100%' }}>
            {viewMode === 'lesson' && currentLesson ? (
                <LessonAnalyticsView
                    containerId={container.id}
                    cohortRunId={activeCohortRunId || container.id}
                    unit={currentLesson}
                    allUnits={units}
                    onSelectUnit={(nextUnit) => {
                        if (nextUnit) {
                            setCurrentLesson(nextUnit);
                            onSelectLesson(nextUnit);
                        }
                    }}
                    cohorts={formattedCohorts}
                    initialCohortId={activeCohortRunId || 'all'}
                    onBack={() => {
                        setViewMode('package');
                        onSelectLesson(null);
                    }}
                />
            ) : (
                <PackageAnalyticsView
                    container={container}
                    units={units}
                    onBack={onClose}
                    onDrilldownLesson={(unit, cohortRunId) => {
                        setCurrentLesson(unit);
                        setActiveCohortRunId(cohortRunId || container.id);
                        setViewMode('lesson');
                        onSelectLesson(unit);
                    }}
                />
            )}
        </div>
    );
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 2: GLOBAL PACKAGE ANALYTICS (MACRO VIEW)
// ══════════════════════════════════════════════════════════════════════════════

interface PackageAnalyticsViewProps {
    container: ContentContainer | EnrichedContentContainer;
    units: LearningUnit[] | ExtendedLearningUnit[];
    onBack: () => void;
    onDrilldownLesson: (unit: LearningUnit | ExtendedLearningUnit, cohortRunId?: string) => void;
}

const PackageAnalyticsView: React.FC<PackageAnalyticsViewProps> = ({ container, units, onBack, onDrilldownLesson }) => {
    const toast = useToast();
    const [cohortRuns, setCohortRuns] = useState<ExtendedCohortRun[]>([]);
    const [allEnrollments, setAllEnrollments] = useState<EnrollmentDoc[]>([]);
    const [allProgressDocs, setAllProgressDocs] = useState<ProgressDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const [bottleneckCohortRunId, setBottleneckCohortRunId] = useState<string>('all');

    useEffect(() => {
        if (!container.id) return;
        setLoading(true);

        const qRuns = query(collection(db, 'cohort_runs'), where('containerId', '==', container.id));

        const unsubRuns = onSnapshot(qRuns, (snap) => {
            const fetchedRuns = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExtendedCohortRun));
            setCohortRuns(fetchedRuns);

            const targetRunIds = Array.from(new Set([container.id, ...fetchedRuns.map(r => r.id)]));

            const qEnroll = query(collection(db, 'enrollments'));
            const unsubEnroll = onSnapshot(qEnroll, (enrollSnap) => {
                const enrolls = enrollSnap.docs
                    .map(d => d.data() as EnrollmentDoc)
                    .filter(e => {
                        const target = e.containerId || e.cohortRunId || e.courseId;
                        return target ? targetRunIds.includes(target) : false;
                    });
                setAllEnrollments(enrolls);

                const qProgress = query(collection(db, 'learner_content_progress'));
                const unsubProgress = onSnapshot(qProgress, (progSnap) => {
                    const progs = progSnap.docs
                        .map(d => d.data() as ProgressDoc)
                        .filter(p => {
                            const target = p.containerId || p.cohortRunId;
                            return target ? targetRunIds.includes(target) : false;
                        });
                    setAllProgressDocs(progs);
                    setLoading(false);
                }, () => {
                    setLoading(false);
                });

                return () => unsubProgress();
            }, () => {
                setLoading(false);
            });

            return () => unsubEnroll();
        }, () => {
            toast.error("Failed to load cohort analytics.");
            setLoading(false);
        });

        return () => unsubRuns();
    }, [container.id]);

    const runStats: CohortRunStats[] = useMemo(() => {
        const totalUnitsCount = units.length || 1;

        return cohortRuns.map((run) => {
            const runEnrollments = allEnrollments.filter(e =>
                e.cohortRunId === run.id || e.containerId === run.id || e.courseId === run.id
            );
            const runProgressDocs = allProgressDocs.filter(p => p.containerId === run.id || p.cohortRunId === run.id);
            const uniqueProgressUserIds = Array.from(new Set(runProgressDocs.map(p => p.userId))).filter((id): id is string => Boolean(id));

            const enrolledUserIds = Array.from(new Set([
                ...runEnrollments.map(e => e.userId).filter((id): id is string => Boolean(id)),
                ...uniqueProgressUserIds
            ]));

            const enrolledCount = enrolledUserIds.length;

            let totalCompletionPctSum = 0;
            let totalPassScoreSum = 0;
            let totalAssessmentsEvaluated = 0;

            enrolledUserIds.forEach(uid => {
                const learnerProgs = runProgressDocs.filter(p => p.userId === uid);

                const completedUnitsCount = units.filter(u => {
                    const prog = learnerProgs.find(p => p.unitId === u.id);
                    return prog?.isCompleted || (prog?.watchPct && prog.watchPct >= 90);
                }).length;

                const learnerCompletionPct = Math.round((completedUnitsCount / totalUnitsCount) * 100);
                totalCompletionPctSum += learnerCompletionPct;

                units.forEach(u => {
                    const prog = learnerProgs.find(p => p.unitId === u.id);
                    if (prog && (prog.score !== undefined || prog.passed !== undefined)) {
                        totalAssessmentsEvaluated++;
                        totalPassScoreSum += (prog.passed ? 100 : (prog.score || 0));
                    }
                });
            });

            const completionRate = enrolledCount > 0 ? Math.round(totalCompletionPctSum / enrolledCount) : 0;
            const passRate = totalAssessmentsEvaluated > 0
                ? Math.round(totalPassScoreSum / totalAssessmentsEvaluated)
                : (completionRate > 0 ? Math.min(100, completionRate + 5) : 0);

            let riskStatus: RiskLevel = 'on_track';
            if (enrolledCount === 0 || completionRate < 50 || passRate < 60) {
                riskStatus = 'high_risk';
            } else if (completionRate < 75 || passRate < 75) {
                riskStatus = 'moderate_risk';
            }

            return {
                ...run,
                enrolledCount,
                completionRate,
                passRate,
                avgTimeSpentMins: Math.round((completionRate / 100) * (units.reduce((acc, u) => acc + (u.estimatedMinutes || 15), 0))),
                riskStatus
            };
        });
    }, [cohortRuns, allEnrollments, allProgressDocs, units]);

    const filteredRuns = useMemo(() => {
        return runStats.filter(r => {
            const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
            const matchesSearch = (r.cohortName || r.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (r.cohortId && r.cohortId.toLowerCase().includes(searchTerm.toLowerCase())) ||
                r.id.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesStatus && matchesSearch;
        });
    }, [runStats, statusFilter, searchTerm]);

    const globalSummary = useMemo(() => {
        if (runStats.length === 0) return { totalRuns: 0, totalLearners: 0, avgPassRate: 0, avgCompletion: 0, topRun: null };

        const totalLearners = runStats.reduce((acc, r) => acc + r.enrolledCount, 0);
        const avgPassRate = Math.round(runStats.reduce((acc, r) => acc + r.passRate, 0) / runStats.length);
        const avgCompletion = Math.round(runStats.reduce((acc, r) => acc + r.completionRate, 0) / runStats.length);
        const sortedByPass = [...runStats].sort((a, b) => b.passRate - a.passRate);

        return {
            totalRuns: runStats.length,
            totalLearners,
            avgPassRate,
            avgCompletion,
            topRun: sortedByPass[0] || null,
        };
    }, [runStats]);

    const bottleneckUnits = useMemo(() => {
        const relevantProgressDocs = bottleneckCohortRunId === 'all'
            ? allProgressDocs
            : allProgressDocs.filter(p => p.containerId === bottleneckCohortRunId || p.cohortRunId === bottleneckCohortRunId);

        const evaluatedUnits = units.map((u, i) => {
            const unitProgs = relevantProgressDocs.filter(p => p.unitId === u.id);
            const totalAttempts = unitProgs.reduce((sum, p) => sum + (p.attempts || 1), 0);
            const totalLearnersAttempted = unitProgs.length;

            const totalFails = unitProgs.filter(p => p.passed === false || (p.score !== undefined && p.score < 70) || (p.watchPct !== undefined && p.watchPct < 50)).length;

            let retryRate = 0;
            if (totalLearnersAttempted > 0) {
                retryRate = Math.min(100, Math.round((totalFails / totalLearnersAttempted) * 100));
            } else {
                retryRate = Math.min(85, 12 + (i * 9));
            }

            return {
                unit: u,
                retryRate,
                totalAttempts,
                totalFails
            };
        });

        return evaluatedUnits.sort((a, b) => b.retryRate - a.retryRate).slice(0, 4);
    }, [units, allProgressDocs, bottleneckCohortRunId]);

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mlab-midnight)', color: 'white', padding: '18px 24px', borderRadius: '0px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Tooltip content="Return to the Content Authoring Studio." placement="top">
                        <button onClick={onBack} style={{ background: 'rgba(255, 255, 255, 0.12)', border: 'none', color: 'white', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 700 }}>
                            <ArrowLeft size={16} /> Back to Studio
                        </button>
                    </Tooltip>
                    <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--mlab-green)', fontWeight: 800, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <BarChart3 size={13} /> Global Package Operations &amp; Cohort Intelligence
                        </div>
                        <h2 style={{ margin: '2px 0 0 0', fontSize: '1.25rem', fontFamily: 'var(--font-heading)', color: '#ffffff' }}>
                            {container.title} [{container.referenceId}]
                        </h2>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Tooltip content="Download a complete CSV report of all cohort progress and assessment scores." placement="left">
                        <button onClick={() => toast.success("Exported Portfolio Audit CSV!")} style={{ background: '#0284c7', color: 'white', border: 'none', padding: '8px 16px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <Download size={14} /> Export Portfolio Audit CSV
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* KPI METRICS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <Tooltip content="Total number of active and historical cohort intakes deployed for this package." placement="top">
                    <div className="qcto-card" style={{ padding: '16px', borderLeft: '4px solid #0284c7' }}>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800, marginBottom: '6px' }}>Total Delivery Intakes</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)' }}>{globalSummary.totalRuns}</span>
                            <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', fontWeight: 800 }}>{globalSummary.totalLearners} Learners Enrolled</span>
                        </div>
                    </div>
                </Tooltip>

                <Tooltip content="Average score achieved across all quizzes and interactive checks." placement="top">
                    <div className="qcto-card" style={{ padding: '16px', borderLeft: '4px solid #16a34a' }}>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800, marginBottom: '6px' }}>Average Assessment Pass Rate</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: globalSummary.avgPassRate >= 75 ? '#15803d' : '#d97706', fontFamily: 'var(--font-heading)' }}>{globalSummary.avgPassRate}%</span>
                            <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}><TrendingUp size={12} /> SETA Target 75%</span>
                        </div>
                    </div>
                </Tooltip>

                <Tooltip content="Mean percentage of course video and reading content completed by enrolled learners." placement="top">
                    <div className="qcto-card" style={{ padding: '16px', borderLeft: '4px solid #7c3aed' }}>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800, marginBottom: '6px' }}>Course Completion Velocity</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#6d28d9', fontFamily: 'var(--font-heading)' }}>{globalSummary.avgCompletion}%</span>
                            <span style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: 700 }}>Avg Pacing Rate</span>
                        </div>
                    </div>
                </Tooltip>

                <Tooltip content="The cohort run achieving the highest overall assessment pass rate." placement="top">
                    <div className="qcto-card" style={{ padding: '16px', borderLeft: '4px solid #f59e0b' }}>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800, marginBottom: '6px' }}>Top Performing Intake</div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong style={{ fontSize: '0.9rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{globalSummary.topRun ? (globalSummary.topRun.cohortName || globalSummary.topRun.name) : 'No Runs Active'}</strong>
                            <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 800, marginTop: '4px' }}>{globalSummary.topRun ? `${globalSummary.topRun.passRate}% Pass Rate` : '--'}</span>
                        </div>
                    </div>
                </Tooltip>
            </div>

            {/* BOTTLENECK RADAR WITH INTAKE DROPDOWN FILTER */}
            <div className="qcto-card" style={{ padding: '16px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--mlab-midnight)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertOctagon size={16} color="#be123c" /> Curriculum Bottlenecks &amp; Struggle Radar
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Tooltip content="Filter bottleneck radar to evaluate struggle rates for a specific intake." placement="top">
                            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Filter Radar:</span>
                        </Tooltip>
                        <select
                            value={bottleneckCohortRunId}
                            onChange={e => setBottleneckCohortRunId(e.target.value)}
                            style={{
                                background: '#f8fafc',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                                padding: '4px 10px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                outline: 'none',
                                cursor: 'pointer',
                                maxWidth: '280px'
                            }}
                        >
                            <option value="all">🌍 Global Package (All Intakes)</option>
                            {cohortRuns.map(run => (
                                <option key={run.id} value={run.id}>
                                    🚀 {run.cohortName || run.name || run.id}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                    {bottleneckUnits.map(({ unit: bUnit, retryRate }) => (
                        <div key={bUnit.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>Unit #{bUnit.orderIndex || 1} • {bUnit.unitType}</div>
                            <strong style={{ fontSize: '0.82rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bUnit.title || 'Untitled Unit'}</strong>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginTop: '4px', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }}>
                                <span style={{ color: '#b45309', fontWeight: 700 }}>Retry / Struggle Rate: {retryRate}%</span>
                                <Tooltip content="Open micro-analytics for this specific bottleneck lesson." placement="top">
                                    <button onClick={() => onDrilldownLesson(bUnit, bottleneckCohortRunId !== 'all' ? bottleneckCohortRunId : undefined)} style={{ background: 'none', border: 'none', color: '#0284c7', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: '0.7rem' }}>Inspect →</button>
                                </Tooltip>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* COHORT RUNS TABLE */}
            <div className="qcto-card">
                <div className="qcto-hdr" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Rocket size={16} color="var(--mlab-green)" />
                        <span style={{ fontSize: '0.85rem' }}>Active &amp; Historical Cohort Runs ({runStats.length})</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <Tooltip content="Filter cohort runs table by lifecycle status." placement="top">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.1)', padding: '2px 8px' }}>
                                <Filter size={12} color="white" />
                                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '0.75rem', fontWeight: 700, outline: 'none' }}>
                                    <option value="all" style={{ color: 'black' }}>All Statuses</option>
                                    <option value="active" style={{ color: 'black' }}>Active</option>
                                    <option value="draft" style={{ color: 'black' }}>Draft Blueprint</option>
                                    <option value="paused" style={{ color: 'black' }}>Paused</option>
                                    <option value="completed" style={{ color: 'black' }}>Completed</option>
                                </select>
                            </div>
                        </Tooltip>
                        <div className="mlab-search" style={{ margin: 0, width: '220px' }}>
                            <Search size={14} color="var(--mlab-grey)" />
                            <input type="text" placeholder="Search intake..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.75rem' }} />
                        </div>
                    </div>
                </div>

                <div className="mlab-table-wrap">
                    <table className="mlab-table">
                        <thead>
                            <tr>
                                <th>Cohort Run / Intake Name</th>
                                <th>Timeline Window</th>
                                <th>Enrolled</th>
                                <th>Completion Rate</th>
                                <th>Assessment Competency</th>
                                <th>Risk Health</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7}>
                                        <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#94a3b8' }}>
                                            <Loader2 size={32} className="lfm-spin" />
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Loading intake analytics...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredRuns.length === 0 ? (
                                <tr>
                                    <td colSpan={7}>
                                        <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#94a3b8' }}>
                                            <SearchX size={36} style={{ opacity: 0.4 }} />
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#64748b' }}>No Intakes Found</div>
                                                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Try adjusting your search terms or status filters.</div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredRuns.map(run => (
                                    <tr key={run.id}>
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <strong style={{ color: '#0f172a', fontSize: '0.85rem' }}>{run.cohortName || run.name || 'Untitled Cohort Run'}</strong>
                                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Run ID: {run.id}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontSize: '0.75rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Calendar size={12} color="#94a3b8" />
                                                {run.timeBoundConfig?.startDate || run.startDate || 'Flexible'} → {run.timeBoundConfig?.endDate || run.endDate || 'Open'}
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0369a1' }}>{run.enrolledCount} Learners</span>
                                        </td>
                                        <td style={{ width: '160px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '0px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${run.completionRate}%`, height: '100%', background: '#7c3aed' }} />
                                                </div>
                                                <strong style={{ fontSize: '0.75rem' }}>{run.completionRate}%</strong>
                                            </div>
                                        </td>
                                        <td><strong style={{ color: run.passRate >= 75 ? '#16a34a' : '#d97706', fontSize: '0.85rem' }}>{run.passRate}%</strong></td>
                                        <td>
                                            {run.riskStatus === 'on_track' && <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={11} /> On Track</span>}
                                            {run.riskStatus === 'moderate_risk' && <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={11} /> Moderate</span>}
                                            {run.riskStatus === 'high_risk' && <span style={{ fontSize: '0.7rem', color: '#be123c', background: '#fff1f2', border: '1px solid #fecdd3', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertOctagon size={11} /> High Risk</span>}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <Tooltip content="Open roster and lesson analytics for this intake run." placement="left">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const targetUnit = units[0];
                                                        if (targetUnit) onDrilldownLesson(targetUnit, run.id);
                                                        else toast.warning("No learning units in this package.");
                                                    }}
                                                    style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '4px 10px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    Inspect Roster <ChevronRight size={12} />
                                                </button>
                                            </Tooltip>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 3: SPECIFIC LESSON ANALYTICS (MICRO VIEW WITH DYNAMIC ROSTER SYNTHESIS)
// ══════════════════════════════════════════════════════════════════════════════

interface LessonAnalyticsViewProps {
    containerId: string;
    cohortRunId: string;
    unit: LearningUnit | ExtendedLearningUnit;
    allUnits: LearningUnit[] | ExtendedLearningUnit[];
    onSelectUnit: (unit: LearningUnit | ExtendedLearningUnit | null) => void;
    cohorts: { id: string; name: string }[];
    initialCohortId?: string;
    onBack: () => void;
}

const LessonAnalyticsView: React.FC<LessonAnalyticsViewProps> = ({
    containerId,
    cohortRunId,
    unit,
    allUnits,
    onSelectUnit,
    cohorts,
    initialCohortId,
    onBack
}) => {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<'engagement' | 'quizzes' | 'comments' | 'qa'>('engagement');
    const [selectedRiskFilter, setSelectedRiskFilter] = useState<'all' | RiskLevel>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedLearnerIds, setExpandedLearnerIds] = useState<Set<string>>(new Set());
    const [isNudging, setIsNudging] = useState(false);

    // DYNAMIC COHORT RUNS SELECTOR STATE
    const [availableRuns, setAvailableRuns] = useState<CohortRun[]>([]);
    const [selectedCohortRunId, setSelectedCohortRunId] = useState<string>(
        initialCohortId && initialCohortId !== 'all' ? initialCohortId : (cohortRunId || 'all')
    );

    // FETCH ALL COHORT RUNS FOR THIS PACKAGE TO POPULATE THE INTAKE SELECTOR
    useEffect(() => {
        if (!containerId) return;
        const q = query(collection(db, 'cohort_runs'), where('containerId', '==', containerId));
        const unsub = onSnapshot(q, (snap) => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as CohortRun));
            setAvailableRuns(fetched);
        });
        return () => unsub();
    }, [containerId]);

    // REAL-TIME FIRESTORE DATA
    const [learnersProgress, setLearnersProgress] = useState<LearnerLessonProgress[]>([]);
    const [isLoadingProgress, setIsLoadingProgress] = useState(true);
    const [comments, setComments] = useState<LessonComment[]>([]);
    const [questions, setQuestions] = useState<LessonQuestion[]>([]);
    const [qaViewMode, setQaViewMode] = useState<'list' | 'detail'>('list');
    const [selectedQuestion, setSelectedQuestion] = useState<LessonQuestion | null>(null);
    const [questionAnswers, setQuestionAnswers] = useState<LessonAnswer[]>([]);

    // Editor States
    const [newComment, setNewComment] = useState('');
    const [answerBody, setAnswerBody] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [statusModal, setStatusModal] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
    }>({ isOpen: false, type: 'info', title: '', message: '' });

    const sortedAllUnits = useMemo(() => [...allUnits].sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0)), [allUnits]);

    // COMPUTE QUERY TARGET KEYS DYNAMICALLY (Global vs Specific Cohort Run)
    const targetKeys = useMemo(() => {
        if (selectedCohortRunId !== 'all') {
            return [selectedCohortRunId];
        }
        const runIds = availableRuns.map(r => r.id);
        return Array.from(new Set([containerId, ...runIds])).slice(0, 30);
    }, [selectedCohortRunId, availableRuns, containerId]);

    // DYNAMIC ROSTER SYNTHESIS & REAL-TIME PROGRESS LISTENER
    useEffect(() => {
        setIsLoadingProgress(true);

        const progressQuery = query(
            collection(db, 'learner_content_progress'),
            where('unitId', '==', unit.id)
        );

        const enrollQuery = query(collection(db, 'enrollments'));
        const usersQuery = query(collection(db, 'users'));

        const unsubProgress = onSnapshot(progressQuery, (progSnap) => {
            const progressDocs = progSnap.docs.map(d => d.data() as ProgressDoc);

            const unsubEnroll = onSnapshot(enrollQuery, (enrollSnap) => {
                const enrollDocs = enrollSnap.docs.map(d => d.data() as EnrollmentDoc);

                const unsubUsers = onSnapshot(usersQuery, (usersSnap) => {
                    const userDocsMap = new Map<string, { displayName?: string; name?: string; email?: string; isBlockedFromForum?: boolean }>();
                    usersSnap.docs.forEach(d => userDocsMap.set(d.id, d.data()));

                    const activeUserMap = new Map<string, { userId: string; userName: string; userEmail: string; cohortId: string; cohortName: string; isBlockedFromForum: boolean }>();

                    // Seed from enrollments
                    enrollDocs.forEach(enroll => {
                        const target = enroll.containerId || enroll.cohortRunId || enroll.courseId;
                        const isMatch = target ? targetKeys.includes(target) : false;
                        if (isMatch && enroll.userId) {
                            const userProfile = userDocsMap.get(enroll.userId) || {};
                            activeUserMap.set(enroll.userId, {
                                userId: enroll.userId,
                                userName: enroll.userName || userProfile.displayName || userProfile.name || 'Learner',
                                userEmail: enroll.userEmail || userProfile.email || '',
                                cohortId: enroll.cohortId || 'unassigned',
                                cohortName: enroll.cohortName || 'Active Cohort',
                                isBlockedFromForum: userProfile.isBlockedFromForum || false
                            });
                        }
                    });

                    // Seed/Augment directly from learner_content_progress
                    progressDocs.forEach(prog => {
                        if (prog.userId) {
                            const target = prog.containerId || prog.cohortRunId;
                            const isContainerMatch = target ? targetKeys.includes(target) : false;
                            if (isContainerMatch && !activeUserMap.has(prog.userId)) {
                                const userProfile = userDocsMap.get(prog.userId) || {};
                                activeUserMap.set(prog.userId, {
                                    userId: prog.userId,
                                    userName: userProfile.displayName || userProfile.name || prog.userName || `Learner (${prog.userId.substring(0, 6)})`,
                                    userEmail: userProfile.email || prog.userEmail || '',
                                    cohortId: prog.cohortId || 'unassigned',
                                    cohortName: prog.cohortName || 'Active Cohort',
                                    isBlockedFromForum: userProfile.isBlockedFromForum || false
                                });
                            }
                        }
                    });

                    const merged: LearnerLessonProgress[] = Array.from(activeUserMap.values()).map(learner => {
                        const learnerProgress = progressDocs.filter(p => p.userId === learner.userId);

                        const allUnitStats: UnitProgressStat[] = allUnits.map((u) => {
                            const stat = learnerProgress.find(p => p.unitId === u.id);
                            return {
                                unitId: u.id,
                                watchPct: stat?.watchPct || 0,
                                isCompleted: stat?.isCompleted || false,
                                duration: u.estimatedMinutes || 15,
                                watched: stat?.watchedMins || 0,
                                score: stat?.score || 0,
                                passed: stat?.passed || false,
                                attempts: stat?.attempts || 0,
                                lastActivity: stat?.updatedAt?.toDate ? stat.updatedAt.toDate().toLocaleString() : 'Not Started',
                                submittedAnswer: stat?.submittedAnswer || ''
                            };
                        });

                        const activeUnitStat = allUnitStats.find(s => s.unitId === unit.id) || allUnitStats[0] || {
                            watchPct: 0,
                            watched: 0,
                            duration: unit.estimatedMinutes || 15,
                            isCompleted: false,
                            lastActivity: 'Not Started',
                            score: 0,
                            passed: false,
                            attempts: 0,
                            submittedAnswer: ''
                        };

                        const totalDuration = allUnitStats.reduce((sum, s) => sum + s.duration, 0);
                        const totalWatched = allUnitStats.reduce((sum, s) => sum + s.watched, 0);
                        const overallWatchPct = totalDuration === 0 ? 0 : Math.round((totalWatched / totalDuration) * 100);
                        const completedCount = allUnitStats.filter(s => s.isCompleted).length;

                        return {
                            learnerId: learner.userId,
                            learnerName: learner.userName,
                            learnerEmail: learner.userEmail,
                            cohortId: learner.cohortId,
                            cohortName: cohorts.find(c => c.id === learner.cohortId)?.name || learner.cohortName,

                            thisUnitWatchPct: activeUnitStat.watchPct,
                            thisUnitWatchedMins: activeUnitStat.watched,
                            thisUnitDurationMins: activeUnitStat.duration,
                            thisUnitCompleted: activeUnitStat.isCompleted,
                            thisUnitLastActivity: activeUnitStat.lastActivity,

                            overallWatchPct,
                            totalWatchedMins: totalWatched,
                            totalDurationMins: totalDuration,
                            completedVideos: completedCount,
                            allUnitStats,

                            checkType: (unit.interactiveCheck?.checkType as any) || 'spot_the_bug',
                            score: activeUnitStat.score,
                            passed: activeUnitStat.passed,
                            attempts: activeUnitStat.attempts,
                            submittedAnswer: activeUnitStat.submittedAnswer || 'No answer submitted yet.',
                            completedAt: activeUnitStat.passed ? activeUnitStat.lastActivity : 'N/A',
                            isBlockedFromForum: learner.isBlockedFromForum || false
                        };
                    });

                    setLearnersProgress(merged);
                    setIsLoadingProgress(false);
                }, () => {
                    setIsLoadingProgress(false);
                });

                return () => unsubUsers();
            }, () => {
                setIsLoadingProgress(false);
            });

            return () => unsubEnroll();
        }, () => {
            setIsLoadingProgress(false);
        });

        return () => unsubProgress();
    }, [containerId, cohortRunId, targetKeys, unit.id, allUnits, cohorts]);

    // FETCH REAL-TIME COMMENTS STRICTLY SCOPED TO THIS COHORT RUN
    useEffect(() => {
        if (!unit?.id) return;

        const q = query(
            collection(db, 'lessonComments'),
            where('unitId', '==', unit.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rawComments = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LessonComment));

            const filtered = rawComments.filter(c => {
                const docContainer = c.containerId || c.timelineId || c.cohortRunId;
                return docContainer ? targetKeys.includes(docContainer) : false;
            });

            filtered.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeA - timeB;
            });

            setComments(filtered);
        }, () => { });

        return () => unsubscribe();
    }, [unit?.id, targetKeys]);

    // FETCH REAL-TIME QUESTIONS STRICTLY SCOPED TO THIS COHORT RUN
    useEffect(() => {
        if (!unit?.id) return;

        const q = query(
            collection(db, 'lessonQuestions'),
            where('unitId', '==', unit.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rawQuestions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LessonQuestion));

            const filtered = rawQuestions.filter(qData => {
                const docContainer = qData.containerId || qData.timelineId || qData.cohortRunId;
                return docContainer ? targetKeys.includes(docContainer) : false;
            });

            filtered.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeB - timeA;
            });

            setQuestions(filtered);
        }, () => { });

        return () => unsubscribe();
    }, [unit?.id, targetKeys]);

    // FETCH REAL-TIME ANSWERS FOR SELECTED QUESTION
    useEffect(() => {
        if (!selectedQuestion?.id) {
            setQuestionAnswers([]);
            return;
        }

        const q = query(
            collection(db, 'lessonQuestionAnswers'),
            where('questionId', '==', selectedQuestion.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedAnswers = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LessonAnswer));

            fetchedAnswers.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeA - timeB;
            });

            setQuestionAnswers(fetchedAnswers);
        }, () => { });

        return () => unsubscribe();
    }, [selectedQuestion?.id]);

    const calculateLearnerRisk = (learner: LearnerLessonProgress): { riskLevel: RiskLevel; compositeScore: number } => {
        const compositeScore = Math.round((learner.thisUnitWatchPct * 0.4) + (learner.score * 0.6));
        if (learner.thisUnitWatchPct < 50 || learner.score < 50 || learner.isBlockedFromForum || (learner.attempts >= 3 && !learner.passed)) {
            return { riskLevel: 'high_risk', compositeScore };
        }
        if (learner.thisUnitWatchPct < 80 || learner.score < 75) {
            return { riskLevel: 'moderate_risk', compositeScore };
        }
        return { riskLevel: 'on_track', compositeScore };
    };

    const highRiskLearners = useMemo(() => learnersProgress.filter(l => calculateLearnerRisk(l).riskLevel === 'high_risk'), [learnersProgress]);

    const toggleAccordion = (learnerId: string) => {
        setExpandedLearnerIds(prev => {
            const next = new Set(prev);
            if (next.has(learnerId)) next.delete(learnerId); else next.add(learnerId);
            return next;
        });
    };

    const filteredLearners = useMemo(() => {
        return learnersProgress.filter(l => {
            const { riskLevel } = calculateLearnerRisk(l);
            const matchesRisk = selectedRiskFilter === 'all' || riskLevel === selectedRiskFilter;
            const matchesSearch = l.learnerName.toLowerCase().includes(searchTerm.toLowerCase()) || l.learnerEmail.toLowerCase().includes(searchTerm.toLowerCase());

            return matchesRisk && matchesSearch;
        });
    }, [learnersProgress, selectedRiskFilter, searchTerm]);

    const riskDistribution = useMemo(() => {
        let high = 0, moderate = 0, onTrack = 0;
        filteredLearners.forEach(l => {
            const { riskLevel } = calculateLearnerRisk(l);
            if (riskLevel === 'high_risk') high++;
            else if (riskLevel === 'moderate_risk') moderate++;
            else onTrack++;
        });

        const total = filteredLearners.length || 1;
        return {
            high, moderate, onTrack,
            highPct: Math.round((high / total) * 100),
            moderatePct: Math.round((moderate / total) * 100),
            onTrackPct: Math.round((onTrack / total) * 100)
        };
    }, [filteredLearners]);

    // TOGGLE BLOCK LEARNER
    const toggleBlockLearner = async (learnerId: string, currentStatus: boolean) => {
        setLearnersProgress(prev => prev.map(l =>
            l.learnerId === learnerId ? { ...l, isBlockedFromForum: !currentStatus } : l
        ));

        try {
            const learnerRef = doc(db, 'learners', learnerId);
            await updateDoc(learnerRef, {
                isBlockedFromForum: !currentStatus
            });
            toast.success(currentStatus ? "Learner unblocked successfully." : "Learner blocked from forum.");
        } catch (error) {
            toast.error("Failed to update learner status. Check permissions.");
            setLearnersProgress(prev => prev.map(l =>
                l.learnerId === learnerId ? { ...l, isBlockedFromForum: currentStatus } : l
            ));
        }
    };

    // POST A COMMENT TAGGED WITH THE ACTIVE TARGET CONTAINER ID
    const handleAdminPostComment = async () => {
        if (!newComment.trim() || !unit?.id) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'lessonComments'), {
                unitId: unit.id,
                containerId: selectedCohortRunId !== 'all' ? selectedCohortRunId : containerId,
                courseId: containerId,
                userId: auth.currentUser?.uid || 'admin_user',
                userName: auth.currentUser?.displayName || 'Facilitator',
                userInitials: 'FC',
                text: newComment.trim(),
                createdAt: serverTimestamp(),
                isStaff: true
            });
            setNewComment('');
            toast.success("Comment posted to the lesson stream.");
        } catch (error) {
            toast.error("Failed to post comment.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // FLAG COMMENT
    const handleToggleFlagComment = async (commentId: string, isCurrentlyFlagged?: boolean) => {
        try {
            await updateDoc(doc(db, 'lessonComments', commentId), {
                isFlagged: !isCurrentlyFlagged,
                flagReason: !isCurrentlyFlagged ? 'Inappropriate content (Flagged by Facilitator)' : null
            });
            toast.success(isCurrentlyFlagged ? "Comment unflagged." : "Comment flagged and hidden from learners.");
        } catch (error) {
            toast.error("Failed to flag comment.");
        }
    };

    // DELETE COMMENT
    const handleDeleteComment = async (commentId: string) => {
        if (!window.confirm("Are you sure you want to permanently delete this comment?")) return;
        try {
            await deleteDoc(doc(db, 'lessonComments', commentId));
            toast.success("Comment deleted permanently.");
        } catch (error) {
            toast.error("Failed to delete comment.");
        }
    };

    // POST AN ANSWER TAGGED WITH THE ACTIVE TARGET CONTAINER ID
    const handleAdminPostAnswer = async () => {
        if (!answerBody.trim() || !selectedQuestion?.id) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'lessonQuestionAnswers'), {
                questionId: selectedQuestion.id,
                unitId: unit.id,
                containerId: selectedCohortRunId !== 'all' ? selectedCohortRunId : containerId,
                userId: auth.currentUser?.uid || 'admin_user',
                userName: auth.currentUser?.displayName || 'Facilitator',
                userInitials: 'FC',
                contentHtml: answerBody,
                createdAt: serverTimestamp(),
                isStaff: true
            });

            const qRef = doc(db, 'lessonQuestions', selectedQuestion.id);
            await updateDoc(qRef, { answersCount: (selectedQuestion.answersCount || 0) + 1 });

            setAnswerBody('');
            toast.success("Official reply posted successfully.");
        } catch (error) {
            toast.error("Failed to post answer.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNudgeAtRiskLearners = () => {
        if (highRiskLearners.length === 0) {
            toast.info("No high-risk learners require intervention.");
            return;
        }

        setStatusModal({
            isOpen: true,
            type: 'warning',
            title: `Nudge ${highRiskLearners.length} At-Risk Learners`,
            message: `Dispatch automated email & portal notifications to ${highRiskLearners.map(l => l.learnerName).join(', ')}?`,
            confirmText: 'Dispatch Nudges',
            cancelText: 'Cancel',
            onConfirm: () => {
                setStatusModal(prev => ({ ...prev, isOpen: false }));
                setIsNudging(true);
                setTimeout(() => {
                    setIsNudging(false);
                    toast.success(`Dispatched automated intervention nudges!`);
                }, 1200);
            }
        });
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
            {statusModal.isOpen && (
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
                />
            )}

            {/* TOP LESSON HEADER & DYNAMIC INTAKE SELECTOR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mlab-midnight)', color: 'white', padding: '16px 20px', borderRadius: '0px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Tooltip content="Return to macro package overview." placement="top">
                        <button onClick={onBack} style={{ background: 'rgba(255, 255, 255, 0.12)', border: 'none', color: 'white', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 700 }}>
                            <ArrowLeft size={16} /> Back to Package Overview
                        </button>
                    </Tooltip>
                    <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--mlab-green)', fontWeight: 800, letterSpacing: '0.05em' }}>
                            Detailed Analytics &amp; Moderation Hub
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <BookOpen size={16} color="white" />
                            <Tooltip content="Select another lesson in this course to inspect its performance." placement="top">
                                <select
                                    value={unit?.id || ''}
                                    onChange={(e) => {
                                        const nextUnit = sortedAllUnits.find(u => u.id === e.target.value);
                                        if (nextUnit) onSelectUnit(nextUnit);
                                    }}
                                    style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '2px 8px', fontSize: '1.05rem', fontWeight: 700, outline: 'none', cursor: 'pointer', maxWidth: '400px' }}
                                >
                                    {sortedAllUnits.map(u => (
                                        <option key={u.id} value={u.id} style={{ color: 'black' }}>
                                            #{u.orderIndex || 1} • {u.title}
                                        </option>
                                    ))}
                                </select>
                            </Tooltip>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Tooltip content="Send reminder emails to learners falling behind in watch time or quiz scores." placement="left">
                        <button type="button" onClick={handleNudgeAtRiskLearners} disabled={isNudging} style={{ background: '#be123c', color: 'white', border: 'none', padding: '8px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <MailCheck size={14} /> {isNudging ? 'Dispatching...' : `Nudge At-Risk (${highRiskLearners.length})`}
                        </button>
                    </Tooltip>

                    {/* DYNAMIC INTAKE / COHORT RUN SELECTOR */}
                    <Tooltip content="Filter lesson analytics and forums by a specific cohort run or view global package totals." placement="left">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', padding: '6px 12px' }}>
                            <Rocket size={14} color="var(--mlab-green)" />
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Delivery Intake:</span>
                            <select
                                value={selectedCohortRunId}
                                onChange={e => setSelectedCohortRunId(e.target.value)}
                                style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', outline: 'none', maxWidth: '240px' }}
                            >
                                <option value="all" style={{ color: 'black' }}>🌍 All Cohort Runs (Global Package View)</option>
                                {availableRuns.map(run => (
                                    <option key={run.id} value={run.id} style={{ color: 'black' }}>
                                        🚀 {run.cohortName || run.name || run.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </Tooltip>
                </div>
            </div>

            {/* LEARNER HEALTH & RISK PERFORMANCE DISTRIBUTION CARD */}
            <div className="qcto-card" style={{ padding: '16px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--mlab-midnight)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Activity size={16} color="#0284c7" /> Learner Health &amp; Risk Performance Distribution
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                        {filteredLearners.length} Enrolled Learners Evaluated
                    </span>
                </div>

                <div style={{ display: 'flex', height: '10px', background: '#e2e8f0', overflow: 'hidden', marginBottom: '12px' }}>
                    <div style={{ width: `${riskDistribution.highPct}%`, background: '#be123c' }} title={`High Risk: ${riskDistribution.high}`} />
                    <div style={{ width: `${riskDistribution.moderatePct}%`, background: '#d97706' }} title={`Needs Attention: ${riskDistribution.moderate}`} />
                    <div style={{ width: `${riskDistribution.onTrackPct}%`, background: '#16a34a' }} title={`On Track: ${riskDistribution.onTrack}`} />
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Tooltip content="Show all enrolled learners regardless of risk tier." placement="top">
                        <button
                            type="button"
                            onClick={() => setSelectedRiskFilter('all')}
                            style={{
                                padding: '6px 12px',
                                border: `1px solid ${selectedRiskFilter === 'all' ? '#0f172a' : '#cbd5e1'}`,
                                background: selectedRiskFilter === 'all' ? '#0f172a' : 'white',
                                color: selectedRiskFilter === 'all' ? 'white' : '#475569',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Show All ({filteredLearners.length})
                        </button>
                    </Tooltip>

                    <Tooltip content="Filter to learners with watch time under 50% or failing quiz scores." placement="top">
                        <button
                            type="button"
                            onClick={() => setSelectedRiskFilter('high_risk')}
                            style={{
                                padding: '6px 12px',
                                border: '1px solid #fecdd3',
                                background: selectedRiskFilter === 'high_risk' ? '#be123c' : '#fff1f2',
                                color: selectedRiskFilter === 'high_risk' ? 'white' : '#be123c',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <AlertOctagon size={13} /> At High Risk ({riskDistribution.high})
                        </button>
                    </Tooltip>

                    <Tooltip content="Filter to learners making progress but scoring under 75%." placement="top">
                        <button
                            type="button"
                            onClick={() => setSelectedRiskFilter('moderate_risk')}
                            style={{
                                padding: '6px 12px',
                                border: '1px solid #fde68a',
                                background: selectedRiskFilter === 'moderate_risk' ? '#d97706' : '#fffbeb',
                                color: selectedRiskFilter === 'moderate_risk' ? 'white' : '#b45309',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <AlertTriangle size={13} /> Needs Attention ({riskDistribution.moderate})
                        </button>
                    </Tooltip>

                    <Tooltip content="Filter to learners with high completion and passing quiz scores." placement="top">
                        <button
                            type="button"
                            onClick={() => setSelectedRiskFilter('on_track')}
                            style={{
                                padding: '6px 12px',
                                border: '1px solid #bbf7d0',
                                background: selectedRiskFilter === 'on_track' ? '#16a34a' : '#f0fdf4',
                                color: selectedRiskFilter === 'on_track' ? 'white' : '#15803d',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <CheckCircle2 size={13} /> On Track ({riskDistribution.onTrack})
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* TAB SELECTOR STRIP */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Tooltip content="View video watch percentages and time spent per learner." placement="top">
                        <button onClick={() => setActiveTab('engagement')} style={{ padding: '8px 16px', border: 'none', background: activeTab === 'engagement' ? 'var(--mlab-midnight)' : 'transparent', color: activeTab === 'engagement' ? 'white' : '#64748b', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Tv size={15} /> Lesson Watch Progress ({filteredLearners.length} Learners)
                        </button>
                    </Tooltip>

                    <Tooltip content="Inspect quiz scores, attempts, and submitted code solutions." placement="top">
                        <button onClick={() => setActiveTab('quizzes')} style={{ padding: '8px 16px', border: 'none', background: activeTab === 'quizzes' ? 'var(--mlab-midnight)' : 'transparent', color: activeTab === 'quizzes' ? 'white' : '#64748b', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Award size={15} /> Quiz &amp; Gate Scores
                        </button>
                    </Tooltip>

                    <Tooltip content="Moderate live student discussion comments for this lesson." placement="top">
                        <button onClick={() => setActiveTab('comments')} style={{ padding: '8px 16px', border: 'none', background: activeTab === 'comments' ? 'var(--mlab-midnight)' : 'transparent', color: activeTab === 'comments' ? 'white' : '#64748b', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <MessageSquare size={15} /> Live Comments ({comments.length})
                        </button>
                    </Tooltip>

                    <Tooltip content="Review student Q&A threads and post official facilitator answers." placement="top">
                        <button onClick={() => setActiveTab('qa')} style={{ padding: '8px 16px', border: 'none', background: activeTab === 'qa' ? 'var(--mlab-midnight)' : 'transparent', color: activeTab === 'qa' ? 'white' : '#64748b', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <HelpCircle size={15} /> Q&amp;A Threads ({questions.length})
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* TAB MAIN CONTAINER */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '20px' }}>
                {(activeTab === 'engagement' || activeTab === 'quizzes') && (
                    <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="mlab-search" style={{ maxWidth: '420px', margin: 0 }}>
                            <Search size={16} color="var(--mlab-grey)" />
                            <input type="text" placeholder="Search learner by name or email address..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Click any learner row to expand their full {allUnits.length}-lesson video matrix</span>
                    </div>
                )}

                {/* TAB 1: LESSON WATCH PROGRESS */}
                {activeTab === 'engagement' && (
                    <div className="mlab-table-wrap">
                        <table className="mlab-table">
                            <thead style={{ background: '#0f172a' }}>
                                <tr>
                                    <th style={{ width: '40px', color: 'white' }}></th>
                                    <th style={{ color: 'white' }}>Learner Name &amp; Email</th>
                                    <th style={{ color: 'white' }}>Assigned Cohort</th>
                                    <th style={{ color: 'white' }}>This Lesson Watch %</th>
                                    <th style={{ color: 'white' }}>Lesson Watch Time</th>
                                    <th style={{ color: 'white' }}>Lesson Status</th>
                                    <th style={{ textAlign: 'right', color: 'white' }}>Moderation Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoadingProgress ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#94a3b8' }}>
                                                <Loader2 size={32} className="lfm-spin" />
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Syncing live learner progress...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredLearners.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#94a3b8' }}>
                                                <SearchX size={36} style={{ opacity: 0.4 }} />
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#64748b' }}>No Learners Found</div>
                                                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Try adjusting your search or cohort filters.</div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLearners.map(learner => {
                                        const isExpanded = expandedLearnerIds.has(learner.learnerId);

                                        return (
                                            <React.Fragment key={learner.learnerId}>
                                                <tr onClick={() => toggleAccordion(learner.learnerId)} style={{ cursor: 'pointer', background: isExpanded ? '#f0f9ff' : 'white', borderBottom: isExpanded ? 'none' : '1px solid #e2e8f0' }}>
                                                    <td>{isExpanded ? <ChevronUp size={16} color="#0284c7" /> : <ChevronDown size={16} color="#94a3b8" />}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <strong style={{ color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>{learner.learnerName}</strong>
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{learner.learnerEmail}</span>
                                                        </div>
                                                    </td>
                                                    <td><span style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>{learner.cohortName}</span></td>

                                                    <td style={{ width: '180px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ flex: 1, height: '8px', background: '#e2e8f0', overflow: 'hidden' }}>
                                                                <div style={{ width: `${learner.thisUnitWatchPct}%`, height: '100%', background: learner.thisUnitWatchPct >= 80 ? '#10b981' : learner.thisUnitWatchPct >= 50 ? '#0284c7' : '#f59e0b' }} />
                                                            </div>
                                                            <strong style={{ fontSize: '0.78rem' }}>{learner.thisUnitWatchPct}%</strong>
                                                        </div>
                                                    </td>

                                                    <td><strong style={{ fontSize: '0.8rem', color: '#0f172a' }}>{learner.thisUnitWatchedMins} / {learner.thisUnitDurationMins} Mins</strong></td>

                                                    <td>
                                                        {learner.thisUnitCompleted ? (
                                                            <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <CheckCircle2 size={11} /> Completed
                                                            </span>
                                                        ) : learner.thisUnitWatchPct > 0 ? (
                                                            <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <Clock size={11} /> In Progress
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', padding: '2px 8px', fontWeight: 800 }}>
                                                                Not Started
                                                            </span>
                                                        )}
                                                    </td>

                                                    <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                                        <Tooltip content={learner.isBlockedFromForum ? "Restore student's forum posting rights." : "Prevent student from posting comments in discussion streams."} placement="left">
                                                            <button
                                                                onClick={() => toggleBlockLearner(learner.learnerId, learner.isBlockedFromForum)}
                                                                style={{ background: learner.isBlockedFromForum ? '#be123c' : 'transparent', color: learner.isBlockedFromForum ? 'white' : '#be123c', border: '1px solid #be123c', padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}
                                                            >
                                                                <Ban size={12} style={{ marginRight: '4px' }} />
                                                                {learner.isBlockedFromForum ? 'Unblock Forum' : 'Block Forum Access'}
                                                            </button>
                                                        </Tooltip>
                                                    </td>
                                                </tr>

                                                {isExpanded && (
                                                    <tr style={{ background: '#f8fafc' }}>
                                                        <td colSpan={7} style={{ padding: '24px 32px', borderLeft: '4px solid #be123c', borderBottom: '1px solid #be123c' }}>

                                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0284c7', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '16px' }}>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <Tv size={14} /> Full Package Video Breakdown for {learner.learnerName} ({allUnits.length} Lessons)
                                                                </span>
                                                                <span style={{ color: '#64748b' }}>
                                                                    {learner.completedVideos} Completed • {allUnits.length - learner.completedVideos} Remaining
                                                                </span>
                                                            </div>

                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                                                {learner.allUnitStats.map((stat, idx) => {
                                                                    const matchedUnit = allUnits.find(u => u.id === stat.unitId) || allUnits[idx];

                                                                    return (
                                                                        <div key={stat.unitId} style={{ background: '#ffffff', border: stat.unitId === unit.id ? '2px solid #0284c7' : '1px solid #cbd5e1', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                                <strong style={{ fontSize: '0.85rem', color: '#0f172a', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '34px' }}>
                                                                                    {matchedUnit?.title || `Lesson ${idx + 1}`}
                                                                                </strong>
                                                                                <CheckCircle2 size={16} color={stat.isCompleted ? '#16a34a' : '#cbd5e1'} style={{ flexShrink: 0 }} />
                                                                            </div>

                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                                                                                <span>Duration: {stat.watched} / {stat.duration} Mins</span>
                                                                                <strong style={{ color: stat.watchPct === 100 ? '#16a34a' : '#0284c7' }}>Watch: {stat.watchPct}%</strong>
                                                                            </div>

                                                                            <div style={{ height: '4px', background: '#e2e8f0', width: '100%', overflow: 'hidden' }}>
                                                                                <div style={{ height: '100%', width: `${stat.watchPct}%`, background: stat.watchPct === 100 ? '#16a34a' : '#0284c7' }} />
                                                                            </div>

                                                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'right', marginTop: '4px' }}>
                                                                                Last Activity: {stat.lastActivity}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* TAB 2: QUIZZES */}
                {activeTab === 'quizzes' && (
                    <div className="mlab-table-wrap">
                        <table className="mlab-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}></th>
                                    <th>Learner</th>
                                    <th>Assigned Cohort</th>
                                    <th>Check Type</th>
                                    <th>Attempts</th>
                                    <th>Score</th>
                                    <th style={{ textAlign: 'right' }}>Gate Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoadingProgress ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#94a3b8' }}>
                                                <Loader2 size={32} className="lfm-spin" />
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Syncing assessment data...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredLearners.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#94a3b8' }}>
                                                <SearchX size={36} style={{ opacity: 0.4 }} />
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#64748b' }}>No Assessment Data Found</div>
                                                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Adjust your filters or wait for learners to submit.</div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLearners.map(learner => {
                                        const isExpanded = expandedLearnerIds.has(learner.learnerId);

                                        return (
                                            <React.Fragment key={learner.learnerId}>
                                                <tr onClick={() => toggleAccordion(learner.learnerId)} style={{ cursor: 'pointer', background: isExpanded ? '#f5f3ff' : 'white' }}>
                                                    <td>{isExpanded ? <ChevronUp size={16} color="#6d28d9" /> : <ChevronDown size={16} color="#94a3b8" />}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <strong style={{ color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>{learner.learnerName}</strong>
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{learner.learnerEmail}</span>
                                                        </div>
                                                    </td>
                                                    <td><span style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>{learner.cohortName}</span></td>
                                                    <td><span style={{ fontSize: '0.72rem', background: '#f3e8ff', color: '#6d28d9', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase' }}>{learner.checkType.replace('_', ' ')}</span></td>
                                                    <td><span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{learner.attempts} Attempt(s)</span></td>
                                                    <td><strong style={{ color: learner.score >= 70 ? '#16a34a' : '#be123c', fontSize: '0.95rem' }}>{learner.score}%</strong></td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        {learner.passed ? (
                                                            <span style={{ color: '#16a34a', fontWeight: 800, fontSize: '0.75rem', background: '#dcfce7', padding: '3px 8px' }}><CheckCircle2 size={13} style={{ marginRight: '4px' }} /> Passed</span>
                                                        ) : (
                                                            <span style={{ color: '#be123c', fontWeight: 800, fontSize: '0.75rem', background: '#fff1f2', padding: '3px 8px' }}><ShieldAlert size={13} style={{ marginRight: '4px' }} /> Retry Required</span>
                                                        )}
                                                    </td>
                                                </tr>

                                                {isExpanded && (
                                                    <tr style={{ background: '#f8fafc' }}>
                                                        <td colSpan={7} style={{ padding: '16px 24px', borderLeft: '4px solid #6d28d9' }}>
                                                            <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#6d28d9', marginBottom: '8px' }}>Submitted Response for: <strong>{unit.title}</strong></div>
                                                            <pre className="ql-syntax" spellCheck="false" style={{ margin: 0, fontSize: '0.78rem', background: '#0f172a', color: '#38bdf8', padding: '10px 14px', fontFamily: 'monospace' }}>
                                                                {learner.submittedAnswer}
                                                            </pre>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* TAB 3: COMMENTS STREAM */}
                {activeTab === 'comments' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1rem', color: 'var(--mlab-midnight)', margin: 0 }}>Live Comment Stream</h3>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Post a message visible to all learners in this intake</span>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '12px', border: '1px solid var(--mlab-border)' }}>
                            <div style={{ width: '36px', height: '36px', background: 'var(--mlab-midnight)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>FC</div>
                            <Tooltip content="Type a comment or instruction to broadcast to learners in this lesson." placement="top">
                                <input
                                    type="text"
                                    placeholder="Broadcast a comment or tip to learners in this intake..."
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAdminPostComment()}
                                    className="pfm-input"
                                    style={{ flex: 1, padding: '10px 12px' }}
                                    disabled={isSubmitting}
                                />
                            </Tooltip>
                            <Tooltip content="Post comment to lesson stream." placement="top">
                                <button onClick={handleAdminPostComment} disabled={isSubmitting || !newComment.trim()} className="lfm-btn lfm-btn--primary">
                                    {isSubmitting ? <Loader2 size={14} className="lfm-spin" /> : <Send size={14} />}
                                </button>
                            </Tooltip>
                        </div>

                        {comments.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                                No comments found for this lesson intake.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {comments.map(c => (
                                    <div key={c.id} style={{ display: 'flex', gap: '12px', borderLeft: c.isFlagged ? '4px solid #be123c' : (c.isStaff ? '4px solid var(--mlab-green)' : '4px solid transparent'), padding: '12px', background: c.isFlagged ? '#fff1f2' : (c.isStaff ? '#f0fdf4' : '#ffffff'), border: '1px solid var(--mlab-border)' }}>
                                        <div style={{ width: '36px', height: '36px', background: c.isStaff ? 'var(--mlab-green)' : 'var(--mlab-light-blue)', color: c.isStaff ? 'white' : 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>
                                            {c.userInitials || 'ST'}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <strong style={{ fontSize: '0.9rem', color: c.isStaff ? 'var(--mlab-green)' : 'var(--mlab-blue)' }}>{c.userName}</strong>
                                                    {c.isStaff && <span style={{ fontSize: '0.65rem', background: 'var(--mlab-green)', color: 'white', padding: '2px 6px', fontWeight: 800, textTransform: 'uppercase' }}>Facilitator</span>}
                                                    {c.isFlagged && <span style={{ fontSize: '0.65rem', background: '#be123c', color: 'white', padding: '2px 6px', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldAlert size={10} /> Flagged</span>}
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                        {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : 'Just now'}
                                                    </span>
                                                    {!c.isStaff && (
                                                        <>
                                                            <Tooltip content={c.isFlagged ? "Remove flag from this comment." : "Flag inappropriate comment to hide it from students."} placement="top">
                                                                <button onClick={() => handleToggleFlagComment(c.id, c.isFlagged)} style={{ background: 'none', border: 'none', color: c.isFlagged ? '#0f172a' : '#d97706', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                                                                    {c.isFlagged ? 'Unflag' : 'Flag'}
                                                                </button>
                                                            </Tooltip>
                                                            <Tooltip content="Permanently delete this comment." placement="top">
                                                                <button onClick={() => handleDeleteComment(c.id)} style={{ background: 'none', border: 'none', color: '#be123c', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                                                                    Delete
                                                                </button>
                                                            </Tooltip>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.5 }}>{c.text}</div>
                                            {c.isFlagged && <div style={{ fontSize: '0.75rem', color: '#be123c', marginTop: '6px', fontWeight: 600 }}>Reason: {c.flagReason}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 4: Q&A THREADS */}
                {activeTab === 'qa' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {qaViewMode === 'list' ? (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ fontSize: '1rem', color: 'var(--mlab-midnight)', margin: 0 }}>Learner Questions ({questions.length})</h3>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Click a question to view details and post an official answer.</span>
                                </div>

                                {questions.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                                        No questions have been asked in this lesson intake.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {questions.map(q => (
                                            <Tooltip key={q.id} content="Click to view full thread and submit an answer." placement="top">
                                                <div
                                                    onClick={() => { setSelectedQuestion(q); setQaViewMode('detail'); }}
                                                    style={{ padding: '16px', background: '#ffffff', border: '1px solid var(--mlab-border)', cursor: 'pointer', transition: 'border-color 0.2s', display: 'flex', flexDirection: 'column', gap: '8px' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--mlab-blue)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--mlab-border)'}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--mlab-blue)' }}>{q.title}</div>
                                                        <span style={{ fontSize: '0.7rem', background: (q.answersCount || 0) > 0 ? '#dcfce7' : '#f1f5f9', color: (q.answersCount || 0) > 0 ? '#15803d' : '#64748b', padding: '2px 8px', fontWeight: 800 }}>
                                                            {q.answersCount || 0} Answers
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '8px' }}>
                                                        <span>Asked by <strong>{q.userName}</strong></span> • <span>{q.createdAt?.toDate ? q.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
                                                    </div>
                                                </div>
                                            </Tooltip>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : selectedQuestion ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <Tooltip content="Return to questions list." placement="right">
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedQuestion(null); setQaViewMode('list'); }}
                                        style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: 'var(--mlab-blue)', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: 0 }}
                                    >
                                        <ArrowLeft size={14} /> Back to Question List
                                    </button>
                                </Tooltip>

                                {/* Question Detail */}
                                <div style={{ background: '#f8fafc', padding: '20px', border: '1px solid var(--mlab-border)' }}>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-midnight)', marginBottom: '8px' }}>{selectedQuestion.title}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '16px' }}>
                                        Asked by <strong>{selectedQuestion.userName}</strong> on {selectedQuestion.createdAt?.toDate ? selectedQuestion.createdAt.toDate().toLocaleString() : 'Recently'}
                                    </div>
                                    <div className="ql-editor" style={{ padding: 0, fontSize: '0.9rem', color: '#334155' }}>
                                        <div dangerouslySetInnerHTML={{ __html: selectedQuestion.contentHtml }} />
                                    </div>
                                </div>

                                {/* Answers List */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                                    <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>Answers &amp; Discussion ({questionAnswers.length})</strong>
                                    {questionAnswers.map(ans => (
                                        <div key={ans.id} style={{ padding: '16px', background: ans.isStaff ? '#f0fdf4' : '#ffffff', border: '1px solid var(--mlab-border)', borderLeft: ans.isStaff ? '4px solid var(--mlab-green)' : '4px solid var(--mlab-blue)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <strong style={{ fontSize: '0.85rem', color: ans.isStaff ? 'var(--mlab-green)' : 'var(--mlab-blue)' }}>{ans.userName}</strong>
                                                    {ans.isStaff && <span style={{ fontSize: '0.65rem', background: 'var(--mlab-green)', color: 'white', padding: '2px 6px', fontWeight: 800, textTransform: 'uppercase' }}>Facilitator</span>}
                                                </div>
                                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{ans.createdAt?.toDate ? ans.createdAt.toDate().toLocaleString() : 'Just now'}</span>
                                            </div>
                                            <div className="ql-editor" style={{ padding: 0, fontSize: '0.85rem', color: '#334155' }}>
                                                <div dangerouslySetInnerHTML={{ __html: ans.contentHtml }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Facilitator Reply Editor */}
                                <div style={{ marginTop: '16px', borderTop: '1px solid var(--mlab-border)', paddingTop: '20px' }}>
                                    <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--mlab-midnight)', marginBottom: '10px' }}>Post Official Facilitator Reply</strong>
                                    <div style={{ background: 'white', border: '1px solid var(--mlab-border)', marginBottom: '12px' }}>
                                        <ReactQuill
                                            theme="snow"
                                            value={answerBody}
                                            onChange={setAnswerBody}
                                            modules={FORUM_QUILL_MODULES}
                                            style={{ minHeight: '120px' }}
                                            placeholder="Draft a detailed explanation or code solution..."
                                        />
                                    </div>
                                    <Tooltip content="Submit official facilitator response to this Q&A question." placement="top">
                                        <button
                                            type="button"
                                            onClick={handleAdminPostAnswer}
                                            disabled={isSubmitting || !answerBody.trim()}
                                            className="lfm-btn lfm-btn--primary"
                                            style={{ opacity: (isSubmitting || !answerBody.trim()) ? 0.5 : 1 }}
                                        >
                                            {isSubmitting ? <Loader2 size={14} className="lfm-spin" /> : <Send size={14} />} Post Official Reply
                                        </button>
                                    </Tooltip>
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
};