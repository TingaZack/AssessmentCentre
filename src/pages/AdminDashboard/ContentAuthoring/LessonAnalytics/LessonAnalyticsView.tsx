// src/pages/AdminDashboard/ContentAuthoring/LessonAnalytics/LessonAnalyticsView.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { ArrowLeft, ChevronLeft, ChevronRight, MailCheck, Search, X, AlertTriangle, Clock, MessageSquare, HelpCircle, Award, CheckCircle2 } from 'lucide-react';
import { db } from '../../../../lib/firebase';
import { useToast } from '../../../../components/common/Toast/Toast';
import { useStore } from '../../../../store/useStore';
import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
import type { LearningUnit, CohortRun } from '../../../../types/content.types';
import type { ExtendedLearningUnit } from '../ContentAuthoring';
import type { EnrollmentDoc, LearnerRow, LessonComment, LessonQuestion, ProgressDoc, RiskLevel, Stage } from './types';
import { LearnerTable, type SortKey, type SortState } from './LearnerTable';
import { useChunkedQuery } from './hooks';
import { assessRisk, attemptNeedsReview, buildSteps, checkTypeLabel, inScope, isDone, isManualCheck, mergeProgress, RISK_RANK, toDate } from './utils';
import { DiscussionPanel } from './DiscussionPanel';
import { LearnerDrawer } from './LearnerDrawer';

import './LessonAnalytics.css';
import type { QuizAttemptDoc } from '../../../LearnerPortal/LearnerContentHub/types';

type Unit = LearningUnit | ExtendedLearningUnit;
type StatusFilter = 'all' | RiskLevel | 'awaiting';

export type LearnerRowExtended = LearnerRow & {
    examStatus?: string | null;
    examCompetency?: string | null;
    examSubmissionId?: string | null;
    activeLinkedAssessmentId?: string | null;
    quizAttempted?: boolean;
    quizPassed?: boolean;
    quizAwaiting?: boolean;
    examSubmitted?: boolean;
    examPassed?: boolean;
    examAwaiting?: boolean;
};

interface Props {
    containerId: string;
    cohortRunId?: string;
    unit: Unit;
    allUnits: LearningUnit[] | ExtendedLearningUnit[];
    onSelectUnit: (unit: Unit | null) => void;
    cohorts: { id: string; name: string }[];
    initialCohortId?: string;
    onBack: () => void;
}

