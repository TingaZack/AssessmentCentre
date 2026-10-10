// src/pages/AdminDashboard/ContentAuthoring/LessonAnalytics/LearnerDrawer.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDocs, query, collection, serverTimestamp, updateDoc, where, writeBatch, onSnapshot } from 'firebase/firestore';
import {
    Ban, CheckCircle2, Circle, Clock, Loader2,
    Save, Tv, UserCheck, X, XCircle, Edit3, Mic, Code, Lock, Award, Eye, ShieldCheck, ExternalLink
} from 'lucide-react';
import { db, auth } from '../../../../lib/firebase';
import { useToast } from '../../../../components/common/Toast/Toast';
import type { LearningUnit } from '../../../../types/content.types';
import type { ExtendedLearningUnit } from '../ContentAuthoring';
import { RISK_LABEL, attemptNeedsReview, checkTypeLabel, fmtDateTime, isDone, mergeProgress, toDate } from './utils';
import type { LearnerRow, ProgressDoc } from './types';

import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';
import type { QuizAttemptDoc } from '../../../LearnerPortal/LearnerContentHub/types';

type Unit = LearningUnit | ExtendedLearningUnit;

interface Props {
    learner: LearnerRow;
    units: Unit[];
    currentUnitId: string;
    progressDocs: ProgressDoc[];
    attempts: QuizAttemptDoc[];
    onClose: () => void;
    onToggleBlock: (learnerId: string, currentlyBlocked: boolean) => void;
}

type EventItem =
    | { kind: 'watch'; at: number; text: string }
    | { kind: 'attempt'; at: number; attempt: QuizAttemptDoc; chronologicalIndex: number }
    | { kind: 'submission'; at: number; submission: any; chronologicalIndex: number };

