import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, setDoc, deleteField, getDocs, query } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    ArrowLeft, CheckCircle, AlertCircle, Save,
    User, GraduationCap, Clock, Award, RotateCcw, MessageSquare,
    ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2, XCircle, AlertTriangle, Activity, Calendar, BarChart, History,
    ShieldAlert
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import './SubmissionReview.css';
import { createPortal } from 'react-dom';
import { TintedSignature } from '../FacilitatorProfileView/FacilitatorProfileView';
import moment from 'moment';
import { PastAttemptsArchive } from '../../../components/dashboard/PastAttemptsArchive/PastAttemptsArchive';
import type { StatusType } from '../../LearnerPortal/AssessmentPlayer/AssessmentPlayer';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';

interface GradeData {
    score: number;
    feedback: string;
    isCorrect?: boolean | null;
}

const RemediationModal: React.FC<{
    submissionTitle: string;
    attemptNumber: number;
    onClose: () => void;
    onSubmit: (date: string, notes: string) => void;
}> = ({ submissionTitle, attemptNumber, onClose, onSubmit }) => {
    const [date, setDate] = useState('');
    const [notes, setNotes] = useState('');
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !notes.trim() || !confirmed) return;
        onSubmit(date, notes);
    };

    const isFinalAttempt = attemptNumber === 2;

    const modalContent = (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
            <div className="animate-fade-in" style={{ background: 'white', maxWidth: '500px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: isFinalAttempt ? '6px solid #ef4444' : '6px solid #f59e0b' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: isFinalAttempt ? '#fef2f2' : '#fffbeb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: isFinalAttempt ? '#ef4444' : '#f59e0b', padding: '10px', borderRadius: '50%', color: 'white' }}>
                            <RotateCcw size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: isFinalAttempt ? '#b91c1c' : '#b45309', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Initiate Remediation {isFinalAttempt && "(FINAL ATTEMPT)"}
                            </h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: isFinalAttempt ? '#991b1b' : '#92400e' }}>{submissionTitle}</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                        {isFinalAttempt
                            ? "WARNING: This will unlock the learner's 3rd and final attempt. A rigorous intervention is required."
                            : "QCTO regulations require evidence of a developmental intervention before a learner can attempt an assessment again. Please log the coaching session details below."}
                    </p>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>Date of Coaching / Feedback Session *</label>
                        <input type="date" required value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none' }} />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                            <MessageSquare size={14} color="#64748b" /> Coaching Notes / Areas Addressed *
                        </label>
                        <textarea required rows={3} placeholder={isFinalAttempt ? "Describe the rigorous intervention applied..." : "Briefly describe what was discussed..."} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', marginBottom: '1.5rem' }}>
                        <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: isFinalAttempt ? '#ef4444' : '#f59e0b' }} />
                        <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                            <strong>I legally declare</strong> that an academic intervention has taken place and this learner is ready for their next attempt.
                        </span>
                    </label>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        <button type="submit" disabled={!date || !notes.trim() || !confirmed} style={{ flex: 2, padding: '0.75rem', background: isFinalAttempt ? '#ef4444' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: (!date || !notes.trim() || !confirmed) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (!date || !notes.trim() || !confirmed) ? 0.5 : 1 }}>
                            Log Coaching & Unlock
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
    return createPortal(modalContent, document.body);
};