const getUnitLinkedAssessmentId = (u?: Unit | null): string | null => {
    if (!u) return null;
    const ext = u as any;
    const candidates = [
        ext.linkedAssessmentId,
        ext.assessmentId,
        ext.formalAssessmentId,
        ext.linkedAssessment,
        ext.assessment,
        ext.examId,
        ext.linkedExamId,
        ext.checkpointMetadata?.linkedAssessmentId,
        ext.checkpointMetadata?.assessmentId
    ];
    for (const candidate of candidates) {
        if (candidate && typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
        if (candidate && typeof candidate === 'object' && candidate !== null && candidate.id) {
            return String(candidate.id).trim();
        }
    }
    return null;
};

/** Dynamically resolves the assessment body title and badge based on the course framework */
const getAssessmentMeta = (u?: Unit | null) => {
    if (!u) return { title: 'Formal Assessment', badge: 'Official' };
    const ext = u as any;
    const framework = String(ext.framework || ext.assessmentFramework || ext.type || '').toLowerCase();

    if (framework.includes('secam') || framework.includes('seta') || framework.includes('qcto')) {
        return { title: 'Formal SETA / QCTO Exam', badge: 'Official' };
    }
    if (framework.includes('codetribe') || framework.includes('bootcamp')) {
        return { title: 'CodeTribe Formal Assessment', badge: 'CodeTribe' };
    }
    return { title: 'Formal Assessment', badge: 'Official' };
};

export const LessonAnalyticsView: React.FC<Props> = ({
    containerId, unit, allUnits, onSelectUnit, cohorts, initialCohortId, onBack
}) => {
    const toast = useToast();
    const { learners = [] } = useStore();

    // ── UI state ────────────────────────────────────────────────────────────
    const [selectedRunId, setSelectedRunId] = useState<string>(
        initialCohortId && initialCohortId !== 'all' ? initialCohortId : 'all'
    );
    const [stage, setStage] = useState<Stage>('all');
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<SortState>({ key: 'risk', dir: 'asc' });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [drawerId, setDrawerId] = useState<string | null>(null);
    const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null);
    const [blockedOverride, setBlockedOverride] = useState<Record<string, boolean>>({});
    const [isNudging, setIsNudging] = useState(false);
    const [availableRuns, setAvailableRuns] = useState<CohortRun[]>([]);
    const [statusModal, setStatusModal] = useState<{
        isOpen: boolean; type: StatusType; title: string; message: string;
        onConfirm?: () => void; confirmText?: string; cancelText?: string;
    }>({ isOpen: false, type: 'info', title: '', message: '' });

    useEffect(() => {
        setSelectedRunId(initialCohortId && initialCohortId !== 'all' ? initialCohortId : 'all');
    }, [initialCohortId]);

    useEffect(() => {
        setStage('all');
        setActiveTaskId(null);
        setSelectedIds(new Set());
        setDrawerId(null);
        setFocusQuestionId(null);
    }, [unit.id]);

    useEffect(() => {
        if (!containerId) return;
        const q = query(collection(db, 'cohort_runs'), where('containerId', '==', containerId));
        const unsub = onSnapshot(q, snap =>
            setAvailableRuns(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CohortRun))
        );
        return () => unsub();
    }, [containerId]);

    // ── Units & scope ───────────────────────────────────────────────────────
    const sortedUnits = useMemo<Unit[]>(
        () => [...allUnits].sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0)),
        [allUnits]
    );
    const unitIds = useMemo(() => sortedUnits.map(u => u.id), [sortedUnits]);
    const unitIdx = sortedUnits.findIndex(u => u.id === unit.id);

    const linkedAssessmentIds = useMemo(() => {
        const ids = new Set<string>();
        sortedUnits.forEach(u => {
            const aid = getUnitLinkedAssessmentId(u);
            if (aid) ids.add(aid);
        });
        return Array.from(ids);
    }, [sortedUnits]);

    const targetKeys = useMemo(() => {
        if (selectedRunId !== 'all') return [selectedRunId];
        return Array.from(new Set([containerId, ...availableRuns.map(r => r.id)]));
    }, [selectedRunId, availableRuns, containerId]);

    // ── Data Subscriptions ──────────────────────────────────────────────────
    const { data: progressDocs, loading: progLoading } = useChunkedQuery<ProgressDoc>('learner_content_progress', 'containerId', targetKeys);
    const { data: enrollments, loading: enrLoading } = useChunkedQuery<EnrollmentDoc>('enrollments', 'containerId', targetKeys);
    const { data: rawAttempts } = useChunkedQuery<QuizAttemptDoc>('learner_quiz_attempts', 'unitId', unitIds);
    const { data: rawSubmissions } = useChunkedQuery<any>('learner_submissions', 'assessmentId', linkedAssessmentIds);
    const { data: rawComments } = useChunkedQuery<LessonComment>('lessonComments', 'unitId', unitIds);
    const { data: rawQuestions } = useChunkedQuery<LessonQuestion>('lessonQuestions', 'unitId', unitIds);

    const attempts = useMemo(
        () => rawAttempts.filter(a => !a.containerId || targetKeys.includes(a.containerId)),
        [rawAttempts, targetKeys]
    );

    const submissions = useMemo(
        () => rawSubmissions.filter(s => !s.containerId || targetKeys.includes(s.containerId) || targetKeys.includes(s.instanceId) || targetKeys.includes(s.courseId)),
        [rawSubmissions, targetKeys]
    );

    const comments = useMemo(() => rawComments.filter(c => inScope(targetKeys, c)), [rawComments, targetKeys]);
    const questions = useMemo(() => rawQuestions.filter(q => inScope(targetKeys, q)), [rawQuestions, targetKeys]);

    const unitComments = useMemo(() => comments.filter(c => c.unitId === unit.id), [comments, unit.id]);
    const unitQuestions = useMemo(() => questions.filter(q => q.unitId === unit.id), [questions, unit.id]);

    const activeLinkedAssessmentId = useMemo(() => getUnitLinkedAssessmentId(unit), [unit]);
    const hasQuiz = Boolean(unit.interactiveCheck && (unit.interactiveCheck.checkType as string) !== 'none');
    const hasExam = Boolean(activeLinkedAssessmentId);
    const examMeta = useMemo(() => getAssessmentMeta(unit), [unit]);

    // ── Join everything into one row per learner ────────────────────────────
    const baseRows = useMemo<LearnerRowExtended[]>(() => {
        const ids = new Set<string>();
        enrollments.forEach(e => e.userId && ids.add(e.userId));
        progressDocs.forEach(p => p.userId && ids.add(p.userId));

        const checkType = hasQuiz ? String(unit.interactiveCheck?.checkType ?? 'spot_the_bug') : (hasExam ? 'formal_assessment' : '');
        const manual = isManualCheck(checkType) || hasExam;
        const durationMins = unit.estimatedMinutes || 15;

        return Array.from(ids).map(uid => {
            const profile = learners.find(l => l.id === uid || l.learnerId === uid || l.authUid === uid);
            const aliases = Array.from(new Set([uid, profile?.id, profile?.learnerId, profile?.authUid].filter(Boolean) as string[]));
            const isMine = (id?: string) => !!id && aliases.includes(id);

            const enrol = enrollments.find(e => isMine(e.userId));
            const userProgDocs = progressDocs.filter(p => isMine(p.userId) && p.unitId === unit.id);
            const best = mergeProgress(userProgDocs);

            // 1. Quiz attempts for this unit
            const quizHistory = attempts
                .filter(a => isMine(a.userId) && a.unitId === unit.id)
                .sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));

            // 2. Exam submissions for this unit
            const examSubmissions = submissions.filter(s =>
                isMine(s.authUid || s.userId) &&
                (s.unitId === unit.id || (activeLinkedAssessmentId && s.assessmentId === activeLinkedAssessmentId))
            );

            // Map exam submissions
            const examAttemptsMapped: QuizAttemptDoc[] = examSubmissions.map(s => {
                const status = String(s.status || '').toLowerCase();
                const comp = String(s.competency || '').toLowerCase();
                const isGraded = ['graded', 'moderated', 'appealed'].includes(status);
                const isPassed = isGraded && ['c', 'hc', '3', '4'].includes(comp);
                const isAwaiting = ['submitted', 'facilitator_reviewed'].includes(status);
                const pctScore = s.totalMarks > 0 ? Math.round(((s.marks || 0) / s.totalMarks) * 100) : (isPassed ? 100 : 0);

                return {
                    id: s.id,
                    userId: s.authUid || s.userId,
                    unitId: unit.id,
                    containerId: s.containerId || s.instanceId || s.courseId,
                    checkType: 'formal_assessment',
                    passed: isPassed,
                    score: pctScore,
                    attemptNumber: s.attemptNumber || 1,
                    attemptedAt: s.submittedAt || s.createdAt,
                    gradedBy: s.grading?.assessorName || s.assessorId,
                    feedback: s.grading?.assessorOverallFeedback || s.feedback,
                    awaitingReview: isAwaiting
                } as any;
            });

            // Extract exact exam meta for the table row
            const latestExamSub = examSubmissions.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
            const examStatus = latestExamSub ? String(latestExamSub.status || 'draft').toLowerCase() : null;
            const examCompetency = latestExamSub ? String(latestExamSub.competency || '').toUpperCase() : null;
            const examSubmissionId = latestExamSub ? latestExamSub.id : null;

            // Individual Task Pass/Awaiting States
            const quizPassed = !hasQuiz || quizHistory.some(a => a.passed === true) || Boolean(best?.passed);
            const examPassed = !hasExam || examAttemptsMapped.some(a => a.passed === true);

            const quizAwaiting = hasQuiz && !quizPassed && quizHistory.length > 0 && attemptNeedsReview(quizHistory[quizHistory.length - 1], checkType);
            const examAwaiting = hasExam && !examPassed && examAttemptsMapped.some(a => (a as any).awaitingReview === true);

            const passed = (quizPassed && examPassed) && (hasQuiz || hasExam ? (quizHistory.length > 0 || examAttemptsMapped.length > 0) : true);
            const awaitingReview = quizAwaiting || examAwaiting;

            // Combined attempt history
            const history = [...quizHistory, ...examAttemptsMapped].sort((a, b) => {
                const timeA = toDate(a.attemptedAt)?.getTime() || 0;
                const timeB = toDate(b.attemptedAt)?.getTime() || 0;
                return timeA - timeB;
            });

            const latest = history[history.length - 1];
            const watchPct = best?.watchPct || 0;
            const completed = isDone(best);
            const started = watchPct > 0 || completed || history.length > 0;
            const attemptCount = Math.max(best?.attempts || 0, history.length);

            const score = best?.score !== undefined ? best.score : (latest?.score ?? (passed ? 100 : 0));

            const mineComments = comments.filter(c => c.unitId === unit.id && isMine(c.userId));
            const mineQuestions = questions.filter(q => q.unitId === unit.id && isMine(q.userId));

            const { level, reason } = assessRisk({ started, watchPct, attempts: attemptCount, score, passed, awaitingReview });
            const lastTimes = [toDate(best?.updatedAt), toDate(latest?.attemptedAt)].filter(Boolean) as Date[];

            return {
                learnerId: uid,
                aliases,
                name: profile?.fullName || best?.userName || enrol?.userName || `Learner ${uid.substring(0, 6)}`,
                email: profile?.email || best?.userEmail || enrol?.userEmail || '',
                cohortName:
                    cohorts.find(c => c.id === (best?.cohortId || profile?.cohortId))?.name ||
                    best?.cohortName || enrol?.cohortName || 'Active cohort',
                isBlockedFromForum: Boolean(profile?.isBlockedFromForum),
                watchPct,
                watchedMins: best?.watchedMins || 0,
                durationMins,
                started,
                completed,
                hasCheck: hasQuiz || hasExam,
                checkType,
                attempts: attemptCount,
                score,
                passed,
                awaitingReview,
                quizAttempted: quizHistory.length > 0,
                quizPassed,
                quizAwaiting,
                examSubmitted: examSubmissions.length > 0,
                examPassed,
                examAwaiting,
                examStatus,
                examCompetency,
                examSubmissionId,
                activeLinkedAssessmentId,
                attemptHistory: history,
                commentCount: mineComments.length,
                questionCount: mineQuestions.length,
                unansweredQuestions: mineQuestions.filter(q => !(q.answersCount && q.answersCount > 0)).length,
                steps: buildSteps({ hasCheck: hasQuiz || hasExam, manual, completed, watchPct, attempts: attemptCount, passed, awaitingReview }),
                risk: level,
                riskReason: reason,
                lastActivity: lastTimes.length ? new Date(Math.max(...lastTimes.map(d => d.getTime()))) : null
            };
        });
    }, [enrollments, progressDocs, attempts, submissions, comments, questions, learners, cohorts, unit, activeLinkedAssessmentId, hasQuiz, hasExam, targetKeys]);

    const rows = useMemo(
        () => baseRows.map(r => (r.learnerId in blockedOverride ? { ...r, isBlockedFromForum: blockedOverride[r.learnerId] } : r)),
        [baseRows, blockedOverride]
    );

    // ── Task Metrics Breakdown ─────────────────────────────────────────────
    const metrics = useMemo(() => {
        const started = rows.filter(r => r.started).length;
        const finished = rows.filter(r => r.completed).length;
        const stopped = rows.filter(r => r.started && !r.completed).length;
        const avgWatch = rows.length ? Math.round(rows.reduce((s, r) => s + r.watchPct, 0) / rows.length) : 0;

        // Quiz Metrics
        const quizAttempted = rows.filter(r => r.quizAttempted).length;
        const quizPassed = rows.filter(r => r.quizPassed).length;
        const quizAwaiting = rows.filter(r => r.quizAwaiting).length;
        const quizFailing = rows.filter(r => r.quizAttempted && !r.quizPassed && !r.quizAwaiting).length;

        // Exam Metrics
        const examSubmitted = rows.filter(r => r.examSubmitted).length;
        const examCompetent = rows.filter(r => r.examPassed).length;
        const examAwaiting = rows.filter(r => r.examAwaiting).length;
        const examNYC = rows.filter(r => r.examSubmitted && !r.examPassed && !r.examAwaiting).length;

        const unanswered = unitQuestions.filter(q => !(q.answersCount && q.answersCount > 0)).length;

        return {
            started, finished, stopped, avgWatch, unanswered,
            quiz: { attempted: quizAttempted, passed: quizPassed, awaiting: quizAwaiting, failing: quizFailing },
            exam: { submitted: examSubmitted, competent: examCompetent, awaiting: examAwaiting, nyc: examNYC }
        };
    }, [rows, unitQuestions]);

    const counts = useMemo(() => ({
        high: rows.filter(r => r.risk === 'high_risk').length,
        moderate: rows.filter(r => r.risk === 'moderate_risk').length,
        onTrack: rows.filter(r => r.risk === 'on_track').length
    }), [rows]);

    // ── Filter + sort ───────────────────────────────────────────────────────
    const visibleRows = useMemo(() => {
        const term = search.trim().toLowerCase();
        const list = rows.filter(r => {
            if (stage === 'watch' && !r.started) return false;
            if (stage === 'quiz' && activeTaskId === 'quiz' && !r.quizAttempted) return false;
            if (stage === 'quiz' && activeTaskId === 'exam' && !r.examSubmitted) return false;
            if (statusFilter === 'awaiting' && !r.awaitingReview) return false;
            if (statusFilter !== 'all' && statusFilter !== 'awaiting' && r.risk !== statusFilter) return false;
            if (term && !r.name.toLowerCase().includes(term) && !r.email.toLowerCase().includes(term)) return false;
            return true;
        });

        const dir = sort.dir === 'asc' ? 1 : -1;
        list.sort((a, b) => {
            let d = 0;
            switch (sort.key) {
                case 'name': d = a.name.localeCompare(b.name); break;
                case 'watch': d = a.watchPct - b.watchPct; break;
                case 'score': d = (a.attempts ? a.score : -1) - (b.attempts ? b.score : -1); break;
                case 'activity': d = (a.lastActivity?.getTime() || 0) - (b.lastActivity?.getTime() || 0); break;
                default:
                    d = RISK_RANK[a.risk as RiskLevel] - RISK_RANK[b.risk as RiskLevel]
                        || Number(b.awaitingReview) - Number(a.awaitingReview)
                        || a.name.localeCompare(b.name);
            }
            return d * dir;
        });
        return list;
    }, [rows, stage, activeTaskId, statusFilter, search, sort]);

    const drawerRow = drawerId ? rows.find(r => r.learnerId === drawerId) ?? null : null;

    // ── Actions ─────────────────────────────────────────────────────────────
    const toggleStage = (s: Stage, taskId?: string) => {
        if (stage === s && activeTaskId === (taskId || null)) {
            setStage('all');
            setActiveTaskId(null);
        } else {
            setStage(s);
            setActiveTaskId(taskId || null);
        }
    };

    const onSort = (key: SortKey) =>
        setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

    const toggleSelect = (id: string) =>
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });

    const toggleAll = (checked: boolean) =>
        setSelectedIds(prev => {
            const next = new Set(prev);
            visibleRows.forEach(r => (checked ? next.add(r.learnerId) : next.delete(r.learnerId)));
            return next;
        });

    const toggleBlock = useCallback(async (learnerId: string, currentlyBlocked: boolean) => {
        setBlockedOverride(prev => ({ ...prev, [learnerId]: !currentlyBlocked }));
        try {
            await updateDoc(doc(db, 'learners', learnerId), { isBlockedFromForum: !currentlyBlocked });
            toast.success(currentlyBlocked ? 'Forum access restored.' : 'Learner blocked from the forum.');
        } catch {
            setBlockedOverride(prev => ({ ...prev, [learnerId]: currentlyBlocked }));
            toast.error('Could not update forum access.');
        }
    }, [toast]);

    const nudgeTargets = useMemo(
        () => (selectedIds.size > 0 ? rows.filter(r => selectedIds.has(r.learnerId)) : rows.filter(r => r.risk === 'high_risk')),
        [rows, selectedIds]
    );

    const handleNudge = () => {
        if (nudgeTargets.length === 0) {
            toast.info('No learners to nudge.');
            return;
        }
        setStatusModal({
            isOpen: true,
            type: 'warning',
            title: `Nudge ${nudgeTargets.length} ${nudgeTargets.length === 1 ? 'learner' : 'learners'}`,
            message: `Send an email and portal notification to ${nudgeTargets.map(l => l.name).join(', ')}?`,
            confirmText: 'Send nudges',
            cancelText: 'Cancel',
            onConfirm: () => {
                setStatusModal(prev => ({ ...prev, isOpen: false }));
                setIsNudging(true);
                setTimeout(() => {
                    setIsNudging(false);
                    setSelectedIds(new Set());
                    toast.success('Nudges sent.');
                }, 1200);
            }
        });
    };

    const handleOpenThread = (q: LessonQuestion) => {
        setDrawerId(null);
        setStage('discussion');
        setFocusQuestionId(q.id);
    };

    const intakeLabel =
        selectedRunId === 'all'
            ? 'all intakes'
            : (availableRuns.find(r => r.id === selectedRunId)?.cohortName || availableRuns.find(r => r.id === selectedRunId)?.name || 'this intake');

    const checkLabel = useMemo(() => {
        const parts: string[] = [];
        if (hasQuiz) parts.push(checkTypeLabel(String(unit.interactiveCheck?.checkType)));
        if (hasExam) parts.push(examMeta.title);
        return parts.length > 0 ? parts.join(' + ') : 'no quiz';
    }, [unit, hasQuiz, hasExam, examMeta]);

    const stageNote =
        stage === 'watch' ? 'Showing learners who have started or completed watching this lesson.'
            : stage === 'quiz' && activeTaskId === 'exam' ? 'Showing learners with formal assessment submissions.'
                : stage === 'quiz' ? 'Showing learners who have attempted the quiz.'
                    : '';

    const isWatchActive = stage === 'watch';
    const isQuizActive = stage === 'quiz' && activeTaskId === 'quiz';
    const isExamActive = stage === 'quiz' && activeTaskId === 'exam';
    const isDiscActive = stage === 'discussion';

    return (
        <div className="la-view">
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

            {/* HEADER: breadcrumb + lesson stepper + primary action */}
            <header className="la-header">
                <nav className="la-crumbs" aria-label="Breadcrumb">
                    <button type="button" className="la-link" onClick={onBack}><ArrowLeft size={14} /> Package overview</button>
                    <ChevronRight size={14} className="la-crumbs__sep" />
                    <select className="la-select" aria-label="Delivery intake" value={selectedRunId} onChange={e => setSelectedRunId(e.target.value)}>
                        <option value="all">All intakes</option>
                        {availableRuns.map(run => (
                            <option key={run.id} value={run.id}>{run.cohortName || run.name || run.id}</option>
                        ))}
                    </select>
                    <ChevronRight size={14} className="la-crumbs__sep" />
                    <button type="button" className="la-icon-btn" disabled={unitIdx <= 0} onClick={() => onSelectUnit(sortedUnits[unitIdx - 1])} aria-label="Previous lesson">
                        <ChevronLeft size={16} />
                    </button>
                    <select className="la-select la-select--lesson" aria-label="Lesson" value={unit.id} onChange={e => onSelectUnit(sortedUnits.find(u => u.id === e.target.value) ?? null)}>
                        {sortedUnits.map((u, i) => (
                            <option key={u.id} value={u.id}>{i + 1}. {u.title || 'Untitled lesson'}</option>
                        ))}
                    </select>
                    <button type="button" className="la-icon-btn" disabled={unitIdx < 0 || unitIdx >= sortedUnits.length - 1} onClick={() => onSelectUnit(sortedUnits[unitIdx + 1])} aria-label="Next lesson">
                        <ChevronRight size={16} />
                    </button>
                </nav>

                <button type="button" className="la-btn la-btn--primary" onClick={handleNudge} disabled={isNudging || nudgeTargets.length === 0}>
                    <MailCheck size={14} />
                    {isNudging ? 'Sending…' : selectedIds.size > 0 ? `Nudge ${nudgeTargets.length} selected` : `Nudge ${nudgeTargets.length} at risk`}
                </button>
            </header>

            <div className="la-titleblock">
                <h1 className="la-title">{unit.title || 'Untitled lesson'}</h1>
                <p className="la-meta">
                    {rows.length} {rows.length === 1 ? 'learner' : 'learners'} in {intakeLabel}. {unit.estimatedMinutes || 15} minute lesson. Check: {checkLabel}.
                </p>
            </div>

            {/* FLOW STRIP: Accommodates both Quiz & Formal Exam Tasks dynamically */}
            <section aria-label="Lesson flow" style={{ display: 'flex', gap: '16px', alignItems: 'stretch', marginBottom: '24px', overflowX: 'auto' }}>

                {/* 1. WATCH STAGE */}
                <button
                    type="button"
                    onClick={() => toggleStage('watch')}
                    aria-pressed={isWatchActive}
                    style={{
                        flex: 1,
                        minWidth: '220px',
                        display: 'flex',
                        flexDirection: 'column',
                        textAlign: 'left',
                        background: 'var(--mlab-white, #ffffff)',
                        border: isWatchActive ? '2px solid var(--mlab-green, #94c73d)' : '2px solid var(--mlab-blue, #073f4e)',
                        padding: 0,
                        cursor: 'pointer',
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
                    <div style={{
                        width: '100%',
                        background: isWatchActive ? 'var(--mlab-green, #94c73d)' : 'var(--mlab-blue, #073f4e)',
                        borderBottom: isWatchActive ? '3px solid #7aaa2e' : '3px solid var(--mlab-green, #94c73d)',
                        padding: '10px 14px',
                        minHeight: '42px',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <span style={{
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: isWatchActive ? 'var(--mlab-blue, #073f4e)' : 'var(--mlab-white, #ffffff)',
                            fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            1. Watch Phase
                        </span>
                    </div>

                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', lineHeight: 1 }}>{metrics.finished}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey, #6b6b6b)', fontWeight: 600, textTransform: 'uppercase' }}>of {rows.length} finished</span>
                        </div>
                        <div style={{ width: '100%', marginTop: '4px' }}>
                            <div style={{ height: '6px', background: 'var(--mlab-border, #dde4e8)', width: '100%', overflow: 'hidden' }}>
                                <div style={{ width: `${metrics.avgWatch}%`, height: '100%', background: isWatchActive ? 'var(--mlab-green, #94c73d)' : 'var(--mlab-blue, #073f4e)' }} />
                            </div>
                        </div>
                    </div>

                    <div style={{
                        width: '100%',
                        background: isWatchActive ? '#f0fdf4' : 'var(--mlab-bg, #f0f4f6)',
                        borderTop: isWatchActive ? '2px solid #bbf7d0' : '2px solid var(--mlab-border, #dde4e8)',
                        padding: '12px 16px',
                        marginTop: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey, #6b6b6b)', fontWeight: 600 }}>
                            {metrics.started} started, {metrics.avgWatch}% watched
                        </div>
                        {metrics.stopped > 0 && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--mlab-red, #ef4444)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <AlertTriangle size={12} /> {metrics.stopped} stopped partway
                            </div>
                        )}
                    </div>
                </button>

                {/* TASK 2A: INTERACTIVE QUIZ CARD (IF PRESENT) */}
                {hasQuiz && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ChevronRight size={20} style={{ color: 'var(--mlab-grey-lt, #9b9b9b)' }} aria-hidden />
                        </div>

                        <button
                            type="button"
                            onClick={() => toggleStage('quiz', 'quiz')}
                            aria-pressed={isQuizActive}
                            style={{
                                flex: 1,
                                minWidth: '220px',
                                display: 'flex',
                                flexDirection: 'column',
                                textAlign: 'left',
                                background: 'var(--mlab-white, #ffffff)',
                                border: isQuizActive ? '2px solid var(--mlab-green, #94c73d)' : '2px solid var(--mlab-blue, #073f4e)',
                                padding: 0,
                                cursor: 'pointer',
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
                            <div style={{
                                width: '100%',
                                background: isQuizActive ? 'var(--mlab-green, #94c73d)' : 'var(--mlab-blue, #073f4e)',
                                borderBottom: isQuizActive ? '3px solid #7aaa2e' : '3px solid var(--mlab-green, #94c73d)',
                                padding: '10px 14px',
                                minHeight: '42px',
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                <span style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    color: isQuizActive ? 'var(--mlab-blue, #073f4e)' : 'var(--mlab-white, #ffffff)',
                                    fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}>
                                    2a. Quiz Gate
                                </span>
                            </div>

                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                    <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', lineHeight: 1 }}>{metrics.quiz.passed}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey, #6b6b6b)', fontWeight: 600, textTransform: 'uppercase' }}>of {metrics.quiz.attempted} passed</span>
                                </div>
                                <div style={{ width: '100%', marginTop: '4px' }}>
                                    <div style={{ height: '6px', background: 'var(--mlab-border, #dde4e8)', width: '100%', overflow: 'hidden' }}>
                                        <div style={{ width: `${metrics.quiz.attempted ? Math.round((metrics.quiz.passed / metrics.quiz.attempted) * 100) : 0}%`, height: '100%', background: isQuizActive ? 'var(--mlab-green, #94c73d)' : 'var(--mlab-blue, #073f4e)' }} />
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                width: '100%',
                                background: isQuizActive ? '#f0fdf4' : 'var(--mlab-bg, #f0f4f6)',
                                borderTop: isQuizActive ? '2px solid #bbf7d0' : '2px solid var(--mlab-border, #dde4e8)',
                                padding: '12px 16px',
                                marginTop: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey, #6b6b6b)', fontWeight: 600 }}>
                                    {checkTypeLabel(String(unit.interactiveCheck?.checkType))}
                                </div>
                                {metrics.quiz.awaiting > 0 && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--mlab-orange, #f59e0b)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={12} /> {metrics.quiz.awaiting} awaiting grading
                                    </div>
                                )}
                                {metrics.quiz.failing > 0 && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--mlab-red, #ef4444)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <AlertTriangle size={12} /> {metrics.quiz.failing} not passing
                                    </div>
                                )}
                            </div>
                        </button>
                    </>
                )}

                {/* TASK 2B: FORMAL ACCREDITED / INTERNAL ASSESSMENT CARD (DYNAMICALLY LABELED) */}
                {hasExam && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ChevronRight size={20} style={{ color: '#c084fc' }} aria-hidden />
                        </div>

                        <button
                            type="button"
                            onClick={() => toggleStage('quiz', 'exam')}
                            aria-pressed={isExamActive}
                            style={{
                                flex: 1,
                                minWidth: '240px',
                                display: 'flex',
                                flexDirection: 'column',
                                textAlign: 'left',
                                background: '#ffffff',
                                border: isExamActive ? '2px solid #9333ea' : '2px solid #7c3aed',
                                padding: 0,
                                cursor: 'pointer',
                                outline: 'none',
                                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                borderRadius: '0px',
                                boxShadow: '0 4px 12px rgba(124, 58, 237, 0.08)'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 8px 16px rgba(124, 58, 237, 0.16)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.08)';
                            }}
                        >
                            <div style={{
                                width: '100%',
                                background: '#7c3aed',
                                borderBottom: '3px solid #6d28d9',
                                padding: '10px 14px',
                                minHeight: '42px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <span style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    color: '#ffffff',
                                    fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
                                    <Award size={15} color="#e9d5ff" /> 2b. {examMeta.title}
                                </span>
                                <span style={{ background: '#f3e8ff', color: '#6b21a8', fontSize: '0.6rem', padding: '1px 6px', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                    {examMeta.badge}
                                </span>
                            </div>

                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                    <span style={{ fontSize: '2rem', fontWeight: 800, color: '#6b21a8', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', lineHeight: 1 }}>{metrics.exam.competent}</span>
                                    <span style={{ fontSize: '0.75rem', color: '#6b21a8', fontWeight: 800, textTransform: 'uppercase' }}>Competent (C)</span>
                                </div>
                                <div style={{ width: '100%', marginTop: '4px' }}>
                                    <div style={{ height: '6px', background: '#f3e8ff', width: '100%', overflow: 'hidden' }}>
                                        <div style={{ width: `${metrics.exam.submitted ? Math.round((metrics.exam.competent / metrics.exam.submitted) * 100) : 0}%`, height: '100%', background: '#7c3aed' }} />
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                width: '100%',
                                background: isExamActive ? '#f3e8ff' : '#faf5ff',
                                borderTop: '2px solid #e9d5ff',
                                padding: '12px 16px',
                                marginTop: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}>
                                <div style={{ fontSize: '0.75rem', color: '#581c87', fontWeight: 700 }}>
                                    {metrics.exam.submitted} official submissions recorded
                                </div>
                                {metrics.exam.awaiting > 0 && (
                                    <div style={{ fontSize: '0.7rem', color: '#c026d3', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={12} /> {metrics.exam.awaiting} awaiting assessor marking
                                    </div>
                                )}
                                {metrics.exam.nyc > 0 && (
                                    <div style={{ fontSize: '0.7rem', color: '#991b1b', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <AlertTriangle size={12} /> {metrics.exam.nyc} Not Yet Competent (NYC)
                                    </div>
                                )}
                            </div>
                        </button>
                    </>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronRight size={20} style={{ color: 'var(--mlab-grey-lt, #9b9b9b)' }} aria-hidden />
                </div>

                {/* 3. DISCUSSION & Q&A STAGE */}
                <button
                    type="button"
                    onClick={() => toggleStage('discussion')}
                    aria-pressed={isDiscActive}
                    style={{
                        flex: 1,
                        minWidth: '240px',
                        display: 'flex',
                        flexDirection: 'column',
                        textAlign: 'left',
                        background: 'var(--mlab-white, #ffffff)',
                        border: isDiscActive ? '2px solid var(--mlab-green, #94c73d)' : '2px solid var(--mlab-blue, #073f4e)',
                        padding: 0,
                        cursor: 'pointer',
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
                    <div style={{
                        width: '100%',
                        background: isDiscActive ? 'var(--mlab-green, #94c73d)' : 'var(--mlab-blue, #073f4e)',
                        borderBottom: isDiscActive ? '3px solid #7aaa2e' : '3px solid var(--mlab-green, #94c73d)',
                        padding: '10px 14px',
                        minHeight: '42px',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <span style={{
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: isDiscActive ? 'var(--mlab-blue, #073f4e)' : 'var(--mlab-white, #ffffff)',
                            fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            3. Discussion &amp; Q&amp;A
                        </span>
                    </div>

                    <div style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'center', flex: 1, width: '100%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', lineHeight: 1 }}>
                                {unitComments.length}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--mlab-grey, #6b6b6b)', fontWeight: 700, textTransform: 'uppercase', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <MessageSquare size={12} /> Comments
                            </div>
                        </div>

                        <div style={{ width: '1px', height: '36px', background: 'var(--mlab-border, #dde4e8)' }} />

                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', lineHeight: 1 }}>
                                {unitQuestions.length}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--mlab-grey, #6b6b6b)', fontWeight: 700, textTransform: 'uppercase', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <HelpCircle size={12} /> Q&amp;A Threads
                            </div>
                        </div>
                    </div>

                    <div style={{
                        width: '100%',
                        background: isDiscActive ? '#f0fdf4' : 'var(--mlab-bg, #f0f4f6)',
                        borderTop: isDiscActive ? '2px solid #bbf7d0' : '2px solid var(--mlab-border, #dde4e8)',
                        padding: '12px 16px',
                        marginTop: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey, #6b6b6b)', fontWeight: 600 }}>
                            {unitComments.length + unitQuestions.length} total discussion items
                        </div>
                        {metrics.unanswered > 0 ? (
                            <div style={{ fontSize: '0.7rem', color: 'var(--mlab-orange, #f59e0b)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <HelpCircle size={12} /> {metrics.unanswered} unanswered question{metrics.unanswered === 1 ? '' : 's'}
                            </div>
                        ) : (
                            <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle2 size={12} /> All Q&amp;A answered
                            </div>
                        )}
                    </div>
                </button>
            </section>

            {/* MAIN PANEL */}
            {stage === 'discussion' ? (
                <DiscussionPanel
                    unitId={unit.id}
                    postContainerId={selectedRunId !== 'all' ? selectedRunId : containerId}
                    courseId={containerId}
                    comments={unitComments}
                    questions={unitQuestions}
                    focusQuestionId={focusQuestionId}
                    onFocusHandled={() => setFocusQuestionId(null)}
                />
            ) : (
                <section className="la-panel">
                    <div className="la-toolbar">
                        <label className="la-search">
                            <Search size={14} />
                            <input type="text" placeholder="Search by name or email" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search learners" />
                        </label>
                        <select className="la-select" aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
                            <option value="all">Everyone ({rows.length})</option>
                            <option value="high_risk">High risk ({counts.high})</option>
                            <option value="moderate_risk">Needs attention ({counts.moderate})</option>
                            <option value="on_track">On track ({counts.onTrack})</option>
                            <option value="awaiting">Awaiting your grade ({rows.filter(r => r.awaitingReview).length})</option>
                        </select>
                        <span className="la-toolbar__hint">Select a learner to see their full history</span>
                    </div>

                    {stageNote && (
                        <div className="la-note">
                            {stageNote}
                            <button type="button" className="la-link" onClick={() => { setStage('all'); setActiveTaskId(null); }}><X size={12} /> Clear</button>
                        </div>
                    )}

                    <LearnerTable
                        rows={visibleRows as any}
                        loading={progLoading || enrLoading}
                        showCohort={selectedRunId === 'all'}
                        selectedIds={selectedIds}
                        activeId={drawerId}
                        sort={sort}
                        onSort={onSort}
                        onToggleSelect={toggleSelect}
                        onToggleAll={toggleAll}
                        onOpen={setDrawerId}
                    />
                </section>
            )}

            {drawerRow && (
                <LearnerDrawer
                    key={drawerRow.learnerId}
                    learner={drawerRow as any}
                    units={sortedUnits}
                    currentUnitId={unit.id}
                    progressDocs={progressDocs}
                    attempts={attempts}
                    comments={comments}
                    questions={questions}
                    onClose={() => setDrawerId(null)}
                    onToggleBlock={toggleBlock}
                    onOpenThread={handleOpenThread}
                />
            )}
        </div>
    );
};