/** Dynamically resolves all linked assessment IDs for a unit (supports single IDs & arrays) */
const getUnitLinkedAssessmentIds = (u?: Unit | null): string[] => {
    if (!u) return [];
    const ext = u as any;
    const set = new Set<string>();

    const checkAndAdd = (item: any) => {
        if (!item) return;
        if (typeof item === 'string' && item.trim().length > 0) {
            set.add(item.trim());
        } else if (Array.isArray(item)) {
            item.forEach(checkAndAdd);
        } else if (typeof item === 'object' && item.id) {
            set.add(String(item.id).trim());
        }
    };

    [
        ext.linkedAssessmentId,
        ext.assessmentId,
        ext.formalAssessmentId,
        ext.linkedAssessment,
        ext.assessment,
        ext.examId,
        ext.linkedExamId,
        ext.linkedAssessmentIds,
        ext.assessmentIds,
        ext.checkpointMetadata?.linkedAssessmentId,
        ext.checkpointMetadata?.assessmentId,
        ext.checkpointMetadata?.linkedAssessmentIds,
        ext.checkpointMetadata?.assessmentIds
    ].forEach(checkAndAdd);

    return Array.from(set);
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

export const LearnerDrawer: React.FC<Props> = ({
    learner,
    units,
    currentUnitId,
    progressDocs,
    attempts,
    onClose,
    onToggleBlock
}) => {
    const toast = useToast();

    // Master-Detail selection state
    const [selectedUnitId, setSelectedUnitId] = useState<string>(currentUnitId);

    const [localAttempts, setLocalAttempts] = useState<QuizAttemptDoc[]>(attempts);
    const [localSubmissions, setLocalSubmissions] = useState<any[]>([]);

    // Inline Grading State
    const [editingAttemptId, setEditingAttemptId] = useState<string | null>(null);
    const [score, setScore] = useState<string>('0');
    const [passed, setPassed] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [saving, setSaving] = useState(false);

    // Lock background page scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (editingAttemptId) setEditingAttemptId(null);
                else onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editingAttemptId, onClose]);

    // Live Snapshot Listener for both Quiz Attempts & Formal Assessment Submissions
    useEffect(() => {
        const targetUids = Array.from(
            new Set([
                learner.learnerId,
                ...(learner.aliases || []),
                (learner as any).uid,
                (learner as any).userId
            ].filter(Boolean) as string[])
        ).slice(0, 10);

        if (targetUids.length === 0) return;

        try {
            // 1. Listen for Interactive Quiz Attempts
            const qQuiz = query(collection(db, 'learner_quiz_attempts'), where('userId', 'in', targetUids));
            const unsubQuiz = onSnapshot(qQuiz, (snap) => {
                const fetched = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as QuizAttemptDoc));
                setLocalAttempts(prev => {
                    const map = new Map<string, QuizAttemptDoc>();
                    prev.forEach(a => map.set(a.id, a));
                    attempts.forEach(a => map.set(a.id, a));
                    fetched.forEach(a => map.set(a.id, a));
                    return Array.from(map.values());
                });
            });

            // 2. Listen for Formal Exam Submissions
            const qSub = query(collection(db, 'learner_submissions'), where('authUid', 'in', targetUids));
            const unsubSub = onSnapshot(qSub, (snap) => {
                const fetched = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
                setLocalSubmissions(fetched);
            }, (err) => {
                // Fallback query if authUid field isn't indexed
                console.warn('[LearnerDrawer] Submissions authUid query warning, attempting userId:', err);
                const qSubUserId = query(collection(db, 'learner_submissions'), where('userId', 'in', targetUids));
                onSnapshot(qSubUserId, (snap2) => {
                    const fetched = snap2.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
                    setLocalSubmissions(fetched);
                });
            });

            return () => {
                unsubQuiz();
                unsubSub();
            };
        } catch (err) {
            console.warn('[LearnerDrawer] Listener setup failed:', err);
        }
    }, [learner.learnerId, JSON.stringify(learner.aliases), attempts]);

    const activeAttempts = useMemo(() => localAttempts.length > 0 ? localAttempts : attempts, [localAttempts, attempts]);
    const activeSubmissions = useMemo(() => localSubmissions, [localSubmissions]);

    const mine = (uid?: string) => {
        if (!uid) return false;
        const aliases = [learner.learnerId, ...(learner.aliases || []), (learner as any).uid, (learner as any).userId].filter(Boolean);
        return aliases.includes(uid);
    };

    const getRecordingUrl = (a: QuizAttemptDoc | any) => a?.audioUrl || a?.recordingUrl || a?.audio_url || a?.recording_url || a?.fileUrl || a?.url || a?.audio || '';
    const getTranscriptText = (a: QuizAttemptDoc | any) => a?.transcript || a?.submittedCodeOrAnswer || a?.submittedAnswer || a?.answer || '';

    const timeline = useMemo(() => {
        return units.map(u => {
            const prog = mergeProgress(progressDocs.filter(p => mine(p.userId) && p.unitId === u.id));

            const linkedAssessmentIds = getUnitLinkedAssessmentIds(u);
            const hasQuiz = Boolean(u.interactiveCheck && (u.interactiveCheck.checkType as string) !== 'none');
            const hasExam = linkedAssessmentIds.length > 0;
            const hasCheck = hasQuiz || hasExam;
            const checkType = hasQuiz ? String(u.interactiveCheck?.checkType ?? '') : (hasExam ? 'formal_assessment' : '');

            // Interactive Quiz Attempts for this unit
            const unitAttempts = activeAttempts
                .filter(a => mine(a.userId) && a.unitId === u.id)
                .sort((a, b) => {
                    const timeA = toDate(a.attemptedAt)?.getTime() ?? 0;
                    const timeB = toDate(b.attemptedAt)?.getTime() ?? 0;
                    if (timeA !== timeB) return timeA - timeB;
                    return (a.attemptNumber || 0) - (b.attemptNumber || 0);
                });

            // Formal Assessment Submissions for this unit
            const unitSubmissions = activeSubmissions
                .filter(s => mine(s.authUid || s.userId || s.learnerId) && (s.unitId === u.id || (s.assessmentId && linkedAssessmentIds.includes(s.assessmentId))))
                .sort((a, b) => {
                    const timeA = toDate(a.submittedAt || a.createdAt)?.getTime() ?? 0;
                    const timeB = toDate(b.submittedAt || b.createdAt)?.getTime() ?? 0;
                    return timeA - timeB;
                });

            const watchPct = prog?.watchPct || 0;
            const watchedMins = prog?.watchedMins || 0;

            const quizPassed = !hasQuiz || unitAttempts.some(a => a.passed === true) || Boolean(prog?.passed);
            const examPassed = !hasExam || unitSubmissions.some(s => {
                const status = String(s.status || '').toLowerCase();
                const comp = String(s.competency || '').toLowerCase();
                return ['graded', 'moderated', 'appealed'].includes(status) && ['c', 'hc', '3', '4'].includes(comp);
            });

            const passedUnit = quizPassed && examPassed;
            const finished = isDone(prog) && (!hasCheck || passedUnit);
            const started = watchPct > 0 || unitAttempts.length > 0 || unitSubmissions.length > 0;

            const events: EventItem[] = [];
            const progAt = toDate(prog?.updatedAt)?.getTime() ?? 0;
            if (prog && watchPct > 0) {
                events.push({ kind: 'watch', at: progAt, text: `Watched ${watchPct}% (${watchedMins} of ${u.estimatedMinutes || 15} min)` });
            }

            unitAttempts.forEach((a, attIdx) => {
                events.push({
                    kind: 'attempt',
                    at: toDate(a.attemptedAt)?.getTime() ?? 0,
                    attempt: a,
                    chronologicalIndex: attIdx + 1
                });
            });

            unitSubmissions.forEach((s, subIdx) => {
                events.push({
                    kind: 'submission',
                    at: toDate(s.submittedAt || s.createdAt)?.getTime() ?? 0,
                    submission: s,
                    chronologicalIndex: subIdx + 1
                });
            });

            events.sort((a, b) => a.at - b.at);

            let summary = 'Not started';
            if (finished) {
                summary = hasCheck ? `Watched ${watchPct}%, passed` : `Watched ${watchPct}%`;
            } else if (started) {
                const parts: string[] = [];
                if (watchPct > 0) parts.push(`Watched ${watchPct}%`);
                if (hasQuiz && unitAttempts.length > 0) parts.push(`Quiz: ${quizPassed ? 'Passed' : `${unitAttempts.length} att`}`);
                if (hasExam && unitSubmissions.length > 0) parts.push(`Exam: ${examPassed ? 'Competent' : `${unitSubmissions.length} sub`}`);
                summary = parts.join(' • ') || `Watched ${watchPct}%`;
            }

            const quizNeedsGrade = unitAttempts.some(a => attemptNeedsReview(a, checkType) && !a.gradedBy);
            const examNeedsGrade = unitSubmissions.some(s => ['submitted', 'facilitator_reviewed'].includes(String(s.status || '').toLowerCase()));
            const requiresGrading = quizNeedsGrade || examNeedsGrade;

            return {
                unit: u,
                events,
                finished,
                started,
                summary,
                watchPct,
                watchedMins,
                hasQuiz,
                hasExam,
                hasCheck,
                checkType,
                requiresGrading,
                unitAttempts,
                unitSubmissions
            };
        });
    }, [units, progressDocs, activeAttempts, activeSubmissions, learner.aliases, learner.learnerId]);

    const startGradingInline = (a: QuizAttemptDoc) => {
        if (a.gradedBy || a.gradedAt) {
            toast.info('This attempt has been finalized and locked.');
            return;
        }
        setEditingAttemptId(a.id);
        setScore(String(a.score ?? 0));
        setPassed(Boolean(a.passed));
        setFeedback(a.facilitatorFeedback || '');
    };

    const saveGrade = async (attempt: QuizAttemptDoc) => {
        const n = Number(score);
        if (score.trim() === '' || Number.isNaN(n) || n < 0 || n > 100) {
            toast.error('Enter a score between 0 and 100.');
            return;
        }
        setSaving(true);
        try {
            await updateDoc(doc(db, 'learner_quiz_attempts', attempt.id), {
                passed,
                score: n,
                facilitatorFeedback: feedback,
                gradedBy: auth.currentUser?.uid || 'Facilitator',
                gradedAt: serverTimestamp(),
                needsReview: false
            });

            const snap = await getDocs(query(collection(db, 'learner_content_progress'), where('userId', '==', learner.learnerId), where('unitId', '==', attempt.unitId)));
            if (!snap.empty) {
                const batch = writeBatch(db);
                snap.docs.forEach(d => batch.update(d.ref, { passed, score: n, isCompleted: passed ? true : d.data().isCompleted }));
                await batch.commit();
            }

            toast.success(`Grade saved: ${n}% (${passed ? 'competent' : 'not yet competent'}).`);
            setEditingAttemptId(null);
            setFeedback('');
        } catch (err) {
            toast.error('Could not save the grade. Check your permissions.');
        } finally {
            setSaving(false);
        }
    };

    const activeTimelineItem = timeline.find(t => t.unit.id === selectedUnitId) || timeline[0];

    const checkTypeDisplay = useMemo(() => {
        if (!activeTimelineItem) return 'None';
        const parts: string[] = [];
        if (activeTimelineItem.hasQuiz) parts.push(checkTypeLabel(activeTimelineItem.checkType));
        if (activeTimelineItem.hasExam) parts.push(getAssessmentMeta(activeTimelineItem.unit).title);
        return parts.length > 0 ? parts.join(' + ') : 'None';
    }, [activeTimelineItem]);

    return (
        <div className="lfm-overlay" onClick={onClose} style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }}>

            {/* CENTERED MASTER-DETAIL MODAL */}
            <div
                role="dialog"
                aria-label={`${learner.name} audit`}
                onClick={e => e.stopPropagation()}
                className="animate-fade-in"
                style={{
                    background: '#ffffff',
                    width: '95vw',
                    maxWidth: '1240px',
                    height: '88vh',
                    display: 'flex',
                    flexDirection: 'column',
                    border: '3px solid #073f4e',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
                    overflow: 'hidden'
                }}
            >
                {/* MODAL HEADER */}
                <header style={{ background: '#073f4e', borderBottom: '3px solid #94c73d', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ color: '#ffffff', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', fontSize: '1.1rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserCheck size={18} style={{ color: '#94c73d' }} /> {learner.name}
                        </div>
                        <div style={{ width: '1px', height: '20px', background: '#ffffff', opacity: 0.25 }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#bae6fd' }}>{learner.email || 'No email on file'}</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>{learner.cohortName}</span>
                            <span style={{
                                fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '2px 8px',
                                background: learner.risk === 'high_risk' || (learner.risk as any) === 'high' ? '#fee2e2' : learner.risk === 'moderate_risk' || (learner.risk as any) === 'medium' ? '#fffbeb' : '#f0f7e1',
                                color: learner.risk === 'high_risk' || (learner.risk as any) === 'high' ? '#991b1b' : learner.risk === 'moderate_risk' || (learner.risk as any) === 'medium' ? '#b45309' : '#7aaa2e',
                                border: `1px solid ${learner.risk === 'high_risk' || (learner.risk as any) === 'high' ? '#fca5a5' : learner.risk === 'moderate_risk' || (learner.risk as any) === 'medium' ? '#fde68a' : '#94c73d'}`
                            }}>
                                {RISK_LABEL[learner.risk]}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button type="button" onClick={() => onToggleBlock(learner.learnerId, learner.isBlockedFromForum)} style={{ background: 'transparent', border: '1px solid #bae6fd', color: '#bae6fd', padding: '4px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                            <Ban size={12} /> {learner.isBlockedFromForum ? 'Unblock Forum' : 'Block Forum'}
                        </button>
                        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '4px' }}>
                            <X size={20} />
                        </button>
                    </div>
                </header>

                {/* 2-COLUMN MASTER-DETAIL BODY */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                    {/* LEFT MASTER COLUMN: Package Lessons List */}
                    <div style={{ width: '340px', background: '#f8fafc', borderRight: '1px solid #dde4e8', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <div style={{ padding: '12px 16px', background: '#e8f0f3', borderBottom: '1px solid #dde4e8', fontSize: '0.75rem', fontWeight: 800, color: '#073f4e', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Package Lessons ({timeline.length})</span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {timeline.map((item, i) => {
                                const isSelected = item.unit.id === selectedUnitId;
                                return (
                                    <button
                                        key={item.unit.id}
                                        onClick={() => {
                                            setSelectedUnitId(item.unit.id);
                                            setEditingAttemptId(null);
                                        }}
                                        style={{
                                            width: '100%', textAlign: 'left', background: isSelected ? '#ffffff' : 'transparent',
                                            borderTop: 'none', borderRight: 'none', borderBottom: '1px solid #dde4e8', borderLeft: isSelected ? '4px solid #073f4e' : '4px solid transparent',
                                            padding: '12px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '4px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#073f4e', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase', lineHeight: 1.25 }}>
                                                {i + 1}. {item.unit.title || 'Untitled Lesson'}
                                            </span>
                                            {item.requiresGrading && (
                                                <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '1px 5px', fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase', flexShrink: 0, marginLeft: '6px' }}>
                                                    Needs Grade
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#6b6b6b' }}>
                                            {item.finished ? <CheckCircle2 size={13} color="#7aaa2e" /> : item.started ? <Clock size={13} color="#073f4e" /> : <Circle size={13} color="#cbd5e1" />}
                                            <span>{item.summary}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT DETAIL COLUMN: Preview & Grading Workspace */}
                    <div style={{ flex: 1, background: '#ffffff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

                        {/* Compact Selected Lesson Summary Bar */}
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid #dde4e8', background: '#f0f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 }}>
                            <div>
                                <div style={{ fontSize: '0.65rem', color: '#6b6b6b', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                    Inspecting Activity For
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#073f4e', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase' }}>
                                    {activeTimelineItem?.unit.title}
                                </h2>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#6b6b6b', textTransform: 'uppercase', fontWeight: 700, fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>Watch Time</span>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#073f4e' }}>
                                        {activeTimelineItem?.watchedMins || 0} / {activeTimelineItem?.unit.estimatedMinutes || 15} Mins ({activeTimelineItem?.watchPct || 0}%)
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#6b6b6b', textTransform: 'uppercase', fontWeight: 700, fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>Check Type</span>
                                    <span style={{ fontSize: '0.72rem', background: '#e8f0f3', color: '#073f4e', padding: '2px 8px', border: '1px solid #dde4e8', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                        {checkTypeDisplay}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Streamlined Events, Attempt Items & Exam Submissions */}
                        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {activeTimelineItem?.events.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#9b9b9b', background: '#f8fafc', border: '1px dashed #dde4e8' }}>
                                    <Clock size={28} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#6b6b6b', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase' }}>No Activity Recorded</div>
                                    <div style={{ fontSize: '0.78rem' }}>The learner has not watched or submitted an attempt for this lesson yet.</div>
                                </div>
                            ) : (
                                activeTimelineItem?.events.map((ev, k) => {
                                    const when = ev.at ? fmtDateTime(new Date(ev.at)) : 'Time unknown';

                                    // 1. WATCH EVENT
                                    if (ev.kind === 'watch') {
                                        return (
                                            <div key={k} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', border: '1px solid #dde4e8' }}>
                                                <div style={{ width: '32px', height: '32px', background: '#e8f0f3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#073f4e', flexShrink: 0 }}>
                                                    <Tv size={15} />
                                                </div>
                                                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#073f4e' }}>{ev.text}</span>
                                                    <span style={{ fontSize: '0.7rem', color: '#9b9b9b', fontFamily: 'monospace' }}>{when}</span>
                                                </div>
                                            </div>
                                        );
                                    }

                                    // 2. FORMAL EXAM SUBMISSION EVENT
                                    if (ev.kind === 'submission') {
                                        const s = ev.submission;
                                        const subStatus = String(s.status || 'submitted').toLowerCase();
                                        const competency = String(s.competency || '').toUpperCase();
                                        const isCompetent = ['C', 'HC', '3', '4'].includes(competency);
                                        const isGraded = ['graded', 'moderated', 'appealed'].includes(subStatus);
                                        const examMeta = getAssessmentMeta(activeTimelineItem.unit);

                                        return (
                                            <div
                                                key={k}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '10px',
                                                    background: '#ffffff',
                                                    borderTop: '1px solid #e9d5ff',
                                                    borderRight: '1px solid #e9d5ff',
                                                    borderBottom: '1px solid #e9d5ff',
                                                    borderLeft: `4px solid ${isGraded ? (isCompetent ? '#7c3aed' : '#ef4444') : '#f59e0b'}`,
                                                    padding: '14px 16px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontFamily: 'var(--font-heading, "Oswald", sans-serif)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Award size={16} color="#7c3aed" /> {examMeta.title} #{ev.chronologicalIndex}
                                                        </span>
                                                        <span style={{ fontSize: '0.7rem', color: '#9b9b9b', fontFamily: 'monospace' }}>{when}</span>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        <span style={{
                                                            background: isGraded ? (isCompetent ? '#f3e8ff' : '#fee2e2') : '#fef3c7',
                                                            color: isGraded ? (isCompetent ? '#6b21a8' : '#991b1b') : '#b45309',
                                                            border: `1px solid ${isGraded ? (isCompetent ? '#e9d5ff' : '#fca5a5') : '#fcd34d'}`,
                                                            padding: '2px 8px',
                                                            fontSize: '0.62rem',
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase',
                                                            fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}>
                                                            {isGraded ? (isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)') : 'Awaiting Assessor Review ⏳'}
                                                        </span>

                                                        {s.id && (
                                                            <a
                                                                href={`/submission-review/${s.id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="lfm-btn lfm-btn--ghost"
                                                                style={{ padding: '3px 8px', fontSize: '0.65rem', textDecoration: 'none', color: '#7c3aed', borderColor: '#c084fc', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                <Eye size={11} /> View Submission Script
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '0.78rem', color: '#475569', flexWrap: 'wrap' }}>
                                                    {s.totalMarks > 0 && (
                                                        <div>
                                                            <strong>Score:</strong> {s.marks || 0} / {s.totalMarks} ({Math.round(((s.marks || 0) / s.totalMarks) * 100)}%)
                                                        </div>
                                                    )}
                                                    {s.grading?.assessorName && (
                                                        <div>
                                                            <strong>Assessor:</strong> {s.grading.assessorName}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                        Ref: <code style={{ background: '#f1f5f9', padding: '1px 4px' }}>{s.id}</code>
                                                    </div>
                                                </div>

                                                {(s.grading?.assessorOverallFeedback || s.feedback) && (
                                                    <div style={{ padding: '8px 12px', background: '#f5f3ff', borderLeft: '3px solid #7c3aed', color: '#581c87', fontSize: '0.78rem' }}>
                                                        <strong>Assessor Feedback:</strong> "{s.grading?.assessorOverallFeedback || s.feedback}"
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }

                                    // 3. INTERACTIVE QUIZ ATTEMPT EVENT
                                    const a = ev.attempt;
                                    const attemptNumber = ev.chronologicalIndex;
                                    const needs = attemptNeedsReview(a, activeTimelineItem.checkType);
                                    const mediaUrl = getRecordingUrl(a);
                                    const textAns = getTranscriptText(a);
                                    const isEditingThis = editingAttemptId === a.id;
                                    const isGraded = Boolean(a.gradedBy || a.gradedAt);

                                    return (
                                        <div
                                            key={k}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '10px',
                                                background: '#ffffff',
                                                borderTop: '1px solid #dde4e8',
                                                borderRight: '1px solid #dde4e8',
                                                borderBottom: '1px solid #dde4e8',
                                                borderLeft: `4px solid ${a.passed ? '#7aaa2e' : '#ef4444'}`,
                                                padding: '14px 16px'
                                            }}
                                        >

                                            {/* Attempt Compact Header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ fontFamily: 'var(--font-heading, "Oswald", sans-serif)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', color: a.passed ? '#7aaa2e' : '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {a.passed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                                                        Quiz Attempt #{attemptNumber} {a.score !== undefined && `(${a.score}%)`}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#9b9b9b', fontFamily: 'monospace' }}>{when}</span>
                                                </div>

                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    {/* GRADED & LOCKED BADGE */}
                                                    {isGraded ? (
                                                        <span style={{
                                                            background: '#dcfce7',
                                                            color: '#15803d',
                                                            border: '1px solid #86efac',
                                                            padding: '2px 8px',
                                                            fontSize: '0.62rem',
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase',
                                                            fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}>
                                                            <Lock size={10} /> Graded &amp; Locked
                                                        </span>
                                                    ) : needs ? (
                                                        <span style={{
                                                            background: '#fef3c7',
                                                            color: '#b45309',
                                                            border: '1px solid #fcd34d',
                                                            padding: '2px 8px',
                                                            fontSize: '0.62rem',
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase',
                                                            fontFamily: 'var(--font-heading, "Oswald", sans-serif)'
                                                        }}>
                                                            Awaiting Grade
                                                        </span>
                                                    ) : null}

                                                    {/* ONLY ALLOW GRADING ON UNGRADED SUBMISSIONS */}
                                                    {!isEditingThis && !isGraded && (
                                                        <button
                                                            type="button"
                                                            className="lfm-btn lfm-btn--primary"
                                                            style={{ padding: '3px 8px', fontSize: '0.65rem' }}
                                                            onClick={() => startGradingInline(a)}
                                                        >
                                                            <Edit3 size={11} /> Review &amp; Grade
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* AI & Human Feedback Notes */}
                                            {a.failureReason && (
                                                <div style={{ padding: '8px 12px', background: '#fff1f2', borderLeft: '3px solid #be123c', color: '#9f1239', fontSize: '0.78rem' }}>
                                                    <strong>AI Flag:</strong> {a.failureReason}
                                                </div>
                                            )}
                                            {a.facilitatorFeedback && (
                                                <div style={{ padding: '8px 12px', background: '#f0fdf4', borderLeft: '3px solid #16a34a', color: '#166534', fontSize: '0.78rem' }}>
                                                    <strong>Facilitator Feedback:</strong> {a.facilitatorFeedback}
                                                </div>
                                            )}

                                            {/* STACKED MEDIA & TRANSCRIPT AREA */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                                                {mediaUrl && (
                                                    <div style={{ background: '#f8fafc', border: '1px solid #dde4e8', padding: '10px 12px' }}>
                                                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#073f4e', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                                            <Mic size={12} style={{ color: '#94c73d' }} /> Submitted Recording
                                                        </div>
                                                        <audio key={mediaUrl} controls src={mediaUrl} style={{ width: '100%', height: '30px', outline: 'none' }} />
                                                    </div>
                                                )}

                                                <div style={{ background: '#073f4e', padding: '10px 12px', width: '100%' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                                        <Code size={12} /> Captured Transcript / Submission
                                                    </div>
                                                    <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.78rem', color: '#38bdf8', whiteSpace: 'pre-wrap', maxHeight: '140px', overflowY: 'auto' }}>
                                                        {textAns || 'Nothing recorded for this attempt.'}
                                                    </pre>
                                                </div>
                                            </div>

                                            {/* Compact Inline Grading Form */}
                                            {isEditingThis && (
                                                <div className="animate-fade-in" style={{ background: '#e8f0f3', border: '2px solid #073f4e', padding: '14px 16px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#073f4e', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Edit3 size={13} /> Official Facilitator Grading</span>
                                                        <button type="button" onClick={() => setEditingAttemptId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b6b' }}><X size={14} /></button>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                                        <div className="lfm-fg" style={{ width: '110px' }}>
                                                            <label style={{ fontSize: '0.65rem' }}>Score (0-100) *</label>
                                                            <input
                                                                type="number" min={0} max={100} value={score}
                                                                onChange={e => setScore(e.target.value)}
                                                                className="lfm-input"
                                                                style={{ padding: '6px 8px', fontSize: '0.95rem', fontWeight: 800, textAlign: 'center' }}
                                                            />
                                                        </div>

                                                        {/* COMPACT GATE DECISION BUTTONS */}
                                                        <div className="lfm-fg">
                                                            <label style={{ fontSize: '0.65rem' }}>Official Gate Decision *</label>
                                                            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPassed(true)}
                                                                    style={{
                                                                        padding: '6px 14px',
                                                                        fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: 700,
                                                                        textTransform: 'uppercase',
                                                                        border: passed ? '1px solid #94c73d' : '1px solid #dde4e8',
                                                                        cursor: 'pointer',
                                                                        background: passed ? '#94c73d' : '#ffffff',
                                                                        color: passed ? '#052e3a' : '#6b6b6b',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                >
                                                                    Competent
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPassed(false)}
                                                                    style={{
                                                                        padding: '6px 14px',
                                                                        fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: 700,
                                                                        textTransform: 'uppercase',
                                                                        border: !passed ? '1px solid #ef4444' : '1px solid #dde4e8',
                                                                        cursor: 'pointer',
                                                                        background: !passed ? '#ef4444' : '#ffffff',
                                                                        color: !passed ? '#ffffff' : '#6b6b6b',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                >
                                                                    Not Competent
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="lfm-fg" style={{ marginBottom: 0 }}>
                                                        <label style={{ fontSize: '0.65rem' }}>Feedback (Visible to Learner)</label>
                                                        <textarea
                                                            rows={2}
                                                            className="lfm-input"
                                                            style={{ resize: 'none', padding: '8px', fontSize: '0.8rem', height: '50px' }}
                                                            value={feedback}
                                                            onChange={e => setFeedback(e.target.value)}
                                                            placeholder="Detail what they did well, or explain exactly what needs fixing..."
                                                        />
                                                    </div>

                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                        <button type="button" className="lfm-btn lfm-btn--ghost" style={{ padding: '4px 12px', fontSize: '0.68rem' }} onClick={() => setEditingAttemptId(null)}>Cancel</button>
                                                        <button type="button" className="lfm-btn lfm-btn--primary" style={{ padding: '4px 16px', fontSize: '0.68rem' }} onClick={() => saveGrade(a)} disabled={saving}>
                                                            {saving ? <Loader2 size={12} className="lfm-spin" /> : <Save size={12} />} Save Grade
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};