export const SubmissionReview: React.FC = () => {
    const { submissionId } = useParams<{ submissionId: string }>();
    const navigate = useNavigate();
    const { user } = useStore();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [submission, setSubmission] = useState<any>(null);
    const [assessment, setAssessment] = useState<any>(null);
    const [learner, setLearner] = useState<any>(null);

    const [learnerProfile, setLearnerProfile] = useState<any>(null);
    const [assessorProfile, setAssessorProfile] = useState<any>(null);
    const [moderatorProfile, setModeratorProfile] = useState<any>(null);
    const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);

    const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
    const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});
    const [modBreakdown, setModBreakdown] = useState<Record<string, GradeData>>({});

    const [facOverallFeedback, setFacOverallFeedback] = useState('');
    const [assOverallFeedback, setAssOverallFeedback] = useState('');
    const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

    const [modFeedback, setModFeedback] = useState('');
    const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

    const [historySnapshots, setHistorySnapshots] = useState<any[]>([]);

    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm: () => void; onCancel?: () => void; confirmText?: string; } | null>(null);
    const [showRemediationModal, setShowRemediationModal] = useState(false);

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sessionStartRef = useRef<number>(performance.now());
    const initialFacTimeRef = useRef<number>(0);
    const initialAssTimeRef = useRef<number>(0);
    const initialModTimeRef = useRef<number>(0);

    const currentStatus = String(submission?.status || '').toLowerCase();
    const currentAttempt = submission?.attemptNumber || 1;
    const isMaxAttempts = currentAttempt >= 3;

    // 🚀 STRICT STATUS FLAGS
    const isSubmitted = ['submitted', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
    const isFacDone = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
    const isAssDone = ['graded', 'moderated', 'returned'].includes(currentStatus);
    const isModDone = ['moderated'].includes(currentStatus);

    // STRICT ROLE DEFINITIONS
    const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
    const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
    const isModerator = user?.role === 'moderator' || user?.role === 'admin';

    const canFacilitatorMark = isFacilitator && currentStatus === 'submitted';
    const canGrade = isAssessor && (currentStatus === 'facilitator_reviewed' || currentStatus === 'returned');
    const canModerate = isModerator && currentStatus === 'graded';

    // 🚀 CLEAN SIDEBAR VISIBILITY (No Locked Placeholder Cards)
    const showFacilitatorPanel = canFacilitatorMark || isFacDone;
    const showAssessorPanel = canGrade || isAssDone;
    const showModeratorPanel = canModerate || isModDone;

    useEffect(() => {
        const loadReviewData = async () => {
            if (!submissionId) return;
            try {
                const subRef = doc(db, 'learner_submissions', submissionId);
                const subSnap = await getDoc(subRef);
                if (!subSnap.exists()) throw new Error("Submission not found");
                const subData = subSnap.data();
                setSubmission({ id: subSnap.id, ...subData });

                const assRef = doc(db, 'assessments', subData.assessmentId);
                const assSnap = await getDoc(assRef);
                if (!assSnap.exists()) throw new Error("Assessment template missing");
                const assData = assSnap.data();
                setAssessment(assData);

                const learnerRef = doc(db, 'learners', subData.learnerId);
                const learnerSnap = await getDoc(learnerRef);
                let learnerAuthUid = null;
                if (learnerSnap.exists()) {
                    const lData = learnerSnap.data();
                    setLearner(lData);
                    learnerAuthUid = lData.authUid;
                }

                const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || learnerAuthUid || subData.learnerId;
                if (targetLearnerUid) {
                    const lProfSnap = await getDoc(doc(db, 'users', targetLearnerUid));
                    if (lProfSnap.exists()) setLearnerProfile(lProfSnap.data());
                }

                if (subData.grading?.gradedBy) {
                    const assProfRef = doc(db, 'users', subData.grading.gradedBy);
                    const assProfSnap = await getDoc(assProfRef);
                    if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
                }

                if (subData.moderation?.moderatedBy) {
                    const modProfRef = doc(db, 'users', subData.moderation.moderatedBy);
                    const modProfSnap = await getDoc(modProfRef);
                    if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
                }

                const facId = subData.latestCoachingLog?.facilitatorId || subData.grading?.facilitatorId;
                if (facId) {
                    const facProfRef = doc(db, 'users', facId);
                    const facProfSnap = await getDoc(facProfRef);
                    if (facProfSnap.exists()) setFacilitatorProfile(facProfSnap.data());
                }

                const historyRef = collection(db, 'learner_submissions', submissionId, 'history');
                const historyQuery = query(historyRef);
                const historySnapshotsRes = await getDocs(historyQuery);
                const hData = historySnapshotsRes.docs.map(d => ({ id: d.id, ...d.data() } as any));
                hData.sort((a: any, b: any) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());
                setHistorySnapshots(hData);

                initialFacTimeRef.current = subData.grading?.facilitatorTimeSpent || 0;
                initialAssTimeRef.current = subData.grading?.assessorTimeSpent || 0;
                initialModTimeRef.current = subData.moderation?.timeSpent || 0;
                sessionStartRef.current = performance.now();

                let fBreakdown = subData.grading?.facilitatorBreakdown;
                let aBreakdown = subData.grading?.assessorBreakdown;
                let mBreakdown = subData.moderation?.breakdown;

                const dbStatus = String(subData.status || '').toLowerCase();

                const generateFreshBreakdown = (includeFeedback: boolean) => {
                    const fresh: Record<string, GradeData> = {};
                    assData.blocks?.forEach((block: any) => {
                        if (block.type === 'mcq') {
                            const isCorrect = subData.answers?.[block.id] === block.correctOption;
                            fresh[block.id] = { score: isCorrect ? (block.marks || 0) : 0, feedback: includeFeedback ? (isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect') : '', isCorrect };
                        } else if (block.type === 'text') {
                            fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
                        }
                    });
                    return fresh;
                };

                if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
                    if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) fBreakdown = subData.grading.breakdown;
                    else fBreakdown = generateFreshBreakdown(true);
                }
                setFacBreakdown(fBreakdown);

                if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
                    if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(dbStatus)) aBreakdown = generateFreshBreakdown(false);
                    else aBreakdown = {};
                }
                setAssBreakdown(aBreakdown);

                if (!mBreakdown || Object.keys(mBreakdown).length === 0) {
                    if (['graded', 'moderated', 'returned'].includes(dbStatus)) mBreakdown = generateFreshBreakdown(false);
                    else mBreakdown = {};
                }
                setModBreakdown(mBreakdown);

                setFacOverallFeedback(subData.grading?.facilitatorOverallFeedback || '');
                setAssOverallFeedback(subData.grading?.assessorOverallFeedback || subData.grading?.overallFeedback || '');

                setCompetency(subData.competency || null);
                setModFeedback(subData.moderation?.feedback || '');
                setModOutcome(subData.moderation?.outcome || null);

            } catch (err: any) {
                toast.error(err.message || "Failed to load data.");
            } finally {
                setLoading(false);
            }
        };
        loadReviewData();
    }, [submissionId]);

    const getFacTime = () => initialFacTimeRef.current + (canFacilitatorMark ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
    const getAssTime = () => initialAssTimeRef.current + (canGrade ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
    const getModTime = () => initialModTimeRef.current + (canModerate ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);

    const formatTimeSpent = (seconds?: number) => {
        if (seconds === undefined || seconds === null) return '—';
        const m = Math.floor(seconds / 60);
        if (m === 0) return '< 1m';
        const h = Math.floor(m / 60);
        if (h > 0) return `${h}h ${m % 60}m`;
        return `${m}m`;
    };

    const formatCalendarSpread = (startStr?: string, endStr?: string) => {
        if (!startStr || !endStr) return null;
        const start = new Date(startStr).getTime();
        const end = new Date(endStr).getTime();
        const diffHours = (end - start) / (1000 * 60 * 60);
        if (diffHours < 24) return diffHours < 1 ? '< 1 hr spread' : `${Math.floor(diffHours)} hr spread`;
        return `${Math.floor(diffHours / 24)} day spread`;
    };

    const triggerAutoSave = (fBreak: any, aBreak: any, mBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setSaving(true);
        saveTimeoutRef.current = setTimeout(async () => {
            if (!submission?.id) return;
            try {
                const updatePayload: any = {
                    'grading.facilitatorBreakdown': fBreak, 'grading.assessorBreakdown': aBreak, 'moderation.breakdown': mBreak,
                    'grading.facilitatorOverallFeedback': fOverall, 'grading.assessorOverallFeedback': aOverall, 'moderation.feedback': updatedModFeedback,
                    lastStaffEditAt: new Date().toISOString()
                };
                if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
                if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;
                if (canFacilitatorMark) updatePayload['grading.facilitatorTimeSpent'] = getFacTime();
                if (canGrade) updatePayload['grading.assessorTimeSpent'] = getAssTime();
                if (canModerate) updatePayload['moderation.timeSpent'] = getModTime();

                const nowIso = new Date().toISOString();
                if (canFacilitatorMark && !submission.grading?.facilitatorStartedAt) {
                    updatePayload['grading.facilitatorStartedAt'] = nowIso;
                    setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, facilitatorStartedAt: nowIso } }));
                }
                if (canGrade && !submission.grading?.assessorStartedAt) {
                    updatePayload['grading.assessorStartedAt'] = nowIso;
                    setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, assessorStartedAt: nowIso } }));
                }
                if (canModerate && !submission.moderation?.moderatorStartedAt) {
                    updatePayload['moderation.moderatorStartedAt'] = nowIso;
                    setSubmission((prev: any) => ({ ...prev, moderation: { ...prev.moderation, moderatorStartedAt: nowIso } }));
                }
                await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
            } catch (error) { console.error("Auto-save failed:", error); } finally { setSaving(false); }
        }, 1500);
    };

    const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
        if (canFacilitatorMark) {
            const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
            setFacBreakdown(next); triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canGrade) {
            const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
            setAssBreakdown(next); triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canModerate) {
            const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
            setModBreakdown(next); triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        }
    };

    const handleScoreChange = (blockId: string, score: number, max: number) => {
        const val = Math.min(Math.max(0, score), max);
        if (canFacilitatorMark) {
            const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], score: val } };
            setFacBreakdown(next); triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canGrade) {
            const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], score: val } };
            setAssBreakdown(next); triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canModerate) {
            const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], score: val } };
            setModBreakdown(next); triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        }
    };

    const handleFeedbackChange = (blockId: string, feedback: string) => {
        if (canFacilitatorMark) {
            const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], feedback } };
            setFacBreakdown(next); triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canGrade) {
            const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], feedback } };
            setAssBreakdown(next); triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canModerate) {
            const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], feedback } };
            setModBreakdown(next); triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        }
    };

    const handleFacOverallFeedbackChange = (val: string) => { if (!canFacilitatorMark) return; setFacOverallFeedback(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome); };
    const handleAssOverallFeedbackChange = (val: string) => { if (!canGrade) return; setAssOverallFeedback(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome); };
    const handleModFeedbackChange = (val: string) => { if (!canModerate) return; setModFeedback(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome); };
    const handleCompetencySelect = (val: 'C' | 'NYC') => { if (!canGrade) return; setCompetency(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome); };
    const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => { if (!canModerate) return; setModOutcome(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val); };

    const executeRemediation = async (coachingDate: string, coachingNotes: string) => {
        setShowRemediationModal(false);
        setSaving(true);
        try {
            const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
            await setDoc(historyRef, {
                ...submission, archivedAt: new Date().toISOString(), snapshotReason: 'Remediation requested after NYC outcome',
                coachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName }
            });

            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                status: 'in_progress', competency: deleteField(), grading: deleteField(), moderation: deleteField(), submittedAt: deleteField(), learnerDeclaration: deleteField(),
                attemptNumber: (submission.attemptNumber || 1) + 1, lastStaffEditAt: new Date().toISOString(),
                latestCoachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName, acknowledged: false }
            });

            toast.success("Workbook grading cleared and unlocked for learner!");
            setTimeout(() => navigate(-1), 1500);
        } catch (err) { toast.error("Failed to unlock for remediation."); } finally { setSaving(false); }
    };

    const getTotals = (breakdown: Record<string, GradeData>) => {
        const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
        const max = assessment?.totalMarks || 0;
        const pct = max > 0 ? Math.round((score / max) * 100) : 0;
        return { score, max, pct };
    };

    const facTotals = getTotals(facBreakdown);
    const assTotals = getTotals(assBreakdown);
    const modTotals = getTotals(modBreakdown);

    let activeTotals = facTotals;
    if (showAssessorPanel) activeTotals = assTotals;
    if (showModeratorPanel) activeTotals = modTotals;

    const sectionTotals: Record<string, { total: number, awarded: number }> = {};
    let currentSectionId = '';
    if (assessment?.blocks) {
        assessment.blocks.forEach((block: any) => {
            if (block.type === 'section') {
                currentSectionId = block.id;
                sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
            } else if ((block.type === 'mcq' || block.type === 'text') && currentSectionId) {
                const g = submission?.grading || {}; const m = submission?.moderation || {};
                const mLayer = m.breakdown?.[block.id] || {}; const aLayer = g.assessorBreakdown?.[block.id] || {}; const fLayer = g.facilitatorBreakdown?.[block.id] || {};
                const legacyLayer = g.breakdown?.[block.id] || { score: 0, isCorrect: null };

                let activeLayer = legacyLayer;
                if (isFacDone) activeLayer = fLayer;
                if (isAssDone) activeLayer = aLayer;
                if (isModDone) activeLayer = mLayer;

                sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
                if (activeLayer.score !== undefined && activeLayer.score !== null) sectionTotals[currentSectionId].awarded += Number(activeLayer.score);
            }
        });
    }

    const validateAllMarked = (breakdown: Record<string, GradeData>) => {
        if (!assessment?.blocks) return true;
        const unmarkedCount = assessment.blocks.filter((block: any) => {
            if (block.type !== 'mcq' && block.type !== 'text') return false;
            const grade = breakdown[block.id];
            return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
        }).length;
        return unmarkedCount === 0;
    };

    const triggerSubmitFacilitator = () => {
        if (!validateAllMarked(facBreakdown)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Marking', message: 'You must evaluate every question. Please ensure every question has a Green Tick or Red Cross selected before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!facOverallFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Overall Facilitator Remarks before sending this script to the Assessor.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

        setModalConfig({
            isOpen: true, type: 'info', title: 'Complete Pre-Marking?', message: 'This will finalize your Blue Pen feedback and send the workbook to the Assessor for official grading.', confirmText: 'Send to Assessor',
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), { status: 'facilitator_reviewed', 'grading.facilitatorBreakdown': facBreakdown, 'grading.facilitatorOverallFeedback': facOverallFeedback, 'grading.facilitatorId': user?.uid, 'grading.facilitatorName': user?.fullName, 'grading.facilitatorReviewedAt': new Date().toISOString(), 'grading.facilitatorTimeSpent': getFacTime() });
                    toast.success("Script marked and passed to Assessor!"); setTimeout(() => navigate(-1), 2000);
                } catch (error) { toast.error("Failed to save marking."); } finally { setSaving(false); }
            }, onCancel: () => setModalConfig(null)
        });
    };

    const triggerSubmitGrade = () => {
        if (!validateAllMarked(assBreakdown)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Grading', message: 'You must evaluate every question. Please ensure every question has a Tick or Cross selected before submitting your final grade.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!competency) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a Final Competency (C or NYC) before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!assOverallFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Assessor Remarks justifying your final outcome before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

        setModalConfig({
            isOpen: true, type: 'warning', title: 'Finalise Grade?', message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.', confirmText: 'Apply Signature & Submit',
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), { status: 'graded', marks: assTotals.score, competency: competency, 'grading.assessorBreakdown': assBreakdown, 'grading.assessorOverallFeedback': assOverallFeedback, 'grading.gradedBy': user?.uid, 'grading.assessorName': user?.fullName, 'grading.assessorRegNumber': user?.assessorRegNumber || 'Pending Reg', 'grading.gradedAt': new Date().toISOString(), 'grading.assessorTimeSpent': getAssTime() });
                    toast.success("Workbook graded and signed successfully!"); setTimeout(() => window.location.reload(), 500);
                } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
            }, onCancel: () => setModalConfig(null)
        });
    };

    const triggerSubmitModeration = () => {
        if (!validateAllMarked(modBreakdown)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete QA', message: 'You must verify every question with a Green Tick or Cross to confirm the Assessor’s marks before endorsing.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!modOutcome) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Outcome', message: 'You must select a Moderation Outcome (Endorsed or Returned) before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!modFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Feedback', message: 'You must provide Moderator Feedback explaining your decision.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

        setModalConfig({
            isOpen: true, type: 'info', title: 'Finalise Moderation?', message: modOutcome === 'Returned' ? 'This will return the workbook to the Assessor for remediation.' : 'This will apply your Green Pen signature and endorse the final grade.', confirmText: 'Confirm Moderation',
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
                    await updateDoc(doc(db, 'learner_submissions', submission.id), { status: newStatus, 'moderation.breakdown': modBreakdown, 'moderation.outcome': modOutcome, 'moderation.feedback': modFeedback, 'moderation.moderatedBy': user?.uid, 'moderation.moderatorName': user?.fullName, 'moderation.moderatorRegNumber': user?.assessorRegNumber || 'Pending Reg', 'moderation.moderatedAt': new Date().toISOString(), 'moderation.timeSpent': getModTime() });
                    toast.success("Moderation saved successfully!"); setTimeout(() => navigate(-1), 1000);
                } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
            }, onCancel: () => setModalConfig(null)
        });
    };

    if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
    if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

    const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');
    const printInkColor = isModDone ? 'green' : (isAssDone ? 'red' : 'blue');

    const canPrint = !['not_started', 'in_progress'].includes(currentStatus);

    const renderBlocks = (isPrintMode: boolean) => {
        return assessment.blocks?.map((block: any, idx: number) => {
            if (block.type === 'section') {
                const totals = sectionTotals[block.id];
                return (
                    <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-section-title-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
                        <h2 className="sr-section-title" style={{ color: '#073f4e', margin: 0, border: 'none', padding: 0 }}>{block.title}</h2>
                        {isAssDone && totals && totals.total > 0 && (
                            <span className="no-print" style={{ fontSize: '0.8rem', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px', fontWeight: 'bold' }}><BarChart size={14} /> {totals.awarded}/{totals.total}</span>
                        )}
                    </div>
                );
            }

            if (block.type === 'mcq' || block.type === 'text') {
                const learnerAns = submission.answers?.[block.id];
                const maxM = block.marks || 0;
                const isMCQ = block.type === 'mcq';

                const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
                const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
                const mData = modBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };

                let activeInkColor = 'blue'; let activeData = fData; let isActiveRole = false;

                if (canFacilitatorMark) { activeInkColor = 'blue'; activeData = fData; isActiveRole = true; }
                else if (canGrade) { activeInkColor = 'red'; activeData = aData; isActiveRole = true; }
                else if (canModerate) { activeInkColor = 'green'; activeData = mData; isActiveRole = true; }
                else {
                    if (isModDone) { activeInkColor = 'green'; activeData = mData; }
                    else if (isAssDone) { activeInkColor = 'red'; activeData = aData; }
                    else { activeInkColor = 'blue'; activeData = fData; }
                }

                const renderFacTick = isFacDone && fData.isCorrect !== null && fData.isCorrect !== undefined;
                const renderAssTick = isAssDone && aData.isCorrect !== null && aData.isCorrect !== undefined;
                const renderModTick = isModDone && mData.isCorrect !== null && mData.isCorrect !== undefined;

                const renderFacReadOnly = isFacDone && !canFacilitatorMark && (fData.score > 0 || fData.feedback || fData.isCorrect !== null);
                const renderAssReadOnly = isAssDone && !canGrade && (aData.score > 0 || aData.feedback || aData.isCorrect !== null);
                const renderModReadOnly = isModDone && !canModerate && (mData.score > 0 || mData.feedback || mData.isCorrect !== null);

                return (
                    <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
                        <div className="sr-q-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
                                <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>

                                <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                                    {renderFacTick && <span title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 4px', borderRadius: '4px' }}>{fData.isCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</span>}
                                    {renderAssTick && <span title="Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 4px', borderRadius: '4px' }}>{aData.isCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</span>}
                                    {renderModTick && <span title="Internal Moderation QA" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 4px', borderRadius: '4px' }}>{mData.isCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</span>}
                                </div>
                            </div>

                            {!isPrintMode && isActiveRole && (
                                <div className="sr-visual-mark">
                                    <button onClick={() => handleVisualMark(block.id, true, maxM)} disabled={!isActiveRole} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
                                    <button onClick={() => handleVisualMark(block.id, false, maxM)} disabled={!isActiveRole} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
                                </div>
                            )}
                        </div>

                        <div className="sr-q-body">
                            <div className="sr-answer-box">
                                <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
                                {isMCQ ? (
                                    <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
                                        <span style={{ color: 'black', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
                                        {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
                                    </div>
                                ) : (
                                    <div className="sr-text-ans">
                                        {learnerAns ? <div className="quill-read-only-content" style={{ color: 'black', wordBreak: 'break-word', overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: learnerAns }} /> : <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>}
                                    </div>
                                )}
                                {isMCQ && <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong></div>}
                            </div>

                            {/* 🚀 READ-ONLY BLOCKS */}
                            {renderFacReadOnly && (
                                <div className="sr-read-only-feedback" style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
                                    <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Info size={13} /> Facilitator Pre-Mark</div>
                                    <div style={{ color: '#0369a1', fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{fData.score ?? 0}/{maxM}]</span> {fData.feedback || <em style={{ opacity: 0.7 }}>No specific coaching provided.</em>}</div>
                                </div>
                            )}

                            {renderAssReadOnly && (
                                <div className="sr-read-only-feedback" style={{ background: '#fef2f2', borderLeft: '3px solid #ef4444', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
                                    <div style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Award size={13} /> Assessor Grade</div>
                                    <div style={{ color: '#991b1b', fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{aData.score ?? 0}/{maxM}]</span> {aData.feedback || <em style={{ opacity: 0.7 }}>No specific feedback provided.</em>}</div>
                                </div>
                            )}

                            {renderModReadOnly && (
                                <div className="sr-read-only-feedback" style={{ background: '#f0fdf4', borderLeft: '3px solid #22c55e', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
                                    <div style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><ShieldCheck size={13} /> Moderator QA</div>
                                    <div style={{ color: '#16a34a', fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{mData.score ?? 0}/{maxM}]</span> {mData.feedback || <em style={{ opacity: 0.7 }}>No QA feedback provided.</em>}</div>
                                </div>
                            )}

                            {/* 🚀 ACTIVE GRADING INPUTS */}
                            {(!isPrintMode && isActiveRole) && (
                                <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderRadius: '6px' }}>
                                    <div className="sr-score-input-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                        <label style={{ color: activeInkColor, fontWeight: 'bold', fontSize: '0.85rem' }}>Marks Awarded:</label>
                                        <input type="number" className="sr-score-input" style={{ color: activeInkColor, width: '60px', padding: '4px 8px', border: `1px solid ${activeInkColor}`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }} value={activeData.score ?? 0} onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)} />
                                        <span style={{ color: activeInkColor, fontWeight: 'bold' }}>/ {maxM}</span>
                                    </div>
                                    <div className="sr-feedback-wrap" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                        <Edit3 size={16} color={activeInkColor} style={{ marginTop: '6px' }} />
                                        <textarea className="sr-feedback-input" rows={2} style={{ width: '100%', color: activeInkColor, fontStyle: 'italic', fontWeight: 500, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }} placeholder={canModerate ? "Moderator Green Pen QA Notes..." : canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."} value={activeData.feedback || ''} onChange={e => handleFeedbackChange(block.id, e.target.value)} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            }
            return null;
        });
    };

    return (
        <div className="sr-root animate-fade-in" style={{ width: '100%', position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* 🚀 RENDER REUSABLE STATUS MODAL 🚀 */}
            {modalConfig && modalConfig.isOpen && (
                <StatusModal
                    type={modalConfig.type}
                    title={modalConfig.title}
                    message={modalConfig.message}
                    confirmText={modalConfig.confirmText}
                    onClose={modalConfig.onConfirm}
                    onCancel={modalConfig.onCancel}
                />
            )}

            {/* 🚀 RENDER REMEDIATION MODAL 🚀 */}
            {showRemediationModal && (
                <RemediationModal
                    submissionTitle={submission.title}
                    attemptNumber={currentAttempt}
                    onClose={() => setShowRemediationModal(false)}
                    onSubmit={executeRemediation}
                />
            )}

            <div className="ap-player-topbar no-print">
                <div className="ap-player-topbar__left">
                    <button className="sr-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={13} /> Portfolio</button>
                    <div className="ap-player-topbar__separator" />
                    <h1 className="ap-player-topbar__title">
                        {assessment.title}
                        {submission?.attemptNumber > 1 && (
                            <span style={{ marginLeft: '10px', fontSize: '0.75rem', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle' }}>
                                Attempt {submission.attemptNumber}
                            </span>
                        )}
                    </h1>
                </div>
                <div className="ap-player-topbar__right">
                    {canPrint && (
                        <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
                            <Printer size={13} /> Print Audit
                        </button>
                    )}
                    <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
                        {saving ? <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</> : <><CheckCircle size={12} /> Auto-saved</>}
                    </span>
                </div>
            </div>

            <div className="sr-print-wrap">

                {/* Cover pages (print only) */}
                <div className="print-only-cover">
                    <div className="print-page">
                        <h1 style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: '10px' }}>
                            {assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}
                        </h1>
                        <h2 style={{ textAlign: 'center', marginBottom: '8mm', textDecoration: 'underline' }}>
                            LEARNER WORKBOOK {submission?.attemptNumber > 1 ? `- ATTEMPT #${submission.attemptNumber}` : ''}
                        </h2>
                        <table className="print-table" style={{ width: '100%', marginBottom: '8mm' }}>
                            <tbody>
                                <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Module #</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Notional hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Credit(s)</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
                            </tbody>
                        </table>
                        <h3>CONTACT INFORMATION:</h3>
                        <table className="print-table" style={{ width: '100%' }}>
                            <tbody>
                                <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName || '________________________'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || learner?.email || '________________________'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Telephone (W)</td><td>{learnerProfile?.telephoneWork || '________________________'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="print-page">
                        <h3>Note to the learner</h3>
                        <p>{assessment?.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
                        <h3>Purpose</h3>
                        <p>{assessment?.purpose || 'The main focus of the learning in this knowledge module is to build an understanding of the concepts related to this subject matter.'}</p>
                        <h3>Topic elements to be covered include</h3>
                        <table className="print-table no-border" style={{ width: '100%' }}>
                            <tbody>
                                {assessment?.moduleInfo?.topics && assessment.moduleInfo.topics.length > 0
                                    ? assessment.moduleInfo.topics.map((topic: any, idx: number) => (
                                        <tr key={idx}>
                                            <td>{topic.code ? <strong>{topic.code}: </strong> : ''}{topic.title || topic.name}</td>
                                            <td style={{ width: '15%' }}>{topic.weight || topic.percentage}%</td>
                                        </tr>
                                    ))
                                    : assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
                                        const secTotal = sectionTotals[sec.id]?.total || 0;
                                        const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
                                        return (
                                            <tr key={idx}>
                                                <td><strong>Section {idx + 1}: </strong>{sec.title}</td>
                                                <td style={{ width: '15%' }}>{secTotal > 0 ? `${pct}%` : '—'}</td>
                                            </tr>
                                        );
                                    })
                                }
                            </tbody>
                        </table>
                    </div>

                    <div className="print-page">
                        <h3>Entry Requirements</h3>
                        <p>{assessment?.moduleInfo?.entryRequirements || `NQF Level ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}</p>
                        <h3>Provider Accreditation Requirements</h3>
                        <p><strong>Physical Requirements:</strong><br />{assessment?.moduleInfo?.physicalRequirements || 'The provider must have structured learning material.'}</p>
                        <h3>Human Resource Requirements</h3>
                        <ul>
                            <li>Lecturer/learner ratio of {assessment?.moduleInfo?.lecturerRatio || '1:20'} (Maximum)</li>
                            <li>Assessors and moderators: accredited by the relevant SETA</li>
                        </ul>
                        <h3>Exemptions</h3>
                        <p>{assessment?.moduleInfo?.exemptions || 'No exemptions, but the module can be achieved in full through a normal RPL process.'}</p>
                        <h3>Venue, Date and Time</h3>
                        <p><strong>Venue:</strong> {assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform'}</p>
                        <p><strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}</p>
                    </div>

                    {/* 🚀 OFFICIAL REMEDIATION RECORD (PRINT ONLY) 🚀 */}
                    {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
                        <div className="print-page">
                            <h3>Record of Developmental Intervention (Remediation)</h3>
                            <p style={{ marginBottom: '15px' }}>This section serves as official evidence that a developmental intervention was conducted prior to the learner's Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>

                            <table className="print-table" style={{ width: '100%', marginBottom: '30px' }}>
                                <tbody>
                                    <tr><td style={{ width: '30%', fontWeight: 'bold' }}>Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString()}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>Coaching Notes</td><td style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.latestCoachingLog.notes}</td></tr>
                                </tbody>
                            </table>

                            <div className="sr-signature-block" style={{ marginTop: '40px', justifyContent: 'flex-start', gap: '2rem' }}>
                                {/* Facilitator Sig */}
                                <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue', flex: '0 1 300px' }}>
                                    <span style={{ color: 'blue' }}>Facilitator Declaration</span>
                                    {facilitatorProfile?.signatureUrl
                                        ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" />
                                        : <div className="sr-sig-no-image" style={{ color: 'blue' }}>No Canvas Signature</div>
                                    }
                                    <strong style={{ color: 'blue' }}>{submission.latestCoachingLog.facilitatorName}</strong>
                                    <em style={{ color: 'blue' }}>Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</em>
                                    <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>Coaching Conducted</div>
                                </div>

                                {/* Learner Sig */}
                                <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
                                    <span style={{ color: 'black' }}>Learner Acknowledgement</span>
                                    {submission.latestCoachingLog.acknowledged ? (
                                        <>
                                            {learnerProfile?.signatureUrl
                                                ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
                                                : <div className="sr-sig-no-image" style={{ color: 'black' }}>No Canvas Signature</div>
                                            }
                                            <strong style={{ color: 'black' }}>{learner?.fullName || learnerProfile?.fullName}</strong>
                                            <em style={{ color: 'black' }}>Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString()}</em>
                                            <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Intervention Received</div>
                                        </>
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                            <div className="sr-sig-no-image" style={{ color: 'black', border: 'none' }}>Pending Signature</div>
                                            <div className="sr-sig-line" style={{ borderTopColor: 'black', width: '80%', marginTop: '10px' }}>Awaiting Learner</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Audit header (score summary + signatures) ── */}
                <div className="sr-print-header">
                    <div className="sr-print-header-info">
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <p><strong>Learner Name:</strong> {learner?.fullName}</p>
                                <p><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
                                <p><strong>Submitted:</strong> {isSubmitted ? new Date(submission.submittedAt).toLocaleDateString() : 'Pending Submission'}</p>
                            </div>
                            <div>
                                <p><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
                                <p><strong>Score:</strong> <span style={{ color: isFacDone ? printInkColor : '#94a3b8', fontWeight: 'bold' }}>{isFacDone ? `${activeTotals.score} / ${activeTotals.max} (${activeTotals.pct}%)` : 'Pending Review'}</span></p>
                                <p><strong>Outcome:</strong> <span style={{ color: isAssDone ? printOutcomeColor : '#94a3b8', fontWeight: 'bold' }}>{isAssDone ? (submission.competency === 'C' ? 'Competent (C)' : submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending') : 'Pending Assessment'}</span></p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sr-blocks">
                    {renderBlocks(true)}
                </div>

                <div className="sr-signature-block">
                    <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black' }}>
                        <span style={{ color: 'black' }}>Learner Declaration</span>
                        {isSubmitted && submission.learnerDeclaration ? (
                            <>
                                {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div className="sr-sig-no-image" style={{ color: 'black' }}>No Canvas Signature</div>}
                                <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
                                <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                <div className="sr-sig-no-image" style={{ color: 'black', border: 'none' }}>Pending Signature</div>
                                <div className="sr-sig-line" style={{ borderTopColor: 'black', width: '80%', marginTop: '10px' }}>Awaiting Submission</div>
                            </div>
                        )}
                    </div>

                    <div className="sr-sig-box" style={{ borderColor: 'red', color: 'red' }}>
                        <span style={{ color: 'red' }}>Assessor Sign-off</span>
                        {isAssDone && submission.grading?.gradedAt ? (
                            <>
                                {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div className="sr-sig-no-image" style={{ color: 'red' }}>No Canvas Signature</div>}
                                <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
                                <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
                                <em style={{ color: 'red' }}>Signed: {new Date(submission.grading.gradedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'red' }}>Digital Signature Confirmed</div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                <div className="sr-sig-no-image" style={{ color: 'red', border: 'none' }}>Pending Signature</div>
                                <div className="sr-sig-line" style={{ borderTopColor: 'red', width: '80%', marginTop: '10px' }}>Awaiting Assessment</div>
                            </div>
                        )}
                    </div>

                    <div className="sr-sig-box" style={{ borderColor: 'green', color: 'green' }}>
                        <span style={{ color: 'green' }}>Internal Moderation</span>
                        {isModDone && submission.moderation?.moderatedAt ? (
                            <>
                                {moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" /> : <div className="sr-sig-no-image" style={{ color: 'green' }}>No Canvas Signature</div>}
                                <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
                                <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
                                <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                <div className="sr-sig-no-image" style={{ color: 'green', border: 'none' }}>Pending Signature</div>
                                <div className="sr-sig-line" style={{ borderTopColor: 'green', width: '80%', marginTop: '10px' }}>Awaiting Moderation</div>
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* ══════════════════════════════════════════════════════════════════
                SCREEN LAYOUT — hidden in print
            ══════════════════════════════════════════════════════════════════ */}
            <div className="sr-layout no-print">
                <div className="sr-content-pane">

                    {/* 🚀 COACHING ALERT BANNER (Visible if a coaching log exists on Attempt > 1) 🚀 */}
                    {submission.latestCoachingLog && currentAttempt > 1 && (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <CheckCircle size={16} /> Remediation Coaching Logged
                            </h4>
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#15803d' }}>
                                <strong>Date:</strong> {new Date(submission.latestCoachingLog.date).toLocaleDateString()}
                            </p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#15803d', fontStyle: 'italic', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                "{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}
                            </p>
                        </div>
                    )}

                    <div className="sr-blocks">
                        {renderBlocks(false)}
                    </div>
                </div>

                {/* ── RIGHT PANE ── */}
                <aside className="sr-sidebar no-print">

                    {/* FACILITATOR */}
                    {showFacilitatorPanel && (
                        <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
                            <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>
                            {canFacilitatorMark && <div className="sr-role-guide blue"><Info size={16} /><div><strong>Formative Feedback</strong><br />Use your Blue Pen to provide developmental feedback.</div></div>}
                            <div className="sr-score-display">
                                <div className="sr-score-circle" style={{ borderColor: 'blue' }}>
                                    <span className="sr-score-val" style={{ color: 'blue' }}>{facTotals.score}</span>
                                    <span className="sr-score-max" style={{ color: 'blue' }}>/ {facTotals.max}</span>
                                </div>
                                <div className="sr-score-percent" style={{ color: 'blue' }}>{facTotals.pct}%</div>
                            </div>
                            <div className="sr-overall-feedback">
                                <label className="sr-sidebar-label" style={{ color: 'blue' }}>Facilitator Remarks</label>
                                {canFacilitatorMark ? (
                                    <textarea className="sr-textarea" rows={3} style={{ color: 'blue', fontStyle: 'italic', borderColor: 'blue', background: 'whitesmoke' }} placeholder="Add overall coaching comments..." value={facOverallFeedback} onChange={e => handleFacOverallFeedbackChange(e.target.value)} />
                                ) : (
                                    <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', color: '#0369a1', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #0284c7', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{facOverallFeedback || "No overall remarks provided."}</div>
                                )}
                            </div>
                            {canFacilitatorMark ? (
                                <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>{saving ? 'Processing...' : 'Send to Assessor'}</button>
                            ) : (
                                <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}><CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Completed by {submission.grading?.facilitatorName || 'Facilitator'}</div>
                            )}
                        </div>
                    )}

                    {/* ASSESSOR */}
                    {showAssessorPanel && (
                        <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
                            <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>
                            {canGrade && <div className="sr-role-guide red"><Info size={16} /><div><strong>Summative Judgment</strong><br />Declare Competency. You must justify your marks.</div></div>}
                            <div className="sr-score-display">
                                <div className="sr-score-circle" style={{ borderColor: 'red', width: '80px', height: '80px' }}><span className="sr-score-val" style={{ color: 'red', fontSize: '1.5rem' }}>{assTotals.score}</span></div>
                                <div className="sr-score-percent" style={{ color: 'red' }}>{assTotals.pct}%</div>
                            </div>
                            <div className="sr-competency-section" style={{ marginTop: '1rem' }}>
                                <label className="sr-sidebar-label" style={{ color: 'red' }}>Final Competency</label>
                                <div className="sr-comp-toggles">
                                    <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')} disabled={!canGrade}><Award size={16} /> Competent (C)</button>
                                    <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')} disabled={!canGrade}><AlertCircle size={16} /> Not Yet Competent</button>
                                </div>
                            </div>
                            <div className="sr-overall-feedback">
                                <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
                                {canGrade ? (
                                    <textarea className="sr-textarea" rows={3} style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: canGrade ? 'red' : '#cbd5e1' }} placeholder={canGrade ? "Provide holistic feedback..." : "No remarks provided."} value={assOverallFeedback} disabled={!canGrade} onChange={e => handleAssOverallFeedbackChange(e.target.value)} />
                                ) : (
                                    <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', color: '#b91c1c', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #dc2626', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{assOverallFeedback || "No overall remarks provided."}</div>
                                )}
                            </div>
                            {(!canGrade && submission.grading?.gradedAt) && (
                                <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
                                    <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: 'red', textTransform: 'uppercase' }}>Assessor Signature</p>
                                    {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div style={{ height: '40px', fontStyle: 'italic', fontSize: '0.8rem', color: 'red' }}>No Canvas Signature</div>}
                                    <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: 'red' }}>{submission.grading?.assessorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'red' }}><Clock size={10} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
                                </div>
                            )}
                            {canGrade && <div className="sr-action-area"><button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving}>{saving ? 'Processing...' : 'Apply Signature & Finalise'}</button></div>}
                        </div>
                    )}

                    {/* MODERATOR */}
                    {showModeratorPanel && (
                        <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
                            <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>
                            {canModerate && <div className="sr-role-guide green"><Info size={16} /><div><strong>Quality Assurance Verification</strong><br />Your Green Pen verifies the Assessor's marking. You must verify every question. Use comments to instruct corrections before endorsing.</div></div>}
                            <div className="sr-score-display" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                                <div className="sr-score-circle" style={{ borderColor: 'green' }}><span className="sr-score-val" style={{ color: 'green' }}>{modTotals.score}</span><span className="sr-score-max" style={{ color: 'green' }}>/ {modTotals.max}</span></div>
                                <div className="sr-score-percent" style={{ color: 'green' }}>{modTotals.pct}%</div>
                            </div>
                            <div className="sr-competency-section">
                                <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderation Outcome</label>
                                <div className="sr-comp-toggles">
                                    <button className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`} onClick={() => handleModOutcomeSelect('Endorsed')} disabled={!canModerate}><ShieldCheck size={16} /> Endorse Grade</button>
                                    <button className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`} onClick={() => handleModOutcomeSelect('Returned')} disabled={!canModerate}><AlertCircle size={16} /> Return to Assessor</button>
                                </div>
                            </div>
                            <div className="sr-overall-feedback">
                                <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderator Feedback</label>
                                <textarea className="sr-textarea" rows={3} style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }} placeholder={canModerate ? "Notes for the assessor or internal QA..." : "No moderation feedback."} value={modFeedback} disabled={!canModerate} onChange={e => handleModFeedbackChange(e.target.value)} />
                            </div>
                            {(!canModerate && submission.moderation?.moderatedAt) && <div className="sr-audit-stamp" style={{ color: 'green', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}><CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Moderated by {submission.moderation?.moderatorName}</div>}
                            {canModerate && <div className="sr-action-area"><button className="sr-submit-btn" style={{ background: 'green' }} onClick={triggerSubmitModeration} disabled={saving}>{saving ? 'Processing...' : 'Finalise QA & Endorse'}</button></div>}
                        </div>
                    )}

                    {/* 🚀 OFFICIAL AUDIT TRAIL 🚀 */}
                    <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}><ShieldCheck size={18} color="#073f4e" /> Official Audit Trail</h3>

                        {(currentStatus === 'not_started') && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>}

                        {/* 🚀 REMEDIATION INTERVENTION CARD (Shows if coaching occurred for this attempt) 🚀 */}
                        {currentAttempt > 1 && submission.latestCoachingLog && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#b45309', margin: '0 0 8px 0', fontWeight: 'bold' }}>Developmental Intervention</p>

                                <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px dashed #fde68a' }}>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#92400e', fontWeight: 'bold', textTransform: 'uppercase' }}>Facilitator Logged</p>
                                    {facilitatorProfile?.signatureUrl ? (
                                        <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" />
                                    ) : (
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', color: '#b45309', fontStyle: 'italic', fontSize: '0.75rem' }}>No Canvas Signature</div>
                                    )}
                                    <p style={{ margin: '4px 0 2px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#78350f' }}>{submission.latestCoachingLog.facilitatorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={11} /> {new Date(submission.latestCoachingLog.date).toLocaleDateString()}
                                    </p>
                                </div>

                                <div>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#92400e', fontWeight: 'bold', textTransform: 'uppercase' }}>Learner Acknowledged</p>
                                    {submission.latestCoachingLog.acknowledged ? (
                                        <>
                                            {learnerProfile?.signatureUrl ? (
                                                <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
                                            ) : (
                                                <div style={{ height: '30px', display: 'flex', alignItems: 'center', color: '#b45309', fontStyle: 'italic', fontSize: '0.75rem' }}>No Canvas Signature</div>
                                            )}
                                            <p style={{ margin: '4px 0 2px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#78350f' }}>{learner?.fullName || learnerProfile?.fullName}</p>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={11} /> {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString()}
                                            </p>
                                        </>
                                    ) : (
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309', fontStyle: 'italic' }}>Pending learner acknowledgement</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Learner Record */}
                        {isSubmitted && submission.learnerDeclaration && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
                                {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</p>
                            </div>
                        )}

                        {/* Facilitator Audit Record */}
                        {isFacDone && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Facilitator Pre-Marking</p>
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'blue' }}>{submission.grading?.facilitatorName || 'Facilitator'}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
                                    {submission.grading?.facilitatorTimeSpent > 0 && (
                                        <>
                                            <span style={{ margin: '0 4px' }}>•</span>
                                            <Activity size={11} /> Active: {formatTimeSpent(submission.grading?.facilitatorTimeSpent)}
                                        </>
                                    )}
                                    {submission.grading?.facilitatorStartedAt && submission.grading?.facilitatorReviewedAt && (
                                        <>
                                            <span style={{ margin: '0 4px' }}>•</span>
                                            <Calendar size={11} /> Spread: {formatCalendarSpread(submission.grading.facilitatorStartedAt, submission.grading.facilitatorReviewedAt)}
                                        </>
                                    )}
                                </p>
                            </div>
                        )}

                        {/* Assessor Record */}
                        {isAssDone && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
                                {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</p>
                                <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
                                    {submission.grading?.assessorTimeSpent > 0 && (
                                        <>
                                            <span style={{ margin: '0 4px' }}>•</span>
                                            <Activity size={11} /> Active: {formatTimeSpent(submission.grading?.assessorTimeSpent)}
                                        </>
                                    )}
                                    {submission.grading?.assessorStartedAt && submission.grading?.gradedAt && (
                                        <>
                                            <span style={{ margin: '0 4px' }}>•</span>
                                            <Calendar size={11} /> Spread: {formatCalendarSpread(submission.grading.assessorStartedAt, submission.grading.gradedAt)}
                                        </>
                                    )}
                                </p>
                            </div>
                        )}

                        {/* Moderator Record */}
                        {isModDone && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation QA</p>
                                {moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</p>
                                <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Outcome: {submission.moderation?.outcome}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:MM') : 'Completed'}
                                    {submission.moderation?.timeSpent > 0 && (
                                        <>
                                            <span style={{ margin: '0 4px' }}>•</span>
                                            <Activity size={11} /> Active: {formatTimeSpent(submission.moderation?.timeSpent)}
                                        </>
                                    )}
                                    {submission.moderation?.moderatorStartedAt && submission.moderation?.moderatedAt && (
                                        <>
                                            <span style={{ margin: '0 4px' }}>•</span>
                                            <Calendar size={11} /> Spread: {formatCalendarSpread(submission.moderation.moderatorStartedAt, submission.moderation.moderatedAt)}
                                        </>
                                    )}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 🚀 ENFORCED 3-ATTEMPT REMEDIATION LOGIC 🚀 */}
                    {currentStatus === 'moderated' && submission.competency === 'NYC' && (
                        <div className="sr-summary-card" style={{ marginTop: '1.5rem', borderTop: isMaxAttempts ? '4px solid #ef4444' : '4px solid #f59e0b', background: isMaxAttempts ? '#fef2f2' : '#fffbeb' }}>
                            <h3 className="sr-summary-title" style={{ color: isMaxAttempts ? '#b91c1c' : '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {isMaxAttempts ? <ShieldAlert size={16} /> : <RotateCcw size={16} />}
                                {isMaxAttempts ? 'Maximum Attempts Reached' : 'Remediation Required'}
                            </h3>

                            <div style={{ background: isMaxAttempts ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)', border: `1px solid ${isMaxAttempts ? '#fca5a5' : '#fcd34d'}`, padding: '8px', borderRadius: '4px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', color: isMaxAttempts ? '#991b1b' : '#b45309', fontWeight: 'bold' }}>Current Attempt:</span>
                                <span style={{ fontSize: '0.9rem', color: isMaxAttempts ? '#7f1d1d' : '#92400e', fontWeight: 'bold' }}>{currentAttempt} of 3</span>
                            </div>

                            {isMaxAttempts ? (
                                <p style={{ fontSize: '0.85rem', color: '#b91c1c', margin: 0, lineHeight: 1.5 }}>
                                    This learner has exhausted all 3 permitted attempts and remains Not Yet Competent. Under QCTO compliance, this assessment is permanently locked. The learner must re-enroll in the module or lodge a formal appeal.
                                </p>
                            ) : (
                                (user?.role === 'facilitator' || user?.role === 'admin') ? (
                                    <>
                                        <p style={{ fontSize: '0.85rem', color: '#b45309', marginBottom: '1rem', lineHeight: 1.5 }}>
                                            This learner has been verified as Not Yet Competent. Ensure a coaching intervention has taken place before unlocking this workbook for their next attempt.
                                        </p>
                                        <button className="sr-submit-btn" style={{ background: '#d97706' }} onClick={() => setShowRemediationModal(true)} disabled={saving}>
                                            <RotateCcw size={16} /> Log Coaching & Unlock
                                        </button>
                                    </>
                                ) : (
                                    <p style={{ fontSize: '0.85rem', color: '#b45309', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                                        This assessment has been finalized as Not Yet Competent. The Facilitator has been notified to conduct a coaching intervention and initiate the remediation process for the next attempt.
                                    </p>
                                )
                            )}
                        </div>
                    )}

                    {/* 🚀 IMPORTED PAST ATTEMPTS ARCHIVE 🚀 */}
                    <PastAttemptsArchive historySnapshots={historySnapshots} assessment={assessment} />

                </aside>
            </div>
        </div>
    );
};

export default SubmissionReview;



// import React, { useState, useEffect, useRef } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { doc, getDoc, updateDoc, collection, setDoc } from 'firebase/firestore'; // 🚀 Added setDoc & collection for history
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import {
//     ArrowLeft, CheckCircle, AlertCircle, Save,
//     User, GraduationCap, Clock, Award, RotateCcw, // 🚀 Added RotateCcw
//     ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2, XCircle, AlertTriangle, Activity, Calendar, BarChart
// } from 'lucide-react';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// import './SubmissionReview.css';
// import { createPortal } from 'react-dom';
// import { TintedSignature } from '../FacilitatorProfileView/FacilitatorProfileView';
// import moment from 'moment';

// interface GradeData {
//     score: number;
//     feedback: string;
//     isCorrect?: boolean | null;
// }

// export type StatusType = 'info' | 'success' | 'error' | 'warning';

// // ─── STATUS MODAL COMPONENT ─────────────────────────────────────────────
// const StatusModal: React.FC<{
//     type: StatusType;
//     title: string;
//     message: string;
//     onClose: () => void;
//     onConfirm?: () => void;
//     confirmText?: string;
//     cancelText?: string;
// }> = ({ type, title, message, onClose, onConfirm, confirmText = "Okay", cancelText = "Cancel" }) => {

//     useEffect(() => {
//         const style = document.createElement('style');
//         style.innerHTML = `
//             body, html { overflow: hidden !important; }
//             .sr-root, .main-wrapper, .admin-content, .admin-layout, .sr-layout { overflow: hidden !important; }
//         `;
//         document.head.appendChild(style);
//         return () => {
//             document.head.removeChild(style);
//         };
//     }, []);

//     const styles = {
//         info: { color: '#3b82f6', Icon: Info },
//         success: { color: '#22c55e', Icon: CheckCircle },
//         error: { color: '#ef4444', Icon: XCircle },
//         warning: { color: '#f59e0b', Icon: AlertTriangle }
//     };

//     const { color, Icon } = styles[type];

//     const modalContent = (
//         <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(3px)' }}>
//             <div style={{ background: 'white', maxWidth: '400px', width: '90%', textAlign: 'center', padding: '2rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
//                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
//                     <Icon size={48} color={color} />
//                 </div>
//                 <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{title}</h2>
//                 <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem', fontSize: '0.9rem' }}>{message}</p>
//                 <div style={{ display: 'flex', gap: '1rem' }}>
//                     {onConfirm && (
//                         <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
//                             {cancelText}
//                         </button>
//                     )}
//                     <button onClick={onConfirm || onClose} style={{ flex: 1, padding: '0.75rem', background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
//                         {confirmText}
//                     </button>
//                 </div>
//             </div>
//         </div>
//     );

//     return createPortal(modalContent, document.body);
// };

// export const SubmissionReview: React.FC = () => {
//     const { submissionId } = useParams<{ submissionId: string }>();
//     const navigate = useNavigate();
//     const { user } = useStore();
//     const toast = useToast();

//     const [loading, setLoading] = useState(true);
//     const [saving, setSaving] = useState(false);

//     const [submission, setSubmission] = useState<any>(null);
//     const [assessment, setAssessment] = useState<any>(null);
//     const [learner, setLearner] = useState<any>(null);

//     const [learnerProfile, setLearnerProfile] = useState<any>(null);
//     const [assessorProfile, setAssessorProfile] = useState<any>(null);
//     const [moderatorProfile, setModeratorProfile] = useState<any>(null);

//     const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
//     const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});
//     const [modBreakdown, setModBreakdown] = useState<Record<string, GradeData>>({});

//     const [facOverallFeedback, setFacOverallFeedback] = useState('');
//     const [assOverallFeedback, setAssOverallFeedback] = useState('');
//     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

//     const [modFeedback, setModFeedback] = useState('');
//     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

//     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm?: () => void; confirmText?: string; cancelText?: string } | null>(null);
//     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

//     const sessionStartRef = useRef<number>(performance.now());
//     const initialFacTimeRef = useRef<number>(0);
//     const initialAssTimeRef = useRef<number>(0);
//     const initialModTimeRef = useRef<number>(0);

//     const currentStatus = String(submission?.status || '').toLowerCase();

//     // STRICT ROLE DEFINITIONS
//     const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
//     const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
//     const isModerator = user?.role === 'moderator' || user?.role === 'admin';

//     const canFacilitatorMark = isFacilitator && currentStatus === 'submitted';
//     const canGrade = isAssessor && (currentStatus === 'facilitator_reviewed' || currentStatus === 'returned');
//     const canModerate = isModerator && currentStatus === 'graded';

//     // DYNAMIC SIDEBAR VISIBILITY
//     const showAssessorLayer = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
//     const showModeratorLayer = ['graded', 'moderated', 'returned'].includes(currentStatus);

//     useEffect(() => {
//         const loadReviewData = async () => {
//             if (!submissionId) return;
//             try {
//                 const subRef = doc(db, 'learner_submissions', submissionId);
//                 const subSnap = await getDoc(subRef);
//                 if (!subSnap.exists()) throw new Error("Submission not found");
//                 const subData = subSnap.data();
//                 setSubmission({ id: subSnap.id, ...subData });

//                 const assRef = doc(db, 'assessments', subData.assessmentId);
//                 const assSnap = await getDoc(assRef);
//                 if (!assSnap.exists()) throw new Error("Assessment template missing");
//                 const assData = assSnap.data();
//                 setAssessment(assData);

//                 const learnerRef = doc(db, 'learners', subData.learnerId);
//                 const learnerSnap = await getDoc(learnerRef);
//                 let learnerAuthUid = null;
//                 if (learnerSnap.exists()) {
//                     const lData = learnerSnap.data();
//                     setLearner(lData);
//                     learnerAuthUid = lData.authUid;
//                 }

//                 const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || learnerAuthUid || subData.learnerId;
//                 if (targetLearnerUid) {
//                     const lProfSnap = await getDoc(doc(db, 'users', targetLearnerUid));
//                     if (lProfSnap.exists()) setLearnerProfile(lProfSnap.data());
//                 }

//                 if (subData.grading?.gradedBy) {
//                     const assProfRef = doc(db, 'users', subData.grading.gradedBy);
//                     const assProfSnap = await getDoc(assProfRef);
//                     if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
//                 }

//                 if (subData.moderation?.moderatedBy) {
//                     const modProfRef = doc(db, 'users', subData.moderation.moderatedBy);
//                     const modProfSnap = await getDoc(modProfRef);
//                     if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
//                 }

//                 initialFacTimeRef.current = subData.grading?.facilitatorTimeSpent || 0;
//                 initialAssTimeRef.current = subData.grading?.assessorTimeSpent || 0;
//                 initialModTimeRef.current = subData.moderation?.timeSpent || 0;
//                 sessionStartRef.current = performance.now();

//                 let fBreakdown = subData.grading?.facilitatorBreakdown;
//                 let aBreakdown = subData.grading?.assessorBreakdown;
//                 let mBreakdown = subData.moderation?.breakdown;

//                 const dbStatus = String(subData.status || '').toLowerCase();

//                 const generateFreshBreakdown = (includeFeedback: boolean) => {
//                     const fresh: Record<string, GradeData> = {};
//                     assData.blocks?.forEach((block: any) => {
//                         if (block.type === 'mcq') {
//                             const isCorrect = subData.answers?.[block.id] === block.correctOption;
//                             fresh[block.id] = {
//                                 score: isCorrect ? (block.marks || 0) : 0,
//                                 feedback: includeFeedback ? (isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect') : '',
//                                 isCorrect
//                             };
//                         } else if (block.type === 'text') {
//                             fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
//                         }
//                     });
//                     return fresh;
//                 };

//                 // 1. Facilitator Layer
//                 if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
//                     if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) {
//                         fBreakdown = subData.grading.breakdown;
//                     } else {
//                         fBreakdown = generateFreshBreakdown(true);
//                     }
//                 }
//                 setFacBreakdown(fBreakdown);

//                 // 2. Assessor Layer
//                 if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
//                     if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(dbStatus)) {
//                         aBreakdown = generateFreshBreakdown(false);
//                     } else {
//                         aBreakdown = {};
//                     }
//                 }
//                 setAssBreakdown(aBreakdown);

//                 // 3. Moderator Layer
//                 if (!mBreakdown || Object.keys(mBreakdown).length === 0) {
//                     if (['graded', 'moderated', 'returned'].includes(dbStatus)) {
//                         mBreakdown = generateFreshBreakdown(false);
//                     } else {
//                         mBreakdown = {};
//                     }
//                 }
//                 setModBreakdown(mBreakdown);

//                 setFacOverallFeedback(subData.grading?.facilitatorOverallFeedback || '');
//                 setAssOverallFeedback(subData.grading?.assessorOverallFeedback || subData.grading?.overallFeedback || '');

//                 setCompetency(subData.competency || null);
//                 setModFeedback(subData.moderation?.feedback || '');
//                 setModOutcome(subData.moderation?.outcome || null);

//             } catch (err: any) {
//                 toast.error(err.message || "Failed to load data.");
//             } finally {
//                 setLoading(false);
//             }
//         };
//         loadReviewData();
//     }, [submissionId]);

//     const getFacTime = () => initialFacTimeRef.current + (canFacilitatorMark ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
//     const getAssTime = () => initialAssTimeRef.current + (canGrade ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
//     const getModTime = () => initialModTimeRef.current + (canModerate ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);

//     const formatTimeSpent = (seconds?: number) => {
//         if (seconds === undefined || seconds === null) return '—';
//         const m = Math.floor(seconds / 60);
//         if (m === 0) return '< 1m';
//         const h = Math.floor(m / 60);
//         if (h > 0) {
//             const remM = m % 60;
//             return `${h}h ${remM}m`;
//         }
//         return `${m}m`;
//     };

//     const formatCalendarSpread = (startStr?: string, endStr?: string) => {
//         if (!startStr || !endStr) return null;
//         const start = new Date(startStr).getTime();
//         const end = new Date(endStr).getTime();
//         const diffHours = (end - start) / (1000 * 60 * 60);

//         if (diffHours < 24) {
//             if (diffHours < 1) return '< 1 hr spread';
//             return `${Math.floor(diffHours)} hr spread`;
//         }
//         return `${Math.floor(diffHours / 24)} day spread`;
//     };

//     const triggerAutoSave = (fBreak: any, aBreak: any, mBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
//         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

//         setSaving(true);
//         saveTimeoutRef.current = setTimeout(async () => {
//             if (!submission?.id) return;
//             try {
//                 const updatePayload: any = {
//                     'grading.facilitatorBreakdown': fBreak,
//                     'grading.assessorBreakdown': aBreak,
//                     'moderation.breakdown': mBreak,
//                     'grading.facilitatorOverallFeedback': fOverall,
//                     'grading.assessorOverallFeedback': aOverall,
//                     'moderation.feedback': updatedModFeedback,
//                     lastStaffEditAt: new Date().toISOString()
//                 };

//                 if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
//                 if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

//                 if (canFacilitatorMark) updatePayload['grading.facilitatorTimeSpent'] = getFacTime();
//                 if (canGrade) updatePayload['grading.assessorTimeSpent'] = getAssTime();
//                 if (canModerate) updatePayload['moderation.timeSpent'] = getModTime();

//                 const nowIso = new Date().toISOString();
//                 if (canFacilitatorMark && !submission.grading?.facilitatorStartedAt) {
//                     updatePayload['grading.facilitatorStartedAt'] = nowIso;
//                     setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, facilitatorStartedAt: nowIso } }));
//                 }
//                 if (canGrade && !submission.grading?.assessorStartedAt) {
//                     updatePayload['grading.assessorStartedAt'] = nowIso;
//                     setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, assessorStartedAt: nowIso } }));
//                 }
//                 if (canModerate && !submission.moderation?.moderatorStartedAt) {
//                     updatePayload['moderation.moderatorStartedAt'] = nowIso;
//                     setSubmission((prev: any) => ({ ...prev, moderation: { ...prev.moderation, moderatorStartedAt: nowIso } }));
//                 }

//                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
//             } catch (error) {
//                 console.error("Auto-save failed:", error);
//             } finally {
//                 setSaving(false);
//             }
//         }, 1500);
//     };

//     const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
//         if (canFacilitatorMark) {
//             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
//             setFacBreakdown(next);
//             triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         } else if (canGrade) {
//             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
//             setAssBreakdown(next);
//             triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         } else if (canModerate) {
//             const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
//             setModBreakdown(next);
//             triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         }
//     };

//     const handleScoreChange = (blockId: string, score: number, max: number) => {
//         const val = Math.min(Math.max(0, score), max);
//         if (canFacilitatorMark) {
//             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], score: val } };
//             setFacBreakdown(next);
//             triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         } else if (canGrade) {
//             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], score: val } };
//             setAssBreakdown(next);
//             triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         } else if (canModerate) {
//             const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], score: val } };
//             setModBreakdown(next);
//             triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         }
//     };

//     const handleFeedbackChange = (blockId: string, feedback: string) => {
//         if (canFacilitatorMark) {
//             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], feedback } };
//             setFacBreakdown(next);
//             triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         } else if (canGrade) {
//             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], feedback } };
//             setAssBreakdown(next);
//             triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         } else if (canModerate) {
//             const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], feedback } };
//             setModBreakdown(next);
//             triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         }
//     };

//     const handleFacOverallFeedbackChange = (val: string) => {
//         if (!canFacilitatorMark) return;
//         setFacOverallFeedback(val);
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome);
//     };

//     const handleAssOverallFeedbackChange = (val: string) => {
//         if (!canGrade) return;
//         setAssOverallFeedback(val);
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome);
//     };

//     const handleModFeedbackChange = (val: string) => {
//         if (!canModerate) return;
//         setModFeedback(val);
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome);
//     };

//     const handleCompetencySelect = (val: 'C' | 'NYC') => {
//         if (!canGrade) return;
//         setCompetency(val);
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome);
//     };

//     const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
//         if (!canModerate) return;
//         setModOutcome(val);
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val);
//     };

//     // 🚀 NEW: REMEDIATION WORKFLOW
//     const triggerRemediation = () => {
//         setModalConfig({
//             isOpen: true,
//             type: 'warning',
//             title: 'Request Remediation?',
//             message: 'This will archive the current failed attempt for audit purposes, and unlock the workbook for the learner to correct their answers and resubmit.',
//             confirmText: 'Unlock & Allow Resubmission',
//             onConfirm: async () => {
//                 setModalConfig(null);
//                 setSaving(true);
//                 try {
//                     // 1. Create a Snapshot in a sub-collection for the EV Auditor
//                     const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
//                     await setDoc(historyRef, {
//                         ...submission,
//                         archivedAt: new Date().toISOString(),
//                         snapshotReason: 'Remediation requested after NYC outcome'
//                     });

//                     // 2. Reset the main submission back to the Learner
//                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         status: 'in_progress',
//                         competency: null,
//                         'moderation.outcome': null,
//                         attemptNumber: (submission.attemptNumber || 1) + 1,
//                         lastStaffEditAt: new Date().toISOString()
//                     });

//                     toast.success("Workbook unlocked for remediation!");
//                     setTimeout(() => window.location.reload(), 1500);
//                 } catch (err) {
//                     console.error("Remediation error:", err);
//                     toast.error("Failed to unlock for remediation.");
//                 } finally {
//                     setSaving(false);
//                 }
//             }
//         });
//     };

//     const getTotals = (breakdown: Record<string, GradeData>) => {
//         const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
//         const max = assessment?.totalMarks || 0;
//         const pct = max > 0 ? Math.round((score / max) * 100) : 0;
//         return { score, max, pct };
//     };

//     const facTotals = getTotals(facBreakdown);
//     const assTotals = getTotals(assBreakdown);
//     const modTotals = getTotals(modBreakdown);

//     let activeTotals = facTotals;
//     if (showAssessorLayer) activeTotals = assTotals;
//     if (showModeratorLayer) activeTotals = modTotals;

//     // ─── HELPER: CALCULATE SECTION TOTALS ───
//     const sectionTotals: Record<string, { total: number, awarded: number }> = {};
//     let currentSectionId = '';
//     if (assessment?.blocks) {
//         assessment.blocks.forEach((block: any) => {
//             if (block.type === 'section') {
//                 currentSectionId = block.id;
//                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
//             } else if ((block.type === 'mcq' || block.type === 'text') && currentSectionId) {

//                 const g = submission?.grading || {};
//                 const m = submission?.moderation || {};
//                 const mLayer = m.breakdown?.[block.id] || {};
//                 const aLayer = g.assessorBreakdown?.[block.id] || {};
//                 const fLayer = g.facilitatorBreakdown?.[block.id] || {};
//                 const legacyLayer = g.breakdown?.[block.id] || { score: 0, isCorrect: null };

//                 let activeLayer = legacyLayer;
//                 if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus)) activeLayer = fLayer;
//                 if (['graded', 'moderated'].includes(currentStatus)) activeLayer = aLayer;
//                 if (currentStatus === 'moderated') activeLayer = mLayer;

//                 sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
//                 if (activeLayer.score !== undefined && activeLayer.score !== null) {
//                     sectionTotals[currentSectionId].awarded += Number(activeLayer.score);
//                 }
//             }
//         });
//     }

//     const validateAllMarked = (breakdown: Record<string, GradeData>) => {
//         if (!assessment?.blocks) return true;
//         const unmarkedCount = assessment.blocks.filter((block: any) => {
//             if (block.type !== 'mcq' && block.type !== 'text') return false;
//             const grade = breakdown[block.id];
//             return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
//         }).length;
//         return unmarkedCount === 0;
//     };

//     const triggerSubmitFacilitator = () => {
//         if (!validateAllMarked(facBreakdown)) {
//             setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Marking', message: 'You must evaluate every question. Please ensure every question has a Green Tick or Red Cross selected before submitting.', confirmText: 'Got it' });
//             return;
//         }
//         if (!facOverallFeedback.trim()) {
//             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Overall Facilitator Remarks before sending this script to the Assessor.', confirmText: 'Got it' });
//             return;
//         }

//         setModalConfig({
//             isOpen: true, type: 'info', title: 'Complete Pre-Marking?',
//             message: 'This will finalize your Blue Pen feedback and send the workbook to the Assessor for official grading.',
//             confirmText: 'Send to Assessor',
//             onConfirm: async () => {
//                 setModalConfig(null); setSaving(true);
//                 try {
//                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         status: 'facilitator_reviewed',
//                         'grading.facilitatorBreakdown': facBreakdown,
//                         'grading.facilitatorOverallFeedback': facOverallFeedback,
//                         'grading.facilitatorId': user?.uid,
//                         'grading.facilitatorName': user?.fullName,
//                         'grading.facilitatorReviewedAt': new Date().toISOString(),
//                         'grading.facilitatorTimeSpent': getFacTime()
//                     });
//                     toast.success("Script marked and passed to Assessor!");
//                     setTimeout(() => navigate(-1), 2000);
//                 } catch (error) { toast.error("Failed to save marking."); } finally { setSaving(false); }
//             }
//         });
//     };

//     const triggerSubmitGrade = () => {
//         if (!validateAllMarked(assBreakdown)) {
//             setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Grading', message: 'You must evaluate every question. Please ensure every question has a Tick or Cross selected before submitting your final grade.', confirmText: 'Got it' });
//             return;
//         }
//         if (!competency) {
//             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a Final Competency (C or NYC) before submitting.', confirmText: 'Got it' });
//             return;
//         }
//         if (!assOverallFeedback.trim()) {
//             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Assessor Remarks justifying your final outcome before submitting.', confirmText: 'Got it' });
//             return;
//         }

//         setModalConfig({
//             isOpen: true, type: 'warning', title: 'Finalise Grade?',
//             message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.',
//             confirmText: 'Apply Signature & Submit',
//             onConfirm: async () => {
//                 setModalConfig(null); setSaving(true);
//                 try {
//                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         status: 'graded',
//                         marks: assTotals.score,
//                         competency: competency,
//                         'grading.assessorBreakdown': assBreakdown,
//                         'grading.assessorOverallFeedback': assOverallFeedback,
//                         'grading.gradedBy': user?.uid,
//                         'grading.assessorName': user?.fullName,
//                         'grading.assessorRegNumber': user?.assessorRegNumber || 'Pending Reg',
//                         'grading.gradedAt': new Date().toISOString(),
//                         'grading.assessorTimeSpent': getAssTime()
//                     });
//                     toast.success("Workbook graded and signed successfully!");
//                     setTimeout(() => window.location.reload(), 500);
//                 } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
//             }
//         });
//     };

//     const triggerSubmitModeration = () => {
//         if (!validateAllMarked(modBreakdown)) {
//             setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete QA', message: 'You must verify every question with a Green Tick or Cross to confirm the Assessor’s marks before endorsing.', confirmText: 'Got it' });
//             return;
//         }
//         if (!modOutcome) {
//             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Outcome', message: 'You must select a Moderation Outcome (Endorsed or Returned) before submitting.', confirmText: 'Got it' });
//             return;
//         }
//         if (!modFeedback.trim()) {
//             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Feedback', message: 'You must provide Moderator Feedback explaining your decision.', confirmText: 'Got it' });
//             return;
//         }

//         setModalConfig({
//             isOpen: true, type: 'info', title: 'Finalise Moderation?',
//             message: modOutcome === 'Returned' ? 'This will return the workbook to the Assessor for remediation.' : 'This will apply your Green Pen signature and endorse the final grade.',
//             confirmText: 'Confirm Moderation',
//             onConfirm: async () => {
//                 setModalConfig(null); setSaving(true);
//                 try {
//                     const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
//                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         status: newStatus,
//                         'moderation.breakdown': modBreakdown,
//                         'moderation.outcome': modOutcome,
//                         'moderation.feedback': modFeedback,
//                         'moderation.moderatedBy': user?.uid,
//                         'moderation.moderatorName': user?.fullName,
//                         'moderation.moderatorRegNumber': user?.assessorRegNumber || 'Pending Reg',
//                         'moderation.moderatedAt': new Date().toISOString(),
//                         'moderation.timeSpent': getModTime()
//                     });
//                     toast.success("Moderation saved successfully!");
//                     setTimeout(() => navigate(-1), 1000);
//                 } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
//             }
//         });
//     };

//     if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
//     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

//     const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');
//     const printInkColor = showModeratorLayer ? 'green' : (showAssessorLayer ? 'red' : 'blue');

//     const canPrint = !['not_started', 'in_progress'].includes(currentStatus);

//     // ─── HELPER: Render Blocks ───
//     const renderBlocks = (isPrintMode: boolean) => {

//         const isFacDone = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
//         const isAssDone = ['graded', 'moderated', 'returned'].includes(currentStatus);
//         const isModDone = ['moderated'].includes(currentStatus);

//         return assessment.blocks?.map((block: any, idx: number) => {
//             if (block.type === 'section') {
//                 const totals = sectionTotals[block.id];
//                 return (
//                     <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-section-title-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
//                         <h2 className="sr-section-title" style={{ color: '#073f4e', margin: 0, border: 'none', padding: 0 }}>{block.title}</h2>
//                         {['graded', 'moderated'].includes(currentStatus) && totals && totals.total > 0 && (
//                             <span className="no-print" style={{ fontSize: '0.8rem', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px', fontWeight: 'bold' }}>
//                                 <BarChart size={14} /> {totals.awarded}/{totals.total}
//                             </span>
//                         )}
//                     </div>
//                 );
//             }

//             if (block.type === 'mcq' || block.type === 'text') {
//                 const learnerAns = submission.answers?.[block.id];
//                 const maxM = block.marks || 0;
//                 const isMCQ = block.type === 'mcq';

//                 const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
//                 const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
//                 const mData = modBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };

//                 let activeInkColor = 'blue';
//                 let activeData = fData;
//                 let isActiveRole = false;

//                 if (canFacilitatorMark) { activeInkColor = 'blue'; activeData = fData; isActiveRole = true; }
//                 else if (canGrade) { activeInkColor = 'red'; activeData = aData; isActiveRole = true; }
//                 else if (canModerate) { activeInkColor = 'green'; activeData = mData; isActiveRole = true; }
//                 else {
//                     if (currentStatus === 'moderated') { activeInkColor = 'green'; activeData = mData; }
//                     else if (['graded', 'returned'].includes(currentStatus)) { activeInkColor = 'red'; activeData = aData; }
//                     else { activeInkColor = 'blue'; activeData = fData; }
//                 }

//                 const renderFacTick = isFacDone && fData.isCorrect !== null && fData.isCorrect !== undefined;
//                 const renderAssTick = isAssDone && aData.isCorrect !== null && aData.isCorrect !== undefined;
//                 const renderModTick = isModDone && mData.isCorrect !== null && mData.isCorrect !== undefined;

//                 const renderFacReadOnly = isFacDone && !canFacilitatorMark && (fData.score > 0 || fData.feedback || fData.isCorrect !== null);
//                 const renderAssReadOnly = isAssDone && !canGrade && (aData.score > 0 || aData.feedback || aData.isCorrect !== null);
//                 const renderModReadOnly = isModDone && !canModerate && (mData.score > 0 || mData.feedback || mData.isCorrect !== null);

//                 return (
//                     <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
//                         <div className="sr-q-header">
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                 <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
//                                 <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>

//                                 <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
//                                     {renderFacTick && (
//                                         <span title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 4px', borderRadius: '4px' }}>
//                                             {fData.isCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}
//                                         </span>
//                                     )}
//                                     {renderAssTick && (
//                                         <span title="Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 4px', borderRadius: '4px' }}>
//                                             {aData.isCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}
//                                         </span>
//                                     )}
//                                     {renderModTick && (
//                                         <span title="Internal Moderation QA" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 4px', borderRadius: '4px' }}>
//                                             {mData.isCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}
//                                         </span>
//                                     )}
//                                 </div>
//                             </div>

//                             {!isPrintMode && isActiveRole && (
//                                 <div className="sr-visual-mark">
//                                     <button
//                                         onClick={() => handleVisualMark(block.id, true, maxM)}
//                                         disabled={!isActiveRole}
//                                         className="sr-mark-btn"
//                                         style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
//                                         title="Mark Correct"
//                                     >
//                                         <Check size={20} />
//                                     </button>
//                                     <button
//                                         onClick={() => handleVisualMark(block.id, false, maxM)}
//                                         disabled={!isActiveRole}
//                                         className="sr-mark-btn"
//                                         style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
//                                         title="Mark Incorrect"
//                                     >
//                                         <X size={20} />
//                                     </button>
//                                 </div>
//                             )}
//                         </div>

//                         <div className="sr-q-body">
//                             <div className="sr-answer-box">
//                                 <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
//                                 {isMCQ ? (
//                                     <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
//                                         <span style={{ color: 'black' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
//                                         {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
//                                     </div>
//                                 ) : (
//                                     <div className="sr-text-ans">
//                                         {learnerAns ? <div className="quill-read-only-content" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: learnerAns }} /> : <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>}
//                                     </div>
//                                 )}
//                                 {isMCQ && <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong></div>}
//                             </div>

//                             {/* 🚀 READ-ONLY BLOCKS */}
//                             {renderFacReadOnly && (
//                                 <div className="sr-read-only-feedback" style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
//                                     <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Info size={13} /> Facilitator Pre-Mark</div>
//                                     <div style={{ color: '#0369a1', fontSize: '0.85rem' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{fData.score ?? 0}/{maxM}]</span> {fData.feedback || <em style={{ opacity: 0.7 }}>No specific coaching provided.</em>}</div>
//                                 </div>
//                             )}

//                             {renderAssReadOnly && (
//                                 <div className="sr-read-only-feedback" style={{ background: '#fef2f2', borderLeft: '3px solid #ef4444', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
//                                     <div style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Award size={13} /> Assessor Grade</div>
//                                     <div style={{ color: '#991b1b', fontSize: '0.85rem' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{aData.score ?? 0}/{maxM}]</span> {aData.feedback || <em style={{ opacity: 0.7 }}>No specific feedback provided.</em>}</div>
//                                 </div>
//                             )}

//                             {renderModReadOnly && (
//                                 <div className="sr-read-only-feedback" style={{ background: '#f0fdf4', borderLeft: '3px solid #22c55e', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
//                                     <div style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><ShieldCheck size={13} /> Moderator QA</div>
//                                     <div style={{ color: '#16a34a', fontSize: '0.85rem' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{mData.score ?? 0}/{maxM}]</span> {mData.feedback || <em style={{ opacity: 0.7 }}>No QA feedback provided.</em>}</div>
//                                 </div>
//                             )}

//                             {/* 🚀 ACTIVE GRADING INPUTS */}
//                             {(!isPrintMode && isActiveRole) && (
//                                 <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderRadius: '6px' }}>
//                                     <div className="sr-score-input-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
//                                         <label style={{ color: activeInkColor, fontWeight: 'bold', fontSize: '0.85rem' }}>Marks Awarded:</label>
//                                         <input type="number" className="sr-score-input" style={{ color: activeInkColor, width: '60px', padding: '4px 8px', border: `1px solid ${activeInkColor}`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }} value={activeData.score ?? 0} onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)} />
//                                         <span style={{ color: activeInkColor, fontWeight: 'bold' }}>/ {maxM}</span>
//                                     </div>
//                                     <div className="sr-feedback-wrap" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
//                                         <Edit3 size={16} color={activeInkColor} style={{ marginTop: '6px' }} />
//                                         <textarea className="sr-feedback-input" rows={2} style={{ width: '100%', color: activeInkColor, fontStyle: 'italic', fontWeight: 500, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }} placeholder={canModerate ? "Moderator Green Pen QA Notes..." : canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."} value={activeData.feedback || ''} onChange={e => handleFeedbackChange(block.id, e.target.value)} />
//                                     </div>
//                                 </div>
//                             )}

//                         </div>
//                     </div>
//                 );
//             }
//             return null;
//         });
//     };

//     return (
//         <div className="sr-root animate-fade-in" style={{ width: '100%', position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {modalConfig && (
//                 <StatusModal
//                     type={modalConfig.type} title={modalConfig.title} message={modalConfig.message}
//                     onConfirm={modalConfig.onConfirm} confirmText={modalConfig.confirmText}
//                     cancelText={modalConfig.cancelText} onClose={() => setModalConfig(null)}
//                 />
//             )}

//             <div className="ap-player-topbar no-print">
//                 <div className="ap-player-topbar__left">
//                     <button className="sr-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={13} /> Portfolio</button>
//                     <div className="ap-player-topbar__separator" />
//                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
//                 </div>
//                 <div className="ap-player-topbar__right">
//                     {canPrint && (
//                         <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
//                             <Printer size={13} /> Print Audit
//                         </button>
//                     )}
//                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
//                         {saving ? <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</> : <><CheckCircle size={12} /> Auto-saved</>}
//                     </span>
//                 </div>
//             </div>

//             <div className="sr-print-wrap">

//                 {/* Cover pages (print only) */}
//                 <div className="print-only-cover">
//                     {/* Cover page 1 */}
//                     <div className="print-page">
//                         <h1 style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: '10px' }}>
//                             {assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}
//                         </h1>
//                         <h2 style={{ textAlign: 'center', marginBottom: '8mm', textDecoration: 'underline' }}>
//                             LEARNER WORKBOOK
//                         </h2>
//                         <table className="print-table" style={{ width: '100%', marginBottom: '8mm' }}>
//                             <tbody>
//                                 <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Module #</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Notional hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Credit(s)</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
//                             </tbody>
//                         </table>
//                         <h3>CONTACT INFORMATION:</h3>
//                         <table className="print-table" style={{ width: '100%' }}>
//                             <tbody>
//                                 <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName || '________________________'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || learner?.email || '________________________'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Telephone (W)</td><td>{learnerProfile?.telephoneWork || '________________________'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
//                             </tbody>
//                         </table>
//                     </div>

//                     {/* Cover page 2 */}
//                     <div className="print-page">
//                         <h3>Note to the learner</h3>
//                         <p>{assessment?.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
//                         <h3>Purpose</h3>
//                         <p>{assessment?.purpose || 'The main focus of the learning in this knowledge module is to build an understanding of the concepts related to this subject matter.'}</p>
//                         <h3>Topic elements to be covered include</h3>
//                         <table className="print-table no-border" style={{ width: '100%' }}>
//                             <tbody>
//                                 {assessment?.moduleInfo?.topics && assessment.moduleInfo.topics.length > 0
//                                     ? assessment.moduleInfo.topics.map((topic: any, idx: number) => (
//                                         <tr key={idx}>
//                                             <td>{topic.code ? <strong>{topic.code}: </strong> : ''}{topic.title || topic.name}</td>
//                                             <td style={{ width: '15%' }}>{topic.weight || topic.percentage}%</td>
//                                         </tr>
//                                     ))
//                                     : assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
//                                         const secTotal = sectionTotals[sec.id]?.total || 0;
//                                         const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
//                                         return (
//                                             <tr key={idx}>
//                                                 <td><strong>Section {idx + 1}: </strong>{sec.title}</td>
//                                                 <td style={{ width: '15%' }}>{secTotal > 0 ? `${pct}%` : '—'}</td>
//                                             </tr>
//                                         );
//                                     })
//                                 }
//                             </tbody>
//                         </table>
//                     </div>

//                     {/* Cover page 3 */}
//                     <div className="print-page">
//                         <h3>Entry Requirements</h3>
//                         <p>{assessment?.moduleInfo?.entryRequirements || `NQF Level ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}</p>
//                         <h3>Provider Accreditation Requirements</h3>
//                         <p><strong>Physical Requirements:</strong><br />{assessment?.moduleInfo?.physicalRequirements || 'The provider must have structured learning material.'}</p>
//                         <h3>Human Resource Requirements</h3>
//                         <ul>
//                             <li>Lecturer/learner ratio of {assessment?.moduleInfo?.lecturerRatio || '1:20'} (Maximum)</li>
//                             <li>Assessors and moderators: accredited by the relevant SETA</li>
//                         </ul>
//                         <h3>Exemptions</h3>
//                         <p>{assessment?.moduleInfo?.exemptions || 'No exemptions, but the module can be achieved in full through a normal RPL process.'}</p>
//                         <h3>Venue, Date and Time</h3>
//                         <p><strong>Venue:</strong> {assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform'}</p>
//                         <p><strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}</p>
//                     </div>

//                 </div>{/* end .print-only-cover */}

//                 {/* ── Audit header (score summary + signatures) ── */}
//                 <div className="sr-print-header">
//                     <div className="sr-print-header-info">
//                         <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
//                             <div>
//                                 <p><strong>Learner Name:</strong> {learner?.fullName}</p>
//                                 <p><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
//                                 <p><strong>Submitted:</strong> {new Date(submission.submittedAt).toLocaleDateString()}</p>
//                             </div>
//                             <div>
//                                 <p><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
//                                 <p><strong>Score:</strong> <span style={{ color: printInkColor, fontWeight: 'bold' }}>{activeTotals.score} / {activeTotals.max} ({activeTotals.pct}%)</span></p>
//                                 <p><strong>Outcome:</strong> <span style={{ color: printOutcomeColor, fontWeight: 'bold' }}>{submission.competency === 'C' ? 'Competent (C)' : submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending'}</span></p>

//                             </div>
//                         </div>
//                     </div>

//                 </div>{/* end .sr-print-header */}

//                 {/* ── Question blocks (Print Version) ── */}
//                 <div className="sr-blocks">
//                     {renderBlocks(true)}
//                 </div>

//                 <div className="sr-signature-block">
//                     {/* Learner Signature - Always Show (Since they submitted it) */}
//                     <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black' }}>
//                         <span style={{ color: 'black' }}>Learner Declaration</span>
//                         {learnerProfile?.signatureUrl
//                             ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
//                             : <div className="sr-sig-no-image" style={{ color: 'black' }}>No Canvas Signature</div>
//                         }
//                         <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
//                         <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
//                         <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
//                     </div>

//                     <div className="sr-sig-box" style={{ borderColor: 'red', color: 'red' }}>
//                         <span style={{ color: 'red' }}>Assessor Sign-off</span>
//                         {submission.grading?.gradedAt ? (
//                             <>
//                                 {assessorProfile?.signatureUrl
//                                     ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
//                                     : <div className="sr-sig-no-image" style={{ color: 'red' }}>No Canvas Signature</div>
//                                 }
//                                 <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
//                                 <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
//                                 <em style={{ color: 'red' }}>Signed: {new Date(submission.grading.gradedAt).toLocaleDateString()}</em>
//                                 <div className="sr-sig-line" style={{ borderTopColor: 'red' }}>Digital Signature Confirmed</div>
//                             </>
//                         ) : (
//                             <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
//                                 <div className="sr-sig-no-image" style={{ color: 'red', border: 'none' }}>Pending Signature</div>
//                                 <div className="sr-sig-line" style={{ borderTopColor: 'red', width: '80%', marginTop: '10px' }}>Awaiting Assessment</div>
//                             </div>
//                         )}
//                     </div>

//                     <div className="sr-sig-box" style={{ borderColor: 'green', color: 'green' }}>
//                         <span style={{ color: 'green' }}>Internal Moderation</span>
//                         {submission.moderation?.moderatedAt ? (
//                             <>
//                                 {moderatorProfile?.signatureUrl
//                                     ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
//                                     : <div className="sr-sig-no-image" style={{ color: 'green' }}>No Canvas Signature</div>
//                                 }
//                                 <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
//                                 <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
//                                 <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString()}</em>
//                                 <div className="sr-sig-line" style={{ borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
//                             </>
//                         ) : (
//                             <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
//                                 <div className="sr-sig-no-image" style={{ color: 'green', border: 'none' }}>Pending Signature</div>
//                                 <div className="sr-sig-line" style={{ borderTopColor: 'green', width: '80%', marginTop: '10px' }}>Awaiting Moderation</div>
//                             </div>
//                         )}
//                     </div>
//                 </div>

//             </div>{/* end .sr-print-wrap */}

//             {/* ══════════════════════════════════════════════════════════════════
//                 SCREEN LAYOUT — hidden in print
//             ══════════════════════════════════════════════════════════════════ */}
//             <div className="sr-layout no-print">
//                 <div className="sr-content-pane">
//                     {/* ── Question blocks (Screen Version) ── */}
//                     <div className="sr-blocks">
//                         {renderBlocks(false)}
//                     </div>
//                 </div>

//                 {/* ── RIGHT PANE ── */}
//                 <aside className="sr-sidebar no-print">
//                     {/* FACILITATOR */}
//                     {(canFacilitatorMark || showAssessorLayer) ? (
//                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
//                             <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>
//                             {canFacilitatorMark && (
//                                 <div className="sr-role-guide blue"><Info size={16} /><div><strong>Formative Feedback</strong><br />Use your Blue Pen to provide developmental feedback.</div></div>
//                             )}
//                             <div className="sr-score-display">
//                                 <div className="sr-score-circle" style={{ borderColor: 'blue' }}>
//                                     <span className="sr-score-val" style={{ color: 'blue' }}>{facTotals.score}</span>
//                                     <span className="sr-score-max" style={{ color: 'blue' }}>/ {facTotals.max}</span>
//                                 </div>
//                                 <div className="sr-score-percent" style={{ color: 'blue' }}>{facTotals.pct}%</div>
//                             </div>
//                             <div className="sr-overall-feedback">
//                                 <label className="sr-sidebar-label" style={{ color: 'blue' }}>Facilitator Remarks</label>
//                                 {canFacilitatorMark ? (
//                                     <textarea className="sr-textarea" rows={3} style={{ color: 'blue', fontStyle: 'italic', borderColor: 'blue', background: 'whitesmoke' }} placeholder="Add overall coaching comments..." value={facOverallFeedback} onChange={e => handleFacOverallFeedbackChange(e.target.value)} />
//                                 ) : (
//                                     <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', color: '#0369a1', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #0284c7' }}>{facOverallFeedback || "No overall remarks provided."}</div>
//                                 )}
//                             </div>
//                             {canFacilitatorMark ? (
//                                 <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>{saving ? 'Processing...' : 'Send to Assessor'}</button>
//                             ) : (
//                                 <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
//                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Completed by {submission.grading?.facilitatorName || 'Facilitator'}
//                                 </div>
//                             )}
//                         </div>
//                     ) : null}

//                     {/* ASSESSOR */}
//                     {showAssessorLayer ? (
//                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
//                             <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>
//                             {canGrade && (
//                                 <div className="sr-role-guide red"><Info size={16} /><div><strong>Summative Judgment</strong><br />Declare Competency. You must justify your marks.</div></div>
//                             )}
//                             <div className="sr-score-display">
//                                 <div className="sr-score-circle" style={{ borderColor: 'red', width: '80px', height: '80px' }}>
//                                     <span className="sr-score-val" style={{ color: 'red', fontSize: '1.5rem' }}>{assTotals.score}</span>
//                                 </div>
//                                 <div className="sr-score-percent" style={{ color: 'red' }}>{assTotals.pct}%</div>
//                             </div>
//                             <div className="sr-competency-section" style={{ marginTop: '1rem' }}>
//                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Final Competency</label>
//                                 <div className="sr-comp-toggles">
//                                     <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')} disabled={!canGrade}><Award size={16} /> Competent (C)</button>
//                                     <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')} disabled={!canGrade}><AlertCircle size={16} /> Not Yet Competent</button>
//                                 </div>
//                             </div>
//                             <div className="sr-overall-feedback">
//                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
//                                 {canGrade ? (
//                                     <textarea className="sr-textarea" rows={3} style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: canGrade ? 'red' : '#cbd5e1' }} placeholder={canGrade ? "Provide holistic feedback..." : "No remarks provided."} value={assOverallFeedback} disabled={!canGrade} onChange={e => handleAssOverallFeedbackChange(e.target.value)} />
//                                 ) : (
//                                     <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', color: '#b91c1c', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #dc2626' }}>{assOverallFeedback || "No overall remarks provided."}</div>
//                                 )}
//                             </div>
//                             {(!canGrade && submission.grading?.gradedAt) && (
//                                 <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
//                                     <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: 'red', textTransform: 'uppercase' }}>Assessor Signature</p>
//                                     {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div style={{ height: '40px', fontStyle: 'italic', fontSize: '0.8rem', color: 'red' }}>No Canvas Signature</div>}
//                                     <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: 'red' }}>{submission.grading?.assessorName}</p>
//                                     <p style={{ margin: 0, fontSize: '0.75rem', color: 'red' }}><Clock size={10} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
//                                 </div>
//                             )}
//                             {canGrade && (
//                                 <div className="sr-action-area"><button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving}>{saving ? 'Processing...' : 'Apply Signature & Finalise'}</button></div>
//                             )}
//                         </div>
//                     ) : (
//                         <div className="sr-summary-card sr-locked-card"><Lock size={28} /><h3>Assessor Grading</h3><p>Awaiting Facilitator to complete Blue Pen pre-marking.</p></div>
//                     )}

//                     {/* MODERATOR */}
//                     {showModeratorLayer ? (
//                         <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
//                             <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>
//                             {canModerate && (
//                                 <div className="sr-role-guide green"><Info size={16} /><div><strong>Quality Assurance Verification</strong><br />Your Green Pen verifies the Assessor's marking. You must verify every question. Use comments to instruct corrections before endorsing.</div></div>
//                             )}
//                             <div className="sr-score-display" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
//                                 <div className="sr-score-circle" style={{ borderColor: 'green' }}>
//                                     <span className="sr-score-val" style={{ color: 'green' }}>{modTotals.score}</span>
//                                     <span className="sr-score-max" style={{ color: 'green' }}>/ {modTotals.max}</span>
//                                 </div>
//                                 <div className="sr-score-percent" style={{ color: 'green' }}>{modTotals.pct}%</div>
//                             </div>
//                             <div className="sr-competency-section">
//                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderation Outcome</label>
//                                 <div className="sr-comp-toggles">
//                                     <button className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`} onClick={() => handleModOutcomeSelect('Endorsed')} disabled={!canModerate}><ShieldCheck size={16} /> Endorse Grade</button>
//                                     <button className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`} onClick={() => handleModOutcomeSelect('Returned')} disabled={!canModerate}><AlertCircle size={16} /> Return to Assessor</button>
//                                 </div>
//                             </div>
//                             <div className="sr-overall-feedback">
//                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderator Feedback</label>
//                                 <textarea className="sr-textarea" rows={3} style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }} placeholder={canModerate ? "Notes for the assessor or internal QA..." : "No moderation feedback."} value={modFeedback} disabled={!canModerate} onChange={e => handleModFeedbackChange(e.target.value)} />
//                             </div>
//                             {(!canModerate && submission.moderation?.moderatedAt) && (
//                                 <div className="sr-audit-stamp" style={{ color: 'green', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}><CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Moderated by {submission.moderation?.moderatorName}</div>
//                             )}
//                             {canModerate && (
//                                 <div className="sr-action-area"><button className="sr-submit-btn" style={{ background: 'green' }} onClick={triggerSubmitModeration} disabled={saving}>{saving ? 'Processing...' : 'Finalise QA & Endorse'}</button></div>
//                             )}
//                         </div>
//                     ) : (
//                         <div className="sr-summary-card sr-locked-card"><Lock size={28} /><h3>QA Moderation</h3><p>Awaiting Assessor to complete Red Pen official grading.</p></div>
//                     )}

//                     {/* 🚀 OFFICIAL AUDIT TRAIL 🚀 */}
//                     <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
//                         <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}><ShieldCheck size={18} color="#073f4e" /> Official Audit Trail</h3>

//                         {(currentStatus === 'not_started') && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>}

//                         {/* Learner Record */}
//                         {currentStatus !== 'not_started' && (
//                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
//                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
//                                 {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
//                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
//                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</p>
//                             </div>
//                         )}

//                         {/* Facilitator Audit Record */}
//                         {submission.grading?.facilitatorReviewedAt && (
//                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
//                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Facilitator Pre-Marking</p>
//                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'blue' }}>{submission.grading?.facilitatorName || 'Facilitator'}</p>
//                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
//                                     <Clock size={11} /> {moment(submission.grading?.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm')}
//                                     <span style={{ margin: '0 4px' }}>•</span>
//                                     <Activity size={11} /> Active: {formatTimeSpent(submission.grading?.facilitatorTimeSpent)}
//                                     {submission.grading?.facilitatorStartedAt && (
//                                         <>
//                                             <span style={{ margin: '0 4px' }}>•</span>
//                                             <Calendar size={11} /> Spread: {formatCalendarSpread(submission.grading.facilitatorStartedAt, submission.grading.facilitatorReviewedAt)}
//                                         </>
//                                     )}
//                                 </p>
//                             </div>
//                         )}

//                         {/* Assessor Record */}
//                         {submission.grading?.gradedAt && (
//                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
//                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
//                                 {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
//                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</p>
//                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
//                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
//                                     <Clock size={11} /> {moment(submission.grading?.gradedAt).format('DD/MM/YYYY HH:mm')}
//                                     <span style={{ margin: '0 4px' }}>•</span>
//                                     <Activity size={11} /> Active: {formatTimeSpent(submission.grading?.assessorTimeSpent)}
//                                     {submission.grading?.assessorStartedAt && (
//                                         <>
//                                             <span style={{ margin: '0 4px' }}>•</span>
//                                             <Calendar size={11} /> Spread: {formatCalendarSpread(submission.grading.assessorStartedAt, submission.grading.gradedAt)}
//                                         </>
//                                     )}
//                                 </p>
//                             </div>
//                         )}

//                         {/* Moderator Record */}
//                         {submission.moderation?.moderatedAt && (
//                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1rem' }}>
//                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation QA</p>
//                                 {moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
//                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</p>
//                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Outcome: {submission.moderation?.outcome}</p>
//                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
//                                     <Clock size={11} /> {moment(submission.moderation?.moderatedAt).format('DD/MM/YYYY HH:MM')}
//                                     <span style={{ margin: '0 4px' }}>•</span>
//                                     <Activity size={11} /> Active: {formatTimeSpent(submission.moderation?.timeSpent)}
//                                     {submission.moderation?.moderatorStartedAt && (
//                                         <>
//                                             <span style={{ margin: '0 4px' }}>•</span>
//                                             <Calendar size={11} /> Spread: {formatCalendarSpread(submission.moderation.moderatorStartedAt, submission.moderation.moderatedAt)}
//                                         </>
//                                     )}
//                                 </p>
//                             </div>
//                         )}
//                     </div>

//                     {/* 🚀 NEW: REMEDIATION WORKFLOW UI 🚀 */}
//                     {currentStatus === 'moderated' && submission.competency === 'NYC' && (isFacilitator || isAssessor || isModerator) && (
//                         <div className="sr-summary-card" style={{ marginTop: '1.5rem', borderTop: '4px solid #f59e0b', background: '#fffbeb' }}>
//                             <h3 className="sr-summary-title" style={{ color: '#d97706' }}>Remediation Required</h3>
//                             <p style={{ fontSize: '0.85rem', color: '#b45309', marginBottom: '1rem', lineHeight: 1.5 }}>
//                                 This learner has been verified as Not Yet Competent. You can unlock this workbook for a second attempt. A snapshot of this failed attempt will be saved for audit purposes.
//                             </p>
//                             <button className="sr-submit-btn" style={{ background: '#d97706' }} onClick={triggerRemediation} disabled={saving}>
//                                 <RotateCcw size={16} /> Unlock for Remediation
//                             </button>
//                         </div>
//                     )}

//                 </aside>
//             </div>
//         </div>
//     );
// };

// export default SubmissionReview;


// // import React, { useState, useEffect, useRef } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import { doc, getDoc, updateDoc } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import {
// //     ArrowLeft, CheckCircle, AlertCircle, Save,
// //     User, GraduationCap, Clock, Award,
// //     ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2, XCircle, AlertTriangle, Activity, Calendar, BarChart
// // } from 'lucide-react';
// // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // import './SubmissionReview.css';
// // import { createPortal } from 'react-dom';
// // import { TintedSignature } from '../FacilitatorProfileView/FacilitatorProfileView';
// // import moment from 'moment';

// // interface GradeData {
// //     score: number;
// //     feedback: string;
// //     isCorrect?: boolean | null;
// // }

// // export type StatusType = 'info' | 'success' | 'error' | 'warning';

// // // ─── STATUS MODAL COMPONENT ─────────────────────────────────────────────
// // const StatusModal: React.FC<{
// //     type: StatusType;
// //     title: string;
// //     message: string;
// //     onClose: () => void;
// //     onConfirm?: () => void;
// //     confirmText?: string;
// //     cancelText?: string;
// // }> = ({ type, title, message, onClose, onConfirm, confirmText = "Okay", cancelText = "Cancel" }) => {

// //     useEffect(() => {
// //         const style = document.createElement('style');
// //         style.innerHTML = `
// //             body, html { overflow: hidden !important; }
// //             .sr-root, .main-wrapper, .admin-content, .admin-layout, .sr-layout { overflow: hidden !important; }
// //         `;
// //         document.head.appendChild(style);
// //         return () => {
// //             document.head.removeChild(style);
// //         };
// //     }, []);

// //     const styles = {
// //         info: { color: '#3b82f6', Icon: Info },
// //         success: { color: '#22c55e', Icon: CheckCircle },
// //         error: { color: '#ef4444', Icon: XCircle },
// //         warning: { color: '#f59e0b', Icon: AlertTriangle }
// //     };

// //     const { color, Icon } = styles[type];

// //     const modalContent = (
// //         <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(3px)' }}>
// //             <div style={{ background: 'white', maxWidth: '400px', width: '90%', textAlign: 'center', padding: '2rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
// //                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
// //                     <Icon size={48} color={color} />
// //                 </div>
// //                 <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{title}</h2>
// //                 <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem', fontSize: '0.9rem' }}>{message}</p>
// //                 <div style={{ display: 'flex', gap: '1rem' }}>
// //                     {onConfirm && (
// //                         <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// //                             {cancelText}
// //                         </button>
// //                     )}
// //                     <button onClick={onConfirm || onClose} style={{ flex: 1, padding: '0.75rem', background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// //                         {confirmText}
// //                     </button>
// //                 </div>
// //             </div>
// //         </div>
// //     );

// //     return createPortal(modalContent, document.body);
// // };

// // export const SubmissionReview: React.FC = () => {
// //     const { submissionId } = useParams<{ submissionId: string }>();
// //     const navigate = useNavigate();
// //     const { user } = useStore();
// //     const toast = useToast();

// //     const [loading, setLoading] = useState(true);
// //     const [saving, setSaving] = useState(false);

// //     const [submission, setSubmission] = useState<any>(null);
// //     const [assessment, setAssessment] = useState<any>(null);
// //     const [learner, setLearner] = useState<any>(null);

// //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);

// //     const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
// //     const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});
// //     const [modBreakdown, setModBreakdown] = useState<Record<string, GradeData>>({});

// //     const [facOverallFeedback, setFacOverallFeedback] = useState('');
// //     const [assOverallFeedback, setAssOverallFeedback] = useState('');
// //     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

// //     const [modFeedback, setModFeedback] = useState('');
// //     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

// //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm?: () => void; confirmText?: string; cancelText?: string } | null>(null);
// //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// //     // 🚀 TIME TRACKING REFS
// //     const sessionStartRef = useRef<number>(performance.now());
// //     const initialFacTimeRef = useRef<number>(0);
// //     const initialAssTimeRef = useRef<number>(0);
// //     const initialModTimeRef = useRef<number>(0);

// //     const currentStatus = String(submission?.status || '').toLowerCase();

// //     // 🚀 STRICT ROLE DEFINITIONS
// //     const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
// //     const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
// //     const isModerator = user?.role === 'moderator';

// //     const canFacilitatorMark = isFacilitator && currentStatus === 'submitted';
// //     const canGrade = isAssessor && (currentStatus === 'facilitator_reviewed' || currentStatus === 'returned');
// //     const canModerate = isModerator && currentStatus === 'graded';

// //     // 🚀 DYNAMIC SIDEBAR VISIBILITY
// //     const showAssessorLayer = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
// //     const showModeratorLayer = ['graded', 'moderated', 'returned'].includes(currentStatus);

// //     useEffect(() => {
// //         const loadReviewData = async () => {
// //             if (!submissionId) return;
// //             try {
// //                 const subRef = doc(db, 'learner_submissions', submissionId);
// //                 const subSnap = await getDoc(subRef);
// //                 if (!subSnap.exists()) throw new Error("Submission not found");
// //                 const subData = subSnap.data();
// //                 setSubmission({ id: subSnap.id, ...subData });

// //                 const assRef = doc(db, 'assessments', subData.assessmentId);
// //                 const assSnap = await getDoc(assRef);
// //                 if (!assSnap.exists()) throw new Error("Assessment template missing");
// //                 const assData = assSnap.data();
// //                 setAssessment(assData);

// //                 const learnerRef = doc(db, 'learners', subData.learnerId);
// //                 const learnerSnap = await getDoc(learnerRef);
// //                 let learnerAuthUid = null;
// //                 if (learnerSnap.exists()) {
// //                     const lData = learnerSnap.data();
// //                     setLearner(lData);
// //                     learnerAuthUid = lData.authUid;
// //                 }

// //                 const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || learnerAuthUid || subData.learnerId;
// //                 if (targetLearnerUid) {
// //                     const lProfSnap = await getDoc(doc(db, 'users', targetLearnerUid));
// //                     if (lProfSnap.exists()) setLearnerProfile(lProfSnap.data());
// //                 }

// //                 if (subData.grading?.gradedBy) {
// //                     const assProfRef = doc(db, 'users', subData.grading.gradedBy);
// //                     const assProfSnap = await getDoc(assProfRef);
// //                     if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
// //                 }

// //                 if (subData.moderation?.moderatedBy) {
// //                     const modProfRef = doc(db, 'users', subData.moderation.moderatedBy);
// //                     const modProfSnap = await getDoc(modProfRef);
// //                     if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
// //                 }

// //                 initialFacTimeRef.current = subData.grading?.facilitatorTimeSpent || 0;
// //                 initialAssTimeRef.current = subData.grading?.assessorTimeSpent || 0;
// //                 initialModTimeRef.current = subData.moderation?.timeSpent || 0;
// //                 sessionStartRef.current = performance.now();

// //                 let fBreakdown = subData.grading?.facilitatorBreakdown;
// //                 let aBreakdown = subData.grading?.assessorBreakdown;
// //                 let mBreakdown = subData.moderation?.breakdown;

// //                 const dbStatus = String(subData.status || '').toLowerCase();

// //                 // 🚀 HELPER: GENERATE FRESH BREAKDOWN (Stops Assessor/Moderator from pre-loading Facilitator ticks)
// //                 const generateFreshBreakdown = (includeFeedback: boolean) => {
// //                     const fresh: Record<string, GradeData> = {};
// //                     assData.blocks?.forEach((block: any) => {
// //                         if (block.type === 'mcq') {
// //                             const isCorrect = subData.answers?.[block.id] === block.correctOption;
// //                             fresh[block.id] = {
// //                                 score: isCorrect ? (block.marks || 0) : 0,
// //                                 feedback: includeFeedback ? (isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect') : '',
// //                                 isCorrect
// //                             };
// //                         } else if (block.type === 'text') {
// //                             fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
// //                         }
// //                     });
// //                     return fresh;
// //                 };

// //                 // 1. Facilitator Layer
// //                 if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
// //                     if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) {
// //                         fBreakdown = subData.grading.breakdown;
// //                     } else {
// //                         fBreakdown = generateFreshBreakdown(true);
// //                     }
// //                 }
// //                 setFacBreakdown(fBreakdown);

// //                 // 2. Assessor Layer (FRESH START)
// //                 if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
// //                     if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(dbStatus)) {
// //                         aBreakdown = generateFreshBreakdown(false);
// //                     } else {
// //                         aBreakdown = {};
// //                     }
// //                 }
// //                 setAssBreakdown(aBreakdown);

// //                 // 3. Moderator Layer (FRESH START)
// //                 if (!mBreakdown || Object.keys(mBreakdown).length === 0) {
// //                     if (['graded', 'moderated', 'returned'].includes(dbStatus)) {
// //                         mBreakdown = generateFreshBreakdown(false);
// //                     } else {
// //                         mBreakdown = {};
// //                     }
// //                 }
// //                 setModBreakdown(mBreakdown);

// //                 setFacOverallFeedback(subData.grading?.facilitatorOverallFeedback || '');
// //                 setAssOverallFeedback(subData.grading?.assessorOverallFeedback || subData.grading?.overallFeedback || '');

// //                 setCompetency(subData.competency || null);
// //                 setModFeedback(subData.moderation?.feedback || '');
// //                 setModOutcome(subData.moderation?.outcome || null);

// //             } catch (err: any) {
// //                 toast.error(err.message || "Failed to load data.");
// //             } finally {
// //                 setLoading(false);
// //             }
// //         };
// //         loadReviewData();
// //     }, [submissionId]);

// //     const getFacTime = () => initialFacTimeRef.current + (canFacilitatorMark ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
// //     const getAssTime = () => initialAssTimeRef.current + (canGrade ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
// //     const getModTime = () => initialModTimeRef.current + (canModerate ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);

// //     const formatTimeSpent = (seconds?: number) => {
// //         if (seconds === undefined || seconds === null) return '—';
// //         const m = Math.floor(seconds / 60);
// //         if (m === 0) return '< 1m';
// //         const h = Math.floor(m / 60);
// //         if (h > 0) {
// //             const remM = m % 60;
// //             return `${h}h ${remM}m`;
// //         }
// //         return `${m}m`;
// //     };

// //     const formatCalendarSpread = (startStr?: string, endStr?: string) => {
// //         if (!startStr || !endStr) return null;
// //         const start = new Date(startStr).getTime();
// //         const end = new Date(endStr).getTime();
// //         const diffHours = (end - start) / (1000 * 60 * 60);

// //         if (diffHours < 24) {
// //             if (diffHours < 1) return '< 1 hr spread';
// //             return `${Math.floor(diffHours)} hr spread`;
// //         }
// //         return `${Math.floor(diffHours / 24)} day spread`;
// //     };

// //     const triggerAutoSave = (fBreak: any, aBreak: any, mBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
// //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

// //         setSaving(true);
// //         saveTimeoutRef.current = setTimeout(async () => {
// //             if (!submission?.id) return;
// //             try {
// //                 const updatePayload: any = {
// //                     'grading.facilitatorBreakdown': fBreak,
// //                     'grading.assessorBreakdown': aBreak,
// //                     'moderation.breakdown': mBreak,
// //                     'grading.facilitatorOverallFeedback': fOverall,
// //                     'grading.assessorOverallFeedback': aOverall,
// //                     'moderation.feedback': updatedModFeedback,
// //                     lastStaffEditAt: new Date().toISOString()
// //                 };

// //                 if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
// //                 if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

// //                 if (canFacilitatorMark) updatePayload['grading.facilitatorTimeSpent'] = getFacTime();
// //                 if (canGrade) updatePayload['grading.assessorTimeSpent'] = getAssTime();
// //                 if (canModerate) updatePayload['moderation.timeSpent'] = getModTime();

// //                 const nowIso = new Date().toISOString();
// //                 if (canFacilitatorMark && !submission.grading?.facilitatorStartedAt) {
// //                     updatePayload['grading.facilitatorStartedAt'] = nowIso;
// //                     setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, facilitatorStartedAt: nowIso } }));
// //                 }
// //                 if (canGrade && !submission.grading?.assessorStartedAt) {
// //                     updatePayload['grading.assessorStartedAt'] = nowIso;
// //                     setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, assessorStartedAt: nowIso } }));
// //                 }
// //                 if (canModerate && !submission.moderation?.moderatorStartedAt) {
// //                     updatePayload['moderation.moderatorStartedAt'] = nowIso;
// //                     setSubmission((prev: any) => ({ ...prev, moderation: { ...prev.moderation, moderatorStartedAt: nowIso } }));
// //                 }

// //                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
// //             } catch (error) {
// //                 console.error("Auto-save failed:", error);
// //             } finally {
// //                 setSaving(false);
// //             }
// //         }, 1500);
// //     };

// //     const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
// //         if (canFacilitatorMark) {
// //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// //             setFacBreakdown(next);
// //             triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canGrade) {
// //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// //             setAssBreakdown(next);
// //             triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canModerate) {
// //             const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// //             setModBreakdown(next);
// //             triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         }
// //     };

// //     const handleScoreChange = (blockId: string, score: number, max: number) => {
// //         const val = Math.min(Math.max(0, score), max);
// //         if (canFacilitatorMark) {
// //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], score: val } };
// //             setFacBreakdown(next);
// //             triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canGrade) {
// //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], score: val } };
// //             setAssBreakdown(next);
// //             triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canModerate) {
// //             const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], score: val } };
// //             setModBreakdown(next);
// //             triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         }
// //     };

// //     const handleFeedbackChange = (blockId: string, feedback: string) => {
// //         if (canFacilitatorMark) {
// //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], feedback } };
// //             setFacBreakdown(next);
// //             triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canGrade) {
// //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], feedback } };
// //             setAssBreakdown(next);
// //             triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canModerate) {
// //             const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], feedback } };
// //             setModBreakdown(next);
// //             triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         }
// //     };

// //     const handleFacOverallFeedbackChange = (val: string) => {
// //         if (!canFacilitatorMark) return;
// //         setFacOverallFeedback(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome);
// //     };

// //     const handleAssOverallFeedbackChange = (val: string) => {
// //         if (!canGrade) return;
// //         setAssOverallFeedback(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome);
// //     };

// //     const handleModFeedbackChange = (val: string) => {
// //         if (!canModerate) return;
// //         setModFeedback(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome);
// //     };

// //     const handleCompetencySelect = (val: 'C' | 'NYC') => {
// //         if (!canGrade) return;
// //         setCompetency(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome);
// //     };

// //     const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
// //         if (!canModerate) return;
// //         setModOutcome(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val);
// //     };

// //     const getTotals = (breakdown: Record<string, GradeData>) => {
// //         const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
// //         const max = assessment?.totalMarks || 0;
// //         const pct = max > 0 ? Math.round((score / max) * 100) : 0;
// //         return { score, max, pct };
// //     };

// //     const facTotals = getTotals(facBreakdown);
// //     const assTotals = getTotals(assBreakdown);
// //     const modTotals = getTotals(modBreakdown);

// //     let activeTotals = facTotals;
// //     if (showAssessorLayer) activeTotals = assTotals;
// //     if (showModeratorLayer) activeTotals = modTotals;

// //     // ─── HELPER: CALCULATE SECTION TOTALS ───
// //     const sectionTotals: Record<string, { total: number, awarded: number }> = {};
// //     let currentSectionId = '';
// //     if (assessment?.blocks) {
// //         assessment.blocks.forEach((block: any) => {
// //             if (block.type === 'section') {
// //                 currentSectionId = block.id;
// //                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
// //             } else if ((block.type === 'mcq' || block.type === 'text') && currentSectionId) {

// //                 const g = submission?.grading || {};
// //                 const m = submission?.moderation || {};
// //                 const mLayer = m.breakdown?.[block.id] || {};
// //                 const aLayer = g.assessorBreakdown?.[block.id] || {};
// //                 const fLayer = g.facilitatorBreakdown?.[block.id] || {};
// //                 const legacyLayer = g.breakdown?.[block.id] || { score: 0, isCorrect: null };

// //                 let activeLayer = legacyLayer;
// //                 if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus)) activeLayer = fLayer;
// //                 if (['graded', 'moderated'].includes(currentStatus)) activeLayer = aLayer;
// //                 if (currentStatus === 'moderated') activeLayer = mLayer;

// //                 sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
// //                 if (activeLayer.score !== undefined && activeLayer.score !== null) {
// //                     sectionTotals[currentSectionId].awarded += Number(activeLayer.score);
// //                 }
// //             }
// //         });
// //     }

// //     const validateAllMarked = (breakdown: Record<string, GradeData>) => {
// //         if (!assessment?.blocks) return true;
// //         const unmarkedCount = assessment.blocks.filter((block: any) => {
// //             if (block.type !== 'mcq' && block.type !== 'text') return false;
// //             const grade = breakdown[block.id];
// //             return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
// //         }).length;
// //         return unmarkedCount === 0;
// //     };

// //     const triggerSubmitFacilitator = () => {
// //         if (!validateAllMarked(facBreakdown)) {
// //             setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Marking', message: 'You must evaluate every question. Please ensure every question has a Green Tick or Red Cross selected before submitting.', confirmText: 'Got it' });
// //             return;
// //         }
// //         if (!facOverallFeedback.trim()) {
// //             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Overall Facilitator Remarks before sending this script to the Assessor.', confirmText: 'Got it' });
// //             return;
// //         }

// //         setModalConfig({
// //             isOpen: true, type: 'info', title: 'Complete Pre-Marking?',
// //             message: 'This will finalize your Blue Pen feedback and send the workbook to the Assessor for official grading.',
// //             confirmText: 'Send to Assessor',
// //             onConfirm: async () => {
// //                 setModalConfig(null); setSaving(true);
// //                 try {
// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: 'facilitator_reviewed',
// //                         'grading.facilitatorBreakdown': facBreakdown,
// //                         'grading.facilitatorOverallFeedback': facOverallFeedback,
// //                         'grading.facilitatorId': user?.uid,
// //                         'grading.facilitatorName': user?.fullName,
// //                         'grading.facilitatorReviewedAt': new Date().toISOString(),
// //                         'grading.facilitatorTimeSpent': getFacTime()
// //                     });
// //                     toast.success("Script marked and passed to Assessor!");
// //                     setTimeout(() => navigate(-1), 2000);
// //                 } catch (error) { toast.error("Failed to save marking."); } finally { setSaving(false); }
// //             }
// //         });
// //     };

// //     const triggerSubmitGrade = () => {
// //         if (!validateAllMarked(assBreakdown)) {
// //             setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Grading', message: 'You must evaluate every question. Please ensure every question has a Tick or Cross selected before submitting your final grade.', confirmText: 'Got it' });
// //             return;
// //         }
// //         if (!competency) {
// //             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a Final Competency (C or NYC) before submitting.', confirmText: 'Got it' });
// //             return;
// //         }
// //         if (!assOverallFeedback.trim()) {
// //             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Assessor Remarks justifying your final outcome before submitting.', confirmText: 'Got it' });
// //             return;
// //         }

// //         setModalConfig({
// //             isOpen: true, type: 'warning', title: 'Finalise Grade?',
// //             message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.',
// //             confirmText: 'Apply Signature & Submit',
// //             onConfirm: async () => {
// //                 setModalConfig(null); setSaving(true);
// //                 try {
// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: 'graded',
// //                         marks: assTotals.score,
// //                         competency: competency,
// //                         'grading.assessorBreakdown': assBreakdown,
// //                         'grading.assessorOverallFeedback': assOverallFeedback,
// //                         'grading.gradedBy': user?.uid,
// //                         'grading.assessorName': user?.fullName,
// //                         'grading.assessorRegNumber': user?.assessorRegNumber || 'Pending Reg',
// //                         'grading.gradedAt': new Date().toISOString(),
// //                         'grading.assessorTimeSpent': getAssTime()
// //                     });
// //                     toast.success("Workbook graded and signed successfully!");
// //                     setTimeout(() => window.location.reload(), 500);
// //                 } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
// //             }
// //         });
// //     };

// //     const triggerSubmitModeration = () => {
// //         if (!validateAllMarked(modBreakdown)) {
// //             setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete QA', message: 'You must verify every question with a Green Tick or Cross to confirm the Assessor’s marks before endorsing.', confirmText: 'Got it' });
// //             return;
// //         }
// //         if (!modOutcome) {
// //             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Outcome', message: 'You must select a Moderation Outcome (Endorsed or Returned) before submitting.', confirmText: 'Got it' });
// //             return;
// //         }
// //         if (!modFeedback.trim()) {
// //             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Feedback', message: 'You must provide Moderator Feedback explaining your decision.', confirmText: 'Got it' });
// //             return;
// //         }

// //         setModalConfig({
// //             isOpen: true, type: 'info', title: 'Finalise Moderation?',
// //             message: modOutcome === 'Returned' ? 'This will return the workbook to the Assessor for remediation.' : 'This will apply your Green Pen signature and endorse the final grade.',
// //             confirmText: 'Confirm Moderation',
// //             onConfirm: async () => {
// //                 setModalConfig(null); setSaving(true);
// //                 try {
// //                     const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: newStatus,
// //                         'moderation.breakdown': modBreakdown,
// //                         'moderation.outcome': modOutcome,
// //                         'moderation.feedback': modFeedback,
// //                         'moderation.moderatedBy': user?.uid,
// //                         'moderation.moderatorName': user?.fullName,
// //                         'moderation.moderatorRegNumber': user?.assessorRegNumber || 'Pending Reg',
// //                         'moderation.moderatedAt': new Date().toISOString(),
// //                         'moderation.timeSpent': getModTime()
// //                     });
// //                     toast.success("Moderation saved successfully!");
// //                     setTimeout(() => navigate(-1), 1000);
// //                 } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
// //             }
// //         });
// //     };

// //     if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
// //     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

// //     const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');
// //     const printInkColor = showModeratorLayer ? 'green' : (showAssessorLayer ? 'red' : 'blue');

// //     const canPrint = !['not_started', 'in_progress'].includes(currentStatus);

// //     // ─── HELPER: Render Blocks ───
// //     const renderBlocks = (isPrintMode: boolean) => {

// //         const isFacDone = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
// //         const isAssDone = ['graded', 'moderated', 'returned'].includes(currentStatus);
// //         const isModDone = ['moderated'].includes(currentStatus);

// //         return assessment.blocks?.map((block: any, idx: number) => {
// //             if (block.type === 'section') {
// //                 const totals = sectionTotals[block.id];
// //                 return (
// //                     <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-section-title-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
// //                         <h2 className="sr-section-title" style={{ color: '#073f4e', margin: 0, border: 'none', padding: 0 }}>{block.title}</h2>
// //                         {['graded', 'moderated'].includes(currentStatus) && totals && totals.total > 0 && (
// //                             <span className="no-print" style={{ fontSize: '0.8rem', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px', fontWeight: 'bold' }}>
// //                                 <BarChart size={14} /> {totals.awarded}/{totals.total}
// //                             </span>
// //                         )}
// //                     </div>
// //                 );
// //             }

// //             if (block.type === 'mcq' || block.type === 'text') {
// //                 const learnerAns = submission.answers?.[block.id];
// //                 const maxM = block.marks || 0;
// //                 const isMCQ = block.type === 'mcq';

// //                 const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
// //                 const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
// //                 const mData = modBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };

// //                 let activeInkColor = 'blue';
// //                 let activeData = fData;
// //                 let isActiveRole = false;

// //                 if (canFacilitatorMark) { activeInkColor = 'blue'; activeData = fData; isActiveRole = true; }
// //                 else if (canGrade) { activeInkColor = 'red'; activeData = aData; isActiveRole = true; }
// //                 else if (canModerate) { activeInkColor = 'green'; activeData = mData; isActiveRole = true; }
// //                 else {
// //                     if (currentStatus === 'moderated') { activeInkColor = 'green'; activeData = mData; }
// //                     else if (['graded', 'returned'].includes(currentStatus)) { activeInkColor = 'red'; activeData = aData; }
// //                     else { activeInkColor = 'blue'; activeData = fData; }
// //                 }

// //                 const renderFacTick = isFacDone && fData.isCorrect !== null && fData.isCorrect !== undefined;
// //                 const renderAssTick = isAssDone && aData.isCorrect !== null && aData.isCorrect !== undefined;
// //                 const renderModTick = isModDone && mData.isCorrect !== null && mData.isCorrect !== undefined;

// //                 const renderFacReadOnly = isFacDone && !canFacilitatorMark && (fData.score > 0 || fData.feedback || fData.isCorrect !== null);
// //                 const renderAssReadOnly = isAssDone && !canGrade && (aData.score > 0 || aData.feedback || aData.isCorrect !== null);
// //                 const renderModReadOnly = isModDone && !canModerate && (mData.score > 0 || mData.feedback || mData.isCorrect !== null);

// //                 return (
// //                     <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
// //                         <div className="sr-q-header">
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                 <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
// //                                 <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>

// //                                 <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
// //                                     {renderFacTick && (
// //                                         <span title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 4px', borderRadius: '4px' }}>
// //                                             {fData.isCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}
// //                                         </span>
// //                                     )}
// //                                     {renderAssTick && (
// //                                         <span title="Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 4px', borderRadius: '4px' }}>
// //                                             {aData.isCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}
// //                                         </span>
// //                                     )}
// //                                     {renderModTick && (
// //                                         <span title="Internal Moderation QA" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 4px', borderRadius: '4px' }}>
// //                                             {mData.isCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}
// //                                         </span>
// //                                     )}
// //                                 </div>
// //                             </div>

// //                             {!isPrintMode && isActiveRole && (
// //                                 <div className="sr-visual-mark">
// //                                     <button
// //                                         onClick={() => handleVisualMark(block.id, true, maxM)}
// //                                         disabled={!isActiveRole}
// //                                         className="sr-mark-btn"
// //                                         style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// //                                         title="Mark Correct"
// //                                     >
// //                                         <Check size={20} />
// //                                     </button>
// //                                     <button
// //                                         onClick={() => handleVisualMark(block.id, false, maxM)}
// //                                         disabled={!isActiveRole}
// //                                         className="sr-mark-btn"
// //                                         style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// //                                         title="Mark Incorrect"
// //                                     >
// //                                         <X size={20} />
// //                                     </button>
// //                                 </div>
// //                             )}
// //                         </div>

// //                         <div className="sr-q-body">
// //                             <div className="sr-answer-box">
// //                                 <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
// //                                 {isMCQ ? (
// //                                     <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
// //                                         <span style={{ color: 'black' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
// //                                         {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
// //                                     </div>
// //                                 ) : (
// //                                     <div className="sr-text-ans">
// //                                         {learnerAns ? <div className="quill-read-only-content" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: learnerAns }} /> : <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>}
// //                                     </div>
// //                                 )}
// //                                 {isMCQ && <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong></div>}
// //                             </div>

// //                             {/* 🚀 READ-ONLY BLOCKS */}
// //                             {renderFacReadOnly && (
// //                                 <div className="sr-read-only-feedback" style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
// //                                     <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Info size={13} /> Facilitator Pre-Mark</div>
// //                                     <div style={{ color: '#0369a1', fontSize: '0.85rem' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{fData.score ?? 0}/{maxM}]</span> {fData.feedback || <em style={{ opacity: 0.7 }}>No specific coaching provided.</em>}</div>
// //                                 </div>
// //                             )}

// //                             {renderAssReadOnly && (
// //                                 <div className="sr-read-only-feedback" style={{ background: '#fef2f2', borderLeft: '3px solid #ef4444', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
// //                                     <div style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Award size={13} /> Assessor Grade</div>
// //                                     <div style={{ color: '#991b1b', fontSize: '0.85rem' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{aData.score ?? 0}/{maxM}]</span> {aData.feedback || <em style={{ opacity: 0.7 }}>No specific feedback provided.</em>}</div>
// //                                 </div>
// //                             )}

// //                             {renderModReadOnly && (
// //                                 <div className="sr-read-only-feedback" style={{ background: '#f0fdf4', borderLeft: '3px solid #22c55e', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
// //                                     <div style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><ShieldCheck size={13} /> Moderator QA</div>
// //                                     <div style={{ color: '#16a34a', fontSize: '0.85rem' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{mData.score ?? 0}/{maxM}]</span> {mData.feedback || <em style={{ opacity: 0.7 }}>No QA feedback provided.</em>}</div>
// //                                 </div>
// //                             )}

// //                             {/* 🚀 ACTIVE GRADING INPUTS */}
// //                             {(!isPrintMode && isActiveRole) && (
// //                                 <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderRadius: '6px' }}>
// //                                     <div className="sr-score-input-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
// //                                         <label style={{ color: activeInkColor, fontWeight: 'bold', fontSize: '0.85rem' }}>Marks Awarded:</label>
// //                                         <input type="number" className="sr-score-input" style={{ color: activeInkColor, width: '60px', padding: '4px 8px', border: `1px solid ${activeInkColor}`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }} value={activeData.score ?? 0} onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)} />
// //                                         <span style={{ color: activeInkColor, fontWeight: 'bold' }}>/ {maxM}</span>
// //                                     </div>
// //                                     <div className="sr-feedback-wrap" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
// //                                         <Edit3 size={16} color={activeInkColor} style={{ marginTop: '6px' }} />
// //                                         <textarea className="sr-feedback-input" rows={2} style={{ width: '100%', color: activeInkColor, fontStyle: 'italic', fontWeight: 500, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }} placeholder={canModerate ? "Moderator Green Pen QA Notes..." : canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."} value={activeData.feedback || ''} onChange={e => handleFeedbackChange(block.id, e.target.value)} />
// //                                     </div>
// //                                 </div>
// //                             )}

// //                         </div>
// //                     </div>
// //                 );
// //             }
// //             return null;
// //         });
// //     };

// //     return (
// //         <div className="sr-root animate-fade-in" style={{ width: '100%', position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {modalConfig && (
// //                 <StatusModal
// //                     type={modalConfig.type} title={modalConfig.title} message={modalConfig.message}
// //                     onConfirm={modalConfig.onConfirm} confirmText={modalConfig.confirmText}
// //                     cancelText={modalConfig.cancelText} onClose={() => setModalConfig(null)}
// //                 />
// //             )}

// //             <div className="ap-player-topbar no-print">
// //                 <div className="ap-player-topbar__left">
// //                     <button className="sr-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={13} /> Portfolio</button>
// //                     <div className="ap-player-topbar__separator" />
// //                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
// //                 </div>
// //                 <div className="ap-player-topbar__right">
// //                     {canPrint && (
// //                         <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
// //                             <Printer size={13} /> Print Audit
// //                         </button>
// //                     )}
// //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
// //                         {saving ? <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</> : <><CheckCircle size={12} /> Auto-saved</>}
// //                     </span>
// //                 </div>
// //             </div>

// //             <div className="sr-print-wrap">

// //                 {/* Cover pages (print only) */}
// //                 <div className="print-only-cover">
// //                     {/* Cover page 1 */}
// //                     <div className="print-page">
// //                         <h1 style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: '10px' }}>
// //                             {assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}
// //                         </h1>
// //                         <h2 style={{ textAlign: 'center', marginBottom: '8mm', textDecoration: 'underline' }}>
// //                             LEARNER WORKBOOK
// //                         </h2>
// //                         <table className="print-table" style={{ width: '100%', marginBottom: '8mm' }}>
// //                             <tbody>
// //                                 <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Module #</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Notional hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Credit(s)</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
// //                             </tbody>
// //                         </table>
// //                         <h3>CONTACT INFORMATION:</h3>
// //                         <table className="print-table" style={{ width: '100%' }}>
// //                             <tbody>
// //                                 <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName || '________________________'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || learner?.email || '________________________'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Telephone (W)</td><td>{learnerProfile?.telephoneWork || '________________________'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
// //                             </tbody>
// //                         </table>
// //                     </div>

// //                     {/* Cover page 2 */}
// //                     <div className="print-page">
// //                         <h3>Note to the learner</h3>
// //                         <p>{assessment?.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
// //                         <h3>Purpose</h3>
// //                         <p>{assessment?.purpose || 'The main focus of the learning in this knowledge module is to build an understanding of the concepts related to this subject matter.'}</p>
// //                         <h3>Topic elements to be covered include</h3>
// //                         <table className="print-table no-border" style={{ width: '100%' }}>
// //                             <tbody>
// //                                 {assessment?.moduleInfo?.topics && assessment.moduleInfo.topics.length > 0
// //                                     ? assessment.moduleInfo.topics.map((topic: any, idx: number) => (
// //                                         <tr key={idx}>
// //                                             <td>{topic.code ? <strong>{topic.code}: </strong> : ''}{topic.title || topic.name}</td>
// //                                             <td style={{ width: '15%' }}>{topic.weight || topic.percentage}%</td>
// //                                         </tr>
// //                                     ))
// //                                     : assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
// //                                         const secTotal = sectionTotals[sec.id]?.total || 0;
// //                                         const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
// //                                         return (
// //                                             <tr key={idx}>
// //                                                 <td><strong>Section {idx + 1}: </strong>{sec.title}</td>
// //                                                 <td style={{ width: '15%' }}>{secTotal > 0 ? `${pct}%` : '—'}</td>
// //                                             </tr>
// //                                         );
// //                                     })
// //                                 }
// //                             </tbody>
// //                         </table>
// //                     </div>

// //                     {/* Cover page 3 */}
// //                     <div className="print-page">
// //                         <h3>Entry Requirements</h3>
// //                         <p>{assessment?.moduleInfo?.entryRequirements || `NQF Level ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}</p>
// //                         <h3>Provider Accreditation Requirements</h3>
// //                         <p><strong>Physical Requirements:</strong><br />{assessment?.moduleInfo?.physicalRequirements || 'The provider must have structured learning material.'}</p>
// //                         <h3>Human Resource Requirements</h3>
// //                         <ul>
// //                             <li>Lecturer/learner ratio of {assessment?.moduleInfo?.lecturerRatio || '1:20'} (Maximum)</li>
// //                             <li>Assessors and moderators: accredited by the relevant SETA</li>
// //                         </ul>
// //                         <h3>Exemptions</h3>
// //                         <p>{assessment?.moduleInfo?.exemptions || 'No exemptions, but the module can be achieved in full through a normal RPL process.'}</p>
// //                         <h3>Venue, Date and Time</h3>
// //                         <p><strong>Venue:</strong> {assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform'}</p>
// //                         <p><strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}</p>
// //                     </div>

// //                 </div>{/* end .print-only-cover */}

// //                 {/* ── Audit header (score summary + signatures) ── */}
// //                 <div className="sr-print-header">
// //                     <div className="sr-print-header-info">
// //                         <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
// //                             <div>
// //                                 <p><strong>Learner Name:</strong> {learner?.fullName}</p>
// //                                 <p><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
// //                                 <p><strong>Submitted:</strong> {new Date(submission.submittedAt).toLocaleDateString()}</p>
// //                             </div>
// //                             <div>
// //                                 <p><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
// //                                 <p><strong>Score:</strong> <span style={{ color: printInkColor, fontWeight: 'bold' }}>{activeTotals.score} / {activeTotals.max} ({activeTotals.pct}%)</span></p>
// //                                 <p><strong>Outcome:</strong> <span style={{ color: printOutcomeColor, fontWeight: 'bold' }}>{submission.competency === 'C' ? 'Competent (C)' : submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending'}</span></p>

// //                             </div>
// //                         </div>
// //                     </div>

// //                 </div>{/* end .sr-print-header */}

// //                 {/* ── Question blocks (Print Version) ── */}
// //                 <div className="sr-blocks">
// //                     {renderBlocks(true)}
// //                 </div>

// //                 <div className="sr-signature-block">
// //                     {/* Learner Signature - Always Show (Since they submitted it) */}
// //                     <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black' }}>
// //                         <span style={{ color: 'black' }}>Learner Declaration</span>
// //                         {learnerProfile?.signatureUrl
// //                             ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// //                             : <div className="sr-sig-no-image" style={{ color: 'black' }}>No Canvas Signature</div>
// //                         }
// //                         <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
// //                         <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
// //                         <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
// //                     </div>

// //                     <div className="sr-sig-box" style={{ borderColor: 'red', color: 'red' }}>
// //                         <span style={{ color: 'red' }}>Assessor Sign-off</span>
// //                         {submission.grading?.gradedAt ? (
// //                             <>
// //                                 {assessorProfile?.signatureUrl
// //                                     ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
// //                                     : <div className="sr-sig-no-image" style={{ color: 'red' }}>No Canvas Signature</div>
// //                                 }
// //                                 <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
// //                                 <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
// //                                 <em style={{ color: 'red' }}>Signed: {new Date(submission.grading.gradedAt).toLocaleDateString()}</em>
// //                                 <div className="sr-sig-line" style={{ borderTopColor: 'red' }}>Digital Signature Confirmed</div>
// //                             </>
// //                         ) : (
// //                             <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
// //                                 <div className="sr-sig-no-image" style={{ color: 'red', border: 'none' }}>Pending Signature</div>
// //                                 <div className="sr-sig-line" style={{ borderTopColor: 'red', width: '80%', marginTop: '10px' }}>Awaiting Assessment</div>
// //                             </div>
// //                         )}
// //                     </div>

// //                     <div className="sr-sig-box" style={{ borderColor: 'green', color: 'green' }}>
// //                         <span style={{ color: 'green' }}>Internal Moderation</span>
// //                         {submission.moderation?.moderatedAt ? (
// //                             <>
// //                                 {moderatorProfile?.signatureUrl
// //                                     ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
// //                                     : <div className="sr-sig-no-image" style={{ color: 'green' }}>No Canvas Signature</div>
// //                                 }
// //                                 <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
// //                                 <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
// //                                 <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString()}</em>
// //                                 <div className="sr-sig-line" style={{ borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
// //                             </>
// //                         ) : (
// //                             <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
// //                                 <div className="sr-sig-no-image" style={{ color: 'green', border: 'none' }}>Pending Signature</div>
// //                                 <div className="sr-sig-line" style={{ borderTopColor: 'green', width: '80%', marginTop: '10px' }}>Awaiting Moderation</div>
// //                             </div>
// //                         )}
// //                     </div>
// //                 </div>

// //             </div>{/* end .sr-print-wrap */}

// //             {/* ══════════════════════════════════════════════════════════════════
// //                 SCREEN LAYOUT — hidden in print
// //             ══════════════════════════════════════════════════════════════════ */}
// //             <div className="sr-layout no-print">
// //                 <div className="sr-content-pane">
// //                     {/* ── Question blocks (Screen Version) ── */}
// //                     <div className="sr-blocks">
// //                         {renderBlocks(false)}
// //                     </div>
// //                 </div>

// //                 {/* ── RIGHT PANE ── */}
// //                 <aside className="sr-sidebar no-print">
// //                     {/* FACILITATOR */}
// //                     {(canFacilitatorMark || showAssessorLayer) ? (
// //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
// //                             <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>
// //                             {canFacilitatorMark && (
// //                                 <div className="sr-role-guide blue"><Info size={16} /><div><strong>Formative Feedback</strong><br />Use your Blue Pen to provide developmental feedback.</div></div>
// //                             )}
// //                             <div className="sr-score-display">
// //                                 <div className="sr-score-circle" style={{ borderColor: 'blue' }}>
// //                                     <span className="sr-score-val" style={{ color: 'blue' }}>{facTotals.score}</span>
// //                                     <span className="sr-score-max" style={{ color: 'blue' }}>/ {facTotals.max}</span>
// //                                 </div>
// //                                 <div className="sr-score-percent" style={{ color: 'blue' }}>{facTotals.pct}%</div>
// //                             </div>
// //                             <div className="sr-overall-feedback">
// //                                 <label className="sr-sidebar-label" style={{ color: 'blue' }}>Facilitator Remarks</label>
// //                                 {canFacilitatorMark ? (
// //                                     <textarea className="sr-textarea" rows={3} style={{ color: 'blue', fontStyle: 'italic', borderColor: 'blue', background: 'whitesmoke' }} placeholder="Add overall coaching comments..." value={facOverallFeedback} onChange={e => handleFacOverallFeedbackChange(e.target.value)} />
// //                                 ) : (
// //                                     <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', color: '#0369a1', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #0284c7' }}>{facOverallFeedback || "No overall remarks provided."}</div>
// //                                 )}
// //                             </div>
// //                             {canFacilitatorMark ? (
// //                                 <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>{saving ? 'Processing...' : 'Send to Assessor'}</button>
// //                             ) : (
// //                                 <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Completed by {submission.grading?.facilitatorName || 'Facilitator'}
// //                                 </div>
// //                             )}
// //                         </div>
// //                     ) : null}

// //                     {/* ASSESSOR */}
// //                     {showAssessorLayer ? (
// //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
// //                             <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>
// //                             {canGrade && (
// //                                 <div className="sr-role-guide red"><Info size={16} /><div><strong>Summative Judgment</strong><br />Declare Competency. You must justify your marks.</div></div>
// //                             )}
// //                             <div className="sr-score-display">
// //                                 <div className="sr-score-circle" style={{ borderColor: 'red', width: '80px', height: '80px' }}>
// //                                     <span className="sr-score-val" style={{ color: 'red', fontSize: '1.5rem' }}>{assTotals.score}</span>
// //                                 </div>
// //                                 <div className="sr-score-percent" style={{ color: 'red' }}>{assTotals.pct}%</div>
// //                             </div>
// //                             <div className="sr-competency-section" style={{ marginTop: '1rem' }}>
// //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Final Competency</label>
// //                                 <div className="sr-comp-toggles">
// //                                     <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')} disabled={!canGrade}><Award size={16} /> Competent (C)</button>
// //                                     <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')} disabled={!canGrade}><AlertCircle size={16} /> Not Yet Competent</button>
// //                                 </div>
// //                             </div>
// //                             <div className="sr-overall-feedback">
// //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
// //                                 {canGrade ? (
// //                                     <textarea className="sr-textarea" rows={3} style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: canGrade ? 'red' : '#cbd5e1' }} placeholder={canGrade ? "Provide holistic feedback..." : "No remarks provided."} value={assOverallFeedback} disabled={!canGrade} onChange={e => handleAssOverallFeedbackChange(e.target.value)} />
// //                                 ) : (
// //                                     <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', color: '#b91c1c', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #dc2626' }}>{assOverallFeedback || "No overall remarks provided."}</div>
// //                                 )}
// //                             </div>
// //                             {(!canGrade && submission.grading?.gradedAt) && (
// //                                 <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
// //                                     <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: 'red', textTransform: 'uppercase' }}>Assessor Signature</p>
// //                                     {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div style={{ height: '40px', fontStyle: 'italic', fontSize: '0.8rem', color: 'red' }}>No Canvas Signature</div>}
// //                                     <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: 'red' }}>{submission.grading?.assessorName}</p>
// //                                     <p style={{ margin: 0, fontSize: '0.75rem', color: 'red' }}><Clock size={10} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// //                                 </div>
// //                             )}
// //                             {canGrade && (
// //                                 <div className="sr-action-area"><button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving}>{saving ? 'Processing...' : 'Apply Signature & Finalise'}</button></div>
// //                             )}
// //                         </div>
// //                     ) : (
// //                         <div className="sr-summary-card sr-locked-card"><Lock size={28} /><h3>Assessor Grading</h3><p>Awaiting Facilitator to complete Blue Pen pre-marking.</p></div>
// //                     )}

// //                     {/* MODERATOR */}
// //                     {showModeratorLayer ? (
// //                         <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
// //                             <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>
// //                             {canModerate && (
// //                                 <div className="sr-role-guide green"><Info size={16} /><div><strong>Quality Assurance Verification</strong><br />Your Green Pen verifies the Assessor's marking. You must verify every question. Use comments to instruct corrections before endorsing.</div></div>
// //                             )}
// //                             <div className="sr-score-display" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
// //                                 <div className="sr-score-circle" style={{ borderColor: 'green' }}>
// //                                     <span className="sr-score-val" style={{ color: 'green' }}>{modTotals.score}</span>
// //                                     <span className="sr-score-max" style={{ color: 'green' }}>/ {modTotals.max}</span>
// //                                 </div>
// //                                 <div className="sr-score-percent" style={{ color: 'green' }}>{modTotals.pct}%</div>
// //                             </div>
// //                             <div className="sr-competency-section">
// //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderation Outcome</label>
// //                                 <div className="sr-comp-toggles">
// //                                     <button className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`} onClick={() => handleModOutcomeSelect('Endorsed')} disabled={!canModerate}><ShieldCheck size={16} /> Endorse Grade</button>
// //                                     <button className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`} onClick={() => handleModOutcomeSelect('Returned')} disabled={!canModerate}><AlertCircle size={16} /> Return to Assessor</button>
// //                                 </div>
// //                             </div>
// //                             <div className="sr-overall-feedback">
// //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderator Feedback</label>
// //                                 <textarea className="sr-textarea" rows={3} style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }} placeholder={canModerate ? "Notes for the assessor or internal QA..." : "No moderation feedback."} value={modFeedback} disabled={!canModerate} onChange={e => handleModFeedbackChange(e.target.value)} />
// //                             </div>
// //                             {(!canModerate && submission.moderation?.moderatedAt) && (
// //                                 <div className="sr-audit-stamp" style={{ color: 'green', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}><CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Moderated by {submission.moderation?.moderatorName}</div>
// //                             )}
// //                             {canModerate && (
// //                                 <div className="sr-action-area"><button className="sr-submit-btn" style={{ background: 'green' }} onClick={triggerSubmitModeration} disabled={saving}>{saving ? 'Processing...' : 'Finalise QA & Endorse'}</button></div>
// //                             )}
// //                         </div>
// //                     ) : (
// //                         <div className="sr-summary-card sr-locked-card"><Lock size={28} /><h3>QA Moderation</h3><p>Awaiting Assessor to complete Red Pen official grading.</p></div>
// //                     )}

// //                     {/* 🚀 OFFICIAL AUDIT TRAIL 🚀 */}
// //                     <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
// //                         <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}><ShieldCheck size={18} color="#073f4e" /> Official Audit Trail</h3>

// //                         {(currentStatus === 'not_started') && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>}

// //                         {/* Learner Record */}
// //                         {currentStatus !== 'not_started' && (
// //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
// //                                 {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
// //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
// //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</p>
// //                             </div>
// //                         )}

// //                         {/* Facilitator Audit Record */}
// //                         {submission.grading?.facilitatorReviewedAt && (
// //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Facilitator Pre-Marking</p>
// //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'blue' }}>{submission.grading?.facilitatorName || 'Facilitator'}</p>
// //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
// //                                     <Clock size={11} /> {moment(submission.grading?.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm')}
// //                                     <span style={{ margin: '0 4px' }}>•</span>
// //                                     <Activity size={11} /> Active: {formatTimeSpent(submission.grading?.facilitatorTimeSpent)}
// //                                     {submission.grading?.facilitatorStartedAt && (
// //                                         <>
// //                                             <span style={{ margin: '0 4px' }}>•</span>
// //                                             <Calendar size={11} /> Spread: {formatCalendarSpread(submission.grading.facilitatorStartedAt, submission.grading.facilitatorReviewedAt)}
// //                                         </>
// //                                     )}
// //                                 </p>
// //                             </div>
// //                         )}

// //                         {/* Assessor Record */}
// //                         {submission.grading?.gradedAt && (
// //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
// //                                 {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
// //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</p>
// //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
// //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
// //                                     <Clock size={11} /> {moment(submission.grading?.gradedAt).format('DD/MM/YYYY HH:mm')}
// //                                     <span style={{ margin: '0 4px' }}>•</span>
// //                                     <Activity size={11} /> Active: {formatTimeSpent(submission.grading?.assessorTimeSpent)}
// //                                     {submission.grading?.assessorStartedAt && (
// //                                         <>
// //                                             <span style={{ margin: '0 4px' }}>•</span>
// //                                             <Calendar size={11} /> Spread: {formatCalendarSpread(submission.grading.assessorStartedAt, submission.grading.gradedAt)}
// //                                         </>
// //                                     )}
// //                                 </p>
// //                             </div>
// //                         )}

// //                         {/* Moderator Record */}
// //                         {submission.moderation?.moderatedAt && (
// //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1rem' }}>
// //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation QA</p>
// //                                 {moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
// //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</p>
// //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Outcome: {submission.moderation?.outcome}</p>
// //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
// //                                     <Clock size={11} /> {moment(submission.moderation?.moderatedAt).format('DD/MM/YYYY HH:MM')}
// //                                     <span style={{ margin: '0 4px' }}>•</span>
// //                                     <Activity size={11} /> Active: {formatTimeSpent(submission.moderation?.timeSpent)}
// //                                     {submission.moderation?.moderatorStartedAt && (
// //                                         <>
// //                                             <span style={{ margin: '0 4px' }}>•</span>
// //                                             <Calendar size={11} /> Spread: {formatCalendarSpread(submission.moderation.moderatorStartedAt, submission.moderation.moderatedAt)}
// //                                         </>
// //                                     )}
// //                                 </p>
// //                             </div>
// //                         )}
// //                     </div>
// //                 </aside>
// //             </div>
// //         </div>
// //     );
// // };

// // export default SubmissionReview;


