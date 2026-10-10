// src/pages/AdminDashboard/ContentAuthoring/LessonAnalytics/PackageAnalyticsView.tsx

import React, { useEffect, useMemo, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import {
    collection, onSnapshot, query, where, doc,
    addDoc, updateDoc, deleteDoc, serverTimestamp, increment
} from 'firebase/firestore';
import {
    AlertTriangle, ArrowLeft, ChevronRight, Download, Loader2, Search,
    SearchX, BarChart3, TrendingUp, Rocket, HelpCircle, MessageSquare,
    CheckCircle2, X, Send, ShieldAlert, Filter, Clock
} from 'lucide-react';
import { db, auth } from '../../../../lib/firebase';
import { useToast } from '../../../../components/common/Toast/Toast';
import { QuillHTMLViewer } from '../../../../components/common/QuillHTMLViewer/QuillHTMLViewer';
import type { ContentContainer, LearningUnit } from '../../../../types/content.types';
import type { ExtendedLearningUnit, EnrichedContentContainer } from '../ContentAuthoring';
import type { ExtendedCohortRun } from '../LaunchCohortModal';

import { useChunkedQuery } from './hooks';
import { RISK_LABEL, downloadCsv, pct } from './utils';
import type {
    CohortRunStats, EnrollmentDoc, LessonComment, LessonQuestion, ProgressDoc, RiskLevel
} from './types';

type Unit = LearningUnit | ExtendedLearningUnit;

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

interface Props {
    container: ContentContainer | EnrichedContentContainer;
    units: LearningUnit[] | ExtendedLearningUnit[];
    onBack: () => void;
    onDrilldownLesson: (unit: Unit, cohortRunId?: string) => void;
}

type KeyedDoc = { containerId?: string; timelineId?: string; cohortRunId?: string };

const progInRun = (p: ProgressDoc, runId: string) => runId === 'all' || p.containerId === runId || p.cohortRunId === runId;
const enrInRun = (e: EnrollmentDoc, runId: string) =>
    runId === 'all' || e.cohortRunId === runId || e.containerId === runId || e.courseId === runId;
const docInRun = (d: KeyedDoc, runId: string) =>
    runId === 'all' || [d.containerId, d.timelineId, d.cohortRunId].includes(runId);

const FORUM_QUILL_MODULES = {
    toolbar: [['bold', 'italic', 'underline', 'code', 'code-block'], ['clean']]
};

export const PackageAnalyticsView: React.FC<Props> = ({ container, units, onBack, onDrilldownLesson }) => {
    const toast = useToast();
    const [cohortRuns, setCohortRuns] = useState<ExtendedCohortRun[]>([]);
    const [runsLoading, setRunsLoading] = useState(true);

    // Page View Navigation Tabs
    const [activePageTab, setActivePageTab] = useState<'overview' | 'qa' | 'comments'>('overview');

    const [scopeRunId, setScopeRunId] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');

    // Q&A State
    const [selectedQuestion, setSelectedQuestion] = useState<LessonQuestion | null>(null);
    const [questionAnswers, setQuestionAnswers] = useState<LessonAnswer[]>([]);
    const [qaFilter, setQaFilter] = useState<'all' | 'unanswered' | 'answered'>('all');
    const [replyBody, setReplyBody] = useState('');
    const [isSubmittingQA, setIsSubmittingQA] = useState(false);

    // Comments State
    const [newBroadcastComment, setNewBroadcastComment] = useState('');
    const [broadcastUnitId, setBroadcastUnitId] = useState<string>(units[0]?.id || '');
    const [isPostingComment, setIsPostingComment] = useState(false);
    const [commentFilter, setCommentFilter] = useState<'all' | 'flagged'>('all');

    useEffect(() => {
        if (!container.id) return;
        const unsub = onSnapshot(
            query(collection(db, 'cohort_runs'), where('containerId', '==', container.id)),
            snap => {
                setCohortRuns(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ExtendedCohortRun));
                setRunsLoading(false);
            },
            (err) => {
                console.error("Failed to load cohort runs:", err);
                toast.error('Could not load cohort analytics.');
                setRunsLoading(false);
            }
        );
        return () => unsub();
    }, [container.id, toast]);

    useEffect(() => {
        if (units.length > 0 && !broadcastUnitId) {
            setBroadcastUnitId(units[0].id);
        }
    }, [units, broadcastUnitId]);

    const runIds = useMemo(() => Array.from(new Set([container.id, ...cohortRuns.map(r => r.id)])), [container.id, cohortRuns]);
    const unitIds = useMemo(() => units.map(u => u.id), [units]);

    const { data: enrollments, loading: enrLoading } = useChunkedQuery<EnrollmentDoc>('enrollments', 'containerId', runIds);
    const { data: progress, loading: progLoading } = useChunkedQuery<ProgressDoc>('learner_content_progress', 'containerId', runIds);
    const { data: comments } = useChunkedQuery<LessonComment>('lessonComments', 'unitId', unitIds);
    const { data: questions } = useChunkedQuery<LessonQuestion>('lessonQuestions', 'unitId', unitIds);

    const loading = runsLoading || enrLoading || progLoading;

    // Listen to Q&A Answers when a thread is expanded
    useEffect(() => {
        if (!selectedQuestion?.id) {
            setQuestionAnswers([]);
            return;
        }
        const q = query(
            collection(db, 'lessonQuestionAnswers'),
            where('questionId', '==', selectedQuestion.id)
        );
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as LessonAnswer));
            list.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return timeA - timeB;
            });
            setQuestionAnswers(list);
        });
        return () => unsub();
    }, [selectedQuestion?.id]);

    const getUnitTitle = (unitId: string) => {
        const found = units.find(u => u.id === unitId);
        return found?.title || `Unit ${unitId.substring(0, 6)}`;
    };

    /** Total unanswered questions awaiting facilitator response across the selected scope */
    const totalUnansweredInScope = useMemo(() => {
        return questions.filter(q => docInRun(q, scopeRunId) && (!q.hasStaffReply && !(q.answersCount && q.answersCount > 0))).length;
    }, [questions, scopeRunId]);

    const questionsInScope = useMemo(() => {
        return questions.filter(q => {
            const inRun = docInRun(q, scopeRunId);
            const matchesSearch = !search || q.title.toLowerCase().includes(search.toLowerCase()) || q.userName.toLowerCase().includes(search.toLowerCase());
            const isUnanswered = !q.hasStaffReply && !(q.answersCount && q.answersCount > 0);
            const matchesFilter = qaFilter === 'all' || (qaFilter === 'unanswered' && isUnanswered) || (qaFilter === 'answered' && !isUnanswered);
            return inRun && matchesSearch && matchesFilter;
        });
    }, [questions, scopeRunId, search, qaFilter]);

    const commentsInScope = useMemo(() => {
        return comments.filter(c => {
            const inRun = docInRun(c, scopeRunId);
            const matchesSearch = !search || c.text.toLowerCase().includes(search.toLowerCase()) || c.userName.toLowerCase().includes(search.toLowerCase());
            const matchesFilter = commentFilter === 'all' || (commentFilter === 'flagged' && c.isFlagged);
            return inRun && matchesSearch && matchesFilter;
        });
    }, [comments, scopeRunId, search, commentFilter]);

    // 🚀 Sort units chronologically by orderIndex so the Course Flow renders accurately
    const sortedUnits = useMemo(() => {
        return [...units].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    }, [units]);

    /** Calculates completion rates, pass rates, and lesson engagement for a given scope */
    const computeScope = useMemo(() => (runId: string) => {
        const prog = progress.filter(p => progInRun(p, runId));
        const userIds = Array.from(new Set(
            [...enrollments.filter(e => enrInRun(e, runId)).map(e => e.userId), ...prog.map(p => p.userId)]
                .filter((id): id is string => Boolean(id))
        ));

        const byUser = new Map<string, ProgressDoc[]>();
        prog.forEach(p => {
            if (!p.userId) return;
            const list = byUser.get(p.userId) ?? [];
            list.push(p);
            byUser.set(p.userId, list);
        });

        // Use chronologically sorted units
        const perUnit = sortedUnits.map(u => {
            const docs = prog.filter(p => p.unitId === u.id);
            const finishedUsers = new Set(docs.filter(p => p.isCompleted === true).map(p => p.userId));
            const evaluated = docs.filter(p => (p.attempts || 0) > 0 || p.passed === true);
            const unitQuestions = questions.filter(q => q.unitId === u.id && docInRun(q, runId));

            return {
                unit: u as Unit,
                watchRate: userIds.length ? Math.round((finishedUsers.size / userIds.length) * 100) : null,
                passRate: evaluated.length ? Math.round((evaluated.filter(p => p.passed).length / evaluated.length) * 100) : null,
                comments: comments.filter(c => c.unitId === u.id && docInRun(c, runId)).length,
                questions: unitQuestions.length,
                unanswered: unitQuestions.filter(q => !q.hasStaffReply && !(q.answersCount && q.answersCount > 0)).length
            };
        });

        const completionRate = userIds.length
            ? Math.round(
                userIds.reduce((sum, uid) => {
                    const docs = byUser.get(uid) ?? [];
                    const done = sortedUnits.filter(u => docs.some(p => p.unitId === u.id && p.isCompleted === true)).length;
                    return sum + (done / (sortedUnits.length || 1)) * 100;
                }, 0) / userIds.length
            )
            : 0;

        const evaluatedAll = prog.filter(p => (p.attempts || 0) > 0 || p.passed === true);
        const passRate = evaluatedAll.length ? Math.round((evaluatedAll.filter(p => p.passed).length / evaluatedAll.length) * 100) : null;
        const avgMins = userIds.length ? Math.round(prog.reduce((s, p) => s + (p.watchedMins || 0), 0) / userIds.length) : 0;

        return { userIds, perUnit, completionRate, passRate, avgMins };
    }, [progress, enrollments, comments, questions, sortedUnits]);

    const funnel = useMemo(() => computeScope(scopeRunId), [computeScope, scopeRunId]);

    const runStats: CohortRunStats[] = useMemo(() => cohortRuns.map(run => {
        const s = computeScope(run.id);
        let risk: RiskLevel | null = null;
        if (s.userIds.length > 0) {
            if (s.completionRate < 50 || (s.passRate !== null && s.passRate < 60)) risk = 'high_risk';
            else if (s.completionRate < 75 || (s.passRate !== null && s.passRate < 75)) risk = 'moderate_risk';
            else risk = 'on_track';
        }
        return {
            ...run,
            enrolledCount: s.userIds.length,
            completionRate: s.completionRate,
            passRate: s.passRate,
            avgTimeSpentMins: s.avgMins,
            riskStatus: risk
        };
    }), [cohortRuns, computeScope]);

    const filteredRuns = useMemo(() => {
        const term = search.trim().toLowerCase();
        return runStats.filter(r => {
            const okStatus = statusFilter === 'all' || r.status === statusFilter;
            const okSearch = !term ||
                (r.cohortName || r.name || '').toLowerCase().includes(term) ||
                r.id.toLowerCase().includes(term);
            return okStatus && okSearch;
        });
    }, [runStats, statusFilter, search]);

    const summary = useMemo(() => {
        const learners = runStats.reduce((a, r) => a + r.enrolledCount, 0);
        const withData = runStats.filter(r => r.enrolledCount > 0);
        const avgCompletion = withData.length ? Math.round(withData.reduce((a, r) => a + r.completionRate, 0) / withData.length) : null;
        const rated = runStats.filter(r => r.passRate !== null);
        const avgPass = rated.length ? Math.round(rated.reduce((a, r) => a + (r.passRate as number), 0) / rated.length) : null;
        const atRisk = runStats.filter(r => r.riskStatus === 'high_risk').length;
        return { learners, avgCompletion, avgPass, atRisk };
    }, [runStats]);

    /** Identifies the lesson learners struggle with most in this intake */
    const worstUnitFor = (runId: string): Unit | undefined => {
        const s = computeScope(runId);
        const scored = s.perUnit.filter(p => p.watchRate !== null);
        if (scored.length === 0) return sortedUnits[0];
        return scored.reduce((worst, p) => ((p.watchRate as number) < (worst.watchRate as number) ? p : worst)).unit;
    };

    const handlePostStaffReply = async () => {
        const currentUser = auth.currentUser;
        if (!replyBody.trim() || !selectedQuestion || !currentUser) return;
        setIsSubmittingQA(true);
        try {
            const userEmail = currentUser.email || 'Facilitator';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            await addDoc(collection(db, 'lessonQuestionAnswers'), {
                questionId: selectedQuestion.id,
                unitId: selectedQuestion.unitId,
                containerId: selectedQuestion.containerId || selectedQuestion.cohortRunId || container.id,
                userId: currentUser.uid,
                userName: userName,
                userInitials: initials,
                contentHtml: replyBody,
                isStaff: true,
                createdAt: serverTimestamp()
            });

            const qRef = doc(db, 'lessonQuestions', selectedQuestion.id);
            await updateDoc(qRef, {
                answersCount: increment(1),
                hasStaffReply: true,
                lastActivityAt: serverTimestamp()
            });

            toast.success("Official facilitator reply posted.");
            setReplyBody('');
        } catch (err) {
            console.error("Failed to post staff reply:", err);
            toast.error("Could not post reply.");
        } finally {
            setIsSubmittingQA(false);
        }
    };

    const handlePostComment = async () => {
        const currentUser = auth.currentUser;
        if (!newBroadcastComment.trim() || !currentUser || !broadcastUnitId) return;
        setIsPostingComment(true);
        try {
            const userEmail = currentUser.email || 'Facilitator';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            await addDoc(collection(db, 'lessonComments'), {
                unitId: broadcastUnitId,
                containerId: scopeRunId === 'all' ? container.id : scopeRunId,
                courseId: container.id,
                userId: currentUser.uid,
                userName: userName,
                userInitials: initials,
                text: newBroadcastComment.trim(),
                isStaff: true,
                createdAt: serverTimestamp()
            });

            toast.success("Comment broadcasted to lesson stream.");
            setNewBroadcastComment('');
        } catch (err) {
            console.error("Failed to post comment:", err);
            toast.error("Could not post comment.");
        } finally {
            setIsPostingComment(false);
        }
    };

    const handleToggleFlagComment = async (commentId: string, isFlagged?: boolean) => {
        try {
            await updateDoc(doc(db, 'lessonComments', commentId), {
                isFlagged: !isFlagged,
                flagReason: !isFlagged ? 'Flagged by Facilitator' : null
            });
            toast.success(isFlagged ? 'Comment unflagged.' : 'Comment flagged.');
        } catch (err) {
            toast.error('Failed to update comment flag.');
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!window.confirm('Delete this comment permanently?')) return;
        try {
            await deleteDoc(doc(db, 'lessonComments', commentId));
            toast.success('Comment deleted.');
        } catch (err) {
            toast.error('Failed to delete comment.');
        }
    };

    const exportCsv = () => {
        if (runStats.length === 0) {
            toast.info('There are no intakes to export yet.');
            return;
        }
        downloadCsv(`${container.referenceId || container.id}-cohort-report.csv`, [
            ['Intake', 'Run ID', 'Status', 'Start', 'End', 'Enrolled', 'Completion %', 'Pass rate %', 'Risk'],
            ...runStats.map(r => [
                r.cohortName || r.name || 'Untitled',
                r.id,
                r.status || '',
                r.timeBoundConfig?.startDate || r.startDate || '',
                r.timeBoundConfig?.endDate || r.endDate || '',
                r.enrolledCount,
                r.completionRate,
                r.passRate ?? '',
                r.riskStatus ? RISK_LABEL[r.riskStatus] : 'No data'
            ])
        ]);
        toast.success('Report downloaded.');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>

            {/* Header Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#073f4e', color: 'white', padding: '18px 24px', borderBottom: '3px solid #94c73d' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button type="button" onClick={onBack} style={{ background: 'rgba(255, 255, 255, 0.12)', border: 'none', color: 'white', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 700, fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase' }}>
                        <ArrowLeft size={16} /> Back to Studio
                    </button>
                    <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#94c73d', fontWeight: 800, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                            <BarChart3 size={13} /> Global Package Operations &amp; Cohort Intelligence
                        </div>
                        <h2 style={{ margin: '2px 0 0 0', fontSize: '1.25rem', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', color: '#ffffff', textTransform: 'uppercase' }}>
                            {container.title} [{container.referenceId}]
                        </h2>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button type="button" onClick={exportCsv} style={{ background: '#94c73d', color: '#052e3a', border: 'none', padding: '8px 16px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase' }}>
                        <Download size={14} /> Export CSV Report
                    </button>
                </div>
            </div>

            {/* Embedded Page Tabs Bar */}
            <div style={{ display: 'flex', background: '#f0f4f6', border: '1px solid #dde4e8', borderBottom: '2px solid #073f4e' }}>
                <button
                    type="button"
                    onClick={() => setActivePageTab('overview')}
                    style={{
                        padding: '12px 20px',
                        background: activePageTab === 'overview' ? '#073f4e' : 'transparent',
                        color: activePageTab === 'overview' ? '#ffffff' : '#073f4e',
                        border: 'none',
                        borderRight: '1px solid #dde4e8',
                        fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <BarChart3 size={16} style={{ color: activePageTab === 'overview' ? '#94c73d' : 'inherit' }} /> Overview &amp; Intakes
                </button>

                <button
                    type="button"
                    onClick={() => setActivePageTab('qa')}
                    style={{
                        padding: '12px 20px',
                        background: activePageTab === 'qa' ? '#073f4e' : 'transparent',
                        color: activePageTab === 'qa' ? '#ffffff' : '#073f4e',
                        border: 'none',
                        borderRight: '1px solid #dde4e8',
                        fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <HelpCircle size={16} style={{ color: activePageTab === 'qa' ? '#94c73d' : 'inherit' }} />
                    Package Q&amp;A Forum
                    {totalUnansweredInScope > 0 && (
                        <span style={{ background: '#d97706', color: '#ffffff', fontSize: '0.65rem', padding: '1px 6px', fontWeight: 800 }}>
                            {totalUnansweredInScope} Unanswered
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActivePageTab('comments')}
                    style={{
                        padding: '12px 20px',
                        background: activePageTab === 'comments' ? '#073f4e' : 'transparent',
                        color: activePageTab === 'comments' ? '#ffffff' : '#073f4e',
                        border: 'none',
                        fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <MessageSquare size={16} style={{ color: activePageTab === 'comments' ? '#94c73d' : 'inherit' }} />
                    Live Comments Stream
                    <span style={{ background: '#e8f0f3', color: '#073f4e', fontSize: '0.65rem', padding: '1px 6px', fontWeight: 800 }}>
                        {commentsInScope.length}
                    </span>
                </button>
            </div>

            {/* PAGE TAB 1: OVERVIEW & INTAKES */}
            {activePageTab === 'overview' && (
                <>
                    {/* KPI Metric Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                        <div style={{ background: '#ffffff', padding: '16px', borderLeft: '4px solid #073f4e', border: '1px solid #dde4e8' }}>
                            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#6b6b6b', fontWeight: 800, marginBottom: '6px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>Total Delivery Intakes</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#073f4e', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>{runStats.length}</span>
                                <span style={{ fontSize: '0.75rem', background: '#e8f0f3', color: '#073f4e', padding: '2px 8px', fontWeight: 800 }}>{summary.learners} Enrolled</span>
                            </div>
                        </div>

                        <div style={{ background: '#ffffff', padding: '16px', borderLeft: '4px solid #94c73d', border: '1px solid #dde4e8' }}>
                            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#6b6b6b', fontWeight: 800, marginBottom: '6px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>Average Assessment Pass Rate</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#7aaa2e', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>{pct(summary.avgPass)}</span>
                                <span style={{ fontSize: '0.72rem', color: '#7aaa2e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}><TrendingUp size={12} /> Target 75%</span>
                            </div>
                        </div>

                        <div style={{ background: '#ffffff', padding: '16px', borderLeft: '4px solid #6d28d9', border: '1px solid #dde4e8' }}>
                            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#6b6b6b', fontWeight: 800, marginBottom: '6px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>Course Completion Velocity</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#6d28d9', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>{pct(summary.avgCompletion)}</span>
                                <span style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: 700 }}>Avg Velocity</span>
                            </div>
                        </div>

                        <div style={{ background: '#ffffff', padding: '16px', borderLeft: '4px solid #ef4444', border: '1px solid #dde4e8' }}>
                            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#6b6b6b', fontWeight: 800, marginBottom: '6px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>At-Risk Intakes</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: summary.atRisk > 0 ? '#ef4444' : '#073f4e', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>{summary.atRisk}</span>
                                <span style={{ fontSize: '0.72rem', color: summary.atRisk > 0 ? '#ef4444' : '#6b6b6b', fontWeight: 700 }}>
                                    {summary.atRisk > 0 ? 'Intervention Required' : 'All Clear'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Course Flow Funnel */}
                    <section style={{ background: '#ffffff', border: '1px solid #dde4e8', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#073f4e', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase' }}>Course Flow</h2>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#6b6b6b' }}>Where learners finish, pass, and discuss, lesson by lesson. Select a lesson card to inspect details.</p>
                            </div>
                            <select className="la-select" aria-label="Intake for course flow" value={scopeRunId} onChange={e => setScopeRunId(e.target.value)} style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f0f4f6', border: '1px solid #dde4e8', outline: 'none' }}>
                                <option value="all">🌍 All Intakes (Global View)</option>
                                {cohortRuns.map(r => <option key={r.id} value={r.id}>🚀 {r.cohortName || r.name || r.id}</option>)}
                            </select>
                        </div>

                        {loading ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#6b6b6b', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}><Loader2 size={22} className="lfm-spin" /> Loading course flow…</div>
                        ) : funnel.userIds.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#6b6b6b' }}>No learners enrolled in this scope yet.</div>
                        ) : (
                            <ol style={{ listStyle: 'none', paddingTop: 16, paddingBottom: 16, margin: 0, display: 'flex', gap: '16px', overflowX: 'auto', alignItems: 'stretch' }}>
                                {funnel.perUnit.map((p, i) => {
                                    const warn = (p.watchRate !== null && p.watchRate < 60) || (p.passRate !== null && p.passRate < 60);
                                    return (
                                        <React.Fragment key={p.unit.id}>
                                            {i > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <ChevronRight size={20} style={{ color: 'var(--mlab-grey-lt, #9b9b9b)' }} aria-hidden />
                                                </div>
                                            )}
                                            <li style={{ flexShrink: 0, width: '260px', display: 'flex', flexDirection: 'column' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => onDrilldownLesson(p.unit, scopeRunId !== 'all' ? scopeRunId : undefined)}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        textAlign: 'left',
                                                        background: 'var(--mlab-white, #ffffff)',
                                                        border: warn ? '2px solid var(--mlab-red, #ef4444)' : '2px solid var(--mlab-blue, #073f4e)',
                                                        padding: 0,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        outline: 'none',
                                                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                                        borderRadius: '0px'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                                        e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.08)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                    }}
                                                >
                                                    {/* Header */}
                                                    <div style={{
                                                        width: '100%',
                                                        background: warn ? 'var(--mlab-red, #ef4444)' : 'var(--mlab-blue, #073f4e)',
                                                        borderBottom: warn ? '3px solid #b91c1c' : '3px solid var(--mlab-green, #94c73d)',
                                                        padding: '10px 14px',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'flex-start',
                                                        gap: '8px',
                                                        minHeight: '48px'
                                                    }}>
                                                        <span style={{
                                                            fontSize: '0.8rem',
                                                            fontWeight: 700,
                                                            color: 'var(--mlab-white, #ffffff)',
                                                            fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                                            textTransform: 'uppercase',
                                                            lineHeight: 1.3,
                                                            letterSpacing: '0.05em'
                                                        }}>
                                                            {i + 1}. {p.unit.title || 'Untitled'}
                                                        </span>
                                                        {warn && <AlertTriangle size={15} color="var(--mlab-white, #ffffff)" style={{ flexShrink: 0 }} />}
                                                    </div>

                                                    {/* Body */}
                                                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, width: '100%' }}>
                                                        <div style={{ width: '100%' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 600, color: 'var(--mlab-grey, #6b6b6b)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', letterSpacing: '0.05em' }}>
                                                                <span>Watch Progress</span>
                                                                <span style={{ color: warn ? 'var(--mlab-red, #ef4444)' : 'var(--mlab-blue, #073f4e)', fontWeight: 800 }}>{pct(p.watchRate)}</span>
                                                            </div>
                                                            <div style={{ height: '6px', background: 'var(--mlab-border, #dde4e8)', width: '100%', overflow: 'hidden' }}>
                                                                <div style={{ width: `${p.watchRate ?? 0}%`, height: '100%', background: warn ? 'var(--mlab-red, #ef4444)' : 'var(--mlab-blue, #073f4e)' }} />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Footer */}
                                                    <div style={{
                                                        width: '100%',
                                                        background: warn ? '#fef2f2' : 'var(--mlab-bg, #f0f4f6)',
                                                        borderTop: warn ? '2px solid #fca5a5' : '2px solid var(--mlab-border, #dde4e8)',
                                                        padding: '10px 14px',
                                                        marginTop: 'auto',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '6px'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', borderBottom: warn ? '1px solid #fecaca' : '1px solid var(--mlab-border, #dde4e8)', paddingBottom: '4px' }}>
                                                            <span style={{ color: 'var(--mlab-grey, #6b6b6b)', fontWeight: 600 }}>Pass Rate</span>
                                                            <strong style={{ color: p.passRate !== null && p.passRate < 60 ? 'var(--mlab-red, #ef4444)' : 'var(--mlab-green-dark, #7aaa2e)' }}>{pct(p.passRate)}</strong>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                            <span style={{ color: 'var(--mlab-grey, #6b6b6b)', fontWeight: 600 }}>Logs</span>
                                                            <strong style={{ color: 'var(--mlab-blue, #073f4e)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>{p.comments} <MessageSquare size={10} style={{ color: 'var(--mlab-grey-lt, #9b9b9b)' }} /></span>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: p.unanswered > 0 ? 'var(--mlab-orange, #f59e0b)' : 'inherit' }}>{p.questions} <HelpCircle size={10} style={{ color: p.unanswered > 0 ? 'var(--mlab-orange, #f59e0b)' : 'var(--mlab-grey-lt, #9b9b9b)' }} /></span>
                                                            </strong>
                                                        </div>
                                                    </div>
                                                </button>
                                            </li>
                                        </React.Fragment>
                                    );
                                })}
                            </ol>
                        )}
                    </section>

                    {/* Cohorts Intake Runs Table */}
                    <section style={{ background: '#ffffff', border: '1px solid #dde4e8' }}>
                        <div style={{ background: '#073f4e', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                <Rocket size={16} color="#94c73d" />
                                <span>Active &amp; Historical Cohort Runs ({runStats.length})</span>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                                <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', padding: '2px 8px', border: '1px solid #dde4e8', width: '200px' }}>
                                    <Search size={14} color="#6b6b6b" />
                                    <input type="text" placeholder="Search intake..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', outline: 'none', padding: '2px 6px', fontSize: '0.75rem', width: '100%' }} />
                                </div>
                            </div>
                        </div>

                        <div className="lfm-module-editor-wrap" style={{ border: 'none', padding: 0 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f0f4f6', borderBottom: '2px solid #dde4e8', textAlign: 'left', fontSize: '0.72rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', color: '#073f4e' }}>
                                        <th style={{ padding: '10px 14px' }}>Cohort Run / Intake Name</th>
                                        <th style={{ padding: '10px 14px' }}>Timeline Window</th>
                                        <th style={{ padding: '10px 14px' }}>Enrolled</th>
                                        <th style={{ padding: '10px 14px' }}>Completion Rate</th>
                                        <th style={{ padding: '10px 14px' }}>Assessment Competency</th>
                                        <th style={{ padding: '10px 14px' }}>Risk Health</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7}>
                                                <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#9b9b9b' }}>
                                                    <Loader2 size={28} className="lfm-spin" />
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Loading intake analytics...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredRuns.length === 0 ? (
                                        <tr>
                                            <td colSpan={7}>
                                                <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#9b9b9b' }}>
                                                    <SearchX size={32} style={{ opacity: 0.4 }} />
                                                    <span style={{ fontSize: '0.85rem' }}>No intakes match your search or filter.</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredRuns.map(run => (
                                            <tr key={run.id} style={{ borderBottom: '1px solid #dde4e8' }}>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <strong style={{ color: '#073f4e', fontSize: '0.85rem' }}>{run.cohortName || run.name || 'Untitled Cohort Run'}</strong>
                                                        <span style={{ fontSize: '0.72rem', color: '#6b6b6b' }}>Run ID: {run.id}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ fontSize: '0.75rem', color: '#6b6b6b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Clock size={12} color="#9b9b9b" />
                                                        {run.timeBoundConfig?.startDate || run.startDate || 'Flexible'} → {run.timeBoundConfig?.endDate || run.endDate || 'Open'}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px' }}><span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#073f4e' }}>{run.enrolledCount} Learners</span></td>
                                                <td style={{ padding: '10px 14px', width: '160px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ flex: 1, height: '6px', background: '#dde4e8', overflow: 'hidden' }}>
                                                            <div style={{ width: `${run.completionRate}%`, height: '100%', background: '#073f4e' }} />
                                                        </div>
                                                        <strong style={{ fontSize: '0.75rem' }}>{run.completionRate}%</strong>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px' }}><strong style={{ color: run.passRate >= 75 ? '#7aaa2e' : '#b45309', fontSize: '0.85rem' }}>{run.passRate}%</strong></td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    {run.riskStatus === 'on_track' && <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={11} /> On Track</span>}
                                                    {run.riskStatus === 'moderate_risk' && <span style={{ fontSize: '0.7rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={11} /> Moderate</span>}
                                                    {run.riskStatus === 'high_risk' && <span style={{ fontSize: '0.7rem', color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ShieldAlert size={11} /> High Risk</span>}
                                                </td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const targetUnit = worstUnitFor(run.id);
                                                            if (targetUnit) onDrilldownLesson(targetUnit, run.id);
                                                            else toast.warning('This package has no lessons yet.');
                                                        }}
                                                        className="lfm-btn lfm-btn--primary"
                                                        style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                                                    >
                                                        Inspect Roster <ChevronRight size={12} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}

            {/* PAGE TAB 2: PACKAGE Q&A FORUM */}
            {activePageTab === 'qa' && (
                <div style={{ background: '#ffffff', border: '1px solid #dde4e8', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Filter & Subheader Controls */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                                type="button"
                                onClick={() => setQaFilter('all')}
                                className="lfm-btn"
                                style={{
                                    background: qaFilter === 'all' ? '#073f4e' : '#f0f4f6',
                                    color: qaFilter === 'all' ? '#ffffff' : '#073f4e',
                                    border: '1px solid #dde4e8',
                                    fontSize: '0.75rem'
                                }}
                            >
                                All Questions ({questions.length})
                            </button>

                            <button
                                type="button"
                                onClick={() => setQaFilter('unanswered')}
                                className="lfm-btn"
                                style={{
                                    background: qaFilter === 'unanswered' ? '#d97706' : '#f0f4f6',
                                    color: qaFilter === 'unanswered' ? '#ffffff' : '#b45309',
                                    border: '1px solid #fde68a',
                                    fontSize: '0.75rem'
                                }}
                            >
                                Needs Facilitator Reply ({questions.filter(q => !q.hasStaffReply && !(q.answersCount && q.answersCount > 0)).length})
                            </button>

                            <button
                                type="button"
                                onClick={() => setQaFilter('answered')}
                                className="lfm-btn"
                                style={{
                                    background: qaFilter === 'answered' ? '#7aaa2e' : '#f0f4f6',
                                    color: qaFilter === 'answered' ? '#052e3a' : '#15803d',
                                    border: '1px solid #bbf7d0',
                                    fontSize: '0.75rem'
                                }}
                            >
                                Answered ({questions.filter(q => q.hasStaffReply || (q.answersCount && q.answersCount > 0)).length})
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <select
                                value={scopeRunId}
                                onChange={e => setScopeRunId(e.target.value)}
                                className="lfm-input"
                                style={{ width: '220px', padding: '6px 10px', fontSize: '0.75rem' }}
                            >
                                <option value="all">🌍 All Intakes (Global View)</option>
                                {cohortRuns.map(r => <option key={r.id} value={r.id}>🚀 {r.cohortName || r.name || r.id}</option>)}
                            </select>

                            <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', padding: '2px 8px', border: '1px solid #dde4e8', width: '220px' }}>
                                <Search size={14} color="#6b6b6b" />
                                <input
                                    type="text"
                                    placeholder="Search Q&amp;A..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    style={{ border: 'none', outline: 'none', padding: '4px 6px', fontSize: '0.75rem', width: '100%' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Split View for Q&A Threads */}
                    <div style={{ display: 'grid', gridTemplateColumns: selectedQuestion ? '360px 1fr' : '1fr', gap: '16px', minHeight: '480px' }}>

                        {/* Questions List Column */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '600px', borderRight: selectedQuestion ? '1px solid #dde4e8' : 'none', paddingRight: selectedQuestion ? '12px' : 0 }}>
                            {questionsInScope.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9b9b9b', background: '#f0f4f6', border: '1px dashed #dde4e8' }}>
                                    <HelpCircle size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                    <div style={{ fontFamily: 'var(--font-heading, "Oswald", sans-serif)', fontSize: '0.95rem', textTransform: 'uppercase' }}>No Questions Found</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>There are no learner questions matching this filter in the selected scope.</div>
                                </div>
                            ) : (
                                questionsInScope.map(q => {
                                    const isSelected = selectedQuestion?.id === q.id;
                                    const isUnanswered = !q.hasStaffReply && !(q.answersCount && q.answersCount > 0);

                                    return (
                                        <div
                                            key={q.id}
                                            onClick={() => setSelectedQuestion(q)}
                                            style={{
                                                padding: '14px',
                                                background: isSelected ? '#e8f0f3' : '#ffffff',
                                                border: `1px solid ${isSelected ? '#073f4e' : '#dde4e8'}`,
                                                borderLeft: `4px solid ${isUnanswered ? '#d97706' : '#7aaa2e'}`,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '6px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#073f4e', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                                    {getUnitTitle(q.unitId)}
                                                </span>
                                                <span style={{ fontSize: '0.6rem', padding: '1px 6px', fontWeight: 800, textTransform: 'uppercase', background: isUnanswered ? '#fef3c7' : '#dcfce7', color: isUnanswered ? '#b45309' : '#15803d', border: `1px solid ${isUnanswered ? '#fcd34d' : '#86efac'}` }}>
                                                    {isUnanswered ? 'Needs Reply' : `${q.answersCount || 0} Replies`}
                                                </span>
                                            </div>

                                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#073f4e', fontFamily: 'var(--font-body)' }}>
                                                {q.title}
                                            </div>

                                            <div style={{ fontSize: '0.72rem', color: '#6b6b6b', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Asked by <strong>{q.userName}</strong></span>
                                                <span>{q.createdAt?.toDate ? q.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Thread Detail & Reply Column */}
                        {selectedQuestion && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: '#ffffff', border: '1px solid #dde4e8', padding: '16px' }}>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #dde4e8', paddingBottom: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#073f4e', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                            Lesson Thread — {getUnitTitle(selectedQuestion.unitId)}
                                        </div>
                                        <h3 style={{ margin: '2px 0 0 0', fontSize: '1.1rem', color: '#073f4e', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase' }}>
                                            {selectedQuestion.title}
                                        </h3>
                                        <div style={{ fontSize: '0.72rem', color: '#6b6b6b', marginTop: '2px' }}>
                                            Asked by <strong>{selectedQuestion.userName}</strong> on {selectedQuestion.createdAt?.toDate ? selectedQuestion.createdAt.toDate().toLocaleString() : 'Recently'}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className="lfm-btn lfm-btn--ghost"
                                        style={{ padding: '4px 8px' }}
                                        onClick={() => setSelectedQuestion(null)}
                                    >
                                        <X size={14} /> Close Thread
                                    </button>
                                </div>

                                {/* Original Question Text */}
                                <div style={{ background: '#f0f4f6', padding: '14px', borderLeft: '3px solid #073f4e' }}>
                                    <QuillHTMLViewer html={selectedQuestion.contentHtml} />
                                </div>

                                {/* List of Answers */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', maxHeight: '300px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#073f4e', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                        Replies ({questionAnswers.length})
                                    </div>

                                    {questionAnswers.length === 0 ? (
                                        <div style={{ fontSize: '0.8rem', color: '#9b9b9b', fontStyle: 'italic', padding: '12px 0' }}>
                                            No responses posted yet. Be the first facilitator to respond below.
                                        </div>
                                    ) : (
                                        questionAnswers.map(ans => (
                                            <div key={ans.id} style={{ background: ans.isStaff ? '#f0f7e1' : '#f8fafc', padding: '12px', border: '1px solid #dde4e8', borderLeft: `3px solid ${ans.isStaff ? '#94c73d' : '#073f4e'}` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {ans.userName}
                                                        {ans.isStaff && (
                                                            <span style={{ fontSize: '0.6rem', background: '#94c73d', color: '#052e3a', padding: '1px 6px', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                                                Facilitator
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span style={{ fontSize: '0.68rem', color: '#6b6b6b' }}>
                                                        {ans.createdAt?.toDate ? ans.createdAt.toDate().toLocaleString() : 'Just now'}
                                                    </span>
                                                </div>
                                                <QuillHTMLViewer html={ans.contentHtml} />
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Rich Text Facilitator Reply Editor */}
                                <div style={{ borderTop: '2px solid #073f4e', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#073f4e', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                        Post Official Facilitator Reply
                                    </div>
                                    <div style={{ background: '#ffffff' }}>
                                        <ReactQuill
                                            theme="snow"
                                            value={replyBody}
                                            onChange={setReplyBody}
                                            modules={FORUM_QUILL_MODULES}
                                            placeholder="Write your explanation or answer..."
                                            style={{ height: '90px', marginBottom: '40px' }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handlePostStaffReply}
                                        disabled={isSubmittingQA || !replyBody.trim()}
                                        className="lfm-btn lfm-btn--primary"
                                        style={{ alignSelf: 'flex-end', padding: '6px 16px', opacity: (isSubmittingQA || !replyBody.trim()) ? 0.6 : 1 }}
                                    >
                                        {isSubmittingQA ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />} Post Staff Reply
                                    </button>
                                </div>

                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* PAGE TAB 3: LIVE COMMENTS CHAT STREAM */}
            {activePageTab === 'comments' && (
                <div style={{ background: '#ffffff', border: '1px solid #dde4e8', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Filter & Subheader Controls */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                                type="button"
                                onClick={() => setCommentFilter('all')}
                                className="lfm-btn"
                                style={{
                                    background: commentFilter === 'all' ? '#073f4e' : '#f0f4f6',
                                    color: commentFilter === 'all' ? '#ffffff' : '#073f4e',
                                    border: '1px solid #dde4e8',
                                    fontSize: '0.75rem'
                                }}
                            >
                                All Messages ({comments.length})
                            </button>

                            <button
                                type="button"
                                onClick={() => setCommentFilter('flagged')}
                                className="lfm-btn"
                                style={{
                                    background: commentFilter === 'flagged' ? '#ef4444' : '#f0f4f6',
                                    color: commentFilter === 'flagged' ? '#ffffff' : '#991b1b',
                                    border: '1px solid #fca5a5',
                                    fontSize: '0.75rem'
                                }}
                            >
                                Flagged Content ({comments.filter(c => c.isFlagged).length})
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <select
                                value={scopeRunId}
                                onChange={e => setScopeRunId(e.target.value)}
                                className="lfm-input"
                                style={{ width: '220px', padding: '6px 10px', fontSize: '0.75rem' }}
                            >
                                <option value="all">🌍 All Intakes (Global View)</option>
                                {cohortRuns.map(r => <option key={r.id} value={r.id}>🚀 {r.cohortName || r.name || r.id}</option>)}
                            </select>

                            <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', padding: '2px 8px', border: '1px solid #dde4e8', width: '220px' }}>
                                <Search size={14} color="#6b6b6b" />
                                <input
                                    type="text"
                                    placeholder="Search messages..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    style={{ border: 'none', outline: 'none', padding: '4px 6px', fontSize: '0.75rem', width: '100%' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Facilitator Broadcast Chat Input Box */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f0f4f6', padding: '12px', border: '1px solid #dde4e8' }}>
                        <div style={{ width: '36px', height: '36px', background: '#073f4e', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, fontFamily: 'var(--font-heading, "Oswald", sans-serif)', flexShrink: 0 }}>
                            FC
                        </div>
                        <select
                            value={broadcastUnitId}
                            onChange={e => setBroadcastUnitId(e.target.value)}
                            className="lfm-input"
                            style={{ width: '180px', padding: '8px' }}
                        >
                            {units.map((u, idx) => (
                                <option key={u.id} value={u.id}>Lesson #{idx + 1}: {u.title}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="Broadcast a tip or reply to learners in this lesson stream..."
                            value={newBroadcastComment}
                            onChange={(e) => setNewBroadcastComment(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                            className="lfm-input"
                            style={{ flex: 1, padding: '8px 12px' }}
                            disabled={isPostingComment}
                        />
                        <button
                            type="button"
                            onClick={handlePostComment}
                            disabled={isPostingComment || !newBroadcastComment.trim()}
                            className="lfm-btn lfm-btn--primary"
                        >
                            {isPostingComment ? <Loader2 size={14} className="lfm-spin" /> : <Send size={14} />} Broadcast
                        </button>
                    </div>

                    {/* Chat Bubble Stream Container */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        maxHeight: '540px',
                        overflowY: 'auto',
                        padding: '16px',
                        background: '#f8fafc',
                        border: '1px solid #dde4e8'
                    }}>
                        {commentsInScope.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9b9b9b' }}>
                                <MessageSquare size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                <div style={{ fontFamily: 'var(--font-heading, "Oswald", sans-serif)', fontSize: '0.95rem', textTransform: 'uppercase' }}>No Messages In Stream</div>
                                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>There are no messages matching this filter in the selected intake scope.</div>
                            </div>
                        ) : (
                            commentsInScope.map(c => {
                                const isStaff = c.isStaff;

                                return (
                                    <div
                                        key={c.id}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: isStaff ? 'flex-end' : 'flex-start',
                                            width: '100%'
                                        }}
                                    >
                                        {/* Message Metadata Header */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            marginBottom: '4px',
                                            flexDirection: isStaff ? 'row-reverse' : 'row'
                                        }}>
                                            <strong style={{ fontSize: '0.78rem', color: isStaff ? '#15803d' : '#073f4e', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase' }}>
                                                {c.userName}
                                            </strong>

                                            {isStaff && (
                                                <span style={{ fontSize: '0.58rem', background: '#94c73d', color: '#052e3a', padding: '1px 5px', fontWeight: 800, fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase' }}>
                                                    Facilitator
                                                </span>
                                            )}

                                            <span style={{ fontSize: '0.65rem', background: '#e8f0f3', color: '#073f4e', padding: '1px 5px', fontWeight: 700, fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase' }}>
                                                {getUnitTitle(c.unitId)}
                                            </span>

                                            <span style={{ fontSize: '0.68rem', color: '#9b9b9b', fontFamily: 'monospace' }}>
                                                {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                                            </span>

                                            {!isStaff && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleFlagComment(c.id, c.isFlagged)}
                                                        style={{ background: 'none', border: 'none', color: c.isFlagged ? '#073f4e' : '#b45309', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                                    >
                                                        {c.isFlagged ? 'Unflag' : 'Flag'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteComment(c.id)}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Chat Bubble Body */}
                                        <div style={{
                                            display: 'flex',
                                            gap: '8px',
                                            maxWidth: '78%',
                                            flexDirection: isStaff ? 'row-reverse' : 'row'
                                        }}>
                                            {/* Avatar Initials */}
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                background: isStaff ? '#073f4e' : '#e8f0f3',
                                                color: isStaff ? '#94c73d' : '#073f4e',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.72rem',
                                                fontWeight: 800,
                                                fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                                flexShrink: 0,
                                                border: `1px solid ${isStaff ? '#052e3a' : '#dde4e8'}`
                                            }}>
                                                {c.userInitials || 'ST'}
                                            </div>

                                            {/* Speech Bubble */}
                                            <div style={{
                                                padding: '10px 14px',
                                                background: c.isFlagged ? '#fee2e2' : (isStaff ? '#073f4e' : '#ffffff'),
                                                color: c.isFlagged ? '#991b1b' : (isStaff ? '#ffffff' : '#073f4e'),
                                                border: `1px solid ${c.isFlagged ? '#fca5a5' : (isStaff ? '#052e3a' : '#dde4e8')}`,
                                                borderRight: isStaff ? '4px solid #94c73d' : `1px solid ${c.isFlagged ? '#fca5a5' : '#dde4e8'}`,
                                                borderLeft: !isStaff ? `4px solid ${c.isFlagged ? '#ef4444' : '#073f4e'}` : `1px solid #052e3a`,
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                fontSize: '0.85rem',
                                                lineHeight: '1.45',
                                                wordBreak: 'break-word'
                                            }}>
                                                {c.text}
                                                {c.isFlagged && (
                                                    <div style={{ fontSize: '0.7rem', color: '#be123c', marginTop: '6px', fontWeight: 600, borderTop: '1px solid #fca5a5', paddingTop: '4px' }}>
                                                        ⚠️ Flagged: {c.flagReason}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                </div>
            )}

        </div>
    );
};