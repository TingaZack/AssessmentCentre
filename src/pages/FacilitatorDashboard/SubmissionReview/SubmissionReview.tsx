import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    ArrowLeft, CheckCircle, AlertCircle, Save,
    User, GraduationCap, Clock, MessageSquare, Award,
    ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2, XCircle, AlertTriangle, Activity, Calendar
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import './SubmissionReview.css';
import { createPortal } from 'react-dom';

import moment from 'moment';

interface GradeData {
    score: number;
    feedback: string;
    isCorrect?: boolean | null;
}

export type StatusType = 'info' | 'success' | 'error' | 'warning';

// ─── STATUS MODAL COMPONENT ─────────────────────────────────────────────
const StatusModal: React.FC<{
    type: StatusType;
    title: string;
    message: string;
    onClose: () => void;
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
}> = ({ type, title, message, onClose, onConfirm, confirmText = "Okay", cancelText = "Cancel" }) => {

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `
            body, html { overflow: hidden !important; }
            .sr-root, .main-wrapper, .admin-content, .admin-layout, .sr-layout { overflow: hidden !important; }
        `;
        document.head.appendChild(style);
        return () => {
            document.head.removeChild(style);
        };
    }, []);

    const styles = {
        info: { color: '#3b82f6', Icon: Info },
        success: { color: '#22c55e', Icon: CheckCircle },
        error: { color: '#ef4444', Icon: XCircle },
        warning: { color: '#f59e0b', Icon: AlertTriangle }
    };

    const { color, Icon } = styles[type];

    const modalContent = (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(3px)' }}>
            <div style={{ background: 'white', maxWidth: '400px', width: '90%', textAlign: 'center', padding: '2rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                    <Icon size={48} color={color} />
                </div>
                <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{title}</h2>
                <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem', fontSize: '0.9rem' }}>{message}</p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    {onConfirm && (
                        <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {cancelText}
                        </button>
                    )}
                    <button onClick={onConfirm || onClose} style={{ flex: 1, padding: '0.75rem', background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        {confirmText}
                    </button>
                </div>
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

    const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
    const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});
    const [modBreakdown, setModBreakdown] = useState<Record<string, GradeData>>({});

    const [facOverallFeedback, setFacOverallFeedback] = useState('');
    const [assOverallFeedback, setAssOverallFeedback] = useState('');
    const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

    const [modFeedback, setModFeedback] = useState('');
    const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm?: () => void; confirmText?: string; cancelText?: string } | null>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 🚀 TIME TRACKING REFS (ACTIVE TIME) 🚀
    const sessionStartRef = useRef<number>(performance.now());
    const initialFacTimeRef = useRef<number>(0);
    const initialAssTimeRef = useRef<number>(0);
    const initialModTimeRef = useRef<number>(0);

    const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
    const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
    const isModerator = user?.role === 'moderator' || user?.role === 'admin';

    const canFacilitatorMark = isFacilitator && submission?.status === 'submitted';
    const canGrade = isAssessor && (submission?.status === 'facilitator_reviewed' || submission?.status === 'returned');
    const canModerate = isModerator && submission?.status === 'graded';

    const showAssessorLayer = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(submission?.status);
    const showModeratorLayer = ['graded', 'moderated'].includes(submission?.status);

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

                // 🚀 LOAD HISTORICAL TIME SPENT 🚀
                initialFacTimeRef.current = subData.grading?.facilitatorTimeSpent || 0;
                initialAssTimeRef.current = subData.grading?.assessorTimeSpent || 0;
                initialModTimeRef.current = subData.moderation?.timeSpent || 0;
                sessionStartRef.current = performance.now(); // Reset secure stopwatch

                let fBreakdown = subData.grading?.facilitatorBreakdown;
                let aBreakdown = subData.grading?.assessorBreakdown;
                let mBreakdown = subData.moderation?.breakdown;

                if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
                    if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) {
                        fBreakdown = subData.grading.breakdown;
                    } else {
                        fBreakdown = {};
                        assData.blocks?.forEach((block: any) => {
                            if (block.type === 'mcq') {
                                const isCorrect = subData.answers?.[block.id] === block.correctOption;
                                fBreakdown[block.id] = { score: isCorrect ? (block.marks || 0) : 0, feedback: isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect', isCorrect };
                            } else if (block.type === 'text') {
                                fBreakdown[block.id] = { score: 0, feedback: '', isCorrect: null };
                            }
                        });
                    }
                }
                setFacBreakdown(fBreakdown);

                if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
                    if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(subData.status)) {
                        aBreakdown = JSON.parse(JSON.stringify(fBreakdown));
                        Object.keys(aBreakdown).forEach(key => { aBreakdown[key].feedback = ''; });
                    } else {
                        aBreakdown = {};
                    }
                }
                setAssBreakdown(aBreakdown);

                if (!mBreakdown || Object.keys(mBreakdown).length === 0) {
                    if (['graded', 'moderated', 'returned'].includes(subData.status)) {
                        mBreakdown = JSON.parse(JSON.stringify(aBreakdown));
                        Object.keys(mBreakdown).forEach(key => { mBreakdown[key].feedback = ''; });
                    } else {
                        mBreakdown = {};
                    }
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


    // 🚀 TIME CALCULATION HELPERS 🚀
    const getFacTime = () => initialFacTimeRef.current + (canFacilitatorMark ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
    const getAssTime = () => initialAssTimeRef.current + (canGrade ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
    const getModTime = () => initialModTimeRef.current + (canModerate ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);

    const formatTimeSpent = (seconds?: number) => {
        if (seconds === undefined || seconds === null) return '—';
        const m = Math.floor(seconds / 60);
        if (m === 0) return '< 1m';
        const h = Math.floor(m / 60);
        if (h > 0) {
            const remM = m % 60;
            return `${h}h ${remM}m`;
        }
        return `${m}m`;
    };

    // 🚀 CALENDAR SPREAD HELPER 🚀
    const formatCalendarSpread = (startStr?: string, endStr?: string) => {
        if (!startStr || !endStr) return null;
        const start = new Date(startStr).getTime();
        const end = new Date(endStr).getTime();
        const diffHours = (end - start) / (1000 * 60 * 60);

        if (diffHours < 24) {
            if (diffHours < 1) return '< 1 hr spread';
            return `${Math.floor(diffHours)} hr spread`;
        }
        return `${Math.floor(diffHours / 24)} day spread`;
    };


    const triggerAutoSave = (fBreak: any, aBreak: any, mBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        setSaving(true);
        saveTimeoutRef.current = setTimeout(async () => {
            if (!submission?.id) return;
            try {
                const updatePayload: any = {
                    'grading.facilitatorBreakdown': fBreak,
                    'grading.assessorBreakdown': aBreak,
                    'moderation.breakdown': mBreak,
                    'grading.facilitatorOverallFeedback': fOverall,
                    'grading.assessorOverallFeedback': aOverall,
                    'moderation.feedback': updatedModFeedback,
                    lastStaffEditAt: new Date().toISOString()
                };

                if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
                if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

                // 🚀 Inject live Active Time tracking into Auto-save
                if (canFacilitatorMark) updatePayload['grading.facilitatorTimeSpent'] = getFacTime();
                if (canGrade) updatePayload['grading.assessorTimeSpent'] = getAssTime();
                if (canModerate) updatePayload['moderation.timeSpent'] = getModTime();

                // 🚀 Capture "First Touch" for Calendar Spread (Only fires once per role)
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
            } catch (error) {
                console.error("Auto-save failed:", error);
            } finally {
                setSaving(false);
            }
        }, 1500);
    };

    const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
        if (canFacilitatorMark) {
            const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
            setFacBreakdown(next);
            triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canGrade) {
            const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
            setAssBreakdown(next);
            triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canModerate) {
            const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
            setModBreakdown(next);
            triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        }
    };

    const handleScoreChange = (blockId: string, score: number, max: number) => {
        const val = Math.min(Math.max(0, score), max);
        if (canFacilitatorMark) {
            const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], score: val } };
            setFacBreakdown(next);
            triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canGrade) {
            const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], score: val } };
            setAssBreakdown(next);
            triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canModerate) {
            const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], score: val } };
            setModBreakdown(next);
            triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        }
    };

    const handleFeedbackChange = (blockId: string, feedback: string) => {
        if (canFacilitatorMark) {
            const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], feedback } };
            setFacBreakdown(next);
            triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canGrade) {
            const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], feedback } };
            setAssBreakdown(next);
            triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canModerate) {
            const next = { ...modBreakdown, [blockId]: { ...modBreakdown[blockId], feedback } };
            setModBreakdown(next);
            triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        }
    };

    const handleFacOverallFeedbackChange = (val: string) => {
        if (!canFacilitatorMark) return;
        setFacOverallFeedback(val);
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome);
    };

    const handleAssOverallFeedbackChange = (val: string) => {
        if (!canGrade) return;
        setAssOverallFeedback(val);
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome);
    };

    const handleModFeedbackChange = (val: string) => {
        if (!canModerate) return;
        setModFeedback(val);
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome);
    };

    const handleCompetencySelect = (val: 'C' | 'NYC') => {
        if (!canGrade) return;
        setCompetency(val);
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome);
    };

    const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
        if (!canModerate) return;
        setModOutcome(val);
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val);
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
    if (showAssessorLayer) activeTotals = assTotals;
    if (showModeratorLayer) activeTotals = modTotals;

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
        if (!validateAllMarked(facBreakdown)) {
            setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Marking', message: 'You must evaluate every question. Please ensure every question has a Green Tick or Red Cross selected before submitting.', confirmText: 'Got it' });
            return;
        }
        if (!facOverallFeedback.trim()) {
            setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Overall Facilitator Remarks before sending this script to the Assessor.', confirmText: 'Got it' });
            return;
        }

        setModalConfig({
            isOpen: true, type: 'info', title: 'Complete Pre-Marking?',
            message: 'This will finalize your Blue Pen feedback and send the workbook to the Assessor for official grading.',
            confirmText: 'Send to Assessor',
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: 'facilitator_reviewed',
                        'grading.facilitatorBreakdown': facBreakdown,
                        'grading.facilitatorOverallFeedback': facOverallFeedback,
                        'grading.facilitatorId': user?.uid,
                        'grading.facilitatorName': user?.fullName,
                        'grading.facilitatorReviewedAt': new Date().toISOString(),
                        'grading.facilitatorTimeSpent': getFacTime() // 🚀 Save final Active time
                    });
                    toast.success("Script marked and passed to Assessor!");
                    setTimeout(() => navigate(-1), 2000);
                } catch (error) { toast.error("Failed to save marking."); } finally { setSaving(false); }
            }
        });
    };

    const triggerSubmitGrade = () => {
        if (!validateAllMarked(assBreakdown)) {
            setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Grading', message: 'You must evaluate every question. Please ensure every question has a Tick or Cross selected before submitting your final grade.', confirmText: 'Got it' });
            return;
        }
        if (!competency) {
            setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a Final Competency (C or NYC) before submitting.', confirmText: 'Got it' });
            return;
        }
        if (!assOverallFeedback.trim()) {
            setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Assessor Remarks justifying your final outcome before submitting.', confirmText: 'Got it' });
            return;
        }

        setModalConfig({
            isOpen: true, type: 'warning', title: 'Finalise Grade?',
            message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.',
            confirmText: 'Apply Signature & Submit',
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: 'graded',
                        marks: assTotals.score,
                        competency: competency,
                        'grading.assessorBreakdown': assBreakdown,
                        'grading.assessorOverallFeedback': assOverallFeedback,
                        'grading.gradedBy': user?.uid,
                        'grading.assessorName': user?.fullName,
                        'grading.assessorRegNumber': user?.assessorRegNumber || 'Pending Reg',
                        'grading.gradedAt': new Date().toISOString(),
                        'grading.assessorTimeSpent': getAssTime() // 🚀 Save final Active time
                    });
                    toast.success("Workbook graded and signed successfully!");
                    setTimeout(() => window.location.reload(), 500);
                } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
            }
        });
    };

    const triggerSubmitModeration = () => {
        if (!validateAllMarked(modBreakdown)) {
            setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete QA', message: 'You must verify every question with a Green Tick or Cross to confirm the Assessor’s marks before endorsing.', confirmText: 'Got it' });
            return;
        }
        if (!modOutcome) {
            setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Outcome', message: 'You must select a Moderation Outcome (Endorsed or Returned) before submitting.', confirmText: 'Got it' });
            return;
        }
        if (!modFeedback.trim()) {
            setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Feedback', message: 'You must provide Moderator Feedback explaining your decision.', confirmText: 'Got it' });
            return;
        }

        setModalConfig({
            isOpen: true, type: 'info', title: 'Finalise Moderation?',
            message: modOutcome === 'Returned' ? 'This will return the workbook to the Assessor for remediation.' : 'This will apply your Green Pen signature and endorse the final grade.',
            confirmText: 'Confirm Moderation',
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: newStatus,
                        'moderation.breakdown': modBreakdown,
                        'moderation.outcome': modOutcome,
                        'moderation.feedback': modFeedback,
                        'moderation.moderatedBy': user?.uid,
                        'moderation.moderatorName': user?.fullName,
                        'moderation.moderatorRegNumber': user?.assessorRegNumber || 'Pending Reg',
                        'moderation.moderatedAt': new Date().toISOString(),
                        'moderation.timeSpent': getModTime() // 🚀 Save final Active time
                    });
                    toast.success("Moderation saved successfully!");
                    setTimeout(() => navigate(-1), 1000);
                } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
            }
        });
    };

    if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
    if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

    const hasBeenGraded = ['graded', 'moderated'].includes(submission.status);
    const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');
    const printInkColor = showModeratorLayer ? 'green' : (showAssessorLayer ? 'red' : 'blue');

    return (
        <div className="sr-root animate-fade-in">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {modalConfig && (
                <StatusModal
                    type={modalConfig.type} title={modalConfig.title} message={modalConfig.message}
                    onConfirm={modalConfig.onConfirm} confirmText={modalConfig.confirmText}
                    cancelText={modalConfig.cancelText} onClose={() => setModalConfig(null)}
                />
            )}

            <div className="ap-player-topbar no-print">
                <div className="ap-player-topbar__left">
                    <button className="sr-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={13} /> Portfolio</button>
                    <div className="ap-player-topbar__separator" />
                    <h1 className="ap-player-topbar__title">{assessment.title}</h1>
                </div>
                <div className="ap-player-topbar__right">
                    <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}><Printer size={13} /> Print Audit</button>
                    <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
                        {saving ? <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</> : <><CheckCircle size={12} /> Auto-saved</>}
                    </span>
                </div>
            </div>

            <div className="sr-layout">
                <div className="sr-content-pane print-pane">

                    <div className="sr-print-header">
                        <h2>OFFICIAL ASSESSMENT RECORD</h2>
                        <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', borderBottom: '1px solid black', paddingBottom: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <p style={{ margin: '4px 0', color: 'black' }}><strong>Learner Name:</strong> {learner?.fullName}</p>
                                <p style={{ margin: '4px 0', color: 'black' }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
                                <p style={{ margin: '4px 0', color: 'black' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
                            </div>
                            <div style={{ flex: 1, textAlign: 'right' }}>
                                <p style={{ margin: '4px 0', color: 'black' }}><strong>Score:</strong> <span style={{ color: printInkColor, fontWeight: 'bold' }}>{activeTotals.score} / {activeTotals.max} ({activeTotals.pct}%)</span></p>
                                <p style={{ margin: '4px 0', color: 'black' }}><strong>Outcome:</strong> <span style={{ color: printOutcomeColor, fontWeight: 'bold' }}>{submission.competency === 'C' ? 'Competent (C)' : (submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending')}</span></p>
                                <p style={{ margin: '4px 0', color: 'black' }}><strong>Submitted:</strong> {new Date(submission.submittedAt).toLocaleDateString()}</p>
                            </div>
                        </div>

                        <div className="sr-signature-block">
                            <div className="sr-sig-box" style={{ borderColor: 'black' }}>
                                <span style={{ color: 'black' }}>Learner Declaration</span>
                                {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'black', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>}
                                <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
                                <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ color: 'black', borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
                            </div>

                            {showAssessorLayer && submission.grading?.gradedAt && (
                                <div className="sr-sig-box" style={{ borderColor: 'red' }}>
                                    <span style={{ color: 'red' }}>Assessor Sign-off</span>
                                    {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'red', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>}
                                    <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
                                    <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
                                    <em style={{ color: 'red' }}>Signed: {new Date(submission.grading?.gradedAt).toLocaleDateString()}</em>
                                    <div className="sr-sig-line" style={{ color: 'red', borderTopColor: 'red' }}>Digital Signature Confirmed</div>
                                </div>
                            )}

                            {showModeratorLayer && submission.moderation?.moderatedAt && (
                                <div className="sr-sig-box" style={{ borderColor: 'green' }}>
                                    <span style={{ color: 'green' }}>Internal Moderation</span>
                                    {moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" /> : <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'green', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>}
                                    <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
                                    <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
                                    <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</em>
                                    <div className="sr-sig-line" style={{ color: 'green', borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {!showAssessorLayer && (
                        <div className="sr-learner-meta no-print">
                            <User size={18} color="black" />
                            <span style={{ color: 'black' }}><strong>{learner?.fullName}</strong> ({learner?.idNumber})</span>
                            <span className="sr-dot" />
                            <Clock size={14} color="black" />
                            <span style={{ color: 'black' }}>Submitted: {moment(submission.submittedAt).format('DD/MM/YYYY HH:mm')}</span>
                        </div>
                    )}

                    <div className="sr-blocks">
                        {assessment.blocks?.map((block: any, idx: number) => {
                            if (block.type === 'section') {
                                return <h2 key={block.id} className="sr-section-title" style={{ color: '#073f4e' }}>{block.title}</h2>;
                            }

                            if (block.type === 'mcq' || block.type === 'text') {
                                const learnerAns = submission.answers?.[block.id];
                                const maxM = block.marks || 0;
                                const isMCQ = block.type === 'mcq';

                                const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
                                const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
                                const mData = modBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };

                                let activeInkColor = 'blue';
                                let activeData = fData;
                                let isActiveRole = false;

                                if (canFacilitatorMark) { activeInkColor = 'blue'; activeData = fData; isActiveRole = true; }
                                else if (canGrade) { activeInkColor = 'red'; activeData = aData; isActiveRole = true; }
                                else if (canModerate) { activeInkColor = 'green'; activeData = mData; isActiveRole = true; }
                                else {
                                    if (submission.status === 'moderated') { activeInkColor = 'green'; activeData = mData; }
                                    else if (submission.status === 'graded' || submission.status === 'returned') { activeInkColor = 'red'; activeData = aData; }
                                    else { activeInkColor = 'blue'; activeData = fData; }
                                }

                                return (
                                    <div key={block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
                                        <div className="sr-q-header">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
                                                <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>

                                                <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                                                    {(showAssessorLayer || showModeratorLayer) && fData.isCorrect !== null && (
                                                        <span title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 4px', borderRadius: '4px' }}>
                                                            {fData.isCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}
                                                        </span>
                                                    )}
                                                    {showModeratorLayer && aData.isCorrect !== null && (
                                                        <span title="Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 4px', borderRadius: '4px' }}>
                                                            {aData.isCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="sr-visual-mark">
                                                <button
                                                    onClick={() => handleVisualMark(block.id, true, maxM)}
                                                    disabled={!isActiveRole}
                                                    className="sr-mark-btn"
                                                    style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
                                                    title="Mark Correct"
                                                >
                                                    <Check size={20} />
                                                </button>
                                                <button
                                                    onClick={() => handleVisualMark(block.id, false, maxM)}
                                                    disabled={!isActiveRole}
                                                    className="sr-mark-btn"
                                                    style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
                                                    title="Mark Incorrect"
                                                >
                                                    <X size={20} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="sr-q-body">
                                            <div className="sr-answer-box">
                                                <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
                                                {isMCQ ? (
                                                    <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
                                                        <span style={{ color: 'black' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
                                                        {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
                                                    </div>
                                                ) : (
                                                    <div className="sr-text-ans">
                                                        {learnerAns ? <div className="quill-read-only-content" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: learnerAns }} /> : <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>}
                                                    </div>
                                                )}
                                                {isMCQ && <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong></div>}
                                            </div>

                                            {(showAssessorLayer || showModeratorLayer) && (fData.score > 0 || fData.feedback || fData.isCorrect !== null) && (
                                                <div className="sr-read-only-feedback" style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
                                                    <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Info size={13} /> Facilitator Pre-Mark</div>
                                                    <div style={{ color: '#0369a1', fontSize: '0.85rem' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{fData.score ?? 0}/{maxM}]</span> {fData.feedback || <em style={{ opacity: 0.7 }}>No specific coaching provided.</em>}</div>
                                                </div>
                                            )}

                                            {(showModeratorLayer) && (aData.score > 0 || aData.feedback || aData.isCorrect !== null) && (
                                                <div className="sr-read-only-feedback" style={{ background: '#fef2f2', borderLeft: '3px solid #ef4444', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
                                                    <div style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Award size={13} /> Assessor Grade</div>
                                                    <div style={{ color: '#991b1b', fontSize: '0.85rem' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{aData.score ?? 0}/{maxM}]</span> {aData.feedback || <em style={{ opacity: 0.7 }}>No specific feedback provided.</em>}</div>
                                                </div>
                                            )}

                                            {(!canModerate && submission.status === 'moderated') && (mData.score > 0 || mData.feedback || mData.isCorrect !== null) && (
                                                <div className="sr-read-only-feedback" style={{ background: '#f0fdf4', borderLeft: '3px solid #22c55e', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
                                                    <div style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><ShieldCheck size={13} /> Moderator QA</div>
                                                    <div style={{ color: '#16a34a', fontSize: '0.85rem' }}><span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{mData.score ?? 0}/{maxM}]</span> {mData.feedback || <em style={{ opacity: 0.7 }}>No QA feedback provided.</em>}</div>
                                                </div>
                                            )}

                                            {isActiveRole && (
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
                        })}
                    </div>
                </div>

                {/* ── RIGHT PANE ── */}
                <aside className="sr-sidebar no-print">

                    {/* FACILITATOR */}
                    {(canFacilitatorMark || showAssessorLayer) && (
                        <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
                            <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>
                            {canFacilitatorMark && (
                                <div className="sr-role-guide blue"><Info size={16} /><div><strong>Formative Feedback</strong><br />Use your Blue Pen to provide developmental feedback.</div></div>
                            )}
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
                                    <textarea className="sr-textarea" rows={3} style={{ color: 'blue', fontStyle: 'italic', borderColor: 'blue' }} placeholder="Add overall coaching comments..." value={facOverallFeedback} onChange={e => handleFacOverallFeedbackChange(e.target.value)} />
                                ) : (
                                    <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', color: '#0369a1', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #0284c7' }}>{facOverallFeedback || "No overall remarks provided."}</div>
                                )}
                            </div>
                            {canFacilitatorMark ? (
                                <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>{saving ? 'Processing...' : 'Send to Assessor'}</button>
                            ) : (
                                <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
                                    <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Completed by {submission.grading?.facilitatorName || 'Facilitator'}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ASSESSOR */}
                    {showAssessorLayer ? (
                        <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
                            <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>
                            {canGrade && (
                                <div className="sr-role-guide red"><Info size={16} /><div><strong>Summative Judgment</strong><br />Declare Competency. You must justify your marks.</div></div>
                            )}
                            <div className="sr-score-display">
                                <div className="sr-score-circle" style={{ borderColor: 'red', width: '80px', height: '80px' }}>
                                    <span className="sr-score-val" style={{ color: 'red', fontSize: '1.5rem' }}>{assTotals.score}</span>
                                </div>
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
                                    <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', color: '#b91c1c', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #dc2626' }}>{assOverallFeedback || "No overall remarks provided."}</div>
                                )}
                            </div>
                            {(!canGrade && submission.grading?.gradedAt) && (
                                <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
                                    <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: 'red', textTransform: 'uppercase' }}>Assessor Signature</p>
                                    {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div style={{ height: '40px', fontStyle: 'italic', fontSize: '0.8rem', color: 'red' }}>No Canvas Signature</div>}
                                    <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: 'red' }}>{submission.grading?.assessorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'red' }}>
                                        <Clock size={10} /> {moment(submission.grading?.gradedAt).format('DD/MM/YYYY HH:mm')}</p>
                                </div>
                            )}
                            {canGrade && (
                                <div className="sr-action-area"><button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving}>{saving ? 'Processing...' : 'Apply Signature & Finalise'}</button></div>
                            )}
                        </div>
                    ) : (
                        <div className="sr-summary-card sr-locked-card"><Lock size={28} /><h3>Assessor Grading</h3><p>Awaiting Facilitator to complete Blue Pen pre-marking.</p></div>
                    )}

                    {/* MODERATOR */}
                    {showModeratorLayer ? (
                        <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
                            <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>
                            {canModerate && (
                                <div className="sr-role-guide green"><Info size={16} /><div><strong>Quality Assurance Verification</strong><br />Your Green Pen verifies the Assessor's marking. You must verify every question. Use comments to instruct corrections before endorsing.</div></div>
                            )}
                            <div className="sr-score-display" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                                <div className="sr-score-circle" style={{ borderColor: 'green' }}>
                                    <span className="sr-score-val" style={{ color: 'green' }}>{modTotals.score}</span>
                                    <span className="sr-score-max" style={{ color: 'green' }}>/ {modTotals.max}</span>
                                </div>
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
                            {(!canModerate && submission.moderation?.moderatedAt) && (
                                <div className="sr-audit-stamp" style={{ color: 'green', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}><CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Moderated by {submission.moderation?.moderatorName}</div>
                            )}
                            {canModerate && (
                                <div className="sr-action-area"><button className="sr-submit-btn" style={{ background: 'green' }} onClick={triggerSubmitModeration} disabled={saving}>{saving ? 'Processing...' : 'Finalise QA & Endorse'}</button></div>
                            )}
                        </div>
                    ) : (
                        <div className="sr-summary-card sr-locked-card"><Lock size={28} /><h3>QA Moderation</h3><p>Awaiting Assessor to complete Red Pen official grading.</p></div>
                    )}

                    {/* 🚀 OFFICIAL AUDIT TRAIL 🚀 */}
                    <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}><ShieldCheck size={18} color="#073f4e" /> Official Audit Trail</h3>

                        {(submission.status === 'not_started') && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>}

                        {/* Learner Record */}
                        {submission.status !== 'not_started' && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
                                {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}</p>
                            </div>
                        )}

                        {/* Facilitator Audit Record */}
                        {submission.grading?.facilitatorReviewedAt && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Facilitator Pre-Marking</p>
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'blue' }}>{submission.grading?.facilitatorName || 'Facilitator'}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'blue', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <Clock size={11} /> {moment(submission.grading?.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm')}
                                    <span style={{ margin: '0 4px' }}>•</span>
                                    <Activity size={11} /> Active: {formatTimeSpent(submission.grading?.facilitatorTimeSpent)}
                                    {submission.grading?.facilitatorStartedAt && (
                                        <>
                                            <span style={{ margin: '0 4px' }}>•</span>
                                            <Calendar size={11} /> Spread: {formatCalendarSpread(submission.grading.facilitatorStartedAt, submission.grading.facilitatorReviewedAt)}
                                        </>
                                    )}
                                </p>
                            </div>
                        )}

                        {/* Assessor Record */}
                        {submission.grading?.gradedAt && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
                                {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName}</p>
                                <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'red', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <Clock size={11} /> {moment(submission.grading?.gradedAt).format('DD/MM/YYYY HH:mm')}

                                    <span style={{ margin: '0 4px' }}>•</span>
                                    <Activity size={11} /> Active: {formatTimeSpent(submission.grading?.assessorTimeSpent)}
                                    {submission.grading?.assessorStartedAt && (
                                        <>
                                            <span style={{ margin: '0 4px' }}>•</span>
                                            <Calendar size={11} /> Spread: {formatCalendarSpread(submission.grading.assessorStartedAt, submission.grading.gradedAt)}
                                        </>
                                    )}
                                </p>
                            </div>
                        )}

                        {/* Moderator Record */}
                        {submission.moderation?.moderatedAt && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation</p>
                                {moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName}</p>
                                <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: 'green' }}>Outcome: {submission.moderation?.outcome}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'green', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    {/* <Clock size={11} /> {new Date(submission.moderation?.moderatedAt).toLocaleDateString()} */}
                                    <Clock size={11} /> {moment(submission.grading?.moderatedAt).format('DD/MM/YYYY HH:mm')}

                                    <span style={{ margin: '0 4px' }}>•</span>
                                    <Activity size={11} /> Active: {formatTimeSpent(submission.moderation?.timeSpent)}
                                    {submission.moderation?.moderatorStartedAt && (
                                        <>
                                            <span style={{ margin: '0 4px' }}>•</span>
                                            <Calendar size={11} /> Spread: {formatCalendarSpread(submission.moderation.moderatorStartedAt, submission.moderation.moderatedAt)}
                                        </>
                                    )}
                                </p>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
};

const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
    const filterMap: any = {
        black: 'brightness(0)',
        blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
        red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
        green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
    };

    return (
        <img
            src={imageUrl}
            alt="Signature"
            style={{
                height: '60px',
                width: 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                marginBottom: '10px',
                filter: filterMap[color] || 'none'
            }}
        />
    );
};


// import React, { useState, useEffect, useRef } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { doc, getDoc, updateDoc } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import {
//     ArrowLeft, CheckCircle, AlertCircle, Save,
//     User, GraduationCap, Clock, MessageSquare, Award,
//     ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2, XCircle, AlertTriangle
// } from 'lucide-react';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// import './SubmissionReview.css';
// import { createPortal } from 'react-dom';

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

//     // Keep the scroll lock to stop the background from scrolling via mouse-wheel
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

//     // Wrap the entire modal in createPortal to escape layout bugs
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

//     // 🚀 STRICT 3-LAYER GRADING STATE 🚀
//     const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
//     const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});
//     const [modBreakdown, setModBreakdown] = useState<Record<string, GradeData>>({});

//     const [facOverallFeedback, setFacOverallFeedback] = useState('');
//     const [assOverallFeedback, setAssOverallFeedback] = useState('');
//     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

//     const [modFeedback, setModFeedback] = useState('');
//     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

//     // Modal State & Auto-Save
//     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm?: () => void; confirmText?: string; cancelText?: string } | null>(null);
//     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

//     // ─── RBAC: PERMISSION FLAGS ────────────────────────────────────────────────
//     const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
//     const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
//     const isModerator = user?.role === 'moderator' || user?.role === 'admin';

//     const canFacilitatorMark = isFacilitator && submission?.status === 'submitted';
//     const canGrade = isAssessor && (submission?.status === 'facilitator_reviewed' || submission?.status === 'returned');
//     const canModerate = isModerator && submission?.status === 'graded';

//     // 🚀 Defines what layers are visible to whom
//     const showAssessorLayer = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(submission?.status);
//     const showModeratorLayer = ['graded', 'moderated'].includes(submission?.status);

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

//                 // 🚀 LAYERED DATA LOADING & LEGACY MIGRATION 🚀
//                 let fBreakdown = subData.grading?.facilitatorBreakdown;
//                 let aBreakdown = subData.grading?.assessorBreakdown;
//                 let mBreakdown = subData.moderation?.breakdown;

//                 // 1. Load Facilitator Data
//                 if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
//                     if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) {
//                         fBreakdown = subData.grading.breakdown;
//                     } else {
//                         fBreakdown = {};
//                         assData.blocks?.forEach((block: any) => {
//                             if (block.type === 'mcq') {
//                                 const isCorrect = subData.answers?.[block.id] === block.correctOption;
//                                 fBreakdown[block.id] = { score: isCorrect ? (block.marks || 0) : 0, feedback: isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect', isCorrect };
//                             } else if (block.type === 'text') {
//                                 fBreakdown[block.id] = { score: 0, feedback: '', isCorrect: null };
//                             }
//                         });
//                     }
//                 }
//                 setFacBreakdown(fBreakdown);

//                 // 2. Load Assessor Data
//                 if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
//                     if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(subData.status)) {
//                         aBreakdown = JSON.parse(JSON.stringify(fBreakdown));
//                         Object.keys(aBreakdown).forEach(key => { aBreakdown[key].feedback = ''; });
//                     } else {
//                         aBreakdown = {};
//                     }
//                 }
//                 setAssBreakdown(aBreakdown);

//                 // 3. Load Moderator Data (The Green Pen Layer)
//                 if (!mBreakdown || Object.keys(mBreakdown).length === 0) {
//                     if (['graded', 'moderated', 'returned'].includes(subData.status)) {
//                         mBreakdown = JSON.parse(JSON.stringify(aBreakdown));
//                         Object.keys(mBreakdown).forEach(key => { mBreakdown[key].feedback = ''; });
//                     } else {
//                         mBreakdown = {};
//                     }
//                 }
//                 setModBreakdown(mBreakdown);

//                 // Load Overall Feedbacks
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

//     // ─── AUTO-SAVE ENGINE ──────────────────────────────────────────────────
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

//                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
//             } catch (error) {
//                 console.error("Auto-save failed:", error);
//             } finally {
//                 setSaving(false);
//             }
//         }, 1500);
//     };

//     // ─── VISUAL MARKING HANDLERS ──────────────────────────────────────────────
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

//     // 🚀 INDEPENDENT SCORE CALCULATIONS 🚀
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

//     // ─── VALIDATION HELPER ──────────────────────────────────────────────────
//     const validateAllMarked = (breakdown: Record<string, GradeData>) => {
//         if (!assessment?.blocks) return true;
//         const unmarkedCount = assessment.blocks.filter((block: any) => {
//             if (block.type !== 'mcq' && block.type !== 'text') return false;
//             const grade = breakdown[block.id];
//             return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
//         }).length;
//         return unmarkedCount === 0;
//     };

//     // ─── FINAL SUBMISSIONS ──────────────────────────────────────────────────
//     const triggerSubmitFacilitator = () => {
//         if (!validateAllMarked(facBreakdown)) {
//             setModalConfig({
//                 isOpen: true, type: 'warning',
//                 title: 'Incomplete Marking',
//                 message: 'You must evaluate every question. Please ensure every question has a Green Tick or Red Cross selected before submitting.',
//                 confirmText: 'Got it'
//             });
//             return;
//         }

//         if (!facOverallFeedback.trim()) {
//             setModalConfig({
//                 isOpen: true, type: 'warning',
//                 title: 'Missing Remarks',
//                 message: 'You must provide Overall Facilitator Remarks before sending this script to the Assessor.',
//                 confirmText: 'Got it'
//             });
//             return;
//         }

//         setModalConfig({
//             isOpen: true, type: 'info',
//             title: 'Complete Pre-Marking?',
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
//                         'grading.facilitatorReviewedAt': new Date().toISOString()
//                     });
//                     toast.success("Script marked and passed to Assessor!");
//                     setTimeout(() => navigate(-1), 2000);
//                 } catch (error) { toast.error("Failed to save marking."); } finally { setSaving(false); }
//             }
//         });
//     };

//     const triggerSubmitGrade = () => {
//         if (!validateAllMarked(assBreakdown)) {
//             setModalConfig({
//                 isOpen: true, type: 'warning',
//                 title: 'Incomplete Grading',
//                 message: 'You must evaluate every question. Please ensure every question has a Tick or Cross selected before submitting your final grade.',
//                 confirmText: 'Got it'
//             });
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
//             isOpen: true, type: 'warning',
//             title: 'Finalise Grade?',
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
//                         'grading.gradedAt': new Date().toISOString()
//                     });
//                     toast.success("Workbook graded and signed successfully!");
//                     setTimeout(() => window.location.reload(), 500);
//                 } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
//             }
//         });
//     };

//     const triggerSubmitModeration = () => {
//         if (!validateAllMarked(modBreakdown)) {
//             setModalConfig({
//                 isOpen: true, type: 'warning',
//                 title: 'Incomplete QA',
//                 message: 'You must verify every question with a Green Tick or Cross to confirm the Assessor’s marks before endorsing.',
//                 confirmText: 'Got it'
//             });
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
//             isOpen: true, type: 'info',
//             title: 'Finalise Moderation?',
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
//                         'moderation.moderatedAt': new Date().toISOString()
//                     });
//                     toast.success("Moderation saved successfully!");
//                     setTimeout(() => navigate(-1), 1000);
//                 } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
//             }
//         });
//     };

//     if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
//     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

//     const hasBeenGraded = ['graded', 'moderated'].includes(submission.status);
//     const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');

//     // 🚀 We set the active ink color for the overall print layout based on status
//     const printInkColor = showModeratorLayer ? 'green' : (showAssessorLayer ? 'red' : 'blue');

//     return (
//         <div className="sr-root animate-fade-in">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {/* 🚀 MODAL MOUNT 🚀 */}
//             {modalConfig && (
//                 <StatusModal
//                     type={modalConfig.type}
//                     title={modalConfig.title}
//                     message={modalConfig.message}
//                     onConfirm={modalConfig.onConfirm}
//                     confirmText={modalConfig.confirmText}
//                     cancelText={modalConfig.cancelText}
//                     onClose={() => setModalConfig(null)}
//                 />
//             )}

//             {/* ── TOP NAV ── */}
//             <div className="ap-player-topbar no-print">
//                 <div className="ap-player-topbar__left">
//                     <button className="sr-back-btn" onClick={() => navigate(-1)}>
//                         <ArrowLeft size={13} /> Portfolio
//                     </button>
//                     <div className="ap-player-topbar__separator" />
//                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
//                 </div>

//                 <div className="ap-player-topbar__right">
//                     <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
//                         <Printer size={13} /> Print Audit
//                     </button>
//                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
//                         {saving ? (
//                             <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</>
//                         ) : (
//                             <><CheckCircle size={12} /> Auto-saved</>
//                         )}
//                     </span>
//                 </div>
//             </div>

//             <div className="sr-layout">
//                 {/* ── LEFT PANE: WORKBOOK & ANSWERS ── */}
//                 <div className="sr-content-pane print-pane">

//                     {/* 🚀 OFFICIAL QCTO AUDIT HEADER (Visible on Print) 🚀 */}
//                     <div className="sr-print-header">
//                         <h2>OFFICIAL ASSESSMENT RECORD</h2>

//                         <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', borderBottom: '1px solid black', paddingBottom: '1rem' }}>
//                             <div style={{ flex: 1 }}>
//                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Learner Name:</strong> {learner?.fullName}</p>
//                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
//                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
//                             </div>
//                             <div style={{ flex: 1, textAlign: 'right' }}>
//                                 <p style={{ margin: '4px 0', color: 'black' }}>
//                                     <strong>Score:</strong> <span style={{ color: printInkColor, fontWeight: 'bold' }}>{activeTotals.score} / {activeTotals.max} ({activeTotals.pct}%)</span>
//                                 </p>
//                                 <p style={{ margin: '4px 0', color: 'black' }}>
//                                     <strong>Outcome:</strong> <span style={{ color: printOutcomeColor, fontWeight: 'bold' }}>{submission.competency === 'C' ? 'Competent (C)' : (submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending')}</span>
//                                 </p>
//                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Submitted:</strong> {new Date(submission.submittedAt).toLocaleDateString()}</p>
//                             </div>
//                         </div>

//                         {/* SIGNATURE BLOCKS */}
//                         <div className="sr-signature-block">
//                             <div className="sr-sig-box" style={{ borderColor: 'black' }}>
//                                 <span style={{ color: 'black' }}>Learner Declaration</span>
//                                 {learnerProfile?.signatureUrl ? (
//                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
//                                 ) : (
//                                     <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'black', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
//                                 )}
//                                 <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
//                                 <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
//                                 <div className="sr-sig-line" style={{ color: 'black', borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
//                             </div>

//                             {showAssessorLayer && submission.grading?.gradedAt && (
//                                 <div className="sr-sig-box" style={{ borderColor: 'red' }}>
//                                     <span style={{ color: 'red' }}>Assessor Sign-off</span>
//                                     {assessorProfile?.signatureUrl ? (
//                                         <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
//                                     ) : (
//                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'red', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
//                                     )}
//                                     <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
//                                     <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
//                                     <em style={{ color: 'red' }}>Signed: {new Date(submission.grading?.gradedAt).toLocaleDateString()}</em>
//                                     <div className="sr-sig-line" style={{ color: 'red', borderTopColor: 'red' }}>Digital Signature Confirmed</div>
//                                 </div>
//                             )}

//                             {showModeratorLayer && submission.moderation?.moderatedAt && (
//                                 <div className="sr-sig-box" style={{ borderColor: 'green' }}>
//                                     <span style={{ color: 'green' }}>Internal Moderation</span>
//                                     {moderatorProfile?.signatureUrl ? (
//                                         <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
//                                     ) : (
//                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'green', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
//                                     )}
//                                     <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
//                                     <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
//                                     <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</em>
//                                     <div className="sr-sig-line" style={{ color: 'green', borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
//                                 </div>
//                             )}
//                         </div>
//                     </div>

//                     {!showAssessorLayer && (
//                         <div className="sr-learner-meta no-print">
//                             <User size={18} color="black" />
//                             <span style={{ color: 'black' }}><strong>{learner?.fullName}</strong> ({learner?.idNumber})</span>
//                             <span className="sr-dot" />
//                             <Clock size={14} color="black" />
//                             <span style={{ color: 'black' }}>Submitted: {new Date(submission.submittedAt).toLocaleString()}</span>
//                         </div>
//                     )}

//                     <div className="sr-blocks">
//                         {assessment.blocks?.map((block: any, idx: number) => {
//                             if (block.type === 'section') {
//                                 return <h2 key={block.id} className="sr-section-title" style={{ color: '#073f4e' }}>{block.title}</h2>;
//                             }

//                             if (block.type === 'mcq' || block.type === 'text') {
//                                 const learnerAns = submission.answers?.[block.id];
//                                 const maxM = block.marks || 0;
//                                 const isMCQ = block.type === 'mcq';

//                                 const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
//                                 const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
//                                 const mData = modBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };

//                                 // 🚀 DETERMINE ACTIVE ROLE & INK 🚀
//                                 let activeInkColor = 'blue';
//                                 let activeData = fData;
//                                 let isActiveRole = false;

//                                 if (canFacilitatorMark) {
//                                     activeInkColor = 'blue'; activeData = fData; isActiveRole = true;
//                                 } else if (canGrade) {
//                                     activeInkColor = 'red'; activeData = aData; isActiveRole = true;
//                                 } else if (canModerate) {
//                                     activeInkColor = 'green'; activeData = mData; isActiveRole = true;
//                                 } else {
//                                     // If locked/viewing historically, show the highest tier
//                                     if (submission.status === 'moderated') {
//                                         activeInkColor = 'green'; activeData = mData;
//                                     } else if (submission.status === 'graded' || submission.status === 'returned') {
//                                         activeInkColor = 'red'; activeData = aData;
//                                     } else {
//                                         activeInkColor = 'blue'; activeData = fData;
//                                     }
//                                 }

//                                 return (
//                                     <div key={block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
//                                         <div className="sr-q-header">
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                 <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
//                                                 <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>

//                                                 {/* 🚀 HORIZONTAL HISTORY TICKS 🚀 */}
//                                                 <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
//                                                     {(showAssessorLayer || showModeratorLayer) && fData.isCorrect !== null && (
//                                                         <span title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 4px', borderRadius: '4px' }}>
//                                                             {fData.isCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}
//                                                         </span>
//                                                     )}
//                                                     {showModeratorLayer && aData.isCorrect !== null && (
//                                                         <span title="Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 4px', borderRadius: '4px' }}>
//                                                             {aData.isCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}
//                                                         </span>
//                                                     )}
//                                                 </div>
//                                             </div>

//                                             {/* 🚀 ACTIVE INTERACTIVE BUTTONS 🚀 */}
//                                             <div className="sr-visual-mark">
//                                                 <button
//                                                     onClick={() => handleVisualMark(block.id, true, maxM)}
//                                                     disabled={!isActiveRole}
//                                                     className="sr-mark-btn"
//                                                     style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
//                                                     title="Mark Correct"
//                                                 >
//                                                     <Check size={20} />
//                                                 </button>
//                                                 <button
//                                                     onClick={() => handleVisualMark(block.id, false, maxM)}
//                                                     disabled={!isActiveRole}
//                                                     className="sr-mark-btn"
//                                                     style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
//                                                     title="Mark Incorrect"
//                                                 >
//                                                     <X size={20} />
//                                                 </button>
//                                             </div>
//                                         </div>

//                                         <div className="sr-q-body">
//                                             {/* LEARNER ANSWER */}
//                                             <div className="sr-answer-box">
//                                                 <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
//                                                 {isMCQ ? (
//                                                     <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
//                                                         <span style={{ color: 'black' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
//                                                         {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
//                                                     </div>
//                                                 ) : (
//                                                     <div className="sr-text-ans">
//                                                         {learnerAns ? (
//                                                             <div className="quill-read-only-content" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: learnerAns }} />
//                                                         ) : (
//                                                             <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>
//                                                         )}
//                                                     </div>
//                                                 )}

//                                                 {isMCQ && (
//                                                     <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>
//                                                         Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong>
//                                                     </div>
//                                                 )}
//                                             </div>

//                                             {/* 🚀 READ-ONLY FACILITATOR LAYER */}
//                                             {(showAssessorLayer || showModeratorLayer) && (fData.score > 0 || fData.feedback || fData.isCorrect !== null) && (
//                                                 <div className="sr-read-only-feedback" style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
//                                                     <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
//                                                         <Info size={13} /> Facilitator Pre-Mark
//                                                     </div>
//                                                     <div style={{ color: '#0369a1', fontSize: '0.85rem' }}>
//                                                         <span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{fData.score ?? 0}/{maxM}]</span> {fData.feedback || <em style={{ opacity: 0.7 }}>No specific coaching provided.</em>}
//                                                     </div>
//                                                 </div>
//                                             )}

//                                             {/* 🚀 READ-ONLY ASSESSOR LAYER */}
//                                             {(showModeratorLayer) && (aData.score > 0 || aData.feedback || aData.isCorrect !== null) && (
//                                                 <div className="sr-read-only-feedback" style={{ background: '#fef2f2', borderLeft: '3px solid #ef4444', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
//                                                     <div style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
//                                                         <Award size={13} /> Assessor Grade
//                                                     </div>
//                                                     <div style={{ color: '#991b1b', fontSize: '0.85rem' }}>
//                                                         <span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{aData.score ?? 0}/{maxM}]</span> {aData.feedback || <em style={{ opacity: 0.7 }}>No specific feedback provided.</em>}
//                                                     </div>
//                                                 </div>
//                                             )}

//                                             {/* 🚀 READ-ONLY MODERATOR LAYER (When fully locked) */}
//                                             {(!canModerate && submission.status === 'moderated') && (mData.score > 0 || mData.feedback || mData.isCorrect !== null) && (
//                                                 <div className="sr-read-only-feedback" style={{ background: '#f0fdf4', borderLeft: '3px solid #22c55e', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
//                                                     <div style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
//                                                         <ShieldCheck size={13} /> Moderator QA
//                                                     </div>
//                                                     <div style={{ color: '#16a34a', fontSize: '0.85rem' }}>
//                                                         <span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{mData.score ?? 0}/{maxM}]</span> {mData.feedback || <em style={{ opacity: 0.7 }}>No QA feedback provided.</em>}
//                                                     </div>
//                                                 </div>
//                                             )}

//                                             {/* 🚀 ACTIVE GRADING INPUTS */}
//                                             {isActiveRole && (
//                                                 <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderRadius: '6px' }}>
//                                                     <div className="sr-score-input-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
//                                                         <label style={{ color: activeInkColor, fontWeight: 'bold', fontSize: '0.85rem' }}>Marks Awarded:</label>
//                                                         <input
//                                                             type="number"
//                                                             className="sr-score-input"
//                                                             style={{ color: activeInkColor, width: '60px', padding: '4px 8px', border: `1px solid ${activeInkColor}`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }}
//                                                             value={activeData.score ?? 0}
//                                                             onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)}
//                                                         />
//                                                         <span style={{ color: activeInkColor, fontWeight: 'bold' }}>/ {maxM}</span>
//                                                     </div>

//                                                     <div className="sr-feedback-wrap" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
//                                                         <Edit3 size={16} color={activeInkColor} style={{ marginTop: '6px' }} />
//                                                         <textarea
//                                                             className="sr-feedback-input"
//                                                             rows={2}
//                                                             style={{ width: '100%', color: activeInkColor, fontStyle: 'italic', fontWeight: 500, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }}
//                                                             placeholder={canModerate ? "Moderator Green Pen QA Notes..." : canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."}
//                                                             value={activeData.feedback || ''}
//                                                             onChange={e => handleFeedbackChange(block.id, e.target.value)}
//                                                         />
//                                                     </div>
//                                                 </div>
//                                             )}

//                                         </div>
//                                     </div>
//                                 );
//                             }
//                             return null;
//                         })}
//                     </div>
//                 </div>

//                 {/* ── RIGHT PANE: GRADING & MODERATION (No print) ── */}
//                 <aside className="sr-sidebar no-print">

//                     {/* FACILITATOR PRE-MARKING PANEL */}
//                     {(canFacilitatorMark || showAssessorLayer) && (
//                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
//                             <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>

//                             {canFacilitatorMark && (
//                                 <div className="sr-role-guide blue">
//                                     <Info size={16} />
//                                     <div>
//                                         <strong>Formative Feedback & Coaching</strong><br />
//                                         Use your Blue Pen to provide developmental feedback. Your comments prove to the QCTO auditor that Learner Support took place before official grading.
//                                     </div>
//                                 </div>
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
//                                     <textarea
//                                         className="sr-textarea"
//                                         rows={3}
//                                         style={{ color: 'blue', fontStyle: 'italic', borderColor: 'blue' }}
//                                         placeholder="Add overall coaching comments..."
//                                         value={facOverallFeedback}
//                                         onChange={e => handleFacOverallFeedbackChange(e.target.value)}
//                                     />
//                                 ) : (
//                                     <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', color: '#0369a1', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #0284c7' }}>
//                                         {facOverallFeedback || "No overall remarks provided."}
//                                     </div>
//                                 )}
//                             </div>

//                             {canFacilitatorMark ? (
//                                 <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>
//                                     {saving ? 'Processing...' : 'Send to Assessor'}
//                                 </button>
//                             ) : (
//                                 <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
//                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Completed by {submission.grading?.facilitatorName || 'Facilitator'}
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {/* ASSESSOR PANEL */}
//                     {showAssessorLayer ? (
//                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
//                             <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>

//                             {canGrade && (
//                                 <div className="sr-role-guide red">
//                                     <Info size={16} />
//                                     <div>
//                                         <strong>Summative Judgment & Remediation</strong><br />
//                                         Use your Red Pen to declare Competency. You <i>must</i> provide written feedback to justify your marks. If NYC, your comments legally guide the learner's remediation.
//                                     </div>
//                                 </div>
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
//                                     <button
//                                         className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`}
//                                         onClick={() => handleCompetencySelect('C')}
//                                         disabled={!canGrade}
//                                     >
//                                         <Award size={16} /> Competent (C)
//                                     </button>
//                                     <button
//                                         className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`}
//                                         onClick={() => handleCompetencySelect('NYC')}
//                                         disabled={!canGrade}
//                                     >
//                                         <AlertCircle size={16} /> Not Yet Competent
//                                     </button>
//                                 </div>
//                             </div>

//                             <div className="sr-overall-feedback">
//                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
//                                 {canGrade ? (
//                                     <textarea
//                                         className="sr-textarea"
//                                         rows={3}
//                                         style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: canGrade ? 'red' : '#cbd5e1' }}
//                                         placeholder={canGrade ? "Provide holistic feedback..." : "No remarks provided."}
//                                         value={assOverallFeedback}
//                                         disabled={!canGrade}
//                                         onChange={e => handleAssOverallFeedbackChange(e.target.value)}
//                                     />
//                                 ) : (
//                                     <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', color: '#b91c1c', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #dc2626' }}>
//                                         {assOverallFeedback || "No overall remarks provided."}
//                                     </div>
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
//                                 <div className="sr-action-area">
//                                     <button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving}>
//                                         {saving ? 'Processing...' : 'Apply Signature & Finalise'}
//                                     </button>
//                                 </div>
//                             )}
//                         </div>
//                     ) : (
//                         <div className="sr-summary-card sr-locked-card">
//                             <Lock size={28} />
//                             <h3>Assessor Grading</h3>
//                             <p>Awaiting Facilitator to complete Blue Pen pre-marking.</p>
//                         </div>
//                     )}

//                     {/* MODERATOR PANEL */}
//                     {showModeratorLayer ? (
//                         <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
//                             <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>

//                             {canModerate && (
//                                 <div className="sr-role-guide green">
//                                     <Info size={16} />
//                                     <div>
//                                         <strong>Quality Assurance Verification</strong><br />
//                                         Your Green Pen verifies the Assessor's marking. You must verify every question. Use comments to instruct the Assessor on corrections before endorsing.
//                                     </div>
//                                 </div>
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
//                                     <button
//                                         className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`}
//                                         onClick={() => handleModOutcomeSelect('Endorsed')}
//                                         disabled={!canModerate}
//                                     >
//                                         <ShieldCheck size={16} /> Endorse Grade
//                                     </button>
//                                     <button
//                                         className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`}
//                                         onClick={() => handleModOutcomeSelect('Returned')}
//                                         disabled={!canModerate}
//                                     >
//                                         <AlertCircle size={16} /> Return to Assessor
//                                     </button>
//                                 </div>
//                             </div>

//                             <div className="sr-overall-feedback">
//                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderator Feedback</label>
//                                 <textarea
//                                     className="sr-textarea"
//                                     rows={3}
//                                     style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }}
//                                     placeholder={canModerate ? "Notes for the assessor or internal QA..." : "No moderation feedback."}
//                                     value={modFeedback}
//                                     disabled={!canModerate}
//                                     onChange={e => handleModFeedbackChange(e.target.value)}
//                                 />
//                             </div>

//                             {(!canModerate && submission.moderation?.moderatedAt) && (
//                                 <div className="sr-audit-stamp" style={{ color: 'green', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
//                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Moderated by {submission.moderation?.moderatorName}
//                                 </div>
//                             )}

//                             {canModerate && (
//                                 <div className="sr-action-area">
//                                     <button
//                                         className="sr-submit-btn"
//                                         style={{ background: 'green' }}
//                                         onClick={triggerSubmitModeration}
//                                         disabled={saving}
//                                     >
//                                         {saving ? 'Processing...' : 'Finalise QA & Endorse'}
//                                     </button>
//                                 </div>
//                             )}
//                         </div>
//                     ) : (
//                         <div className="sr-summary-card sr-locked-card">
//                             <Lock size={28} />
//                             <h3>QA Moderation</h3>
//                             <p>Awaiting Assessor to complete Red Pen official grading.</p>
//                         </div>
//                     )}

//                     {/* 🚀 OFFICIAL AUDIT TRAIL 🚀 */}
//                     <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
//                         <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}>
//                             <ShieldCheck size={18} color="#073f4e" /> Official Audit Trail
//                         </h3>

//                         {
//                             (submission.status === 'not_started') && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>
//                         }

//                         {/* Learner Record */}
//                         {submission.status !== 'not_started' && (
//                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
//                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
//                                 {learnerProfile?.signatureUrl ? (
//                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
//                                 ) : (
//                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
//                                 )}
//                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
//                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</p>
//                             </div>
//                         )}

//                         {/* Assessor Record */}
//                         {submission.grading?.gradedAt && (
//                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
//                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
//                                 {assessorProfile?.signatureUrl ? (
//                                     <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
//                                 ) : (
//                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
//                                 )}
//                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName}</p>
//                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
//                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
//                             </div>
//                         )}

//                         {/* Moderator Record */}
//                         {submission.moderation?.moderatedAt && (
//                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1rem' }}>
//                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation</p>
//                                 {moderatorProfile?.signatureUrl ? (
//                                     <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
//                                 ) : (
//                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
//                                 )}
//                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{submission.moderation?.moderatorName}</p>
//                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Outcome: {submission.moderation?.outcome}</p>
//                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</p>
//                             </div>
//                         )}
//                     </div>
//                 </aside>
//             </div>
//         </div>
//     );
// };

// const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
//     const filterMap: any = {
//         black: 'brightness(0)',
//         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
//         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
//         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
//     };

//     return (
//         <img
//             src={imageUrl}
//             alt="Signature"
//             style={{
//                 height: '60px',
//                 width: 'auto',
//                 maxWidth: '100%',
//                 objectFit: 'contain',
//                 marginBottom: '10px',
//                 filter: filterMap[color] || 'none'
//             }}
//         />
//     );
// };



// // import React, { useState, useEffect, useRef } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import { doc, getDoc, updateDoc } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import {
// //     ArrowLeft, CheckCircle, AlertCircle, Save,
// //     User, GraduationCap, Clock, MessageSquare, Award,
// //     ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2, XCircle, AlertTriangle
// // } from 'lucide-react';
// // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // import './SubmissionReview.css';
// // import { createPortal } from 'react-dom';

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

// //     // Keep the scroll lock to stop the background from scrolling via mouse-wheel
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

// //     // 🚀 NEW: Wrap the entire modal in createPortal
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

// //     // This renders the modal directly into the document.body, escaping all layout wrappers!
// //     return createPortal(modalContent, document.body);
// // };
// // // const StatusModal: React.FC<{
// // //     type: StatusType;
// // //     title: string;
// // //     message: string;
// // //     onClose: () => void;
// // //     onConfirm?: () => void;
// // //     confirmText?: string;
// // //     cancelText?: string;
// // // }> = ({ type, title, message, onClose, onConfirm, confirmText = "Okay", cancelText = "Cancel" }) => {

// // //     const styles = {
// // //         info: { color: '#3b82f6', Icon: Info },
// // //         success: { color: '#22c55e', Icon: CheckCircle },
// // //         error: { color: '#ef4444', Icon: XCircle },
// // //         warning: { color: '#f59e0b', Icon: AlertTriangle }
// // //     };

// // //     const { color, Icon } = styles[type];

// // //     return (
// // //         <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(3px)' }}>
// // //             <div style={{ background: 'white', maxWidth: '400px', width: '90%', textAlign: 'center', padding: '2rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
// // //                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
// // //                     <Icon size={48} color={color} />
// // //                 </div>
// // //                 <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{title}</h2>
// // //                 <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem', fontSize: '0.9rem' }}>{message}</p>
// // //                 <div style={{ display: 'flex', gap: '1rem' }}>
// // //                     {onConfirm && (
// // //                         <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// // //                             {cancelText}
// // //                         </button>
// // //                     )}
// // //                     <button onClick={onConfirm || onClose} style={{ flex: 1, padding: '0.75rem', background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// // //                         {confirmText}
// // //                     </button>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // };

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

// //     // 🚀 STRICT DUAL-LAYER GRADING STATE 🚀
// //     const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
// //     const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});

// //     const [facOverallFeedback, setFacOverallFeedback] = useState('');
// //     const [assOverallFeedback, setAssOverallFeedback] = useState('');
// //     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

// //     const [modFeedback, setModFeedback] = useState('');
// //     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

// //     // Modal State & Auto-Save
// //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm?: () => void; confirmText?: string; cancelText?: string } | null>(null);
// //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// //     // ─── RBAC: PERMISSION FLAGS ────────────────────────────────────────────────
// //     const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
// //     const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
// //     const isModerator = user?.role === 'moderator' || user?.role === 'admin';

// //     const canFacilitatorMark = isFacilitator && submission?.status === 'submitted';
// //     const canGrade = isAssessor && (submission?.status === 'facilitator_reviewed' || submission?.status === 'returned');
// //     const canModerate = isModerator && submission?.status === 'graded';

// //     // 🚀 Defines what layers are visible to whom
// //     const showAssessorLayer = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(submission?.status);
// //     const showModeratorLayer = ['graded', 'moderated'].includes(submission?.status);

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

// //                 // 🚀 LAYERED DATA LOADING & LEGACY MIGRATION 🚀
// //                 let fBreakdown = subData.grading?.facilitatorBreakdown;
// //                 let aBreakdown = subData.grading?.assessorBreakdown;

// //                 // 1. Load Facilitator Data
// //                 if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
// //                     if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) {
// //                         // Legacy Migration: Move old grades into the Facilitator layer
// //                         fBreakdown = subData.grading.breakdown;
// //                     } else {
// //                         // Completely fresh start: Auto-grade MCQs for Facilitator
// //                         fBreakdown = {};
// //                         assData.blocks?.forEach((block: any) => {
// //                             if (block.type === 'mcq') {
// //                                 const isCorrect = subData.answers?.[block.id] === block.correctOption;
// //                                 fBreakdown[block.id] = { score: isCorrect ? (block.marks || 0) : 0, feedback: isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect', isCorrect };
// //                             } else if (block.type === 'text') {
// //                                 fBreakdown[block.id] = { score: 0, feedback: '', isCorrect: null };
// //                             }
// //                         });
// //                     }
// //                 }
// //                 setFacBreakdown(fBreakdown);

// //                 // 2. Load Assessor Data
// //                 if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
// //                     if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(subData.status)) {
// //                         aBreakdown = JSON.parse(JSON.stringify(fBreakdown));
// //                         Object.keys(aBreakdown).forEach(key => {
// //                             aBreakdown[key].feedback = '';
// //                         });
// //                     } else {
// //                         aBreakdown = {};
// //                     }
// //                 }
// //                 setAssBreakdown(aBreakdown);

// //                 // Load Overall Feedbacks
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

// //     // ─── AUTO-SAVE ENGINE ──────────────────────────────────────────────────
// //     const triggerAutoSave = (fBreak: any, aBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
// //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

// //         setSaving(true);
// //         saveTimeoutRef.current = setTimeout(async () => {
// //             if (!submission?.id) return;
// //             try {
// //                 const updatePayload: any = {
// //                     'grading.facilitatorBreakdown': fBreak,
// //                     'grading.assessorBreakdown': aBreak,
// //                     'grading.facilitatorOverallFeedback': fOverall,
// //                     'grading.assessorOverallFeedback': aOverall,
// //                     'moderation.feedback': updatedModFeedback,
// //                     lastStaffEditAt: new Date().toISOString()
// //                 };

// //                 if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
// //                 if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

// //                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
// //             } catch (error) {
// //                 console.error("Auto-save failed:", error);
// //             } finally {
// //                 setSaving(false);
// //             }
// //         }, 1500);
// //     };

// //     // ─── VISUAL MARKING HANDLERS ──────────────────────────────────────────────
// //     const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
// //         if (canFacilitatorMark) {
// //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// //             setFacBreakdown(next);
// //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canGrade) {
// //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// //             setAssBreakdown(next);
// //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         }
// //     };

// //     const handleScoreChange = (blockId: string, score: number, max: number) => {
// //         const val = Math.min(Math.max(0, score), max);
// //         if (canFacilitatorMark) {
// //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], score: val } };
// //             setFacBreakdown(next);
// //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canGrade) {
// //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], score: val } };
// //             setAssBreakdown(next);
// //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         }
// //     };

// //     const handleFeedbackChange = (blockId: string, feedback: string) => {
// //         if (canFacilitatorMark) {
// //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], feedback } };
// //             setFacBreakdown(next);
// //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canGrade) {
// //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], feedback } };
// //             setAssBreakdown(next);
// //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         }
// //     };

// //     const handleFacOverallFeedbackChange = (val: string) => {
// //         if (!canFacilitatorMark) return;
// //         setFacOverallFeedback(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome);
// //     };

// //     const handleAssOverallFeedbackChange = (val: string) => {
// //         if (!canGrade) return;
// //         setAssOverallFeedback(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome);
// //     };

// //     const handleModFeedbackChange = (val: string) => {
// //         if (!canModerate) return;
// //         setModFeedback(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome);
// //     };

// //     const handleCompetencySelect = (val: 'C' | 'NYC') => {
// //         if (!canGrade) return;
// //         setCompetency(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome);
// //     };

// //     const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
// //         if (!canModerate) return;
// //         setModOutcome(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val);
// //     };

// //     // 🚀 INDEPENDENT SCORE CALCULATIONS 🚀
// //     const getTotals = (breakdown: Record<string, GradeData>) => {
// //         const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
// //         const max = assessment?.totalMarks || 0;
// //         const pct = max > 0 ? Math.round((score / max) * 100) : 0;
// //         return { score, max, pct };
// //     };

// //     const facTotals = getTotals(facBreakdown);
// //     const assTotals = getTotals(assBreakdown);
// //     const activeTotals = showAssessorLayer ? assTotals : facTotals;

// //     // ─── VALIDATION HELPER ──────────────────────────────────────────────────
// //     const validateAllMarked = (breakdown: Record<string, GradeData>) => {
// //         if (!assessment?.blocks) return true;

// //         const unmarkedCount = assessment.blocks.filter((block: any) => {
// //             if (block.type !== 'mcq' && block.type !== 'text') return false;
// //             const grade = breakdown[block.id];
// //             return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
// //         }).length;

// //         return unmarkedCount === 0;
// //     };

// //     // ─── FINAL SUBMISSIONS ──────────────────────────────────────────────────
// //     const triggerSubmitFacilitator = () => {
// //         // 🚀 VALIDATION: Ensure all questions are ticked/crossed
// //         if (!validateAllMarked(facBreakdown)) {
// //             setModalConfig({
// //                 isOpen: true, type: 'warning',
// //                 title: 'Incomplete Marking',
// //                 message: 'You must evaluate every question. Please ensure every question has a Green Tick or Red Cross selected before submitting.',
// //                 confirmText: 'Got it'
// //             });
// //             return;
// //         }

// //         // 🚀 VALIDATION: Ensure overall feedback is provided
// //         if (!facOverallFeedback.trim()) {
// //             setModalConfig({
// //                 isOpen: true, type: 'warning',
// //                 title: 'Missing Remarks',
// //                 message: 'You must provide Overall Facilitator Remarks before sending this script to the Assessor.',
// //                 confirmText: 'Got it'
// //             });
// //             return;
// //         }

// //         setModalConfig({
// //             isOpen: true,
// //             type: 'info',
// //             title: 'Complete Pre-Marking?',
// //             message: 'This will finalize your Blue Pen feedback and send the workbook to the Assessor for official grading.',
// //             confirmText: 'Send to Assessor',
// //             onConfirm: async () => {
// //                 setModalConfig(null);
// //                 setSaving(true);
// //                 try {
// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: 'facilitator_reviewed',
// //                         'grading.facilitatorBreakdown': facBreakdown,
// //                         'grading.facilitatorOverallFeedback': facOverallFeedback,
// //                         'grading.facilitatorId': user?.uid,
// //                         'grading.facilitatorName': user?.fullName,
// //                         'grading.facilitatorReviewedAt': new Date().toISOString()
// //                     });
// //                     toast.success("Script marked and passed to Assessor!");
// //                     setTimeout(() => navigate(-1), 2000);
// //                 } catch (error) { toast.error("Failed to save marking."); } finally { setSaving(false); }
// //             }
// //         });
// //     };

// //     const triggerSubmitGrade = () => {
// //         // 🚀 VALIDATION: Ensure all questions are ticked/crossed
// //         if (!validateAllMarked(assBreakdown)) {
// //             setModalConfig({
// //                 isOpen: true, type: 'warning',
// //                 title: 'Incomplete Grading',
// //                 message: 'You must evaluate every question. Please ensure every question has a Tick or Cross selected before submitting your final grade.',
// //                 confirmText: 'Got it'
// //             });
// //             return;
// //         }

// //         // 🚀 VALIDATION: Ensure competency is selected
// //         if (!competency) {
// //             setModalConfig({
// //                 isOpen: true, type: 'warning',
// //                 title: 'Missing Competency',
// //                 message: 'You must select a Final Competency (C or NYC) before submitting.',
// //                 confirmText: 'Got it'
// //             });
// //             return;
// //         }

// //         // 🚀 VALIDATION: Ensure overall feedback is provided
// //         if (!assOverallFeedback.trim()) {
// //             setModalConfig({
// //                 isOpen: true, type: 'warning',
// //                 title: 'Missing Remarks',
// //                 message: 'You must provide Assessor Remarks justifying your final outcome before submitting.',
// //                 confirmText: 'Got it'
// //             });
// //             return;
// //         }

// //         setModalConfig({
// //             isOpen: true,
// //             type: 'warning',
// //             title: 'Finalise Grade?',
// //             message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.',
// //             confirmText: 'Apply Signature & Submit',
// //             onConfirm: async () => {
// //                 setModalConfig(null);
// //                 setSaving(true);
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
// //                         'grading.gradedAt': new Date().toISOString()
// //                     });
// //                     toast.success("Workbook graded and signed successfully!");
// //                     setTimeout(() => window.location.reload(), 500);
// //                 } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
// //             }
// //         });
// //     };

// //     const triggerSubmitModeration = () => {
// //         // 🚀 VALIDATION: Ensure moderation outcome is selected
// //         if (!modOutcome) {
// //             setModalConfig({
// //                 isOpen: true, type: 'warning',
// //                 title: 'Missing Outcome',
// //                 message: 'You must select a Moderation Outcome (Endorsed or Returned) before submitting.',
// //                 confirmText: 'Got it'
// //             });
// //             return;
// //         }

// //         // 🚀 VALIDATION: Ensure moderator notes are provided
// //         if (!modFeedback.trim()) {
// //             setModalConfig({
// //                 isOpen: true, type: 'warning',
// //                 title: 'Missing Feedback',
// //                 message: 'You must provide Moderator Feedback explaining your decision.',
// //                 confirmText: 'Got it'
// //             });
// //             return;
// //         }

// //         setModalConfig({
// //             isOpen: true,
// //             type: 'info',
// //             title: 'Finalise Moderation?',
// //             message: modOutcome === 'Returned' ? 'This will return the workbook to the Assessor for remediation.' : 'This will apply your Green Pen signature and endorse the final grade.',
// //             confirmText: 'Confirm Moderation',
// //             onConfirm: async () => {
// //                 setModalConfig(null);
// //                 setSaving(true);
// //                 try {
// //                     const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: newStatus,
// //                         'moderation.outcome': modOutcome,
// //                         'moderation.feedback': modFeedback,
// //                         'moderation.moderatedBy': user?.uid,
// //                         'moderation.moderatorName': user?.fullName,
// //                         'moderation.moderatorRegNumber': user?.assessorRegNumber || 'Pending Reg',
// //                         'moderation.moderatedAt': new Date().toISOString()
// //                     });
// //                     toast.success("Moderation saved successfully!");
// //                     setTimeout(() => window.location.reload(), 500);
// //                 } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
// //             }
// //         });
// //     };

// //     if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
// //     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

// //     const hasBeenGraded = ['graded', 'moderated'].includes(submission.status);
// //     const activeInkColor = showAssessorLayer ? 'red' : 'blue';
// //     const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');

// //     return (
// //         <div className="sr-root animate-fade-in">
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {/* 🚀 MODAL MOUNT 🚀 */}
// //             {modalConfig && (
// //                 <StatusModal
// //                     type={modalConfig.type}
// //                     title={modalConfig.title}
// //                     message={modalConfig.message}
// //                     onConfirm={modalConfig.onConfirm}
// //                     confirmText={modalConfig.confirmText}
// //                     cancelText={modalConfig.cancelText}
// //                     onClose={() => setModalConfig(null)}
// //                 />
// //             )}

// //             {/* ── TOP NAV ── */}
// //             <div className="ap-player-topbar no-print">
// //                 <div className="ap-player-topbar__left">
// //                     <button className="sr-back-btn" onClick={() => navigate(-1)}>
// //                         <ArrowLeft size={13} /> Portfolio
// //                     </button>
// //                     <div className="ap-player-topbar__separator" />
// //                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
// //                 </div>

// //                 <div className="ap-player-topbar__right">
// //                     <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
// //                         <Printer size={13} /> Print Audit
// //                     </button>
// //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
// //                         {saving ? (
// //                             <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</>
// //                         ) : (
// //                             <><CheckCircle size={12} /> Auto-saved</>
// //                         )}
// //                     </span>
// //                 </div>
// //             </div>

// //             <div className="sr-layout">
// //                 {/* ── LEFT PANE: WORKBOOK & ANSWERS ── */}
// //                 <div className="sr-content-pane print-pane">

// //                     {/* 🚀 OFFICIAL QCTO AUDIT HEADER (Visible on Print) 🚀 */}
// //                     <div className="sr-print-header">
// //                         <h2>OFFICIAL ASSESSMENT RECORD</h2>

// //                         <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', borderBottom: '1px solid black', paddingBottom: '1rem' }}>
// //                             <div style={{ flex: 1 }}>
// //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Learner Name:</strong> {learner?.fullName}</p>
// //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
// //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
// //                             </div>
// //                             <div style={{ flex: 1, textAlign: 'right' }}>
// //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// //                                     <strong>Score:</strong> <span style={{ color: activeInkColor, fontWeight: 'bold' }}>{activeTotals.score} / {activeTotals.max} ({activeTotals.pct}%)</span>
// //                                 </p>
// //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// //                                     <strong>Outcome:</strong> <span style={{ color: printOutcomeColor, fontWeight: 'bold' }}>{submission.competency === 'C' ? 'Competent (C)' : (submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending')}</span>
// //                                 </p>
// //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Submitted:</strong> {new Date(submission.submittedAt).toLocaleDateString()}</p>
// //                             </div>
// //                         </div>

// //                         {/* SIGNATURE BLOCKS */}
// //                         <div className="sr-signature-block">
// //                             <div className="sr-sig-box" style={{ borderColor: 'black' }}>
// //                                 <span style={{ color: 'black' }}>Learner Declaration</span>
// //                                 {learnerProfile?.signatureUrl ? (
// //                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// //                                 ) : (
// //                                     <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'black', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// //                                 )}
// //                                 <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
// //                                 <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
// //                                 <div className="sr-sig-line" style={{ color: 'black', borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
// //                             </div>

// //                             {showAssessorLayer && submission.grading?.gradedAt && (
// //                                 <div className="sr-sig-box" style={{ borderColor: 'red' }}>
// //                                     <span style={{ color: 'red' }}>Assessor Sign-off</span>
// //                                     {assessorProfile?.signatureUrl ? (
// //                                         <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
// //                                     ) : (
// //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'red', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// //                                     )}
// //                                     <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
// //                                     <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
// //                                     <em style={{ color: 'red' }}>Signed: {new Date(submission.grading?.gradedAt).toLocaleDateString()}</em>
// //                                     <div className="sr-sig-line" style={{ color: 'red', borderTopColor: 'red' }}>Digital Signature Confirmed</div>
// //                                 </div>
// //                             )}

// //                             {showModeratorLayer && submission.moderation?.moderatedAt && (
// //                                 <div className="sr-sig-box" style={{ borderColor: 'green' }}>
// //                                     <span style={{ color: 'green' }}>Internal Moderation</span>
// //                                     {moderatorProfile?.signatureUrl ? (
// //                                         <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
// //                                     ) : (
// //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'green', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// //                                     )}
// //                                     <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
// //                                     <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
// //                                     <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</em>
// //                                     <div className="sr-sig-line" style={{ color: 'green', borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     </div>

// //                     {!showAssessorLayer && (
// //                         <div className="sr-learner-meta no-print">
// //                             <User size={18} color="black" />
// //                             <span style={{ color: 'black' }}><strong>{learner?.fullName}</strong> ({learner?.idNumber})</span>
// //                             <span className="sr-dot" />
// //                             <Clock size={14} color="black" />
// //                             <span style={{ color: 'black' }}>Submitted: {new Date(submission.submittedAt).toLocaleString()}</span>
// //                         </div>
// //                     )}

// //                     <div className="sr-blocks">
// //                         {assessment.blocks?.map((block: any, idx: number) => {
// //                             if (block.type === 'section') {
// //                                 return <h2 key={block.id} className="sr-section-title" style={{ color: '#073f4e' }}>{block.title}</h2>;
// //                             }

// //                             if (block.type === 'mcq' || block.type === 'text') {
// //                                 const learnerAns = submission.answers?.[block.id];
// //                                 const maxM = block.marks || 0;
// //                                 const isMCQ = block.type === 'mcq';

// //                                 const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
// //                                 const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };

// //                                 const activeData = showAssessorLayer ? aData : fData;

// //                                 return (
// //                                     <div key={block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
// //                                         <div className="sr-q-header">
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                 <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
// //                                                 <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>
// //                                             </div>

// //                                             {/* ACTIVE VISUAL MARKERS */}
// //                                             <div className="sr-visual-mark">
// //                                                 <button
// //                                                     onClick={() => handleVisualMark(block.id, true, maxM)}
// //                                                     disabled={!(canGrade || canFacilitatorMark)}
// //                                                     className="sr-mark-btn"
// //                                                     style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// //                                                     title="Mark Correct"
// //                                                 >
// //                                                     <Check size={20} />
// //                                                 </button>
// //                                                 <button
// //                                                     onClick={() => handleVisualMark(block.id, false, maxM)}
// //                                                     disabled={!(canGrade || canFacilitatorMark)}
// //                                                     className="sr-mark-btn"
// //                                                     style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// //                                                     title="Mark Incorrect"
// //                                                 >
// //                                                     <X size={20} />
// //                                                 </button>
// //                                             </div>
// //                                         </div>

// //                                         <div className="sr-q-body">
// //                                             {/* LEARNER ANSWER */}
// //                                             <div className="sr-answer-box">
// //                                                 <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
// //                                                 {isMCQ ? (
// //                                                     <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
// //                                                         <span style={{ color: 'black' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
// //                                                         {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
// //                                                     </div>
// //                                                 ) : (
// //                                                     <div className="sr-text-ans">
// //                                                         {learnerAns ? (
// //                                                             <div className="quill-read-only-content" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: learnerAns }} />
// //                                                         ) : (
// //                                                             <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>
// //                                                         )}
// //                                                     </div>
// //                                                 )}

// //                                                 {isMCQ && (
// //                                                     <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>
// //                                                         Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong>
// //                                                     </div>
// //                                                 )}
// //                                             </div>

// //                                             {/* 🚀 READ-ONLY FACILITATOR LAYER (Seen by Assessor & Moderator) */}
// //                                             {showAssessorLayer && (fData.score > 0 || fData.feedback || fData.isCorrect !== null) && (
// //                                                 <div className="sr-read-only-feedback blue-pen-locked">
// //                                                     <div className="label"><Info size={13} /> Facilitator Pre-Mark</div>
// //                                                     <div className="content">
// //                                                         <span className="score">[{fData.score ?? 0}/{maxM}]</span> {fData.feedback || <em>No specific coaching provided.</em>}
// //                                                     </div>
// //                                                 </div>
// //                                             )}

// //                                             {/* 🚀 READ-ONLY ASSESSOR LAYER (Seen by Moderator) */}
// //                                             {showModeratorLayer && (aData.score > 0 || aData.feedback || aData.isCorrect !== null) && (
// //                                                 <div className="sr-read-only-feedback red-pen-locked">
// //                                                     <div className="label"><Award size={13} /> Assessor Grade</div>
// //                                                     <div className="content">
// //                                                         <span className="score">[{aData.score ?? 0}/{maxM}]</span> {aData.feedback || <em>No specific feedback provided.</em>}
// //                                                     </div>
// //                                                 </div>
// //                                             )}

// //                                             {/* 🚀 ACTIVE GRADING INPUTS (Your Turn) */}
// //                                             {(canGrade || canFacilitatorMark) && (
// //                                                 <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}` }}>
// //                                                     <div className="sr-score-input-wrap">
// //                                                         <label style={{ color: activeInkColor }}>Marks Awarded:</label>
// //                                                         <input
// //                                                             type="number"
// //                                                             className="sr-score-input"
// //                                                             style={{ color: activeInkColor }}
// //                                                             value={activeData.score ?? 0}
// //                                                             onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)}
// //                                                         />
// //                                                         <span style={{ color: activeInkColor }}>/ {maxM}</span>
// //                                                     </div>

// //                                                     <div className="sr-feedback-wrap">
// //                                                         <Edit3 size={14} color={activeInkColor} />
// //                                                         <input
// //                                                             type="text"
// //                                                             className="sr-feedback-input"
// //                                                             style={{ color: activeInkColor, fontStyle: 'italic', fontWeight: 500 }}
// //                                                             placeholder={canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."}
// //                                                             value={activeData.feedback || ''}
// //                                                             onChange={e => handleFeedbackChange(block.id, e.target.value)}
// //                                                         />
// //                                                     </div>
// //                                                 </div>
// //                                             )}

// //                                         </div>
// //                                     </div>
// //                                 );
// //                             }
// //                             return null;
// //                         })}
// //                     </div>
// //                 </div>

// //                 {/* ── RIGHT PANE: GRADING & MODERATION (No print) ── */}
// //                 <aside className="sr-sidebar no-print">

// //                     {/* FACILITATOR PRE-MARKING PANEL */}
// //                     {(canFacilitatorMark || showAssessorLayer) && (
// //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
// //                             <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>

// //                             {canFacilitatorMark && (
// //                                 <div className="sr-role-guide blue">
// //                                     <Info size={16} />
// //                                     <div>
// //                                         <strong>Formative Feedback & Coaching</strong><br />
// //                                         Use your Blue Pen to provide developmental feedback. Your comments prove to the QCTO auditor that Learner Support took place before official grading.
// //                                     </div>
// //                                 </div>
// //                             )}

// //                             <div className="sr-score-display">
// //                                 <div className="sr-score-circle" style={{ borderColor: 'blue' }}>
// //                                     <span className="sr-score-val" style={{ color: 'blue' }}>{facTotals.score}</span>
// //                                     <span className="sr-score-max" style={{ color: 'blue' }}>/ {facTotals.max}</span>
// //                                 </div>
// //                                 <div className="sr-score-percent" style={{ color: 'blue' }}>{facTotals.pct}%</div>
// //                             </div>

// //                             {/* 🚀 Facilitator Overall Feedback */}
// //                             <div className="sr-overall-feedback">
// //                                 <label className="sr-sidebar-label" style={{ color: 'blue' }}>Facilitator Remarks</label>
// //                                 {canFacilitatorMark ? (
// //                                     <textarea
// //                                         className="sr-textarea"
// //                                         rows={3}
// //                                         style={{ color: 'blue', fontStyle: 'italic', borderColor: 'blue' }}
// //                                         placeholder="Add overall coaching comments..."
// //                                         value={facOverallFeedback}
// //                                         onChange={e => handleFacOverallFeedbackChange(e.target.value)}
// //                                     />
// //                                 ) : (
// //                                     <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', color: '#0369a1', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #0284c7' }}>
// //                                         {facOverallFeedback || "No overall remarks provided."}
// //                                     </div>
// //                                 )}
// //                             </div>

// //                             {canFacilitatorMark ? (
// //                                 <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>
// //                                     {saving ? 'Processing...' : 'Send to Assessor'}
// //                                 </button>
// //                             ) : (
// //                                 <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Completed by {submission.grading?.facilitatorName || 'Facilitator'}
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}

// //                     {/* ASSESSOR PANEL */}
// //                     {showAssessorLayer ? (
// //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
// //                             <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>

// //                             {canGrade && (
// //                                 <div className="sr-role-guide red">
// //                                     <Info size={16} />
// //                                     <div>
// //                                         <strong>Summative Judgment & Remediation</strong><br />
// //                                         Use your Red Pen to declare Competency. You <i>must</i> provide written feedback to justify your marks. If NYC, your comments legally guide the learner's remediation.
// //                                     </div>
// //                                 </div>
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
// //                                     <button
// //                                         className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`}
// //                                         onClick={() => handleCompetencySelect('C')}
// //                                         disabled={!canGrade}
// //                                     >
// //                                         <Award size={16} /> Competent (C)
// //                                     </button>
// //                                     <button
// //                                         className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`}
// //                                         onClick={() => handleCompetencySelect('NYC')}
// //                                         disabled={!canGrade}
// //                                     >
// //                                         <AlertCircle size={16} /> Not Yet Competent
// //                                     </button>
// //                                 </div>
// //                             </div>

// //                             {/* 🚀 Assessor Overall Feedback */}
// //                             <div className="sr-overall-feedback">
// //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
// //                                 {canGrade ? (
// //                                     <textarea
// //                                         className="sr-textarea"
// //                                         rows={3}
// //                                         style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: canGrade ? 'red' : '#cbd5e1' }}
// //                                         placeholder={canGrade ? "Provide holistic feedback..." : "No remarks provided."}
// //                                         value={assOverallFeedback}
// //                                         disabled={!canGrade}
// //                                         onChange={e => handleAssOverallFeedbackChange(e.target.value)}
// //                                     />
// //                                 ) : (
// //                                     <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', color: '#b91c1c', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #dc2626' }}>
// //                                         {assOverallFeedback || "No overall remarks provided."}
// //                                     </div>
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
// //                                 <div className="sr-action-area">
// //                                     <button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving}>
// //                                         {saving ? 'Processing...' : 'Apply Signature & Finalise'}
// //                                     </button>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     ) : (
// //                         <div className="sr-summary-card sr-locked-card">
// //                             <Lock size={28} />
// //                             <h3>Assessor Grading</h3>
// //                             <p>Awaiting Facilitator to complete Blue Pen pre-marking.</p>
// //                         </div>
// //                     )}

// //                     {/* MODERATOR PANEL */}
// //                     {showModeratorLayer ? (
// //                         <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
// //                             <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>

// //                             {canModerate && (
// //                                 <div className="sr-role-guide green">
// //                                     <Info size={16} />
// //                                     <div>
// //                                         <strong>Quality Assurance & Endorsement</strong><br />
// //                                         Your Green Pen evaluates the Assessor, not the learner. Use comments to instruct the Assessor on corrections before endorsing this script.
// //                                     </div>
// //                                 </div>
// //                             )}

// //                             <div className="sr-competency-section">
// //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderation Outcome</label>
// //                                 <div className="sr-comp-toggles">
// //                                     <button
// //                                         className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`}
// //                                         onClick={() => handleModOutcomeSelect('Endorsed')}
// //                                         disabled={!canModerate}
// //                                     >
// //                                         <ShieldCheck size={16} /> Endorse Grade
// //                                     </button>
// //                                     <button
// //                                         className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`}
// //                                         onClick={() => handleModOutcomeSelect('Returned')}
// //                                         disabled={!canModerate}
// //                                     >
// //                                         <AlertCircle size={16} /> Return to Assessor
// //                                     </button>
// //                                 </div>
// //                             </div>

// //                             <div className="sr-overall-feedback">
// //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderator Feedback</label>
// //                                 <textarea
// //                                     className="sr-textarea"
// //                                     rows={3}
// //                                     style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }}
// //                                     placeholder={canModerate ? "Notes for the assessor or internal QA..." : "No moderation feedback."}
// //                                     value={modFeedback}
// //                                     disabled={!canModerate}
// //                                     onChange={e => handleModFeedbackChange(e.target.value)}
// //                                 />
// //                             </div>

// //                             {(!canModerate && submission.moderation?.moderatedAt) && (
// //                                 <div className="sr-audit-stamp" style={{ color: 'green', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Moderated by {submission.moderation?.moderatorName}
// //                                 </div>
// //                             )}

// //                             {canModerate && (
// //                                 <div className="sr-action-area">
// //                                     <button
// //                                         className="sr-submit-btn"
// //                                         style={{ background: 'green' }}
// //                                         onClick={triggerSubmitModeration}
// //                                         disabled={saving}
// //                                     >
// //                                         {saving ? 'Processing...' : 'Finalise QA & Endorse'}
// //                                     </button>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     ) : (
// //                         <div className="sr-summary-card sr-locked-card">
// //                             <Lock size={28} />
// //                             <h3>QA Moderation</h3>
// //                             <p>Awaiting Assessor to complete Red Pen official grading.</p>
// //                         </div>
// //                     )}

// //                     {/* 🚀 OFFICIAL AUDIT TRAIL 🚀 */}
// //                     <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
// //                         <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}>
// //                             <ShieldCheck size={18} color="#073f4e" /> Official Audit Trail
// //                         </h3>

// //                         {
// //                             (submission.status === 'not_started') && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>
// //                         }

// //                         {/* Learner Record */}
// //                         {submission.status !== 'not_started' && (
// //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
// //                                 {learnerProfile?.signatureUrl ? (
// //                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// //                                 ) : (
// //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// //                                 )}
// //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
// //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</p>
// //                             </div>
// //                         )}

// //                         {/* Assessor Record */}
// //                         {submission.grading?.gradedAt && (
// //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
// //                                 {assessorProfile?.signatureUrl ? (
// //                                     <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// //                                 ) : (
// //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// //                                 )}
// //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName}</p>
// //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
// //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: 'red', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// //                             </div>
// //                         )}

// //                         {/* Moderator Record */}
// //                         {submission.moderation?.moderatedAt && (
// //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1rem' }}>
// //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation</p>
// //                                 {moderatorProfile?.signatureUrl ? (
// //                                     <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
// //                                 ) : (
// //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// //                                 )}
// //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{submission.moderation?.moderatorName}</p>
// //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Outcome: {submission.moderation?.outcome}</p>
// //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</p>
// //                             </div>
// //                         )}
// //                     </div>
// //                 </aside>
// //             </div>
// //         </div>
// //     );
// // };

// // const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
// //     const filterMap: any = {
// //         black: 'brightness(0)',
// //         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
// //         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
// //         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
// //     };

// //     return (
// //         <img
// //             src={imageUrl}
// //             alt="Signature"
// //             style={{
// //                 height: '60px',
// //                 width: 'auto',
// //                 maxWidth: '100%',
// //                 objectFit: 'contain',
// //                 marginBottom: '10px',
// //                 filter: filterMap[color] || 'none'
// //             }}
// //         />
// //     );
// // };


// // // import React, { useState, useEffect, useRef } from 'react';
// // // import { useParams, useNavigate } from 'react-router-dom';
// // // import { doc, getDoc, updateDoc } from 'firebase/firestore';
// // // import { db } from '../../../lib/firebase';
// // // import { useStore } from '../../../store/useStore';
// // // import {
// // //     ArrowLeft, CheckCircle, AlertCircle, Save,
// // //     User, GraduationCap, Clock, MessageSquare, Award,
// // //     ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2, XCircle, AlertTriangle
// // // } from 'lucide-react';
// // // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // // import './SubmissionReview.css';

// // // interface GradeData {
// // //     score: number;
// // //     feedback: string;
// // //     isCorrect?: boolean | null;
// // // }

// // // export type StatusType = 'info' | 'success' | 'error' | 'warning';

// // // // ─── STATUS MODAL COMPONENT ─────────────────────────────────────────────
// // // const StatusModal: React.FC<{
// // //     type: StatusType;
// // //     title: string;
// // //     message: string;
// // //     onClose: () => void;
// // //     onConfirm?: () => void;
// // //     confirmText?: string;
// // //     cancelText?: string;
// // // }> = ({ type, title, message, onClose, onConfirm, confirmText = "Okay", cancelText = "Cancel" }) => {

// // //     const styles = {
// // //         info: { color: '#3b82f6', Icon: Info },
// // //         success: { color: '#22c55e', Icon: CheckCircle },
// // //         error: { color: '#ef4444', Icon: XCircle },
// // //         warning: { color: '#f59e0b', Icon: AlertTriangle }
// // //     };

// // //     const { color, Icon } = styles[type];

// // //     return (
// // //         <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(3px)' }}>
// // //             <div style={{ background: 'white', maxWidth: '400px', width: '90%', textAlign: 'center', padding: '2rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
// // //                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
// // //                     <Icon size={48} color={color} />
// // //                 </div>
// // //                 <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{title}</h2>
// // //                 <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem', fontSize: '0.9rem' }}>{message}</p>
// // //                 <div style={{ display: 'flex', gap: '1rem' }}>
// // //                     {onConfirm && (
// // //                         <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// // //                             {cancelText}
// // //                         </button>
// // //                     )}
// // //                     <button onClick={onConfirm || onClose} style={{ flex: 1, padding: '0.75rem', background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// // //                         {confirmText}
// // //                     </button>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // export const SubmissionReview: React.FC = () => {
// // //     const { submissionId } = useParams<{ submissionId: string }>();
// // //     const navigate = useNavigate();
// // //     const { user } = useStore();
// // //     const toast = useToast();

// // //     const [loading, setLoading] = useState(true);
// // //     const [saving, setSaving] = useState(false);

// // //     const [submission, setSubmission] = useState<any>(null);
// // //     const [assessment, setAssessment] = useState<any>(null);
// // //     const [learner, setLearner] = useState<any>(null);

// // //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// // //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// // //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);

// // //     // 🚀 STRICT DUAL-LAYER GRADING STATE 🚀
// // //     const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
// // //     const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});

// // //     const [facOverallFeedback, setFacOverallFeedback] = useState('');
// // //     const [assOverallFeedback, setAssOverallFeedback] = useState('');
// // //     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

// // //     const [modFeedback, setModFeedback] = useState('');
// // //     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

// // //     // Modal State & Auto-Save
// // //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm?: () => void; confirmText?: string; cancelText?: string } | null>(null);
// // //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// // //     // ─── RBAC: PERMISSION FLAGS ────────────────────────────────────────────────
// // //     const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
// // //     const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
// // //     const isModerator = user?.role === 'moderator' || user?.role === 'admin';

// // //     const canFacilitatorMark = isFacilitator && submission?.status === 'submitted';
// // //     const canGrade = isAssessor && (submission?.status === 'facilitator_reviewed' || submission?.status === 'returned');
// // //     const canModerate = isModerator && submission?.status === 'graded';

// // //     // 🚀 Defines what layers are visible to whom
// // //     const showAssessorLayer = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(submission?.status);
// // //     const showModeratorLayer = ['graded', 'moderated'].includes(submission?.status);

// // //     useEffect(() => {
// // //         const loadReviewData = async () => {
// // //             if (!submissionId) return;
// // //             try {
// // //                 const subRef = doc(db, 'learner_submissions', submissionId);
// // //                 const subSnap = await getDoc(subRef);
// // //                 if (!subSnap.exists()) throw new Error("Submission not found");
// // //                 const subData = subSnap.data();
// // //                 setSubmission({ id: subSnap.id, ...subData });

// // //                 const assRef = doc(db, 'assessments', subData.assessmentId);
// // //                 const assSnap = await getDoc(assRef);
// // //                 if (!assSnap.exists()) throw new Error("Assessment template missing");
// // //                 const assData = assSnap.data();
// // //                 setAssessment(assData);

// // //                 const learnerRef = doc(db, 'learners', subData.learnerId);
// // //                 const learnerSnap = await getDoc(learnerRef);
// // //                 let learnerAuthUid = null;
// // //                 if (learnerSnap.exists()) {
// // //                     const lData = learnerSnap.data();
// // //                     setLearner(lData);
// // //                     learnerAuthUid = lData.authUid;
// // //                 }

// // //                 const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || learnerAuthUid || subData.learnerId;
// // //                 if (targetLearnerUid) {
// // //                     const lProfSnap = await getDoc(doc(db, 'users', targetLearnerUid));
// // //                     if (lProfSnap.exists()) setLearnerProfile(lProfSnap.data());
// // //                 }

// // //                 if (subData.grading?.gradedBy) {
// // //                     const assProfRef = doc(db, 'users', subData.grading.gradedBy);
// // //                     const assProfSnap = await getDoc(assProfRef);
// // //                     if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
// // //                 }

// // //                 if (subData.moderation?.moderatedBy) {
// // //                     const modProfRef = doc(db, 'users', subData.moderation.moderatedBy);
// // //                     const modProfSnap = await getDoc(modProfRef);
// // //                     if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
// // //                 }

// // //                 // 🚀 LAYERED DATA LOADING & LEGACY MIGRATION 🚀
// // //                 let fBreakdown = subData.grading?.facilitatorBreakdown;
// // //                 let aBreakdown = subData.grading?.assessorBreakdown;

// // //                 // 1. Load Facilitator Data
// // //                 if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
// // //                     if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) {
// // //                         // Legacy Migration: Move old grades into the Facilitator layer
// // //                         fBreakdown = subData.grading.breakdown;
// // //                     } else {
// // //                         // Completely fresh start: Auto-grade MCQs for Facilitator
// // //                         fBreakdown = {};
// // //                         assData.blocks?.forEach((block: any) => {
// // //                             if (block.type === 'mcq') {
// // //                                 const isCorrect = subData.answers?.[block.id] === block.correctOption;
// // //                                 fBreakdown[block.id] = { score: isCorrect ? (block.marks || 0) : 0, feedback: isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect', isCorrect };
// // //                             } else if (block.type === 'text') {
// // //                                 fBreakdown[block.id] = { score: 0, feedback: '', isCorrect: null };
// // //                             }
// // //                         });
// // //                     }
// // //                 }
// // //                 setFacBreakdown(fBreakdown);

// // //                 // 2. Load Assessor Data
// // //                 if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
// // //                     if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(subData.status)) {
// // //                         aBreakdown = JSON.parse(JSON.stringify(fBreakdown));
// // //                         Object.keys(aBreakdown).forEach(key => {
// // //                             aBreakdown[key].feedback = '';
// // //                         });
// // //                     } else {
// // //                         aBreakdown = {};
// // //                     }
// // //                 }
// // //                 setAssBreakdown(aBreakdown);

// // //                 // Load Overall Feedbacks
// // //                 setFacOverallFeedback(subData.grading?.facilitatorOverallFeedback || '');
// // //                 setAssOverallFeedback(subData.grading?.assessorOverallFeedback || subData.grading?.overallFeedback || '');

// // //                 setCompetency(subData.competency || null);
// // //                 setModFeedback(subData.moderation?.feedback || '');
// // //                 setModOutcome(subData.moderation?.outcome || null);

// // //             } catch (err: any) {
// // //                 toast.error(err.message || "Failed to load data.");
// // //             } finally {
// // //                 setLoading(false);
// // //             }
// // //         };
// // //         loadReviewData();
// // //     }, [submissionId]);

// // //     // ─── AUTO-SAVE ENGINE ──────────────────────────────────────────────────
// // //     const triggerAutoSave = (fBreak: any, aBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
// // //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

// // //         setSaving(true);
// // //         saveTimeoutRef.current = setTimeout(async () => {
// // //             if (!submission?.id) return;
// // //             try {
// // //                 const updatePayload: any = {
// // //                     'grading.facilitatorBreakdown': fBreak,
// // //                     'grading.assessorBreakdown': aBreak,
// // //                     'grading.facilitatorOverallFeedback': fOverall,
// // //                     'grading.assessorOverallFeedback': aOverall,
// // //                     'moderation.feedback': updatedModFeedback,
// // //                     lastStaffEditAt: new Date().toISOString()
// // //                 };

// // //                 if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
// // //                 if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

// // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
// // //             } catch (error) {
// // //                 console.error("Auto-save failed:", error);
// // //             } finally {
// // //                 setSaving(false);
// // //             }
// // //         }, 1500);
// // //     };

// // //     // ─── VISUAL MARKING HANDLERS ──────────────────────────────────────────────
// // //     const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
// // //         if (canFacilitatorMark) {
// // //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// // //             setFacBreakdown(next);
// // //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // //         } else if (canGrade) {
// // //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// // //             setAssBreakdown(next);
// // //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // //         }
// // //     };

// // //     const handleScoreChange = (blockId: string, score: number, max: number) => {
// // //         const val = Math.min(Math.max(0, score), max);
// // //         if (canFacilitatorMark) {
// // //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], score: val } };
// // //             setFacBreakdown(next);
// // //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // //         } else if (canGrade) {
// // //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], score: val } };
// // //             setAssBreakdown(next);
// // //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // //         }
// // //     };

// // //     const handleFeedbackChange = (blockId: string, feedback: string) => {
// // //         if (canFacilitatorMark) {
// // //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], feedback } };
// // //             setFacBreakdown(next);
// // //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // //         } else if (canGrade) {
// // //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], feedback } };
// // //             setAssBreakdown(next);
// // //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // //         }
// // //     };

// // //     const handleFacOverallFeedbackChange = (val: string) => {
// // //         if (!canFacilitatorMark) return;
// // //         setFacOverallFeedback(val);
// // //         triggerAutoSave(facBreakdown, assBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome);
// // //     };

// // //     const handleAssOverallFeedbackChange = (val: string) => {
// // //         if (!canGrade) return;
// // //         setAssOverallFeedback(val);
// // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome);
// // //     };

// // //     const handleModFeedbackChange = (val: string) => {
// // //         if (!canModerate) return;
// // //         setModFeedback(val);
// // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome);
// // //     };

// // //     const handleCompetencySelect = (val: 'C' | 'NYC') => {
// // //         if (!canGrade) return;
// // //         setCompetency(val);
// // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome);
// // //     };

// // //     const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
// // //         if (!canModerate) return;
// // //         setModOutcome(val);
// // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val);
// // //     };

// // //     // 🚀 INDEPENDENT SCORE CALCULATIONS 🚀
// // //     const getTotals = (breakdown: Record<string, GradeData>) => {
// // //         const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
// // //         const max = assessment?.totalMarks || 0;
// // //         const pct = max > 0 ? Math.round((score / max) * 100) : 0;
// // //         return { score, max, pct };
// // //     };

// // //     const facTotals = getTotals(facBreakdown);
// // //     const assTotals = getTotals(assBreakdown);
// // //     const activeTotals = showAssessorLayer ? assTotals : facTotals;

// // //     // ─── VALIDATION HELPER ──────────────────────────────────────────────────
// // //     const validateAllMarked = (breakdown: Record<string, GradeData>) => {
// // //         if (!assessment?.blocks) return true;

// // //         const unmarkedCount = assessment.blocks.filter((block: any) => {
// // //             if (block.type !== 'mcq' && block.type !== 'text') return false;
// // //             const grade = breakdown[block.id];
// // //             return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
// // //         }).length;

// // //         return unmarkedCount === 0;
// // //     };

// // //     // ─── FINAL SUBMISSIONS ──────────────────────────────────────────────────
// // //     const triggerSubmitFacilitator = () => {
// // //         if (!validateAllMarked(facBreakdown)) {
// // //             setModalConfig({
// // //                 isOpen: true, type: 'warning',
// // //                 title: 'Incomplete Marking',
// // //                 message: 'You must evaluate every question. Please ensure every question has a Green Tick or Red Cross selected before submitting.',
// // //                 confirmText: 'Got it'
// // //             });
// // //             return;
// // //         }

// // //         setModalConfig({
// // //             isOpen: true,
// // //             type: 'info',
// // //             title: 'Complete Pre-Marking?',
// // //             message: 'This will finalize your Blue Pen feedback and send the workbook to the Assessor for official grading.',
// // //             confirmText: 'Send to Assessor',
// // //             onConfirm: async () => {
// // //                 setModalConfig(null);
// // //                 setSaving(true);
// // //                 try {
// // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // //                         status: 'facilitator_reviewed',
// // //                         'grading.facilitatorBreakdown': facBreakdown,
// // //                         'grading.facilitatorOverallFeedback': facOverallFeedback,
// // //                         'grading.facilitatorId': user?.uid,
// // //                         'grading.facilitatorName': user?.fullName,
// // //                         'grading.facilitatorReviewedAt': new Date().toISOString()
// // //                     });
// // //                     toast.success("Script marked and passed to Assessor!");
// // //                     setTimeout(() => navigate(-1), 2000);
// // //                 } catch (error) { toast.error("Failed to save marking."); } finally { setSaving(false); }
// // //             }
// // //         });
// // //     };

// // //     const triggerSubmitGrade = () => {
// // //         if (!validateAllMarked(assBreakdown)) {
// // //             setModalConfig({
// // //                 isOpen: true, type: 'warning',
// // //                 title: 'Incomplete Grading',
// // //                 message: 'You must evaluate every question. Please ensure every question has a Tick or Cross selected before submitting your final grade.',
// // //                 confirmText: 'Got it'
// // //             });
// // //             return;
// // //         }

// // //         if (!competency) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a final competency (C or NYC) before submitting.', confirmText: 'Got it' });

// // //         setModalConfig({
// // //             isOpen: true,
// // //             type: 'warning',
// // //             title: 'Finalise Grade?',
// // //             message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.',
// // //             confirmText: 'Apply Signature & Submit',
// // //             onConfirm: async () => {
// // //                 setModalConfig(null);
// // //                 setSaving(true);
// // //                 try {
// // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // //                         status: 'graded',
// // //                         marks: assTotals.score,
// // //                         competency: competency,
// // //                         'grading.assessorBreakdown': assBreakdown,
// // //                         'grading.assessorOverallFeedback': assOverallFeedback,
// // //                         'grading.gradedBy': user?.uid,
// // //                         'grading.assessorName': user?.fullName,
// // //                         'grading.assessorRegNumber': user?.assessorRegNumber || 'Pending Reg',
// // //                         'grading.gradedAt': new Date().toISOString()
// // //                     });
// // //                     toast.success("Workbook graded and signed successfully!");
// // //                     setTimeout(() => window.location.reload(), 500);
// // //                 } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
// // //             }
// // //         });
// // //     };

// // //     const triggerSubmitModeration = () => {
// // //         if (!modOutcome) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Outcome', message: 'You must select an endorsement outcome before submitting.', confirmText: 'Got it' });

// // //         setModalConfig({
// // //             isOpen: true,
// // //             type: 'info',
// // //             title: 'Finalise Moderation?',
// // //             message: modOutcome === 'Returned' ? 'This will return the workbook to the Assessor for remediation.' : 'This will apply your Green Pen signature and endorse the final grade.',
// // //             confirmText: 'Confirm Moderation',
// // //             onConfirm: async () => {
// // //                 setModalConfig(null);
// // //                 setSaving(true);
// // //                 try {
// // //                     const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
// // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // //                         status: newStatus,
// // //                         'moderation.outcome': modOutcome,
// // //                         'moderation.feedback': modFeedback,
// // //                         'moderation.moderatedBy': user?.uid,
// // //                         'moderation.moderatorName': user?.fullName,
// // //                         'moderation.moderatorRegNumber': user?.assessorRegNumber || 'Pending Reg',
// // //                         'moderation.moderatedAt': new Date().toISOString()
// // //                     });
// // //                     toast.success("Moderation saved successfully!");
// // //                     setTimeout(() => window.location.reload(), 500);
// // //                 } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
// // //             }
// // //         });
// // //     };

// // //     if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
// // //     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

// // //     const hasBeenGraded = ['graded', 'moderated'].includes(submission.status);
// // //     const activeInkColor = showAssessorLayer ? 'red' : 'blue';
// // //     const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');

// // //     return (
// // //         <div className="sr-root animate-fade-in">
// // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // //             {/* 🚀 MODAL MOUNT 🚀 */}
// // //             {modalConfig && (
// // //                 <StatusModal
// // //                     type={modalConfig.type}
// // //                     title={modalConfig.title}
// // //                     message={modalConfig.message}
// // //                     onConfirm={modalConfig.onConfirm}
// // //                     confirmText={modalConfig.confirmText}
// // //                     cancelText={modalConfig.cancelText}
// // //                     onClose={() => setModalConfig(null)}
// // //                 />
// // //             )}

// // //             {/* ── TOP NAV ── */}
// // //             <div className="ap-player-topbar no-print">
// // //                 <div className="ap-player-topbar__left">
// // //                     <button className="sr-back-btn" onClick={() => navigate(-1)}>
// // //                         <ArrowLeft size={13} /> Portfolio
// // //                     </button>
// // //                     <div className="ap-player-topbar__separator" />
// // //                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
// // //                 </div>

// // //                 <div className="ap-player-topbar__right">
// // //                     <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
// // //                         <Printer size={13} /> Print Audit
// // //                     </button>
// // //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
// // //                         {saving ? (
// // //                             <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</>
// // //                         ) : (
// // //                             <><CheckCircle size={12} /> Auto-saved</>
// // //                         )}
// // //                     </span>
// // //                 </div>
// // //             </div>

// // //             <div className="sr-layout">
// // //                 {/* ── LEFT PANE: WORKBOOK & ANSWERS ── */}
// // //                 <div className="sr-content-pane print-pane">

// // //                     {/* 🚀 OFFICIAL QCTO AUDIT HEADER (Visible on Print) 🚀 */}
// // //                     <div className="sr-print-header">
// // //                         <h2>OFFICIAL ASSESSMENT RECORD</h2>

// // //                         <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', borderBottom: '1px solid black', paddingBottom: '1rem' }}>
// // //                             <div style={{ flex: 1 }}>
// // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Learner Name:</strong> {learner?.fullName}</p>
// // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
// // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
// // //                             </div>
// // //                             <div style={{ flex: 1, textAlign: 'right' }}>
// // //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// // //                                     <strong>Score:</strong> <span style={{ color: activeInkColor, fontWeight: 'bold' }}>{activeTotals.score} / {activeTotals.max} ({activeTotals.pct}%)</span>
// // //                                 </p>
// // //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// // //                                     <strong>Outcome:</strong> <span style={{ color: printOutcomeColor, fontWeight: 'bold' }}>{submission.competency === 'C' ? 'Competent (C)' : (submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending')}</span>
// // //                                 </p>
// // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Submitted:</strong> {new Date(submission.submittedAt).toLocaleDateString()}</p>
// // //                             </div>
// // //                         </div>

// // //                         {/* SIGNATURE BLOCKS */}
// // //                         <div className="sr-signature-block">
// // //                             <div className="sr-sig-box" style={{ borderColor: 'black' }}>
// // //                                 <span style={{ color: 'black' }}>Learner Declaration</span>
// // //                                 {learnerProfile?.signatureUrl ? (
// // //                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// // //                                 ) : (
// // //                                     <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'black', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // //                                 )}
// // //                                 <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
// // //                                 <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
// // //                                 <div className="sr-sig-line" style={{ color: 'black', borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
// // //                             </div>

// // //                             {showAssessorLayer && submission.grading?.gradedAt && (
// // //                                 <div className="sr-sig-box" style={{ borderColor: 'red' }}>
// // //                                     <span style={{ color: 'red' }}>Assessor Sign-off</span>
// // //                                     {assessorProfile?.signatureUrl ? (
// // //                                         <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
// // //                                     ) : (
// // //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'red', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // //                                     )}
// // //                                     <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
// // //                                     <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
// // //                                     <em style={{ color: 'red' }}>Signed: {new Date(submission.grading?.gradedAt).toLocaleDateString()}</em>
// // //                                     <div className="sr-sig-line" style={{ color: 'red', borderTopColor: 'red' }}>Digital Signature Confirmed</div>
// // //                                 </div>
// // //                             )}

// // //                             {showModeratorLayer && submission.moderation?.moderatedAt && (
// // //                                 <div className="sr-sig-box" style={{ borderColor: 'green' }}>
// // //                                     <span style={{ color: 'green' }}>Internal Moderation</span>
// // //                                     {moderatorProfile?.signatureUrl ? (
// // //                                         <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
// // //                                     ) : (
// // //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'green', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // //                                     )}
// // //                                     <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
// // //                                     <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
// // //                                     <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</em>
// // //                                     <div className="sr-sig-line" style={{ color: 'green', borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     </div>

// // //                     {!showAssessorLayer && (
// // //                         <div className="sr-learner-meta no-print">
// // //                             <User size={18} color="black" />
// // //                             <span style={{ color: 'black' }}><strong>{learner?.fullName}</strong> ({learner?.idNumber})</span>
// // //                             <span className="sr-dot" />
// // //                             <Clock size={14} color="black" />
// // //                             <span style={{ color: 'black' }}>Submitted: {new Date(submission.submittedAt).toLocaleString()}</span>
// // //                         </div>
// // //                     )}

// // //                     <div className="sr-blocks">
// // //                         {assessment.blocks?.map((block: any, idx: number) => {
// // //                             if (block.type === 'section') {
// // //                                 return <h2 key={block.id} className="sr-section-title" style={{ color: '#073f4e' }}>{block.title}</h2>;
// // //                             }

// // //                             if (block.type === 'mcq' || block.type === 'text') {
// // //                                 const learnerAns = submission.answers?.[block.id];
// // //                                 const maxM = block.marks || 0;
// // //                                 const isMCQ = block.type === 'mcq';

// // //                                 const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
// // //                                 const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };

// // //                                 const activeData = showAssessorLayer ? aData : fData;

// // //                                 return (
// // //                                     <div key={block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
// // //                                         <div className="sr-q-header">
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                                 <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
// // //                                                 <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>
// // //                                             </div>

// // //                                             {/* 🚀 RESTORED: Visual Markers always render, but are disabled if it's not your turn */}
// // //                                             <div className="sr-visual-mark">
// // //                                                 <button
// // //                                                     onClick={() => handleVisualMark(block.id, true, maxM)}
// // //                                                     disabled={!(canGrade || canFacilitatorMark)}
// // //                                                     className="sr-mark-btn"
// // //                                                     style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// // //                                                     title="Mark Correct"
// // //                                                 >
// // //                                                     <Check size={20} />
// // //                                                 </button>
// // //                                                 <button
// // //                                                     onClick={() => handleVisualMark(block.id, false, maxM)}
// // //                                                     disabled={!(canGrade || canFacilitatorMark)}
// // //                                                     className="sr-mark-btn"
// // //                                                     style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// // //                                                     title="Mark Incorrect"
// // //                                                 >
// // //                                                     <X size={20} />
// // //                                                 </button>
// // //                                             </div>
// // //                                         </div>

// // //                                         <div className="sr-q-body">
// // //                                             {/* LEARNER ANSWER */}
// // //                                             <div className="sr-answer-box">
// // //                                                 <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
// // //                                                 {isMCQ ? (
// // //                                                     <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
// // //                                                         <span style={{ color: 'black' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
// // //                                                         {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
// // //                                                     </div>
// // //                                                 ) : (
// // //                                                     <div className="sr-text-ans">
// // //                                                         {learnerAns ? (
// // //                                                             <div className="quill-read-only-content" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: learnerAns }} />
// // //                                                         ) : (
// // //                                                             <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>
// // //                                                         )}
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {isMCQ && (
// // //                                                     <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>
// // //                                                         Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong>
// // //                                                     </div>
// // //                                                 )}
// // //                                             </div>

// // //                                             {/* 🚀 READ-ONLY FACILITATOR LAYER (Seen by Assessor & Moderator) */}
// // //                                             {showAssessorLayer && (fData.score > 0 || fData.feedback || fData.isCorrect !== null) && (
// // //                                                 <div className="sr-read-only-feedback blue-pen-locked">
// // //                                                     <div className="label"><Info size={13} /> Facilitator Pre-Mark</div>
// // //                                                     <div className="content">
// // //                                                         <span className="score">[{fData.score ?? 0}/{maxM}]</span> {fData.feedback || <em>No specific coaching provided.</em>}
// // //                                                     </div>
// // //                                                 </div>
// // //                                             )}

// // //                                             {/* 🚀 READ-ONLY ASSESSOR LAYER (Seen by Moderator) */}
// // //                                             {showModeratorLayer && (aData.score > 0 || aData.feedback || aData.isCorrect !== null) && (
// // //                                                 <div className="sr-read-only-feedback red-pen-locked">
// // //                                                     <div className="label"><Award size={13} /> Assessor Grade</div>
// // //                                                     <div className="content">
// // //                                                         <span className="score">[{aData.score ?? 0}/{maxM}]</span> {aData.feedback || <em>No specific feedback provided.</em>}
// // //                                                     </div>
// // //                                                 </div>
// // //                                             )}

// // //                                             {/* 🚀 FIXED: ACTIVE GRADING INPUTS 
// // //                                                 Only renders the input boxes if the user is actively allowed to type. 
// // //                                                 Prevents duplicate UI for Moderators. 
// // //                                             */}
// // //                                             {(canGrade || canFacilitatorMark) && (
// // //                                                 <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}` }}>
// // //                                                     <div className="sr-score-input-wrap">
// // //                                                         <label style={{ color: activeInkColor }}>Marks Awarded:</label>
// // //                                                         <input
// // //                                                             type="number"
// // //                                                             className="sr-score-input"
// // //                                                             style={{ color: activeInkColor }}
// // //                                                             value={activeData.score ?? 0}
// // //                                                             onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)}
// // //                                                         />
// // //                                                         <span style={{ color: activeInkColor }}>/ {maxM}</span>
// // //                                                     </div>

// // //                                                     <div className="sr-feedback-wrap">
// // //                                                         <Edit3 size={14} color={activeInkColor} />
// // //                                                         <input
// // //                                                             type="text"
// // //                                                             className="sr-feedback-input"
// // //                                                             style={{ color: activeInkColor, fontStyle: 'italic', fontWeight: 500 }}
// // //                                                             placeholder={canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."}
// // //                                                             value={activeData.feedback || ''}
// // //                                                             onChange={e => handleFeedbackChange(block.id, e.target.value)}
// // //                                                         />
// // //                                                     </div>
// // //                                                 </div>
// // //                                             )}

// // //                                         </div>
// // //                                     </div>
// // //                                 );
// // //                             }
// // //                             return null;
// // //                         })}
// // //                     </div>
// // //                     {/* <div className="sr-blocks">
// // //                         {assessment.blocks?.map((block: any, idx: number) => {
// // //                             if (block.type === 'section') {
// // //                                 return <h2 key={block.id} className="sr-section-title" style={{ color: '#073f4e' }}>{block.title}</h2>;
// // //                             }

// // //                             if (block.type === 'mcq' || block.type === 'text') {
// // //                                 const learnerAns = submission.answers?.[block.id];
// // //                                 const maxM = block.marks || 0;
// // //                                 const isMCQ = block.type === 'mcq';

// // //                                 const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
// // //                                 const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };

// // //                                 const activeData = showAssessorLayer ? aData : fData;

// // //                                 return (
// // //                                     <div key={block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
// // //                                         <div className="sr-q-header">
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                                 <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
// // //                                                 <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>
// // //                                             </div>

// // //                                             {(canGrade || canFacilitatorMark) && (
// // //                                                 <div className="sr-visual-mark">
// // //                                                     <button
// // //                                                         onClick={() => handleVisualMark(block.id, true, maxM)}
// // //                                                         className="sr-mark-btn"
// // //                                                         style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// // //                                                         title="Mark Correct"
// // //                                                     >
// // //                                                         <Check size={20} />
// // //                                                     </button>
// // //                                                     <button
// // //                                                         onClick={() => handleVisualMark(block.id, false, maxM)}
// // //                                                         className="sr-mark-btn"
// // //                                                         style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// // //                                                         title="Mark Incorrect"
// // //                                                     >
// // //                                                         <X size={20} />
// // //                                                     </button>
// // //                                                 </div>
// // //                                             )}
// // //                                         </div>

// // //                                         <div className="sr-q-body">
// // //                                             <div className="sr-answer-box">
// // //                                                 <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
// // //                                                 {isMCQ ? (
// // //                                                     <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
// // //                                                         <span style={{ color: 'black' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
// // //                                                         {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
// // //                                                     </div>
// // //                                                 ) : (
// // //                                                     <div className="sr-text-ans">
// // //                                                         {learnerAns ? (
// // //                                                             <div className="quill-read-only-content" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: learnerAns }} />
// // //                                                         ) : (
// // //                                                             <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>
// // //                                                         )}
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {isMCQ && (
// // //                                                     <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>
// // //                                                         Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong>
// // //                                                     </div>
// // //                                                 )}
// // //                                             </div>

// // //                                             {showAssessorLayer && (
// // //                                                 <div className="sr-read-only-feedback blue-pen-locked">
// // //                                                     <div className="label"><Info size={13} /> Facilitator Pre-Mark</div>
// // //                                                     <div className="content">
// // //                                                         <span className="score">[{fData.score ?? 0}/{maxM}]</span> {fData.feedback || <em>No specific coaching provided.</em>}
// // //                                                     </div>
// // //                                                 </div>
// // //                                             )}

// // //                                             {showModeratorLayer && (
// // //                                                 <div className="sr-read-only-feedback red-pen-locked">
// // //                                                     <div className="label"><Award size={13} /> Assessor Grade</div>
// // //                                                     <div className="content">
// // //                                                         <span className="score">[{aData.score ?? 0}/{maxM}]</span> {aData.feedback || <em>No specific feedback provided.</em>}
// // //                                                     </div>
// // //                                                 </div>
// // //                                             )}

// // //                                             <div className={`sr-grade-box ${!(canGrade || canFacilitatorMark) ? 'disabled' : ''}`}>
// // //                                                 <div className="sr-score-input-wrap">
// // //                                                     <label style={{ color: activeInkColor }}>Marks Awarded:</label>
// // //                                                     <input
// // //                                                         type="number"
// // //                                                         className="sr-score-input"
// // //                                                         style={{ color: activeInkColor }}
// // //                                                         value={activeData.score ?? 0}
// // //                                                         disabled={!(canGrade || canFacilitatorMark)}
// // //                                                         onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)}
// // //                                                     />
// // //                                                     <span style={{ color: activeInkColor }}>/ {maxM}</span>
// // //                                                 </div>

// // //                                                 <div className="sr-feedback-wrap">
// // //                                                     <Edit3 size={14} color={activeInkColor} />
// // //                                                     <input
// // //                                                         type="text"
// // //                                                         className="sr-feedback-input"
// // //                                                         style={{ color: activeInkColor, fontStyle: 'italic', fontWeight: 500 }}
// // //                                                         placeholder={canGrade ? "Assessor Red Pen feedback..." : canFacilitatorMark ? "Facilitator Blue Pen feedback..." : "No specific feedback provided."}
// // //                                                         value={activeData.feedback || ''}
// // //                                                         disabled={!(canGrade || canFacilitatorMark)}
// // //                                                         onChange={e => handleFeedbackChange(block.id, e.target.value)}
// // //                                                     />
// // //                                                 </div>
// // //                                             </div>

// // //                                         </div>
// // //                                     </div>
// // //                                 );
// // //                             }
// // //                             return null;
// // //                         })}
// // //                     </div> */}
// // //                 </div>

// // //                 {/* ── RIGHT PANE: GRADING & MODERATION (No print) ── */}
// // //                 <aside className="sr-sidebar no-print">

// // //                     {/* FACILITATOR PRE-MARKING PANEL */}
// // //                     {(canFacilitatorMark || showAssessorLayer) && (
// // //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
// // //                             <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>

// // //                             {canFacilitatorMark && (
// // //                                 <div className="sr-role-guide blue">
// // //                                     <Info size={16} />
// // //                                     <div>
// // //                                         <strong>Formative Feedback & Coaching</strong><br />
// // //                                         Use your Blue Pen to provide developmental feedback. Your comments prove to the QCTO auditor that Learner Support took place before official grading.
// // //                                     </div>
// // //                                 </div>
// // //                             )}

// // //                             <div className="sr-score-display">
// // //                                 <div className="sr-score-circle" style={{ borderColor: 'blue' }}>
// // //                                     <span className="sr-score-val" style={{ color: 'blue' }}>{facTotals.score}</span>
// // //                                     <span className="sr-score-max" style={{ color: 'blue' }}>/ {facTotals.max}</span>
// // //                                 </div>
// // //                                 <div className="sr-score-percent" style={{ color: 'blue' }}>{facTotals.pct}%</div>
// // //                             </div>

// // //                             {/* 🚀 Facilitator Overall Feedback */}
// // //                             <div className="sr-overall-feedback">
// // //                                 <label className="sr-sidebar-label" style={{ color: 'blue' }}>Facilitator Remarks</label>
// // //                                 {canFacilitatorMark ? (
// // //                                     <textarea
// // //                                         className="sr-textarea"
// // //                                         rows={3}
// // //                                         style={{ color: 'blue', fontStyle: 'italic', borderColor: 'blue' }}
// // //                                         placeholder="Add overall coaching comments..."
// // //                                         value={facOverallFeedback}
// // //                                         onChange={e => handleFacOverallFeedbackChange(e.target.value)}
// // //                                     />
// // //                                 ) : (
// // //                                     <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', color: '#0369a1', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #0284c7' }}>
// // //                                         {facOverallFeedback || "No overall remarks provided."}
// // //                                     </div>
// // //                                 )}
// // //                             </div>

// // //                             {canFacilitatorMark ? (
// // //                                 <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>
// // //                                     {saving ? 'Processing...' : 'Send to Assessor'}
// // //                                 </button>
// // //                             ) : (
// // //                                 <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// // //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Completed by {submission.grading?.facilitatorName || 'Facilitator'}
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     )}

// // //                     {/* ASSESSOR PANEL */}
// // //                     {showAssessorLayer ? (
// // //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
// // //                             <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>

// // //                             {canGrade && (
// // //                                 <div className="sr-role-guide red">
// // //                                     <Info size={16} />
// // //                                     <div>
// // //                                         <strong>Summative Judgment & Remediation</strong><br />
// // //                                         Use your Red Pen to declare Competency. You <i>must</i> provide written feedback to justify your marks. If NYC, your comments legally guide the learner's remediation.
// // //                                     </div>
// // //                                 </div>
// // //                             )}

// // //                             <div className="sr-score-display">
// // //                                 <div className="sr-score-circle" style={{ borderColor: 'red', width: '80px', height: '80px' }}>
// // //                                     <span className="sr-score-val" style={{ color: 'red', fontSize: '1.5rem' }}>{assTotals.score}</span>
// // //                                     <span className="sr-score-max" style={{ color: 'red' }}>/ {assTotals.max}</span>
// // //                                 </div>
// // //                                 <div className="sr-score-percent" style={{ color: 'red' }}>{assTotals.pct}%</div>
// // //                             </div>

// // //                             <div className="sr-competency-section" style={{ marginTop: '1rem' }}>
// // //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Final Competency</label>
// // //                                 <div className="sr-comp-toggles">
// // //                                     <button
// // //                                         className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`}
// // //                                         onClick={() => handleCompetencySelect('C')}
// // //                                         disabled={!canGrade}
// // //                                     >
// // //                                         <Award size={16} /> Competent (C)
// // //                                     </button>
// // //                                     <button
// // //                                         className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`}
// // //                                         onClick={() => handleCompetencySelect('NYC')}
// // //                                         disabled={!canGrade}
// // //                                     >
// // //                                         <AlertCircle size={16} /> Not Yet Competent
// // //                                     </button>
// // //                                 </div>
// // //                             </div>

// // //                             {/* 🚀 Assessor Overall Feedback */}
// // //                             <div className="sr-overall-feedback">
// // //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
// // //                                 {canGrade ? (
// // //                                     <textarea
// // //                                         className="sr-textarea"
// // //                                         rows={3}
// // //                                         style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: canGrade ? 'red' : '#cbd5e1' }}
// // //                                         placeholder={canGrade ? "Provide holistic feedback..." : "No remarks provided."}
// // //                                         value={assOverallFeedback}
// // //                                         disabled={!canGrade}
// // //                                         onChange={e => handleAssOverallFeedbackChange(e.target.value)}
// // //                                     />
// // //                                 ) : (
// // //                                     <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', color: '#b91c1c', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #dc2626' }}>
// // //                                         {assOverallFeedback || "No overall remarks provided."}
// // //                                     </div>
// // //                                 )}
// // //                             </div>

// // //                             {(!canGrade && submission.grading?.gradedAt) && (
// // //                                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1rem' }}>
// // //                                     <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
// // //                                     {assessorProfile?.signatureUrl ? (
// // //                                         <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
// // //                                     ) : (
// // //                                         <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // //                                     )}
// // //                                     <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName}</p>
// // //                                     <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
// // //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// // //                                 </div>
// // //                             )}

// // //                             {canGrade && (
// // //                                 <div className="sr-action-area">
// // //                                     <button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving}>
// // //                                         {saving ? 'Processing...' : 'Apply Signature & Finalise'}
// // //                                     </button>
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     ) : (
// // //                         <div className="sr-summary-card sr-locked-card">
// // //                             <Lock size={28} />
// // //                             <h3>Assessor Grading</h3>
// // //                             <p>Awaiting Facilitator to complete Blue Pen pre-marking.</p>
// // //                         </div>
// // //                     )}

// // //                     {/* MODERATOR PANEL */}
// // //                     {showModeratorLayer ? (
// // //                         <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
// // //                             <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>

// // //                             {canModerate && (
// // //                                 <div className="sr-role-guide green">
// // //                                     <Info size={16} />
// // //                                     <div>
// // //                                         <strong>Quality Assurance & Endorsement</strong><br />
// // //                                         Your Green Pen evaluates the Assessor, not the learner. Use comments to instruct the Assessor on corrections before endorsing this script.
// // //                                     </div>
// // //                                 </div>
// // //                             )}

// // //                             <div className="sr-competency-section">
// // //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderation Outcome</label>
// // //                                 <div className="sr-comp-toggles">
// // //                                     <button
// // //                                         className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`}
// // //                                         onClick={() => handleModOutcomeSelect('Endorsed')}
// // //                                         disabled={!canModerate}
// // //                                     >
// // //                                         <ShieldCheck size={16} /> Endorse Grade
// // //                                     </button>
// // //                                     <button
// // //                                         className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`}
// // //                                         onClick={() => handleModOutcomeSelect('Returned')}
// // //                                         disabled={!canModerate}
// // //                                     >
// // //                                         <AlertCircle size={16} /> Return to Assessor
// // //                                     </button>
// // //                                 </div>
// // //                             </div>

// // //                             <div className="sr-overall-feedback">
// // //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderator Feedback</label>
// // //                                 <textarea
// // //                                     className="sr-textarea"
// // //                                     rows={3}
// // //                                     style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }}
// // //                                     placeholder={canModerate ? "Notes for the assessor or internal QA..." : "No moderation feedback."}
// // //                                     value={modFeedback}
// // //                                     disabled={!canModerate}
// // //                                     onChange={e => handleModFeedbackChange(e.target.value)}
// // //                                 />
// // //                             </div>

// // //                             {(!canModerate && submission.moderation?.moderatedAt) && (
// // //                                 <div className="sr-audit-stamp" style={{ color: 'green', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// // //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Moderated by {submission.moderation?.moderatorName}
// // //                                 </div>
// // //                             )}

// // //                             {canModerate && (
// // //                                 <div className="sr-action-area">
// // //                                     <button
// // //                                         className="sr-submit-btn"
// // //                                         style={{ background: 'green' }}
// // //                                         onClick={triggerSubmitModeration}
// // //                                         disabled={saving}
// // //                                     >
// // //                                         {saving ? 'Processing...' : 'Finalise QA & Endorse'}
// // //                                     </button>
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     ) : (
// // //                         <div className="sr-summary-card sr-locked-card">
// // //                             <Lock size={28} />
// // //                             <h3>QA Moderation</h3>
// // //                             <p>Awaiting Assessor to complete Red Pen official grading.</p>
// // //                         </div>
// // //                     )}

// // //                     {/* 🚀 OFFICIAL AUDIT TRAIL 🚀 */}
// // //                     <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
// // //                         <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}>
// // //                             <ShieldCheck size={18} color="#073f4e" /> Official Audit Trail
// // //                         </h3>

// // //                         {
// // //                             (submission.status === 'not_started') && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>
// // //                         }

// // //                         {/* Learner Record */}
// // //                         {submission.status !== 'not_started' && (
// // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
// // //                                 {learnerProfile?.signatureUrl ? (
// // //                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// // //                                 ) : (
// // //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // //                                 )}
// // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
// // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</p>
// // //                             </div>
// // //                         )}

// // //                         {/* Assessor Record */}
// // //                         {submission.grading?.gradedAt && (
// // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
// // //                                 {assessorProfile?.signatureUrl ? (
// // //                                     <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// // //                                 ) : (
// // //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // //                                 )}
// // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName}</p>
// // //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
// // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// // //                             </div>
// // //                         )}

// // //                         {/* Moderator Record */}
// // //                         {submission.moderation?.moderatedAt && (
// // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1rem' }}>
// // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation</p>
// // //                                 {moderatorProfile?.signatureUrl ? (
// // //                                     <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
// // //                                 ) : (
// // //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // //                                 )}
// // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{submission.moderation?.moderatorName}</p>
// // //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Outcome: {submission.moderation?.outcome}</p>
// // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</p>
// // //                             </div>
// // //                         )}
// // //                     </div>
// // //                 </aside>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // // ─── INTERNAL COMPONENTS ───

// // // const SigBox = ({ label, name, date, url, color }: any) => (
// // //     <div className="sr-sig-box" style={{ borderColor: color }}>
// // //         <span style={{ color }}>{label}</span>
// // //         {url ? <TintedSignature imageUrl={url} color={color} /> : <div className="sr-timestamp-text" style={{ color }}>Verified Timestamp</div>}
// // //         <strong style={{ color }}>{name || 'N/A'}</strong>
// // //         <span style={{ color }}>{date ? new Date(date).toLocaleDateString() : '—'}</span>
// // //     </div>
// // // );

// // // const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
// // //     const filterMap: any = {
// // //         black: 'brightness(0)',
// // //         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
// // //         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
// // //         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
// // //     };

// // //     return (
// // //         <img
// // //             src={imageUrl}
// // //             alt="Signature"
// // //             style={{
// // //                 height: '60px',
// // //                 width: 'auto',
// // //                 maxWidth: '100%',
// // //                 objectFit: 'contain',
// // //                 marginBottom: '10px',
// // //                 filter: filterMap[color] || 'none'
// // //             }}
// // //         />
// // //     );
// // // };


// // // // import React, { useState, useEffect, useRef } from 'react';
// // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // import { doc, getDoc, updateDoc } from 'firebase/firestore';
// // // // import { db } from '../../../lib/firebase';
// // // // import { useStore } from '../../../store/useStore';
// // // // import {
// // // //     ArrowLeft, CheckCircle, AlertCircle, Save,
// // // //     User, GraduationCap, Clock, MessageSquare, Award,
// // // //     ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2, XCircle, AlertTriangle
// // // // } from 'lucide-react';
// // // // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // // // import './SubmissionReview.css';

// // // // interface GradeData {
// // // //     score: number;
// // // //     feedback: string;
// // // //     isCorrect?: boolean | null;
// // // // }

// // // // export type StatusType = 'info' | 'success' | 'error' | 'warning';

// // // // // ─── STATUS MODAL COMPONENT ─────────────────────────────────────────────
// // // // const StatusModal: React.FC<{
// // // //     type: StatusType;
// // // //     title: string;
// // // //     message: string;
// // // //     onClose: () => void;
// // // //     onConfirm?: () => void;
// // // //     confirmText?: string;
// // // //     cancelText?: string;
// // // // }> = ({ type, title, message, onClose, onConfirm, confirmText = "Okay", cancelText = "Cancel" }) => {

// // // //     const styles = {
// // // //         info: { color: '#3b82f6', Icon: Info },
// // // //         success: { color: '#22c55e', Icon: CheckCircle },
// // // //         error: { color: '#ef4444', Icon: XCircle },
// // // //         warning: { color: '#f59e0b', Icon: AlertTriangle }
// // // //     };

// // // //     const { color, Icon } = styles[type];

// // // //     return (
// // // //         <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(3px)' }}>
// // // //             <div style={{ background: 'white', maxWidth: '400px', width: '90%', textAlign: 'center', padding: '2rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
// // // //                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
// // // //                     <Icon size={48} color={color} />
// // // //                 </div>
// // // //                 <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{title}</h2>
// // // //                 <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem', fontSize: '0.9rem' }}>{message}</p>
// // // //                 <div style={{ display: 'flex', gap: '1rem' }}>
// // // //                     {onConfirm && (
// // // //                         <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// // // //                             {cancelText}
// // // //                         </button>
// // // //                     )}
// // // //                     <button onClick={onConfirm || onClose} style={{ flex: 1, padding: '0.75rem', background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// // // //                         {confirmText}
// // // //                     </button>
// // // //                 </div>
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };

// // // // export const SubmissionReview: React.FC = () => {
// // // //     const { submissionId } = useParams<{ submissionId: string }>();
// // // //     const navigate = useNavigate();
// // // //     const { user } = useStore();
// // // //     const toast = useToast();

// // // //     const [loading, setLoading] = useState(true);
// // // //     const [saving, setSaving] = useState(false);

// // // //     const [submission, setSubmission] = useState<any>(null);
// // // //     const [assessment, setAssessment] = useState<any>(null);
// // // //     const [learner, setLearner] = useState<any>(null);

// // // //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// // // //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// // // //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);

// // // //     // 🚀 STRICT DUAL-LAYER GRADING STATE 🚀
// // // //     const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
// // // //     const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});

// // // //     const [facOverallFeedback, setFacOverallFeedback] = useState('');
// // // //     const [assOverallFeedback, setAssOverallFeedback] = useState('');
// // // //     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

// // // //     const [modFeedback, setModFeedback] = useState('');
// // // //     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

// // // //     // Modal State & Auto-Save
// // // //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm?: () => void; confirmText?: string; cancelText?: string } | null>(null);
// // // //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// // // //     // ─── RBAC: PERMISSION FLAGS ────────────────────────────────────────────────
// // // //     const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
// // // //     const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
// // // //     const isModerator = user?.role === 'moderator' || user?.role === 'admin';

// // // //     const canFacilitatorMark = isFacilitator && submission?.status === 'submitted';
// // // //     const canGrade = isAssessor && (submission?.status === 'facilitator_reviewed' || submission?.status === 'returned');
// // // //     const canModerate = isModerator && submission?.status === 'graded';

// // // //     // 🚀 Defines what layers are visible to whom
// // // //     const showAssessorLayer = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(submission?.status);
// // // //     const showModeratorLayer = ['graded', 'moderated'].includes(submission?.status);

// // // //     useEffect(() => {
// // // //         const loadReviewData = async () => {
// // // //             if (!submissionId) return;
// // // //             try {
// // // //                 const subRef = doc(db, 'learner_submissions', submissionId);
// // // //                 const subSnap = await getDoc(subRef);
// // // //                 if (!subSnap.exists()) throw new Error("Submission not found");
// // // //                 const subData = subSnap.data();
// // // //                 setSubmission({ id: subSnap.id, ...subData });

// // // //                 const assRef = doc(db, 'assessments', subData.assessmentId);
// // // //                 const assSnap = await getDoc(assRef);
// // // //                 if (!assSnap.exists()) throw new Error("Assessment template missing");
// // // //                 const assData = assSnap.data();
// // // //                 setAssessment(assData);

// // // //                 const learnerRef = doc(db, 'learners', subData.learnerId);
// // // //                 const learnerSnap = await getDoc(learnerRef);
// // // //                 let learnerAuthUid = null;
// // // //                 if (learnerSnap.exists()) {
// // // //                     const lData = learnerSnap.data();
// // // //                     setLearner(lData);
// // // //                     learnerAuthUid = lData.authUid;
// // // //                 }

// // // //                 const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || learnerAuthUid || subData.learnerId;
// // // //                 if (targetLearnerUid) {
// // // //                     const lProfSnap = await getDoc(doc(db, 'users', targetLearnerUid));
// // // //                     if (lProfSnap.exists()) setLearnerProfile(lProfSnap.data());
// // // //                 }

// // // //                 if (subData.grading?.gradedBy) {
// // // //                     const assProfRef = doc(db, 'users', subData.grading.gradedBy);
// // // //                     const assProfSnap = await getDoc(assProfRef);
// // // //                     if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
// // // //                 }

// // // //                 if (subData.moderation?.moderatedBy) {
// // // //                     const modProfRef = doc(db, 'users', subData.moderation.moderatedBy);
// // // //                     const modProfSnap = await getDoc(modProfRef);
// // // //                     if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
// // // //                 }

// // // //                 // 🚀 LAYERED DATA LOADING & LEGACY MIGRATION 🚀
// // // //                 let fBreakdown = subData.grading?.facilitatorBreakdown;
// // // //                 let aBreakdown = subData.grading?.assessorBreakdown;

// // // //                 // 1. Load Facilitator Data
// // // //                 if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
// // // //                     if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) {
// // // //                         // Legacy Migration: Move old grades into the Facilitator layer so they aren't lost
// // // //                         fBreakdown = subData.grading.breakdown;
// // // //                     } else {
// // // //                         // Completely fresh start: Auto-grade MCQs for Facilitator
// // // //                         fBreakdown = {};
// // // //                         assData.blocks?.forEach((block: any) => {
// // // //                             if (block.type === 'mcq') {
// // // //                                 const isCorrect = subData.answers?.[block.id] === block.correctOption;
// // // //                                 fBreakdown[block.id] = { score: isCorrect ? (block.marks || 0) : 0, feedback: isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect', isCorrect };
// // // //                             } else if (block.type === 'text') {
// // // //                                 fBreakdown[block.id] = { score: 0, feedback: '', isCorrect: null };
// // // //                             }
// // // //                         });
// // // //                     }
// // // //                 }
// // // //                 setFacBreakdown(fBreakdown);

// // // //                 // 2. Load Assessor Data
// // // //                 if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
// // // //                     // UX Booster: Pre-fill Assessor scores with Facilitator scores to save time,
// // // //                     // but wipe the feedback so the Assessor writes their own Red Pen comments.
// // // //                     if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(subData.status)) {
// // // //                         aBreakdown = JSON.parse(JSON.stringify(fBreakdown));
// // // //                         Object.keys(aBreakdown).forEach(key => {
// // // //                             aBreakdown[key].feedback = '';
// // // //                         });
// // // //                     } else {
// // // //                         aBreakdown = {};
// // // //                     }
// // // //                 }
// // // //                 setAssBreakdown(aBreakdown);

// // // //                 // Load Overall Feedbacks
// // // //                 setFacOverallFeedback(subData.grading?.facilitatorOverallFeedback || '');
// // // //                 setAssOverallFeedback(subData.grading?.assessorOverallFeedback || subData.grading?.overallFeedback || '');

// // // //                 setCompetency(subData.competency || null);
// // // //                 setModFeedback(subData.moderation?.feedback || '');
// // // //                 setModOutcome(subData.moderation?.outcome || null);

// // // //             } catch (err: any) {
// // // //                 toast.error(err.message || "Failed to load data.");
// // // //             } finally {
// // // //                 setLoading(false);
// // // //             }
// // // //         };
// // // //         loadReviewData();
// // // //     }, [submissionId]);

// // // //     // ─── AUTO-SAVE ENGINE ──────────────────────────────────────────────────
// // // //     const triggerAutoSave = (fBreak: any, aBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
// // // //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

// // // //         setSaving(true);
// // // //         saveTimeoutRef.current = setTimeout(async () => {
// // // //             if (!submission?.id) return;
// // // //             try {
// // // //                 const updatePayload: any = {
// // // //                     'grading.facilitatorBreakdown': fBreak,
// // // //                     'grading.assessorBreakdown': aBreak,
// // // //                     'grading.facilitatorOverallFeedback': fOverall,
// // // //                     'grading.assessorOverallFeedback': aOverall,
// // // //                     'moderation.feedback': updatedModFeedback,
// // // //                     lastStaffEditAt: new Date().toISOString()
// // // //                 };

// // // //                 if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
// // // //                 if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

// // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
// // // //             } catch (error) {
// // // //                 console.error("Auto-save failed:", error);
// // // //             } finally {
// // // //                 setSaving(false);
// // // //             }
// // // //         }, 1500);
// // // //     };

// // // //     // ─── VISUAL MARKING HANDLERS ──────────────────────────────────────────────
// // // //     const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
// // // //         if (canFacilitatorMark) {
// // // //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// // // //             setFacBreakdown(next);
// // // //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // //         } else if (canGrade) {
// // // //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// // // //             setAssBreakdown(next);
// // // //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // //         }
// // // //     };

// // // //     const handleScoreChange = (blockId: string, score: number, max: number) => {
// // // //         const val = Math.min(Math.max(0, score), max);
// // // //         if (canFacilitatorMark) {
// // // //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], score: val } };
// // // //             setFacBreakdown(next);
// // // //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // //         } else if (canGrade) {
// // // //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], score: val } };
// // // //             setAssBreakdown(next);
// // // //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // //         }
// // // //     };

// // // //     const handleFeedbackChange = (blockId: string, feedback: string) => {
// // // //         if (canFacilitatorMark) {
// // // //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], feedback } };
// // // //             setFacBreakdown(next);
// // // //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // //         } else if (canGrade) {
// // // //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], feedback } };
// // // //             setAssBreakdown(next);
// // // //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // //         }
// // // //     };

// // // //     const handleFacOverallFeedbackChange = (val: string) => {
// // // //         if (!canFacilitatorMark) return;
// // // //         setFacOverallFeedback(val);
// // // //         triggerAutoSave(facBreakdown, assBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome);
// // // //     };

// // // //     const handleAssOverallFeedbackChange = (val: string) => {
// // // //         if (!canGrade) return;
// // // //         setAssOverallFeedback(val);
// // // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome);
// // // //     };

// // // //     const handleModFeedbackChange = (val: string) => {
// // // //         if (!canModerate) return;
// // // //         setModFeedback(val);
// // // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome);
// // // //     };

// // // //     const handleCompetencySelect = (val: 'C' | 'NYC') => {
// // // //         if (!canGrade) return;
// // // //         setCompetency(val);
// // // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome);
// // // //     };

// // // //     const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
// // // //         if (!canModerate) return;
// // // //         setModOutcome(val);
// // // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val);
// // // //     };

// // // //     // 🚀 INDEPENDENT SCORE CALCULATIONS 🚀
// // // //     const getTotals = (breakdown: Record<string, GradeData>) => {
// // // //         const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
// // // //         const max = assessment?.totalMarks || 0;
// // // //         const pct = max > 0 ? Math.round((score / max) * 100) : 0;
// // // //         return { score, max, pct };
// // // //     };

// // // //     const facTotals = getTotals(facBreakdown);
// // // //     const assTotals = getTotals(assBreakdown);
// // // //     const activeTotals = showAssessorLayer ? assTotals : facTotals;

// // // //     // ─── VALIDATION HELPER ──────────────────────────────────────────────────
// // // //     const validateAllMarked = (breakdown: Record<string, GradeData>) => {
// // // //         if (!assessment?.blocks) return true;

// // // //         const unmarkedCount = assessment.blocks.filter((block: any) => {
// // // //             if (block.type !== 'mcq' && block.type !== 'text') return false;
// // // //             const grade = breakdown[block.id];
// // // //             return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
// // // //         }).length;

// // // //         return unmarkedCount === 0;
// // // //     };

// // // //     // ─── FINAL SUBMISSIONS ──────────────────────────────────────────────────
// // // //     const triggerSubmitFacilitator = () => {
// // // //         if (!validateAllMarked(facBreakdown)) {
// // // //             setModalConfig({
// // // //                 isOpen: true, type: 'warning',
// // // //                 title: 'Incomplete Marking',
// // // //                 message: 'You must evaluate every question. Please ensure every question has a Green Tick or Red Cross selected before submitting.',
// // // //                 confirmText: 'Got it'
// // // //             });
// // // //             return;
// // // //         }

// // // //         setModalConfig({
// // // //             isOpen: true,
// // // //             type: 'info',
// // // //             title: 'Complete Pre-Marking?',
// // // //             message: 'This will finalize your Blue Pen feedback and send the workbook to the Assessor for official grading.',
// // // //             confirmText: 'Send to Assessor',
// // // //             onConfirm: async () => {
// // // //                 setModalConfig(null);
// // // //                 setSaving(true);
// // // //                 try {
// // // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // //                         status: 'facilitator_reviewed',
// // // //                         'grading.facilitatorBreakdown': facBreakdown,
// // // //                         'grading.facilitatorOverallFeedback': facOverallFeedback,
// // // //                         'grading.facilitatorId': user?.uid,
// // // //                         'grading.facilitatorName': user?.fullName,
// // // //                         'grading.facilitatorReviewedAt': new Date().toISOString()
// // // //                     });
// // // //                     toast.success("Script marked and passed to Assessor!");
// // // //                     setTimeout(() => navigate(-1), 2000);
// // // //                 } catch (error) { toast.error("Failed to save marking."); } finally { setSaving(false); }
// // // //             }
// // // //         });
// // // //     };

// // // //     const triggerSubmitGrade = () => {
// // // //         if (!validateAllMarked(assBreakdown)) {
// // // //             setModalConfig({
// // // //                 isOpen: true, type: 'warning',
// // // //                 title: 'Incomplete Grading',
// // // //                 message: 'You must evaluate every question. Please ensure every question has a Tick or Cross selected before submitting your final grade.',
// // // //                 confirmText: 'Got it'
// // // //             });
// // // //             return;
// // // //         }

// // // //         if (!competency) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a final competency (C or NYC) before submitting.', confirmText: 'Got it' });

// // // //         setModalConfig({
// // // //             isOpen: true,
// // // //             type: 'warning',
// // // //             title: 'Finalise Grade?',
// // // //             message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.',
// // // //             confirmText: 'Apply Signature & Submit',
// // // //             onConfirm: async () => {
// // // //                 setModalConfig(null);
// // // //                 setSaving(true);
// // // //                 try {
// // // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // //                         status: 'graded',
// // // //                         marks: assTotals.score,
// // // //                         competency: competency,
// // // //                         'grading.assessorBreakdown': assBreakdown,
// // // //                         'grading.assessorOverallFeedback': assOverallFeedback,
// // // //                         'grading.gradedBy': user?.uid,
// // // //                         'grading.assessorName': user?.fullName,
// // // //                         'grading.assessorRegNumber': user?.assessorRegNumber || 'Pending Reg',
// // // //                         'grading.gradedAt': new Date().toISOString()
// // // //                     });
// // // //                     toast.success("Workbook graded and signed successfully!");
// // // //                     setTimeout(() => window.location.reload(), 500);
// // // //                 } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
// // // //             }
// // // //         });
// // // //     };

// // // //     const triggerSubmitModeration = () => {
// // // //         if (!modOutcome) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Outcome', message: 'You must select an endorsement outcome before submitting.', confirmText: 'Got it' });

// // // //         setModalConfig({
// // // //             isOpen: true,
// // // //             type: 'info',
// // // //             title: 'Finalise Moderation?',
// // // //             message: modOutcome === 'Returned' ? 'This will return the workbook to the Assessor for remediation.' : 'This will apply your Green Pen signature and endorse the final grade.',
// // // //             confirmText: 'Confirm Moderation',
// // // //             onConfirm: async () => {
// // // //                 setModalConfig(null);
// // // //                 setSaving(true);
// // // //                 try {
// // // //                     const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
// // // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // //                         status: newStatus,
// // // //                         'moderation.outcome': modOutcome,
// // // //                         'moderation.feedback': modFeedback,
// // // //                         'moderation.moderatedBy': user?.uid,
// // // //                         'moderation.moderatorName': user?.fullName,
// // // //                         'moderation.moderatorRegNumber': user?.assessorRegNumber || 'Pending Reg',
// // // //                         'moderation.moderatedAt': new Date().toISOString()
// // // //                     });
// // // //                     toast.success("Moderation saved successfully!");
// // // //                     setTimeout(() => window.location.reload(), 500);
// // // //                 } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
// // // //             }
// // // //         });
// // // //     };

// // // //     if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
// // // //     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

// // // //     const activeInkColor = showAssessorLayer ? 'red' : 'blue';
// // // //     const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');

// // // //     return (
// // // //         <div className="sr-root animate-fade-in">
// // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // //             {/* 🚀 MODAL MOUNT 🚀 */}
// // // //             {modalConfig && (
// // // //                 <StatusModal
// // // //                     type={modalConfig.type}
// // // //                     title={modalConfig.title}
// // // //                     message={modalConfig.message}
// // // //                     onConfirm={modalConfig.onConfirm}
// // // //                     confirmText={modalConfig.confirmText}
// // // //                     cancelText={modalConfig.cancelText}
// // // //                     onClose={() => setModalConfig(null)}
// // // //                 />
// // // //             )}

// // // //             {/* ── TOP NAV ── */}
// // // //             <div className="ap-player-topbar no-print">
// // // //                 <div className="ap-player-topbar__left">
// // // //                     <button className="sr-back-btn" onClick={() => navigate(-1)}>
// // // //                         <ArrowLeft size={13} /> Portfolio
// // // //                     </button>
// // // //                     <div className="ap-player-topbar__separator" />
// // // //                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
// // // //                 </div>

// // // //                 <div className="ap-player-topbar__right">
// // // //                     <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
// // // //                         <Printer size={13} /> Print Audit
// // // //                     </button>
// // // //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
// // // //                         {saving ? (
// // // //                             <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</>
// // // //                         ) : (
// // // //                             <><CheckCircle size={12} /> Auto-saved</>
// // // //                         )}
// // // //                     </span>
// // // //                 </div>
// // // //             </div>

// // // //             <div className="sr-layout">
// // // //                 {/* ── LEFT PANE: WORKBOOK & ANSWERS ── */}
// // // //                 <div className="sr-content-pane print-pane">

// // // //                     {/* 🚀 OFFICIAL QCTO AUDIT HEADER (Visible on Print) 🚀 */}
// // // //                     <div className="sr-print-header">
// // // //                         <h2>OFFICIAL ASSESSMENT RECORD</h2>

// // // //                         <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', borderBottom: '1px solid black', paddingBottom: '1rem' }}>
// // // //                             <div style={{ flex: 1 }}>
// // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Learner Name:</strong> {learner?.fullName}</p>
// // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
// // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
// // // //                             </div>
// // // //                             <div style={{ flex: 1, textAlign: 'right' }}>
// // // //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// // // //                                     <strong>Score:</strong> <span style={{ color: activeInkColor, fontWeight: 'bold' }}>{activeTotals.score} / {activeTotals.max} ({activeTotals.pct}%)</span>
// // // //                                 </p>
// // // //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// // // //                                     <strong>Outcome:</strong> <span style={{ color: printOutcomeColor, fontWeight: 'bold' }}>{submission.competency === 'C' ? 'Competent (C)' : (submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending')}</span>
// // // //                                 </p>
// // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Submitted:</strong> {new Date(submission.submittedAt).toLocaleDateString()}</p>
// // // //                             </div>
// // // //                         </div>

// // // //                         {/* SIGNATURE BLOCKS */}
// // // //                         <div className="sr-signature-block">
// // // //                             <div className="sr-sig-box" style={{ borderColor: 'black' }}>
// // // //                                 <span style={{ color: 'black' }}>Learner Declaration</span>
// // // //                                 {learnerProfile?.signatureUrl ? (
// // // //                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// // // //                                 ) : (
// // // //                                     <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'black', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // //                                 )}
// // // //                                 <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
// // // //                                 <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
// // // //                                 <div className="sr-sig-line" style={{ color: 'black', borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
// // // //                             </div>

// // // //                             {showAssessorLayer && submission.grading?.gradedAt && (
// // // //                                 <div className="sr-sig-box" style={{ borderColor: 'red' }}>
// // // //                                     <span style={{ color: 'red' }}>Assessor Sign-off</span>
// // // //                                     {assessorProfile?.signatureUrl ? (
// // // //                                         <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
// // // //                                     ) : (
// // // //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'red', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // //                                     )}
// // // //                                     <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
// // // //                                     <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
// // // //                                     <em style={{ color: 'red' }}>Signed: {new Date(submission.grading?.gradedAt).toLocaleDateString()}</em>
// // // //                                     <div className="sr-sig-line" style={{ color: 'red', borderTopColor: 'red' }}>Digital Signature Confirmed</div>
// // // //                                 </div>
// // // //                             )}

// // // //                             {showModeratorLayer && submission.moderation?.moderatedAt && (
// // // //                                 <div className="sr-sig-box" style={{ borderColor: 'green' }}>
// // // //                                     <span style={{ color: 'green' }}>Internal Moderation</span>
// // // //                                     {moderatorProfile?.signatureUrl ? (
// // // //                                         <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
// // // //                                     ) : (
// // // //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'green', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // //                                     )}
// // // //                                     <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
// // // //                                     <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
// // // //                                     <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</em>
// // // //                                     <div className="sr-sig-line" style={{ color: 'green', borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                     </div>

// // // //                     {!showAssessorLayer && (
// // // //                         <div className="sr-learner-meta no-print">
// // // //                             <User size={18} color="black" />
// // // //                             <span style={{ color: 'black' }}><strong>{learner?.fullName}</strong> ({learner?.idNumber})</span>
// // // //                             <span className="sr-dot" />
// // // //                             <Clock size={14} color="black" />
// // // //                             <span style={{ color: 'black' }}>Submitted: {new Date(submission.submittedAt).toLocaleString()}</span>
// // // //                         </div>
// // // //                     )}

// // // //                     <div className="sr-blocks">
// // // //                         {assessment.blocks?.map((block: any, idx: number) => {
// // // //                             if (block.type === 'section') {
// // // //                                 return <h2 key={block.id} className="sr-section-title" style={{ color: '#073f4e' }}>{block.title}</h2>;
// // // //                             }

// // // //                             if (block.type === 'mcq' || block.type === 'text') {
// // // //                                 const learnerAns = submission.answers?.[block.id];
// // // //                                 const maxM = block.marks || 0;
// // // //                                 const isMCQ = block.type === 'mcq';

// // // //                                 const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
// // // //                                 const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };

// // // //                                 const activeData = showAssessorLayer ? aData : fData;

// // // //                                 return (
// // // //                                     <div key={block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
// // // //                                         <div className="sr-q-header">
// // // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                                                 <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
// // // //                                                 <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>
// // // //                                             </div>

// // // //                                             {/* ACTIVE VISUAL MARKERS */}
// // // //                                             {(canGrade || canFacilitatorMark) && (
// // // //                                                 <div className="sr-visual-mark">
// // // //                                                     <button
// // // //                                                         onClick={() => handleVisualMark(block.id, true, maxM)}
// // // //                                                         className="sr-mark-btn"
// // // //                                                         style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// // // //                                                         title="Mark Correct"
// // // //                                                     >
// // // //                                                         <Check size={20} />
// // // //                                                     </button>
// // // //                                                     <button
// // // //                                                         onClick={() => handleVisualMark(block.id, false, maxM)}
// // // //                                                         className="sr-mark-btn"
// // // //                                                         style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// // // //                                                         title="Mark Incorrect"
// // // //                                                     >
// // // //                                                         <X size={20} />
// // // //                                                     </button>
// // // //                                                 </div>
// // // //                                             )}
// // // //                                         </div>

// // // //                                         <div className="sr-q-body">
// // // //                                             {/* LEARNER ANSWER */}
// // // //                                             <div className="sr-answer-box">
// // // //                                                 <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
// // // //                                                 {isMCQ ? (
// // // //                                                     <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
// // // //                                                         <span style={{ color: 'black' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
// // // //                                                         {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
// // // //                                                     </div>
// // // //                                                 ) : (
// // // //                                                     <div className="sr-text-ans">
// // // //                                                         {learnerAns ? (
// // // //                                                             <div className="quill-read-only-content" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: learnerAns }} />
// // // //                                                         ) : (
// // // //                                                             <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>
// // // //                                                         )}
// // // //                                                     </div>
// // // //                                                 )}

// // // //                                                 {isMCQ && (
// // // //                                                     <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>
// // // //                                                         Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong>
// // // //                                                     </div>
// // // //                                                 )}
// // // //                                             </div>

// // // //                                             {/* 🚀 READ-ONLY FACILITATOR LAYER (Seen by Assessor & Moderator) */}
// // // //                                             {showAssessorLayer && (
// // // //                                                 <div className="sr-read-only-feedback blue-pen-locked">
// // // //                                                     <div className="label"><Info size={13} /> Facilitator Pre-Mark</div>
// // // //                                                     <div className="content">
// // // //                                                         <span className="score">[{fData.score ?? 0}/{maxM}]</span> {fData.feedback || <em>No specific coaching provided.</em>}
// // // //                                                     </div>
// // // //                                                 </div>
// // // //                                             )}

// // // //                                             {/* 🚀 READ-ONLY ASSESSOR LAYER (Seen by Moderator) */}
// // // //                                             {showModeratorLayer && (
// // // //                                                 <div className="sr-read-only-feedback red-pen-locked">
// // // //                                                     <div className="label"><Award size={13} /> Assessor Grade</div>
// // // //                                                     <div className="content">
// // // //                                                         <span className="score">[{aData.score ?? 0}/{maxM}]</span> {aData.feedback || <em>No specific feedback provided.</em>}
// // // //                                                     </div>
// // // //                                                 </div>
// // // //                                             )}

// // // //                                             {/* ACTIVE GRADING INPUTS (Your Turn OR Read-Only Display of Final Assessor Grade) */}
// // // //                                             <div className={`sr-grade-box ${!(canGrade || canFacilitatorMark) ? 'disabled' : ''}`}>
// // // //                                                 <div className="sr-score-input-wrap">
// // // //                                                     <label style={{ color: activeInkColor }}>Marks Awarded:</label>
// // // //                                                     <input
// // // //                                                         type="number"
// // // //                                                         className="sr-score-input"
// // // //                                                         style={{ color: activeInkColor }}
// // // //                                                         value={activeData.score ?? 0}
// // // //                                                         disabled={!(canGrade || canFacilitatorMark)}
// // // //                                                         onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)}
// // // //                                                     />
// // // //                                                     <span style={{ color: activeInkColor }}>/ {maxM}</span>
// // // //                                                 </div>

// // // //                                                 <div className="sr-feedback-wrap">
// // // //                                                     <Edit3 size={14} color={activeInkColor} />
// // // //                                                     <input
// // // //                                                         type="text"
// // // //                                                         className="sr-feedback-input"
// // // //                                                         style={{ color: activeInkColor, fontStyle: 'italic', fontWeight: 500 }}
// // // //                                                         placeholder={canGrade ? "Assessor Red Pen feedback..." : canFacilitatorMark ? "Facilitator Blue Pen feedback..." : "No specific feedback provided."}
// // // //                                                         value={activeData.feedback || ''}
// // // //                                                         disabled={!(canGrade || canFacilitatorMark)}
// // // //                                                         onChange={e => handleFeedbackChange(block.id, e.target.value)}
// // // //                                                     />
// // // //                                                 </div>
// // // //                                             </div>

// // // //                                         </div>
// // // //                                     </div>
// // // //                                 );
// // // //                             }
// // // //                             return null;
// // // //                         })}
// // // //                     </div>
// // // //                 </div>

// // // //                 {/* ── RIGHT PANE: GRADING & MODERATION (No print) ── */}
// // // //                 <aside className="sr-sidebar no-print">

// // // //                     {/* FACILITATOR PRE-MARKING PANEL */}
// // // //                     {(canFacilitatorMark || showAssessorLayer) && (
// // // //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
// // // //                             <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>

// // // //                             {canFacilitatorMark && (
// // // //                                 <div className="sr-role-guide blue">
// // // //                                     <Info size={16} />
// // // //                                     <div>
// // // //                                         <strong>Formative Feedback & Coaching</strong><br />
// // // //                                         Use your Blue Pen to provide developmental feedback. Your comments prove to the QCTO auditor that Learner Support took place before official grading.
// // // //                                     </div>
// // // //                                 </div>
// // // //                             )}

// // // //                             <div className="sr-score-display">
// // // //                                 <div className="sr-score-circle" style={{ borderColor: 'blue' }}>
// // // //                                     <span className="sr-score-val" style={{ color: 'blue' }}>
// // // //                                         {facTotals.score}
// // // //                                     </span>
// // // //                                     <span className="sr-score-max" style={{ color: 'blue' }}>/ {facTotals.max}</span>
// // // //                                 </div>
// // // //                                 <div className="sr-score-percent" style={{ color: 'blue' }}>{facTotals.pct}%</div>
// // // //                             </div>

// // // //                             {/* 🚀 Facilitator Overall Feedback */}
// // // //                             <div className="sr-overall-feedback">
// // // //                                 <label className="sr-sidebar-label" style={{ color: 'blue' }}>Facilitator Remarks</label>
// // // //                                 {canFacilitatorMark ? (
// // // //                                     <textarea
// // // //                                         className="sr-textarea"
// // // //                                         rows={3}
// // // //                                         style={{ color: 'blue', fontStyle: 'italic', borderColor: 'blue' }}
// // // //                                         placeholder="Add overall coaching comments..."
// // // //                                         value={facOverallFeedback}
// // // //                                         onChange={e => handleFacOverallFeedbackChange(e.target.value)}
// // // //                                     />
// // // //                                 ) : (
// // // //                                     <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', color: '#0369a1', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #0284c7' }}>
// // // //                                         {facOverallFeedback || "No overall remarks provided."}
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>

// // // //                             {canFacilitatorMark ? (
// // // //                                 <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>
// // // //                                     {saving ? 'Processing...' : 'Send to Assessor'}
// // // //                                 </button>
// // // //                             ) : (
// // // //                                 <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// // // //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Completed by {submission.grading?.facilitatorName || 'Facilitator'}
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                     )}

// // // //                     {/* ASSESSOR PANEL */}
// // // //                     {showAssessorLayer && (
// // // //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
// // // //                             <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>

// // // //                             {canGrade && (
// // // //                                 <div className="sr-role-guide red">
// // // //                                     <Info size={16} />
// // // //                                     <div>
// // // //                                         <strong>Summative Judgment & Remediation</strong><br />
// // // //                                         Use your Red Pen to declare Competency. You <i>must</i> provide written feedback to justify your marks. If NYC, your comments legally guide the learner's remediation.
// // // //                                     </div>
// // // //                                 </div>
// // // //                             )}

// // // //                             <div className="sr-score-display">
// // // //                                 <div className="sr-score-circle" style={{ borderColor: 'red', width: '80px', height: '80px' }}>
// // // //                                     <span className="sr-score-val" style={{ color: 'red', fontSize: '1.5rem' }}>{assTotals.score}</span>
// // // //                                 </div>
// // // //                                 <div className="sr-score-percent" style={{ color: 'red' }}>{assTotals.pct}%</div>
// // // //                             </div>

// // // //                             <div className="sr-competency-section" style={{ marginTop: '1rem' }}>
// // // //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Final Competency</label>
// // // //                                 <div className="sr-comp-toggles">
// // // //                                     <button
// // // //                                         className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`}
// // // //                                         onClick={() => handleCompetencySelect('C')}
// // // //                                         disabled={!canGrade}
// // // //                                     >
// // // //                                         <Award size={16} /> Competent (C)
// // // //                                     </button>
// // // //                                     <button
// // // //                                         className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`}
// // // //                                         onClick={() => handleCompetencySelect('NYC')}
// // // //                                         disabled={!canGrade}
// // // //                                     >
// // // //                                         <AlertCircle size={16} /> Not Yet Competent
// // // //                                     </button>
// // // //                                 </div>
// // // //                             </div>

// // // //                             {/* 🚀 Assessor Overall Feedback */}
// // // //                             <div className="sr-overall-feedback">
// // // //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
// // // //                                 {canGrade ? (
// // // //                                     <textarea
// // // //                                         className="sr-textarea"
// // // //                                         rows={3}
// // // //                                         style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: 'red' }}
// // // //                                         placeholder="Provide holistic assessment feedback..."
// // // //                                         value={assOverallFeedback}
// // // //                                         onChange={e => handleAssOverallFeedbackChange(e.target.value)}
// // // //                                     />
// // // //                                 ) : (
// // // //                                     <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', color: '#b91c1c', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #dc2626' }}>
// // // //                                         {assOverallFeedback || "No overall remarks provided."}
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>

// // // //                             {(!canGrade && submission.grading?.gradedAt) && (
// // // //                                 <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
// // // //                                     <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: 'red', textTransform: 'uppercase' }}>Assessor Signature</p>
// // // //                                     {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div style={{ height: '40px', fontStyle: 'italic', fontSize: '0.8rem', color: 'red' }}>No Canvas Signature</div>}
// // // //                                     <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: 'red' }}>{submission.grading?.assessorName}</p>
// // // //                                     <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}><Clock size={10} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// // // //                                 </div>
// // // //                             )}

// // // //                             {canGrade && (
// // // //                                 <div className="sr-action-area">
// // // //                                     <button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving}>
// // // //                                         {saving ? 'Processing...' : 'Apply Signature & Finalise'}
// // // //                                     </button>
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                     )}

// // // //                     {/* MODERATOR PANEL */}
// // // //                     {showModeratorLayer && (
// // // //                         <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
// // // //                             <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>

// // // //                             {canModerate && (
// // // //                                 <div className="sr-role-guide green">
// // // //                                     <Info size={16} />
// // // //                                     <div>
// // // //                                         <strong>Quality Assurance & Endorsement</strong><br />
// // // //                                         Your Green Pen evaluates the Assessor, not the learner. Use comments to instruct the Assessor on corrections before endorsing this script.
// // // //                                     </div>
// // // //                                 </div>
// // // //                             )}

// // // //                             <div className="sr-competency-section">
// // // //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderation Outcome</label>
// // // //                                 <div className="sr-comp-toggles">
// // // //                                     <button
// // // //                                         className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`}
// // // //                                         onClick={() => handleModOutcomeSelect('Endorsed')}
// // // //                                         disabled={!canModerate}
// // // //                                     >
// // // //                                         <ShieldCheck size={16} /> Endorse Grade
// // // //                                     </button>
// // // //                                     <button
// // // //                                         className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`}
// // // //                                         onClick={() => handleModOutcomeSelect('Returned')}
// // // //                                         disabled={!canModerate}
// // // //                                     >
// // // //                                         <AlertCircle size={16} /> Return to Assessor
// // // //                                     </button>
// // // //                                 </div>
// // // //                             </div>

// // // //                             <div className="sr-overall-feedback">
// // // //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderator Feedback</label>
// // // //                                 <textarea
// // // //                                     className="sr-textarea"
// // // //                                     rows={3}
// // // //                                     style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }}
// // // //                                     placeholder={canModerate ? "Notes for the assessor or internal QA..." : "No moderation feedback."}
// // // //                                     value={modFeedback}
// // // //                                     disabled={!canModerate}
// // // //                                     onChange={e => handleModFeedbackChange(e.target.value)}
// // // //                                 />
// // // //                             </div>

// // // //                             {(!canModerate && submission.moderation?.moderatedAt) && (
// // // //                                 <div className="sr-audit-stamp" style={{ color: 'green', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// // // //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Moderated by {submission.moderation?.moderatorName}
// // // //                                 </div>
// // // //                             )}

// // // //                             {canModerate && (
// // // //                                 <div className="sr-action-area">
// // // //                                     <button
// // // //                                         className="sr-submit-btn"
// // // //                                         style={{ background: 'green' }}
// // // //                                         onClick={triggerSubmitModeration}
// // // //                                         disabled={saving}
// // // //                                     >
// // // //                                         {saving ? 'Processing...' : 'Finalise QA & Endorse'}
// // // //                                     </button>
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                     )}
// // // //                 </aside>
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };

// // // // // ─── INTERNAL COMPONENTS ───

// // // // const SigBox = ({ label, name, date, url, color }: any) => (
// // // //     <div className="sr-sig-box" style={{ borderColor: color }}>
// // // //         <span style={{ color }}>{label}</span>
// // // //         {url ? <TintedSignature imageUrl={url} color={color} /> : <div className="sr-timestamp-text" style={{ color }}>Verified Timestamp</div>}
// // // //         <strong style={{ color }}>{name || 'N/A'}</strong>
// // // //         <span style={{ color }}>{date ? new Date(date).toLocaleDateString() : '—'}</span>
// // // //     </div>
// // // // );

// // // // const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
// // // //     const filterMap: any = {
// // // //         black: 'brightness(0)',
// // // //         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
// // // //         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
// // // //         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
// // // //     };

// // // //     return (
// // // //         <img
// // // //             src={imageUrl}
// // // //             alt="Signature"
// // // //             style={{
// // // //                 height: '60px',
// // // //                 width: 'auto',
// // // //                 maxWidth: '100%',
// // // //                 objectFit: 'contain',
// // // //                 marginBottom: '10px',
// // // //                 filter: filterMap[color] || 'none'
// // // //             }}
// // // //         />
// // // //     );
// // // // };


// // // // // // import React, { useState, useEffect, useRef } from 'react';
// // // // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // // // import { doc, getDoc, updateDoc } from 'firebase/firestore';
// // // // // // import { db } from '../../../lib/firebase';
// // // // // // import { useStore } from '../../../store/useStore';
// // // // // // import {
// // // // // //     ArrowLeft, CheckCircle, AlertCircle, Save,
// // // // // //     User, GraduationCap, Clock, MessageSquare, Award,
// // // // // //     ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2, XCircle, AlertTriangle
// // // // // // } from 'lucide-react';
// // // // // // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // // // // // import './SubmissionReview.css';

// // // // // // interface GradeData {
// // // // // //     score: number;
// // // // // //     feedback: string;
// // // // // //     isCorrect?: boolean | null;
// // // // // // }

// // // // // // export type StatusType = 'info' | 'success' | 'error' | 'warning';

// // // // // // // ─── STATUS MODAL COMPONENT ─────────────────────────────────────────────
// // // // // // const StatusModal: React.FC<{
// // // // // //     type: StatusType;
// // // // // //     title: string;
// // // // // //     message: string;
// // // // // //     onClose: () => void;
// // // // // //     onConfirm?: () => void;
// // // // // //     confirmText?: string;
// // // // // //     cancelText?: string;
// // // // // // }> = ({ type, title, message, onClose, onConfirm, confirmText = "Okay", cancelText = "Cancel" }) => {

// // // // // //     const styles = {
// // // // // //         info: { color: '#3b82f6', Icon: Info },
// // // // // //         success: { color: '#22c55e', Icon: CheckCircle },
// // // // // //         error: { color: '#ef4444', Icon: XCircle },
// // // // // //         warning: { color: '#f59e0b', Icon: AlertTriangle }
// // // // // //     };

// // // // // //     const { color, Icon } = styles[type];

// // // // // //     return (
// // // // // //         <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(3px)' }}>
// // // // // //             <div style={{ background: 'white', maxWidth: '400px', width: '90%', textAlign: 'center', padding: '2rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
// // // // // //                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
// // // // // //                     <Icon size={48} color={color} />
// // // // // //                 </div>
// // // // // //                 <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{title}</h2>
// // // // // //                 <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem', fontSize: '0.9rem' }}>{message}</p>
// // // // // //                 <div style={{ display: 'flex', gap: '1rem' }}>
// // // // // //                     {onConfirm && (
// // // // // //                         <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// // // // // //                             {cancelText}
// // // // // //                         </button>
// // // // // //                     )}
// // // // // //                     <button onClick={onConfirm || onClose} style={{ flex: 1, padding: '0.75rem', background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// // // // // //                         {confirmText}
// // // // // //                     </button>
// // // // // //                 </div>
// // // // // //             </div>
// // // // // //         </div>
// // // // // //     );
// // // // // // };

// // // // // // export const SubmissionReview: React.FC = () => {
// // // // // //     const { submissionId } = useParams<{ submissionId: string }>();
// // // // // //     const navigate = useNavigate();
// // // // // //     const { user } = useStore();
// // // // // //     const toast = useToast();

// // // // // //     const [loading, setLoading] = useState(true);
// // // // // //     const [saving, setSaving] = useState(false);

// // // // // //     const [submission, setSubmission] = useState<any>(null);
// // // // // //     const [assessment, setAssessment] = useState<any>(null);
// // // // // //     const [learner, setLearner] = useState<any>(null);

// // // // // //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// // // // // //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// // // // // //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);

// // // // // //     // 🚀 STRICT DUAL-LAYER GRADING STATE 🚀
// // // // // //     const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
// // // // // //     const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});

// // // // // //     const [facOverallFeedback, setFacOverallFeedback] = useState('');
// // // // // //     const [assOverallFeedback, setAssOverallFeedback] = useState('');
// // // // // //     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

// // // // // //     const [modFeedback, setModFeedback] = useState('');
// // // // // //     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

// // // // // //     // Modal State & Auto-Save
// // // // // //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm?: () => void; confirmText?: string; cancelText?: string } | null>(null);
// // // // // //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// // // // // //     // ─── RBAC: PERMISSION FLAGS ────────────────────────────────────────────────
// // // // // //     const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
// // // // // //     const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
// // // // // //     const isModerator = user?.role === 'moderator' || user?.role === 'admin';

// // // // // //     const canFacilitatorMark = isFacilitator && submission?.status === 'submitted';
// // // // // //     const canGrade = isAssessor && (submission?.status === 'facilitator_reviewed' || submission?.status === 'returned');
// // // // // //     const canModerate = isModerator && submission?.status === 'graded';

// // // // // //     // 🚀 Defines what layers are visible to whom
// // // // // //     const showAssessorLayer = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(submission?.status);
// // // // // //     const showModeratorLayer = ['graded', 'moderated'].includes(submission?.status);

// // // // // //     useEffect(() => {
// // // // // //         const loadReviewData = async () => {
// // // // // //             if (!submissionId) return;
// // // // // //             try {
// // // // // //                 const subRef = doc(db, 'learner_submissions', submissionId);
// // // // // //                 const subSnap = await getDoc(subRef);
// // // // // //                 if (!subSnap.exists()) throw new Error("Submission not found");
// // // // // //                 const subData = subSnap.data();
// // // // // //                 setSubmission({ id: subSnap.id, ...subData });

// // // // // //                 const assRef = doc(db, 'assessments', subData.assessmentId);
// // // // // //                 const assSnap = await getDoc(assRef);
// // // // // //                 if (!assSnap.exists()) throw new Error("Assessment template missing");
// // // // // //                 const assData = assSnap.data();
// // // // // //                 setAssessment(assData);

// // // // // //                 const learnerRef = doc(db, 'learners', subData.learnerId);
// // // // // //                 const learnerSnap = await getDoc(learnerRef);
// // // // // //                 let learnerAuthUid = null;
// // // // // //                 if (learnerSnap.exists()) {
// // // // // //                     const lData = learnerSnap.data();
// // // // // //                     setLearner(lData);
// // // // // //                     learnerAuthUid = lData.authUid;
// // // // // //                 }

// // // // // //                 const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || learnerAuthUid || subData.learnerId;
// // // // // //                 if (targetLearnerUid) {
// // // // // //                     const lProfSnap = await getDoc(doc(db, 'users', targetLearnerUid));
// // // // // //                     if (lProfSnap.exists()) setLearnerProfile(lProfSnap.data());
// // // // // //                 }

// // // // // //                 if (subData.grading?.gradedBy) {
// // // // // //                     const assProfRef = doc(db, 'users', subData.grading.gradedBy);
// // // // // //                     const assProfSnap = await getDoc(assProfRef);
// // // // // //                     if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
// // // // // //                 }

// // // // // //                 if (subData.moderation?.moderatedBy) {
// // // // // //                     const modProfRef = doc(db, 'users', subData.moderation.moderatedBy);
// // // // // //                     const modProfSnap = await getDoc(modProfRef);
// // // // // //                     if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
// // // // // //                 }

// // // // // //                 // 🚀 LAYERED DATA LOADING & LEGACY MIGRATION 🚀
// // // // // //                 let fBreakdown = subData.grading?.facilitatorBreakdown;
// // // // // //                 let aBreakdown = subData.grading?.assessorBreakdown;

// // // // // //                 // 1. Load Facilitator Data
// // // // // //                 if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
// // // // // //                     if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) {
// // // // // //                         // Legacy Migration: Move old grades into the Facilitator layer so they aren't lost
// // // // // //                         fBreakdown = subData.grading.breakdown;
// // // // // //                     } else {
// // // // // //                         // Completely fresh start: Auto-grade MCQs for Facilitator
// // // // // //                         fBreakdown = {};
// // // // // //                         assData.blocks?.forEach((block: any) => {
// // // // // //                             if (block.type === 'mcq') {
// // // // // //                                 const isCorrect = subData.answers?.[block.id] === block.correctOption;
// // // // // //                                 fBreakdown[block.id] = { score: isCorrect ? (block.marks || 0) : 0, feedback: isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect', isCorrect };
// // // // // //                             } else if (block.type === 'text') {
// // // // // //                                 fBreakdown[block.id] = { score: 0, feedback: '', isCorrect: null };
// // // // // //                             }
// // // // // //                         });
// // // // // //                     }
// // // // // //                 }
// // // // // //                 setFacBreakdown(fBreakdown);

// // // // // //                 // 2. Load Assessor Data
// // // // // //                 if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
// // // // // //                     // UX Booster: Pre-fill Assessor scores with Facilitator scores to save time,
// // // // // //                     // but wipe the feedback so the Assessor writes their own Red Pen comments.
// // // // // //                     if (['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(subData.status)) {
// // // // // //                         aBreakdown = JSON.parse(JSON.stringify(fBreakdown));
// // // // // //                         Object.keys(aBreakdown).forEach(key => {
// // // // // //                             aBreakdown[key].feedback = '';
// // // // // //                         });
// // // // // //                     } else {
// // // // // //                         aBreakdown = {};
// // // // // //                     }
// // // // // //                 }
// // // // // //                 setAssBreakdown(aBreakdown);

// // // // // //                 // Load Overall Feedbacks
// // // // // //                 setFacOverallFeedback(subData.grading?.facilitatorOverallFeedback || '');
// // // // // //                 setAssOverallFeedback(subData.grading?.assessorOverallFeedback || subData.grading?.overallFeedback || '');

// // // // // //                 setCompetency(subData.competency || null);
// // // // // //                 setModFeedback(subData.moderation?.feedback || '');
// // // // // //                 setModOutcome(subData.moderation?.outcome || null);

// // // // // //             } catch (err: any) {
// // // // // //                 toast.error(err.message || "Failed to load data.");
// // // // // //             } finally {
// // // // // //                 setLoading(false);
// // // // // //             }
// // // // // //         };
// // // // // //         loadReviewData();
// // // // // //     }, [submissionId]);

// // // // // //     // ─── AUTO-SAVE ENGINE ──────────────────────────────────────────────────
// // // // // //     const triggerAutoSave = (fBreak: any, aBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
// // // // // //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

// // // // // //         setSaving(true);
// // // // // //         saveTimeoutRef.current = setTimeout(async () => {
// // // // // //             if (!submission?.id) return;
// // // // // //             try {
// // // // // //                 const updatePayload: any = {
// // // // // //                     'grading.facilitatorBreakdown': fBreak,
// // // // // //                     'grading.assessorBreakdown': aBreak,
// // // // // //                     'grading.facilitatorOverallFeedback': fOverall,
// // // // // //                     'grading.assessorOverallFeedback': aOverall,
// // // // // //                     'moderation.feedback': updatedModFeedback,
// // // // // //                     lastStaffEditAt: new Date().toISOString()
// // // // // //                 };

// // // // // //                 if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
// // // // // //                 if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

// // // // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
// // // // // //             } catch (error) {
// // // // // //                 console.error("Auto-save failed:", error);
// // // // // //             } finally {
// // // // // //                 setSaving(false);
// // // // // //             }
// // // // // //         }, 1500);
// // // // // //     };

// // // // // //     // ─── VISUAL MARKING HANDLERS ──────────────────────────────────────────────
// // // // // //     const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
// // // // // //         if (canFacilitatorMark) {
// // // // // //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// // // // // //             setFacBreakdown(next);
// // // // // //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // // // //         } else if (canGrade) {
// // // // // //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// // // // // //             setAssBreakdown(next);
// // // // // //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // // // //         }
// // // // // //     };

// // // // // //     const handleScoreChange = (blockId: string, score: number, max: number) => {
// // // // // //         const val = Math.min(Math.max(0, score), max);
// // // // // //         if (canFacilitatorMark) {
// // // // // //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], score: val } };
// // // // // //             setFacBreakdown(next);
// // // // // //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // // // //         } else if (canGrade) {
// // // // // //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], score: val } };
// // // // // //             setAssBreakdown(next);
// // // // // //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // // // //         }
// // // // // //     };

// // // // // //     const handleFeedbackChange = (blockId: string, feedback: string) => {
// // // // // //         if (canFacilitatorMark) {
// // // // // //             const next = { ...facBreakdown, [blockId]: { ...facBreakdown[blockId], feedback } };
// // // // // //             setFacBreakdown(next);
// // // // // //             triggerAutoSave(next, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // // // //         } else if (canGrade) {
// // // // // //             const next = { ...assBreakdown, [blockId]: { ...assBreakdown[blockId], feedback } };
// // // // // //             setAssBreakdown(next);
// // // // // //             triggerAutoSave(facBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// // // // // //         }
// // // // // //     };

// // // // // //     const handleFacOverallFeedbackChange = (val: string) => {
// // // // // //         if (!canFacilitatorMark) return;
// // // // // //         setFacOverallFeedback(val);
// // // // // //         triggerAutoSave(facBreakdown, assBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome);
// // // // // //     };

// // // // // //     const handleAssOverallFeedbackChange = (val: string) => {
// // // // // //         if (!canGrade) return;
// // // // // //         setAssOverallFeedback(val);
// // // // // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome);
// // // // // //     };

// // // // // //     const handleModFeedbackChange = (val: string) => {
// // // // // //         if (!canModerate) return;
// // // // // //         setModFeedback(val);
// // // // // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome);
// // // // // //     };

// // // // // //     const handleCompetencySelect = (val: 'C' | 'NYC') => {
// // // // // //         if (!canGrade) return;
// // // // // //         setCompetency(val);
// // // // // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome);
// // // // // //     };

// // // // // //     const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
// // // // // //         if (!canModerate) return;
// // // // // //         setModOutcome(val);
// // // // // //         triggerAutoSave(facBreakdown, assBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val);
// // // // // //     };

// // // // // //     // 🚀 INDEPENDENT SCORE CALCULATIONS 🚀
// // // // // //     const getTotals = (breakdown: Record<string, GradeData>) => {
// // // // // //         const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
// // // // // //         const max = assessment?.totalMarks || 0;
// // // // // //         const pct = max > 0 ? Math.round((score / max) * 100) : 0;
// // // // // //         return { score, max, pct };
// // // // // //     };

// // // // // //     const facTotals = getTotals(facBreakdown);
// // // // // //     const assTotals = getTotals(assBreakdown);
// // // // // //     const activeTotals = showAssessorLayer ? assTotals : facTotals;

// // // // // //     // ─── VALIDATION HELPER ──────────────────────────────────────────────────
// // // // // //     const validateAllMarked = (breakdown: Record<string, GradeData>) => {
// // // // // //         if (!assessment?.blocks) return true;

// // // // // //         const unmarkedCount = assessment.blocks.filter((block: any) => {
// // // // // //             if (block.type !== 'mcq' && block.type !== 'text') return false;
// // // // // //             const grade = breakdown[block.id];
// // // // // //             return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
// // // // // //         }).length;

// // // // // //         return unmarkedCount === 0;
// // // // // //     };

// // // // // //     // ─── FINAL SUBMISSIONS ──────────────────────────────────────────────────
// // // // // //     const triggerSubmitFacilitator = () => {
// // // // // //         if (!validateAllMarked(facBreakdown)) {
// // // // // //             setModalConfig({
// // // // // //                 isOpen: true, type: 'warning',
// // // // // //                 title: 'Incomplete Marking',
// // // // // //                 message: 'You must evaluate every question. Please ensure every question has a Blue Tick, Green Tick or Red Cross selected before submitting.',
// // // // // //                 confirmText: 'Got it'
// // // // // //             });
// // // // // //             return;
// // // // // //         }

// // // // // //         setModalConfig({
// // // // // //             isOpen: true,
// // // // // //             type: 'info',
// // // // // //             title: 'Complete Pre-Marking?',
// // // // // //             message: 'This will finalize your Blue Pen feedback and send the workbook to the Assessor for official grading.',
// // // // // //             confirmText: 'Send to Assessor',
// // // // // //             onConfirm: async () => {
// // // // // //                 setModalConfig(null);
// // // // // //                 setSaving(true);
// // // // // //                 try {
// // // // // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // // //                         status: 'facilitator_reviewed',
// // // // // //                         'grading.facilitatorBreakdown': facBreakdown,
// // // // // //                         'grading.facilitatorOverallFeedback': facOverallFeedback,
// // // // // //                         'grading.facilitatorId': user?.uid,
// // // // // //                         'grading.facilitatorName': user?.fullName,
// // // // // //                         'grading.facilitatorReviewedAt': new Date().toISOString()
// // // // // //                     });
// // // // // //                     toast.success("Script marked and passed to Assessor!");
// // // // // //                     setTimeout(() => navigate(-1), 2000);
// // // // // //                 } catch (error) { toast.error("Failed to save marking."); } finally { setSaving(false); }
// // // // // //             }
// // // // // //         });
// // // // // //     };

// // // // // //     const triggerSubmitGrade = () => {
// // // // // //         if (!validateAllMarked(assBreakdown)) {
// // // // // //             setModalConfig({
// // // // // //                 isOpen: true, type: 'warning',
// // // // // //                 title: 'Incomplete Grading',
// // // // // //                 message: 'You must evaluate every question. Please ensure every question has a Tick or Cross selected before submitting your final grade.',
// // // // // //                 confirmText: 'Got it'
// // // // // //             });
// // // // // //             return;
// // // // // //         }

// // // // // //         if (!competency) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a final competency (C or NYC) before submitting.', confirmText: 'Got it' });

// // // // // //         setModalConfig({
// // // // // //             isOpen: true,
// // // // // //             type: 'warning',
// // // // // //             title: 'Finalise Grade?',
// // // // // //             message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.',
// // // // // //             confirmText: 'Apply Signature & Submit',
// // // // // //             onConfirm: async () => {
// // // // // //                 setModalConfig(null);
// // // // // //                 setSaving(true);
// // // // // //                 try {
// // // // // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // // //                         status: 'graded',
// // // // // //                         marks: assTotals.score,
// // // // // //                         competency: competency,
// // // // // //                         'grading.assessorBreakdown': assBreakdown,
// // // // // //                         'grading.assessorOverallFeedback': assOverallFeedback,
// // // // // //                         'grading.gradedBy': user?.uid,
// // // // // //                         'grading.assessorName': user?.fullName,
// // // // // //                         'grading.assessorRegNumber': user?.assessorRegNumber || 'Pending Reg',
// // // // // //                         'grading.gradedAt': new Date().toISOString()
// // // // // //                     });
// // // // // //                     toast.success("Workbook graded and signed successfully!");
// // // // // //                     setTimeout(() => window.location.reload(), 500);
// // // // // //                 } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
// // // // // //             }
// // // // // //         });
// // // // // //     };

// // // // // //     const triggerSubmitModeration = () => {
// // // // // //         if (!modOutcome) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Outcome', message: 'You must select an endorsement outcome before submitting.', confirmText: 'Got it' });

// // // // // //         setModalConfig({
// // // // // //             isOpen: true,
// // // // // //             type: 'info',
// // // // // //             title: 'Finalise Moderation?',
// // // // // //             message: modOutcome === 'Returned' ? 'This will return the workbook to the Assessor for remediation.' : 'This will apply your Green Pen signature and endorse the final grade.',
// // // // // //             confirmText: 'Confirm Moderation',
// // // // // //             onConfirm: async () => {
// // // // // //                 setModalConfig(null);
// // // // // //                 setSaving(true);
// // // // // //                 try {
// // // // // //                     const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
// // // // // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // // //                         status: newStatus,
// // // // // //                         'moderation.outcome': modOutcome,
// // // // // //                         'moderation.feedback': modFeedback,
// // // // // //                         'moderation.moderatedBy': user?.uid,
// // // // // //                         'moderation.moderatorName': user?.fullName,
// // // // // //                         'moderation.moderatorRegNumber': user?.assessorRegNumber || 'Pending Reg',
// // // // // //                         'moderation.moderatedAt': new Date().toISOString()
// // // // // //                     });
// // // // // //                     toast.success("Moderation saved successfully!");
// // // // // //                     setTimeout(() => window.location.reload(), 500);
// // // // // //                 } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
// // // // // //             }
// // // // // //         });
// // // // // //     };

// // // // // //     if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
// // // // // //     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

// // // // // //     const activeInkColor = showAssessorLayer ? 'red' : 'blue';
// // // // // //     const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');

// // // // // //     return (
// // // // // //         <div className="sr-root animate-fade-in">
// // // // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // // // //             {/* 🚀 MODAL MOUNT 🚀 */}
// // // // // //             {modalConfig && (
// // // // // //                 <StatusModal
// // // // // //                     type={modalConfig.type}
// // // // // //                     title={modalConfig.title}
// // // // // //                     message={modalConfig.message}
// // // // // //                     onConfirm={modalConfig.onConfirm}
// // // // // //                     confirmText={modalConfig.confirmText}
// // // // // //                     cancelText={modalConfig.cancelText}
// // // // // //                     onClose={() => setModalConfig(null)}
// // // // // //                 />
// // // // // //             )}

// // // // // //             {/* ── TOP NAV ── */}
// // // // // //             <div className="ap-player-topbar no-print">
// // // // // //                 <div className="ap-player-topbar__left">
// // // // // //                     <button className="sr-back-btn" onClick={() => navigate(-1)}>
// // // // // //                         <ArrowLeft size={13} /> Portfolio
// // // // // //                     </button>
// // // // // //                     <div className="ap-player-topbar__separator" />
// // // // // //                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
// // // // // //                 </div>

// // // // // //                 <div className="ap-player-topbar__right">
// // // // // //                     <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
// // // // // //                         <Printer size={13} /> Print Audit
// // // // // //                     </button>
// // // // // //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
// // // // // //                         {saving ? (
// // // // // //                             <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</>
// // // // // //                         ) : (
// // // // // //                             <><CheckCircle size={12} /> Auto-saved</>
// // // // // //                         )}
// // // // // //                     </span>
// // // // // //                 </div>
// // // // // //             </div>

// // // // // //             <div className="sr-layout">
// // // // // //                 {/* ── LEFT PANE: WORKBOOK & ANSWERS ── */}
// // // // // //                 <div className="sr-content-pane print-pane">

// // // // // //                     {/* 🚀 OFFICIAL QCTO AUDIT HEADER (Visible on Print) 🚀 */}
// // // // // //                     <div className="sr-print-header">
// // // // // //                         <h2>OFFICIAL ASSESSMENT RECORD</h2>

// // // // // //                         <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', borderBottom: '1px solid black', paddingBottom: '1rem' }}>
// // // // // //                             <div style={{ flex: 1 }}>
// // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Learner Name:</strong> {learner?.fullName}</p>
// // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
// // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
// // // // // //                             </div>
// // // // // //                             <div style={{ flex: 1, textAlign: 'right' }}>
// // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// // // // // //                                     <strong>Score:</strong> <span style={{ color: activeInkColor, fontWeight: 'bold' }}>{activeTotals.score} / {activeTotals.max} ({activeTotals.pct}%)</span>
// // // // // //                                 </p>
// // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// // // // // //                                     <strong>Outcome:</strong> <span style={{ color: printOutcomeColor, fontWeight: 'bold' }}>{submission.competency === 'C' ? 'Competent (C)' : (submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending')}</span>
// // // // // //                                 </p>
// // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Submitted:</strong> {new Date(submission.submittedAt).toLocaleDateString()}</p>
// // // // // //                             </div>
// // // // // //                         </div>

// // // // // //                         {/* SIGNATURE BLOCKS */}
// // // // // //                         <div className="sr-signature-block">
// // // // // //                             <div className="sr-sig-box" style={{ borderColor: 'black' }}>
// // // // // //                                 <span style={{ color: 'black' }}>Learner Declaration</span>
// // // // // //                                 {learnerProfile?.signatureUrl ? (
// // // // // //                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// // // // // //                                 ) : (
// // // // // //                                     <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'black', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // // // //                                 )}
// // // // // //                                 <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
// // // // // //                                 <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
// // // // // //                                 <div className="sr-sig-line" style={{ color: 'black', borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
// // // // // //                             </div>

// // // // // //                             {showAssessorLayer && submission.grading?.gradedAt && (
// // // // // //                                 <div className="sr-sig-box" style={{ borderColor: 'red' }}>
// // // // // //                                     <span style={{ color: 'red' }}>Assessor Sign-off</span>
// // // // // //                                     {assessorProfile?.signatureUrl ? (
// // // // // //                                         <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
// // // // // //                                     ) : (
// // // // // //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'red', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // // // //                                     )}
// // // // // //                                     <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
// // // // // //                                     <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
// // // // // //                                     <em style={{ color: 'red' }}>Signed: {new Date(submission.grading?.gradedAt).toLocaleDateString()}</em>
// // // // // //                                     <div className="sr-sig-line" style={{ color: 'red', borderTopColor: 'red' }}>Digital Signature Confirmed</div>
// // // // // //                                 </div>
// // // // // //                             )}

// // // // // //                             {showModeratorLayer && submission.moderation?.moderatedAt && (
// // // // // //                                 <div className="sr-sig-box" style={{ borderColor: 'green' }}>
// // // // // //                                     <span style={{ color: 'green' }}>Internal Moderation</span>
// // // // // //                                     {moderatorProfile?.signatureUrl ? (
// // // // // //                                         <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
// // // // // //                                     ) : (
// // // // // //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'green', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // // // //                                     )}
// // // // // //                                     <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
// // // // // //                                     <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
// // // // // //                                     <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</em>
// // // // // //                                     <div className="sr-sig-line" style={{ color: 'green', borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
// // // // // //                                 </div>
// // // // // //                             )}
// // // // // //                         </div>
// // // // // //                     </div>

// // // // // //                     {!showAssessorLayer && (
// // // // // //                         <div className="sr-learner-meta no-print">
// // // // // //                             <User size={18} color="black" />
// // // // // //                             <span style={{ color: 'black' }}><strong>{learner?.fullName}</strong> ({learner?.idNumber})</span>
// // // // // //                             <span className="sr-dot" />
// // // // // //                             <Clock size={14} color="black" />
// // // // // //                             <span style={{ color: 'black' }}>Submitted: {new Date(submission.submittedAt).toLocaleString()}</span>
// // // // // //                         </div>
// // // // // //                     )}

// // // // // //                     <div className="sr-blocks">
// // // // // //                         {assessment.blocks?.map((block: any, idx: number) => {
// // // // // //                             if (block.type === 'section') {
// // // // // //                                 return <h2 key={block.id} className="sr-section-title" style={{ color: '#073f4e' }}>{block.title}</h2>;
// // // // // //                             }

// // // // // //                             if (block.type === 'mcq' || block.type === 'text') {
// // // // // //                                 const learnerAns = submission.answers?.[block.id];
// // // // // //                                 const maxM = block.marks || 0;
// // // // // //                                 const isMCQ = block.type === 'mcq';

// // // // // //                                 const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };
// // // // // //                                 const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null };

// // // // // //                                 const activeData = showAssessorLayer ? aData : fData;

// // // // // //                                 return (
// // // // // //                                     <div key={block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
// // // // // //                                         <div className="sr-q-header">
// // // // // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // // //                                                 <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
// // // // // //                                                 <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>
// // // // // //                                             </div>

// // // // // //                                             {/* ACTIVE VISUAL MARKERS */}
// // // // // //                                             {(canGrade || canFacilitatorMark) && (
// // // // // //                                                 <div className="sr-visual-mark">
// // // // // //                                                     <button
// // // // // //                                                         onClick={() => handleVisualMark(block.id, true, maxM)}
// // // // // //                                                         className="sr-mark-btn"
// // // // // //                                                         style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// // // // // //                                                         title="Mark Correct"
// // // // // //                                                     >
// // // // // //                                                         <Check size={20} />
// // // // // //                                                     </button>
// // // // // //                                                     <button
// // // // // //                                                         onClick={() => handleVisualMark(block.id, false, maxM)}
// // // // // //                                                         className="sr-mark-btn"
// // // // // //                                                         style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}}
// // // // // //                                                         title="Mark Incorrect"
// // // // // //                                                     >
// // // // // //                                                         <X size={20} />
// // // // // //                                                     </button>
// // // // // //                                                 </div>
// // // // // //                                             )}
// // // // // //                                         </div>

// // // // // //                                         <div className="sr-q-body">
// // // // // //                                             {/* LEARNER ANSWER */}
// // // // // //                                             <div className="sr-answer-box">
// // // // // //                                                 <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
// // // // // //                                                 {isMCQ ? (
// // // // // //                                                     <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
// // // // // //                                                         <span style={{ color: 'black' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
// // // // // //                                                         {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
// // // // // //                                                     </div>
// // // // // //                                                 ) : (
// // // // // //                                                     <div className="sr-text-ans">
// // // // // //                                                         {learnerAns ? (
// // // // // //                                                             <div className="quill-read-only-content" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: learnerAns }} />
// // // // // //                                                         ) : (
// // // // // //                                                             <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>
// // // // // //                                                         )}
// // // // // //                                                     </div>
// // // // // //                                                 )}

// // // // // //                                                 {isMCQ && (
// // // // // //                                                     <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>
// // // // // //                                                         Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong>
// // // // // //                                                     </div>
// // // // // //                                                 )}
// // // // // //                                             </div>

// // // // // //                                             {/* 🚀 READ-ONLY FACILITATOR LAYER (Seen by Assessor & Moderator) */}
// // // // // //                                             {showAssessorLayer && (
// // // // // //                                                 <div className="sr-read-only-feedback blue-pen-locked">
// // // // // //                                                     <div className="label"><Info size={13} /> Facilitator Pre-Mark</div>
// // // // // //                                                     <div className="content">
// // // // // //                                                         <span className="score">[{fData.score ?? 0}/{maxM}]</span> {fData.feedback || <em>No specific coaching provided.</em>}
// // // // // //                                                     </div>
// // // // // //                                                 </div>
// // // // // //                                             )}

// // // // // //                                             {/* 🚀 READ-ONLY ASSESSOR LAYER (Seen by Moderator) */}
// // // // // //                                             {showModeratorLayer && (
// // // // // //                                                 <div className="sr-read-only-feedback red-pen-locked">
// // // // // //                                                     <div className="label"><Award size={13} /> Assessor Grade</div>
// // // // // //                                                     <div className="content">
// // // // // //                                                         <span className="score">[{aData.score ?? 0}/{maxM}]</span> {aData.feedback || <em>No specific feedback provided.</em>}
// // // // // //                                                     </div>
// // // // // //                                                 </div>
// // // // // //                                             )}

// // // // // //                                             {/* ACTIVE GRADING INPUTS (Your Turn OR Read-Only Display of Final Assessor Grade) */}
// // // // // //                                             <div className={`sr-grade-box ${!(canGrade || canFacilitatorMark) ? 'disabled' : ''}`}>
// // // // // //                                                 <div className="sr-score-input-wrap">
// // // // // //                                                     <label style={{ color: activeInkColor }}>Marks Awarded:</label>
// // // // // //                                                     <input
// // // // // //                                                         type="number"
// // // // // //                                                         className="sr-score-input"
// // // // // //                                                         style={{ color: activeInkColor }}
// // // // // //                                                         value={activeData.score ?? 0}
// // // // // //                                                         disabled={!(canGrade || canFacilitatorMark)}
// // // // // //                                                         onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)}
// // // // // //                                                     />
// // // // // //                                                     <span style={{ color: activeInkColor }}>/ {maxM}</span>
// // // // // //                                                 </div>

// // // // // //                                                 <div className="sr-feedback-wrap">
// // // // // //                                                     <Edit3 size={14} color={activeInkColor} />
// // // // // //                                                     <input
// // // // // //                                                         type="text"
// // // // // //                                                         className="sr-feedback-input"
// // // // // //                                                         style={{ color: activeInkColor, fontStyle: 'italic', fontWeight: 500 }}
// // // // // //                                                         placeholder={canGrade ? "Assessor Red Pen feedback..." : canFacilitatorMark ? "Facilitator Blue Pen feedback..." : "No specific feedback provided."}
// // // // // //                                                         value={activeData.feedback || ''}
// // // // // //                                                         disabled={!(canGrade || canFacilitatorMark)}
// // // // // //                                                         onChange={e => handleFeedbackChange(block.id, e.target.value)}
// // // // // //                                                     />
// // // // // //                                                 </div>
// // // // // //                                             </div>

// // // // // //                                         </div>
// // // // // //                                     </div>
// // // // // //                                 );
// // // // // //                             }
// // // // // //                             return null;
// // // // // //                         })}
// // // // // //                     </div>
// // // // // //                 </div>

// // // // // //                 {/* ── RIGHT PANE: GRADING & MODERATION (No print) ── */}
// // // // // //                 <aside className="sr-sidebar no-print">

// // // // // //                     {/* FACILITATOR PRE-MARKING PANEL */}
// // // // // //                     {(canFacilitatorMark || showAssessorLayer) && (
// // // // // //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
// // // // // //                             <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>

// // // // // //                             {canFacilitatorMark && (
// // // // // //                                 <div className="sr-role-guide blue">
// // // // // //                                     <Info size={16} />
// // // // // //                                     <div>
// // // // // //                                         <strong>Formative Feedback & Coaching</strong><br />
// // // // // //                                         Use your Blue Pen to provide developmental feedback. Your comments prove to the QCTO auditor that Learner Support took place before official grading.
// // // // // //                                     </div>
// // // // // //                                 </div>
// // // // // //                             )}

// // // // // //                             <div className="sr-score-display">
// // // // // //                                 <div className="sr-score-circle" style={{ borderColor: 'blue' }}>
// // // // // //                                     <span className="sr-score-val" style={{ color: 'blue' }}>{facTotals.score}</span>
// // // // // //                                     <span className="sr-score-max" style={{ color: 'blue' }}>/ {facTotals.max}</span>
// // // // // //                                 </div>
// // // // // //                                 <div className="sr-score-percent" style={{ color: 'blue' }}>{facTotals.pct}%</div>
// // // // // //                             </div>

// // // // // //                             {/* 🚀 Facilitator Overall Feedback */}
// // // // // //                             <div className="sr-overall-feedback">
// // // // // //                                 <label className="sr-sidebar-label" style={{ color: 'blue' }}>Facilitator Remarks</label>
// // // // // //                                 {canFacilitatorMark ? (
// // // // // //                                     <textarea
// // // // // //                                         className="sr-textarea"
// // // // // //                                         rows={3}
// // // // // //                                         style={{ color: 'blue', fontStyle: 'italic', borderColor: 'blue' }}
// // // // // //                                         placeholder="Add overall coaching comments..."
// // // // // //                                         value={facOverallFeedback}
// // // // // //                                         onChange={e => handleFacOverallFeedbackChange(e.target.value)}
// // // // // //                                     />
// // // // // //                                 ) : (
// // // // // //                                     <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', color: '#0369a1', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #0284c7' }}>
// // // // // //                                         {facOverallFeedback || "No overall remarks provided."}
// // // // // //                                     </div>
// // // // // //                                 )}
// // // // // //                             </div>

// // // // // //                             {canFacilitatorMark ? (
// // // // // //                                 <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>
// // // // // //                                     {saving ? 'Processing...' : 'Send to Assessor'}
// // // // // //                                 </button>
// // // // // //                             ) : (
// // // // // //                                 <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// // // // // //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Completed by {submission.grading?.facilitatorName || 'Facilitator'}
// // // // // //                                 </div>
// // // // // //                             )}
// // // // // //                         </div>
// // // // // //                     )}

// // // // // //                     {/* ASSESSOR PANEL */}
// // // // // //                     {showAssessorLayer && (
// // // // // //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
// // // // // //                             <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>

// // // // // //                             {canGrade && (
// // // // // //                                 <div className="sr-role-guide red">
// // // // // //                                     <Info size={16} />
// // // // // //                                     <div>
// // // // // //                                         <strong>Summative Judgment & Remediation</strong><br />
// // // // // //                                         Use your Red Pen to declare Competency. You <i>must</i> provide written feedback to justify your marks. If NYC, your comments legally guide the learner's remediation.
// // // // // //                                     </div>
// // // // // //                                 </div>
// // // // // //                             )}

// // // // // //                             <div className="sr-score-display">
// // // // // //                                 <div className="sr-score-circle" style={{ borderColor: 'red', width: '80px', height: '80px' }}>
// // // // // //                                     <span className="sr-score-val" style={{ color: 'red', fontSize: '1.5rem' }}>{assTotals.score}</span>
// // // // // //                                 </div>
// // // // // //                                 <div className="sr-score-percent" style={{ color: 'red' }}>{assTotals.pct}%</div>
// // // // // //                             </div>

// // // // // //                             <div className="sr-competency-section" style={{ marginTop: '1rem' }}>
// // // // // //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Final Competency</label>
// // // // // //                                 <div className="sr-comp-toggles">
// // // // // //                                     <button
// // // // // //                                         className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`}
// // // // // //                                         onClick={() => handleCompetencySelect('C')}
// // // // // //                                         disabled={!canGrade}
// // // // // //                                     >
// // // // // //                                         <Award size={16} /> Competent (C)
// // // // // //                                     </button>
// // // // // //                                     <button
// // // // // //                                         className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`}
// // // // // //                                         onClick={() => handleCompetencySelect('NYC')}
// // // // // //                                         disabled={!canGrade}
// // // // // //                                     >
// // // // // //                                         <AlertCircle size={16} /> Not Yet Competent
// // // // // //                                     </button>
// // // // // //                                 </div>
// // // // // //                             </div>

// // // // // //                             {/* 🚀 Assessor Overall Feedback */}
// // // // // //                             <div className="sr-overall-feedback">
// // // // // //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
// // // // // //                                 {canGrade ? (
// // // // // //                                     <textarea
// // // // // //                                         className="sr-textarea"
// // // // // //                                         rows={3}
// // // // // //                                         style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: 'red' }}
// // // // // //                                         placeholder="Provide holistic assessment feedback..."
// // // // // //                                         value={assOverallFeedback}
// // // // // //                                         onChange={e => handleAssOverallFeedbackChange(e.target.value)}
// // // // // //                                     />
// // // // // //                                 ) : (
// // // // // //                                     <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', color: '#b91c1c', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #dc2626' }}>
// // // // // //                                         {assOverallFeedback || "No overall remarks provided."}
// // // // // //                                     </div>
// // // // // //                                 )}
// // // // // //                             </div>

// // // // // //                             {(!canGrade && submission.grading?.gradedAt) && (
// // // // // //                                 <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
// // // // // //                                     <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: 'red', textTransform: 'uppercase' }}>Assessor Signature</p>
// // // // // //                                     {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div style={{ height: '40px', fontStyle: 'italic', fontSize: '0.8rem', color: 'red' }}>No Canvas Signature</div>}
// // // // // //                                     <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: 'red' }}>{submission.grading?.assessorName}</p>
// // // // // //                                     <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}><Clock size={10} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// // // // // //                                 </div>
// // // // // //                             )}

// // // // // //                             {canGrade && (
// // // // // //                                 <div className="sr-action-area">
// // // // // //                                     <button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving}>
// // // // // //                                         {saving ? 'Processing...' : 'Apply Signature & Finalise'}
// // // // // //                                     </button>
// // // // // //                                 </div>
// // // // // //                             )}
// // // // // //                         </div>
// // // // // //                     )}

// // // // // //                     {/* MODERATOR PANEL */}
// // // // // //                     {showModeratorLayer && (
// // // // // //                         <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
// // // // // //                             <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>

// // // // // //                             {canModerate && (
// // // // // //                                 <div className="sr-role-guide green">
// // // // // //                                     <Info size={16} />
// // // // // //                                     <div>
// // // // // //                                         <strong>Quality Assurance & Endorsement</strong><br />
// // // // // //                                         Your Green Pen evaluates the Assessor, not the learner. Use comments to instruct the Assessor on corrections before endorsing this script.
// // // // // //                                     </div>
// // // // // //                                 </div>
// // // // // //                             )}

// // // // // //                             <div className="sr-competency-section">
// // // // // //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderation Outcome</label>
// // // // // //                                 <div className="sr-comp-toggles">
// // // // // //                                     <button
// // // // // //                                         className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`}
// // // // // //                                         onClick={() => handleModOutcomeSelect('Endorsed')}
// // // // // //                                         disabled={!canModerate}
// // // // // //                                     >
// // // // // //                                         <ShieldCheck size={16} /> Endorse Grade
// // // // // //                                     </button>
// // // // // //                                     <button
// // // // // //                                         className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`}
// // // // // //                                         onClick={() => handleModOutcomeSelect('Returned')}
// // // // // //                                         disabled={!canModerate}
// // // // // //                                     >
// // // // // //                                         <AlertCircle size={16} /> Return to Assessor
// // // // // //                                     </button>
// // // // // //                                 </div>
// // // // // //                             </div>

// // // // // //                             <div className="sr-overall-feedback">
// // // // // //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderator Feedback</label>
// // // // // //                                 <textarea
// // // // // //                                     className="sr-textarea"
// // // // // //                                     rows={3}
// // // // // //                                     style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }}
// // // // // //                                     placeholder={canModerate ? "Notes for the assessor or internal QA..." : "No moderation feedback."}
// // // // // //                                     value={modFeedback}
// // // // // //                                     disabled={!canModerate}
// // // // // //                                     onChange={e => handleModFeedbackChange(e.target.value)}
// // // // // //                                 />
// // // // // //                             </div>

// // // // // //                             {(!canModerate && submission.moderation?.moderatedAt) && (
// // // // // //                                 <div className="sr-audit-stamp" style={{ color: 'green', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// // // // // //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Moderated by {submission.moderation?.moderatorName}
// // // // // //                                 </div>
// // // // // //                             )}

// // // // // //                             {canModerate && (
// // // // // //                                 <div className="sr-action-area">
// // // // // //                                     <button
// // // // // //                                         className="sr-submit-btn"
// // // // // //                                         style={{ background: 'green' }}
// // // // // //                                         onClick={triggerSubmitModeration}
// // // // // //                                         disabled={saving}
// // // // // //                                     >
// // // // // //                                         {saving ? 'Processing...' : 'Finalise QA & Endorse'}
// // // // // //                                     </button>
// // // // // //                                 </div>
// // // // // //                             )}
// // // // // //                         </div>
// // // // // //                     )}

// // // // // //                     {/* 🚀 OFFICIAL AUDIT TRAIL 🚀 */}
// // // // // //                     <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
// // // // // //                         <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}>
// // // // // //                             <ShieldCheck size={18} color="#073f4e" /> Official Audit Trail
// // // // // //                         </h3>

// // // // // //                         {
// // // // // //                             (submission.status === 'not_started') && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>
// // // // // //                         }

// // // // // //                         {/* Learner Record */}
// // // // // //                         {submission.status !== 'not_started' && (
// // // // // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// // // // // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
// // // // // //                                 {learnerProfile?.signatureUrl ? (
// // // // // //                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// // // // // //                                 ) : (
// // // // // //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // // // // //                                 )}
// // // // // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
// // // // // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</p>
// // // // // //                             </div>
// // // // // //                         )}

// // // // // //                         {/* Assessor Record */}
// // // // // //                         {submission.grading?.gradedAt && (
// // // // // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// // // // // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
// // // // // //                                 {assessorProfile?.signatureUrl ? (
// // // // // //                                     <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// // // // // //                                 ) : (
// // // // // //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // // // // //                                 )}
// // // // // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName}</p>
// // // // // //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
// // // // // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// // // // // //                             </div>
// // // // // //                         )}

// // // // // //                         {/* Moderator Record */}
// // // // // //                         {submission.moderation?.moderatedAt && (
// // // // // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1rem' }}>
// // // // // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation</p>
// // // // // //                                 {moderatorProfile?.signatureUrl ? (
// // // // // //                                     <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
// // // // // //                                 ) : (
// // // // // //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // // // // //                                 )}
// // // // // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{submission.moderation?.moderatorName}</p>
// // // // // //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Outcome: {submission.moderation?.outcome}</p>
// // // // // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</p>
// // // // // //                             </div>
// // // // // //                         )}
// // // // // //                     </div>
// // // // // //                 </aside>
// // // // // //             </div>
// // // // // //         </div>
// // // // // //     );
// // // // // // };

// // // // // // const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
// // // // // //     const filterMap: any = {
// // // // // //         black: 'brightness(0)',
// // // // // //         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
// // // // // //         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
// // // // // //         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
// // // // // //     };

// // // // // //     return (
// // // // // //         <img
// // // // // //             src={imageUrl}
// // // // // //             alt="Signature"
// // // // // //             style={{
// // // // // //                 height: '60px',
// // // // // //                 width: 'auto',
// // // // // //                 maxWidth: '100%',
// // // // // //                 objectFit: 'contain',
// // // // // //                 marginBottom: '10px',
// // // // // //                 filter: filterMap[color] || 'none'
// // // // // //             }}
// // // // // //         />
// // // // // //     );
// // // // // // };


// // // // // import React, { useState, useEffect, useRef } from 'react';
// // // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // // import { doc, getDoc, updateDoc } from 'firebase/firestore';
// // // // // import { db } from '../../../lib/firebase';
// // // // // import { useStore } from '../../../store/useStore';
// // // // // import {
// // // // //     ArrowLeft, CheckCircle, AlertCircle, Save,
// // // // //     User, GraduationCap, Clock, MessageSquare, Award,
// // // // //     ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2, XCircle, AlertTriangle
// // // // // } from 'lucide-react';
// // // // // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // // // // import './SubmissionReview.css';

// // // // // interface GradeData {
// // // // //     score: number;
// // // // //     feedback: string;
// // // // //     isCorrect?: boolean | null;
// // // // // }

// // // // // export type StatusType = 'info' | 'success' | 'error' | 'warning';

// // // // // // ─── STATUS MODAL COMPONENT ─────────────────────────────────────────────
// // // // // const StatusModal: React.FC<{
// // // // //     type: StatusType;
// // // // //     title: string;
// // // // //     message: string;
// // // // //     onClose: () => void;
// // // // //     onConfirm?: () => void;
// // // // //     confirmText?: string;
// // // // //     cancelText?: string;
// // // // // }> = ({ type, title, message, onClose, onConfirm, confirmText = "Okay", cancelText = "Cancel" }) => {

// // // // //     const styles = {
// // // // //         info: { color: '#3b82f6', Icon: Info },
// // // // //         success: { color: '#22c55e', Icon: CheckCircle },
// // // // //         error: { color: '#ef4444', Icon: XCircle },
// // // // //         warning: { color: '#f59e0b', Icon: AlertTriangle }
// // // // //     };

// // // // //     const { color, Icon } = styles[type];

// // // // //     return (
// // // // //         <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(3px)' }}>
// // // // //             <div style={{ background: 'white', maxWidth: '400px', width: '90%', textAlign: 'center', padding: '2rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
// // // // //                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
// // // // //                     <Icon size={48} color={color} />
// // // // //                 </div>
// // // // //                 <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{title}</h2>
// // // // //                 <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem', fontSize: '0.9rem' }}>{message}</p>
// // // // //                 <div style={{ display: 'flex', gap: '1rem' }}>
// // // // //                     {onConfirm && (
// // // // //                         <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// // // // //                             {cancelText}
// // // // //                         </button>
// // // // //                     )}
// // // // //                     <button onClick={onConfirm || onClose} style={{ flex: 1, padding: '0.75rem', background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
// // // // //                         {confirmText}
// // // // //                     </button>
// // // // //                 </div>
// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };

// // // // // export const SubmissionReview: React.FC = () => {
// // // // //     const { submissionId } = useParams<{ submissionId: string }>();
// // // // //     const navigate = useNavigate();
// // // // //     const { user } = useStore();
// // // // //     const toast = useToast();

// // // // //     const [loading, setLoading] = useState(true);
// // // // //     const [saving, setSaving] = useState(false);

// // // // //     const [submission, setSubmission] = useState<any>(null);
// // // // //     const [assessment, setAssessment] = useState<any>(null);
// // // // //     const [learner, setLearner] = useState<any>(null);

// // // // //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// // // // //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// // // // //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);

// // // // //     const [grades, setGrades] = useState<Record<string, GradeData>>({});
// // // // //     const [overallFeedback, setOverallFeedback] = useState('');
// // // // //     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

// // // // //     const [modFeedback, setModFeedback] = useState('');
// // // // //     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

// // // // //     // Modal State
// // // // //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm?: () => void; confirmText?: string } | null>(null);

// // // // //     // 🚀 AUTO-SAVE REF
// // // // //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// // // // //     // ─── RBAC: PERMISSION FLAGS ────────────────────────────────────────────────
// // // // //     const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
// // // // //     const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
// // // // //     const isModerator = user?.role === 'moderator' || user?.role === 'admin';

// // // // //     const canFacilitatorMark = isFacilitator && submission?.status === 'submitted';
// // // // //     const canGrade = isAssessor && (submission?.status === 'facilitator_reviewed' || submission?.status === 'returned');
// // // // //     const canModerate = isModerator && submission?.status === 'graded';

// // // // //     useEffect(() => {
// // // // //         const loadReviewData = async () => {
// // // // //             if (!submissionId) return;
// // // // //             try {
// // // // //                 const subRef = doc(db, 'learner_submissions', submissionId);
// // // // //                 const subSnap = await getDoc(subRef);
// // // // //                 if (!subSnap.exists()) throw new Error("Submission not found");
// // // // //                 const subData = subSnap.data();
// // // // //                 setSubmission({ id: subSnap.id, ...subData });

// // // // //                 const assRef = doc(db, 'assessments', subData.assessmentId);
// // // // //                 const assSnap = await getDoc(assRef);
// // // // //                 if (!assSnap.exists()) throw new Error("Assessment template missing");
// // // // //                 const assData = assSnap.data();
// // // // //                 setAssessment(assData);

// // // // //                 const learnerRef = doc(db, 'learners', subData.learnerId);
// // // // //                 const learnerSnap = await getDoc(learnerRef);
// // // // //                 let learnerAuthUid = null;
// // // // //                 if (learnerSnap.exists()) {
// // // // //                     const lData = learnerSnap.data();
// // // // //                     setLearner(lData);
// // // // //                     learnerAuthUid = lData.authUid;
// // // // //                 }

// // // // //                 const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || learnerAuthUid || subData.learnerId;
// // // // //                 if (targetLearnerUid) {
// // // // //                     const lProfSnap = await getDoc(doc(db, 'users', targetLearnerUid));
// // // // //                     if (lProfSnap.exists()) setLearnerProfile(lProfSnap.data());
// // // // //                 }

// // // // //                 if (subData.grading?.gradedBy) {
// // // // //                     const assProfRef = doc(db, 'users', subData.grading.gradedBy);
// // // // //                     const assProfSnap = await getDoc(assProfRef);
// // // // //                     if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
// // // // //                 }

// // // // //                 if (subData.moderation?.moderatedBy) {
// // // // //                     const modProfRef = doc(db, 'users', subData.moderation.moderatedBy);
// // // // //                     const modProfSnap = await getDoc(modProfRef);
// // // // //                     if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
// // // // //                 }

// // // // //                 const existingBreakdown = subData.grading?.breakdown;

// // // // //                 if (existingBreakdown && Object.keys(existingBreakdown).length > 0) {
// // // // //                     setGrades(existingBreakdown);
// // // // //                     setOverallFeedback(subData.grading?.overallFeedback || '');
// // // // //                     setCompetency(subData.competency || null);
// // // // //                     setModFeedback(subData.moderation?.feedback || '');
// // // // //                     setModOutcome(subData.moderation?.outcome || null);
// // // // //                 } else {
// // // // //                     const initialGrades: Record<string, GradeData> = {};
// // // // //                     assData.blocks?.forEach((block: any) => {
// // // // //                         if (block.type === 'mcq') {
// // // // //                             const learnerAns = subData.answers?.[block.id];
// // // // //                             const isCorrect = learnerAns === block.correctOption;
// // // // //                             initialGrades[block.id] = {
// // // // //                                 score: isCorrect ? (block.marks || 0) : 0,
// // // // //                                 feedback: isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect',
// // // // //                                 isCorrect: isCorrect
// // // // //                             };
// // // // //                         } else if (block.type === 'text') {
// // // // //                             initialGrades[block.id] = { score: 0, feedback: '', isCorrect: null };
// // // // //                         }
// // // // //                     });
// // // // //                     setGrades(initialGrades);
// // // // //                 }
// // // // //             } catch (err: any) {
// // // // //                 toast.error(err.message || "Failed to load data.");
// // // // //             } finally {
// // // // //                 setLoading(false);
// // // // //             }
// // // // //         };
// // // // //         loadReviewData();
// // // // //     }, [submissionId]);

// // // // //     // ─── AUTO-SAVE ENGINE ──────────────────────────────────────────────────
// // // // //     const triggerAutoSave = (updatedGrades: any, updatedOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
// // // // //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

// // // // //         setSaving(true);
// // // // //         saveTimeoutRef.current = setTimeout(async () => {
// // // // //             if (!submission?.id) return;
// // // // //             try {
// // // // //                 const updatePayload: any = {
// // // // //                     'grading.breakdown': updatedGrades,
// // // // //                     'grading.overallFeedback': updatedOverall,
// // // // //                     'moderation.feedback': updatedModFeedback,
// // // // //                     lastStaffEditAt: new Date().toISOString()
// // // // //                 };

// // // // //                 if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
// // // // //                 if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

// // // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
// // // // //             } catch (error) {
// // // // //                 console.error("Auto-save failed:", error);
// // // // //             } finally {
// // // // //                 setSaving(false);
// // // // //             }
// // // // //         }, 1500);
// // // // //     };

// // // // //     // ─── VISUAL MARKING HANDLER ──────────────────────────────────────────────
// // // // //     const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
// // // // //         if (!canGrade && !canFacilitatorMark) return;
// // // // //         const newGrades = { ...grades, [blockId]: { ...grades[blockId], isCorrect: isCorrect, score: isCorrect ? maxMarks : 0 } };
// // // // //         setGrades(newGrades);
// // // // //         triggerAutoSave(newGrades, overallFeedback, modFeedback, competency, modOutcome);
// // // // //     };

// // // // //     const handleScoreChange = (blockId: string, score: number, max: number) => {
// // // // //         if (!canGrade && !canFacilitatorMark) return;
// // // // //         const validScore = Math.min(Math.max(0, score), max);
// // // // //         const newGrades = { ...grades, [blockId]: { ...grades[blockId], score: validScore } };
// // // // //         setGrades(newGrades);
// // // // //         triggerAutoSave(newGrades, overallFeedback, modFeedback, competency, modOutcome);
// // // // //     };

// // // // //     const handleFeedbackChange = (blockId: string, feedback: string) => {
// // // // //         if (!canGrade && !canFacilitatorMark) return;
// // // // //         const newGrades = { ...grades, [blockId]: { ...grades[blockId], feedback } };
// // // // //         setGrades(newGrades);
// // // // //         triggerAutoSave(newGrades, overallFeedback, modFeedback, competency, modOutcome);
// // // // //     };

// // // // //     const handleOverallFeedbackChange = (val: string) => {
// // // // //         if (!canGrade) return;
// // // // //         setOverallFeedback(val);
// // // // //         triggerAutoSave(grades, val, modFeedback, competency, modOutcome);
// // // // //     };

// // // // //     const handleModFeedbackChange = (val: string) => {
// // // // //         if (!canModerate) return;
// // // // //         setModFeedback(val);
// // // // //         triggerAutoSave(grades, overallFeedback, val, competency, modOutcome);
// // // // //     };

// // // // //     const handleCompetencySelect = (val: 'C' | 'NYC') => {
// // // // //         if (!canGrade) return;
// // // // //         setCompetency(val);
// // // // //         triggerAutoSave(grades, overallFeedback, modFeedback, val, modOutcome);
// // // // //     };

// // // // //     const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
// // // // //         if (!canModerate) return;
// // // // //         setModOutcome(val);
// // // // //         triggerAutoSave(grades, overallFeedback, modFeedback, competency, val);
// // // // //     };

// // // // //     const calculateTotals = () => {
// // // // //         const totalScore = Object.values(grades).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
// // // // //         const maxScore = assessment?.totalMarks || 0;
// // // // //         const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
// // // // //         return { totalScore, maxScore, percentage };
// // // // //     };

// // // // //     // ─── FACILITATOR REVIEW ──────────────────────────────────────────────────
// // // // //     const triggerSubmitFacilitator = () => {
// // // // //         setModalConfig({
// // // // //             isOpen: true,
// // // // //             type: 'info',
// // // // //             title: 'Complete Pre-Marking?',
// // // // //             message: 'This will finalize your Blue Pen feedback and send the workbook to the Assessor for official grading.',
// // // // //             confirmText: 'Send to Assessor',
// // // // //             onConfirm: async () => {
// // // // //                 setModalConfig(null);
// // // // //                 setSaving(true);
// // // // //                 try {
// // // // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // //                         status: 'facilitator_reviewed',
// // // // //                         grading: { breakdown: grades, overallFeedback, facilitatorId: user?.uid, facilitatorName: user?.fullName, facilitatorReviewedAt: new Date().toISOString() }
// // // // //                     });
// // // // //                     toast.success("Script marked and passed to Assessor!");
// // // // //                     setTimeout(() => navigate(-1), 2000);
// // // // //                 } catch (error) { toast.error("Failed to save marking."); } finally { setSaving(false); }
// // // // //             }
// // // // //         });
// // // // //     };

// // // // //     // ─── ASSESSOR SUBMIT ─────────────────────────────────────────────────────
// // // // //     const triggerSubmitGrade = () => {
// // // // //         if (!competency) {
// // // // //             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a final competency (C or NYC) before submitting.', confirmText: 'Got it' });
// // // // //             return;
// // // // //         }
// // // // //         setModalConfig({
// // // // //             isOpen: true,
// // // // //             type: 'warning',
// // // // //             title: 'Finalise Grade?',
// // // // //             message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.',
// // // // //             confirmText: 'Apply Signature & Submit',
// // // // //             onConfirm: async () => {
// // // // //                 setModalConfig(null);
// // // // //                 setSaving(true);
// // // // //                 const { totalScore } = calculateTotals();
// // // // //                 try {
// // // // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // //                         status: 'graded', marks: totalScore, competency,
// // // // //                         grading: { ...submission.grading, breakdown: grades, overallFeedback, gradedBy: user?.uid, assessorName: user?.fullName, assessorRegNumber: user?.assessorRegNumber || 'Pending Reg', gradedAt: new Date().toISOString() }
// // // // //                     });
// // // // //                     toast.success("Workbook graded and signed successfully!");
// // // // //                     setTimeout(() => window.scrollTo(0, 0), 500);
// // // // //                     const assProfSnap = await getDoc(doc(db, 'users', user!.uid));
// // // // //                     if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
// // // // //                     setSubmission((prev: any) => ({ ...prev, status: 'graded', competency, marks: totalScore, grading: { ...prev.grading, gradedAt: new Date().toISOString(), assessorName: user?.fullName } }));
// // // // //                 } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
// // // // //             }
// // // // //         });
// // // // //     };

// // // // //     // ─── MODERATOR SUBMIT ────────────────────────────────────────────────────
// // // // //     const triggerSubmitModeration = () => {
// // // // //         if (!modOutcome) {
// // // // //             setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Outcome', message: 'You must select an endorsement outcome before submitting.', confirmText: 'Got it' });
// // // // //             return;
// // // // //         }
// // // // //         setModalConfig({
// // // // //             isOpen: true,
// // // // //             type: 'info',
// // // // //             title: 'Finalise Moderation?',
// // // // //             message: modOutcome === 'Returned' ? 'This will return the workbook to the Assessor for remediation.' : 'This will apply your Green Pen signature and endorse the final grade.',
// // // // //             confirmText: 'Confirm Moderation',
// // // // //             onConfirm: async () => {
// // // // //                 setModalConfig(null);
// // // // //                 setSaving(true);
// // // // //                 try {
// // // // //                     const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
// // // // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // //                         status: newStatus,
// // // // //                         moderation: { outcome: modOutcome, feedback: modFeedback, moderatedBy: user?.uid, moderatorName: user?.fullName, moderatorRegNumber: user?.assessorRegNumber || 'Pending Reg', moderatedAt: new Date().toISOString() }
// // // // //                     });
// // // // //                     toast.success("Moderation saved successfully!");
// // // // //                     setTimeout(() => window.scrollTo(0, 0), 500);
// // // // //                     const modProfSnap = await getDoc(doc(db, 'users', user!.uid));
// // // // //                     if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
// // // // //                     setSubmission((prev: any) => ({ ...prev, status: newStatus }));
// // // // //                 } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
// // // // //             }
// // // // //         });
// // // // //     };

// // // // //     if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
// // // // //     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

// // // // //     const { totalScore, maxScore, percentage } = calculateTotals();
// // // // //     const hasBeenGraded = ['graded', 'moderated'].includes(submission.status);
// // // // //     const hasBeenReviewed = ['facilitator_reviewed', 'graded', 'moderated'].includes(submission.status);

// // // // //     const isAssessorActive = canGrade || hasBeenGraded;
// // // // //     const isFacilitatorActive = canFacilitatorMark || (submission.status === 'facilitator_reviewed' && !canGrade);
// // // // //     const printScoreColor = isAssessorActive ? 'red' : (isFacilitatorActive ? 'blue' : 'black');
// // // // //     const printOutcomeColor = submission.competency ? 'red' : 'black';

// // // // //     return (
// // // // //         <div className="sr-root animate-fade-in">
// // // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // // //             {/* 🚀 MODAL MOUNT 🚀 */}
// // // // //             {modalConfig && (
// // // // //                 <StatusModal
// // // // //                     type={modalConfig.type}
// // // // //                     title={modalConfig.title}
// // // // //                     message={modalConfig.message}
// // // // //                     onConfirm={modalConfig.onConfirm}
// // // // //                     confirmText={modalConfig.confirmText}
// // // // //                     onClose={() => setModalConfig(null)}
// // // // //                 />
// // // // //             )}

// // // // //             {/* ── TOP NAV ── */}
// // // // //             <div className="ap-player-topbar no-print">
// // // // //                 <div className="ap-player-topbar__left">
// // // // //                     <button className="sr-back-btn" onClick={() => navigate(-1)}>
// // // // //                         <ArrowLeft size={13} /> Portfolio
// // // // //                     </button>
// // // // //                     <div className="ap-player-topbar__separator" />
// // // // //                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
// // // // //                 </div>

// // // // //                 <div className="ap-player-topbar__right">
// // // // //                     <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
// // // // //                         <Printer size={13} /> Print Audit
// // // // //                     </button>
// // // // //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
// // // // //                         {saving ? <><Loader2 className="ap-spinner-icon" size={12} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><CheckCircle size={12} /> Auto-saved</>}
// // // // //                     </span>
// // // // //                 </div>
// // // // //             </div>

// // // // //             <div className="sr-layout">
// // // // //                 {/* ── LEFT PANE: WORKBOOK & ANSWERS ── */}
// // // // //                 <div className="sr-content-pane print-pane">
// // // // //                     {/* 🚀 OFFICIAL QCTO AUDIT HEADER (Visible on Print) 🚀 */}
// // // // //                     <div className="sr-print-header">
// // // // //                         <h2>OFFICIAL ASSESSMENT RECORD</h2>

// // // // //                         <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', borderBottom: '1px solid black', paddingBottom: '1rem' }}>
// // // // //                             <div style={{ flex: 1 }}>
// // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Learner Name:</strong> {learner?.fullName}</p>
// // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
// // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
// // // // //                             </div>
// // // // //                             <div style={{ flex: 1, textAlign: 'right' }}>
// // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// // // // //                                     <strong>Score:</strong> <span style={{ color: printScoreColor, fontWeight: 'bold' }}>{totalScore} / {maxScore} ({percentage}%)</span>
// // // // //                                 </p>
// // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// // // // //                                     <strong>Outcome:</strong> <span style={{ color: printOutcomeColor, fontWeight: 'bold' }}>{submission.competency === 'C' ? 'Competent (C)' : (submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending')}</span>
// // // // //                                 </p>
// // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Submitted:</strong> {new Date(submission.submittedAt).toLocaleDateString()}</p>
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         {/* SIGNATURE BLOCKS */}
// // // // //                         <div className="sr-signature-block">
// // // // //                             <div className="sr-sig-box" style={{ borderColor: 'black' }}>
// // // // //                                 <span style={{ color: 'black' }}>Learner Declaration</span>
// // // // //                                 {learnerProfile?.signatureUrl ? (
// // // // //                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// // // // //                                 ) : (
// // // // //                                     <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'black', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // // //                                 )}
// // // // //                                 <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
// // // // //                                 <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
// // // // //                                 <div className="sr-sig-line" style={{ color: 'black', borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
// // // // //                             </div>

// // // // //                             {hasBeenGraded && (
// // // // //                                 <div className="sr-sig-box" style={{ borderColor: 'red' }}>
// // // // //                                     <span style={{ color: 'red' }}>Assessor Sign-off</span>
// // // // //                                     {assessorProfile?.signatureUrl ? (
// // // // //                                         <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
// // // // //                                     ) : (
// // // // //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'red', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // // //                                     )}
// // // // //                                     <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
// // // // //                                     <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
// // // // //                                     <em style={{ color: 'red' }}>Signed: {new Date(submission.grading?.gradedAt).toLocaleDateString()}</em>
// // // // //                                     <div className="sr-sig-line" style={{ color: 'red', borderTopColor: 'red' }}>Digital Signature Confirmed</div>
// // // // //                                 </div>
// // // // //                             )}

// // // // //                             {submission.status === 'moderated' && (
// // // // //                                 <div className="sr-sig-box" style={{ borderColor: 'green' }}>
// // // // //                                     <span style={{ color: 'green' }}>Internal Moderation</span>
// // // // //                                     {moderatorProfile?.signatureUrl ? (
// // // // //                                         <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
// // // // //                                     ) : (
// // // // //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'green', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // // //                                     )}
// // // // //                                     <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
// // // // //                                     <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
// // // // //                                     <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</em>
// // // // //                                     <div className="sr-sig-line" style={{ color: 'green', borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
// // // // //                                 </div>
// // // // //                             )}
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     {!hasBeenGraded && (
// // // // //                         <div className="sr-learner-meta no-print">
// // // // //                             <User size={18} color="black" />
// // // // //                             <span style={{ color: 'black' }}><strong>{learner?.fullName}</strong> ({learner?.idNumber})</span>
// // // // //                             <span className="sr-dot" />
// // // // //                             <Clock size={14} color="black" />
// // // // //                             <span style={{ color: 'black' }}>Submitted: {new Date(submission.submittedAt).toLocaleString()}</span>
// // // // //                         </div>
// // // // //                     )}

// // // // //                     <div className="sr-blocks">
// // // // //                         {assessment.blocks?.map((block: any, idx: number) => {
// // // // //                             if (block.type === 'section') {
// // // // //                                 return <h2 key={block.id} className="sr-section-title" style={{ color: '#073f4e' }}>{block.title}</h2>;
// // // // //                             }

// // // // //                             if (block.type === 'mcq' || block.type === 'text') {
// // // // //                                 const learnerAns = submission.answers?.[block.id];
// // // // //                                 const maxM = block.marks || 0;
// // // // //                                 const gradeData = grades[block.id] || { score: 0, feedback: '', isCorrect: null };
// // // // //                                 const isMCQ = block.type === 'mcq';

// // // // //                                 let currentPenColor = 'transparent';
// // // // //                                 if (isAssessorActive) currentPenColor = 'red';
// // // // //                                 else if (isFacilitatorActive) currentPenColor = 'blue';

// // // // //                                 return (
// // // // //                                     <div key={block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
// // // // //                                         <div className="sr-q-header">
// // // // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                                                 <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
// // // // //                                                 <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>
// // // // //                                             </div>

// // // // //                                             <div className="sr-visual-mark">
// // // // //                                                 <button onClick={() => handleVisualMark(block.id, true, maxM)} disabled={!canGrade && !canFacilitatorMark} className="sr-mark-btn" style={gradeData.isCorrect === true ? { color: currentPenColor, border: `1px solid ${currentPenColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
// // // // //                                                 <button onClick={() => handleVisualMark(block.id, false, maxM)} disabled={!canGrade && !canFacilitatorMark} className="sr-mark-btn" style={gradeData.isCorrect === false ? { color: currentPenColor, border: `1px solid ${currentPenColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
// // // // //                                             </div>
// // // // //                                         </div>

// // // // //                                         <div className="sr-q-body">
// // // // //                                             <div className="sr-answer-box">
// // // // //                                                 <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
// // // // //                                                 {isMCQ ? (
// // // // //                                                     <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
// // // // //                                                         <span style={{ color: 'black' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}` : 'No answer provided.'}</span>
// // // // //                                                         {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
// // // // //                                                     </div>
// // // // //                                                 ) : (
// // // // //                                                     <div className="sr-text-ans">
// // // // //                                                         {learnerAns ? <div className="quill-read-only-content" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: learnerAns }} /> : <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>}
// // // // //                                                     </div>
// // // // //                                                 )}

// // // // //                                                 {isMCQ && (
// // // // //                                                     <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong></div>
// // // // //                                                 )}
// // // // //                                             </div>

// // // // //                                             <div className={`sr-grade-box ${!(canGrade || canFacilitatorMark) ? 'disabled' : ''}`}>
// // // // //                                                 <div className="sr-score-input-wrap">
// // // // //                                                     <label>Marks Awarded:</label>
// // // // //                                                     <input type="number" className="sr-score-input" style={{ color: currentPenColor !== 'transparent' ? currentPenColor : 'inherit' }} value={gradeData.score ?? 0} disabled={!(canGrade || canFacilitatorMark)} onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)} />
// // // // //                                                     <span>/ {maxM}</span>
// // // // //                                                 </div>

// // // // //                                                 <div className="sr-feedback-wrap">
// // // // //                                                     <Edit3 size={14} color="#94a3b8" />
// // // // //                                                     <input type="text" className="sr-feedback-input" style={{ color: currentPenColor !== 'transparent' ? currentPenColor : 'inherit', fontStyle: 'italic', fontWeight: 500 }} placeholder={(canGrade || canFacilitatorMark) ? "Add specific feedback for this answer..." : "No specific feedback provided."} value={gradeData.feedback} disabled={!(canGrade || canFacilitatorMark)} onChange={e => handleFeedbackChange(block.id, e.target.value)} />
// // // // //                                                 </div>
// // // // //                                             </div>
// // // // //                                         </div>
// // // // //                                     </div>
// // // // //                                 );
// // // // //                             }
// // // // //                             return null;
// // // // //                         })}
// // // // //                     </div>
// // // // //                 </div>

// // // // //                 {/* ── RIGHT PANE: GRADING & MODERATION (No print) ── */}
// // // // //                 <aside className="sr-sidebar no-print">

// // // // //                     {/* FACILITATOR PRE-MARKING PANEL */}
// // // // //                     {(canFacilitatorMark || submission.status === 'facilitator_reviewed') && (
// // // // //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
// // // // //                             <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>

// // // // //                             {canFacilitatorMark && (
// // // // //                                 <div className="sr-role-guide blue">
// // // // //                                     <Info size={16} />
// // // // //                                     <div>
// // // // //                                         <strong>Formative Feedback & Coaching</strong><br />
// // // // //                                         Use your Blue Pen to provide developmental feedback. Your comments prove to the QCTO auditor that Learner Support took place before official grading.
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             )}

// // // // //                             <div className="sr-score-display">
// // // // //                                 <div className="sr-score-circle" style={{ borderColor: 'blue' }}>
// // // // //                                     <span className="sr-score-val" style={{ color: 'blue' }}>{totalScore}</span>
// // // // //                                     <span className="sr-score-max" style={{ color: 'blue' }}>/ {maxScore}</span>
// // // // //                                 </div>
// // // // //                                 <div className="sr-score-percent" style={{ color: 'blue' }}>{percentage}%</div>
// // // // //                             </div>

// // // // //                             {canFacilitatorMark ? (
// // // // //                                 <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>
// // // // //                                     {saving ? 'Processing...' : 'Send to Assessor'}
// // // // //                                 </button>
// // // // //                             ) : (
// // // // //                                 <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// // // // //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Marked by Facilitator
// // // // //                                 </div>
// // // // //                             )}
// // // // //                         </div>
// // // // //                     )}

// // // // //                     {/* ASSESSOR PANEL */}
// // // // //                     {(hasBeenReviewed || submission.status === 'returned') ? (
// // // // //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
// // // // //                             <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>

// // // // //                             {canGrade && (
// // // // //                                 <div className="sr-role-guide red">
// // // // //                                     <Info size={16} />
// // // // //                                     <div>
// // // // //                                         <strong>Summative Judgment & Remediation</strong><br />
// // // // //                                         Use your Red Pen to declare Competency. You <i>must</i> provide written feedback to justify your marks. If NYC, your comments legally guide the learner's remediation.
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             )}

// // // // //                             <div className="sr-score-display">
// // // // //                                 <div className="sr-score-circle" style={{ borderColor: 'red' }}>
// // // // //                                     <span className="sr-score-val" style={{ color: 'red' }}>{totalScore}</span>
// // // // //                                     <span className="sr-score-max" style={{ color: 'red' }}>/ {maxScore}</span>
// // // // //                                 </div>
// // // // //                                 <div className="sr-score-percent" style={{ color: 'red' }}>{percentage}%</div>
// // // // //                             </div>

// // // // //                             <div className="sr-competency-section">
// // // // //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Final Competency</label>
// // // // //                                 <div className="sr-comp-toggles">
// // // // //                                     <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')} disabled={!canGrade}><Award size={16} /> Competent (C)</button>
// // // // //                                     <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')} disabled={!canGrade}><AlertCircle size={16} /> Not Yet Competent</button>
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             <div className="sr-overall-feedback">
// // // // //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
// // // // //                                 <textarea className="sr-textarea" rows={3} style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: canGrade ? 'red' : '#cbd5e1' }} placeholder={canGrade ? "Provide holistic feedback..." : "No remarks provided."} value={overallFeedback} disabled={!canGrade} onChange={e => handleOverallFeedbackChange(e.target.value)} />
// // // // //                             </div>

// // // // //                             {hasBeenGraded && (
// // // // //                                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
// // // // //                                     <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
// // // // //                                     {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
// // // // //                                     <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName}</p>
// // // // //                                     <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
// // // // //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// // // // //                                 </div>
// // // // //                             )}

// // // // //                             {canGrade && (
// // // // //                                 <div className="sr-action-area">
// // // // //                                     <button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving || !competency}>{saving ? 'Processing...' : 'Apply Digital Signature & Finalise'}</button>
// // // // //                                 </div>
// // // // //                             )}
// // // // //                         </div>
// // // // //                     ) : (
// // // // //                         <div className="sr-summary-card sr-locked-card"><Lock size={28} /><h3>Assessor Grading</h3><p>Awaiting Facilitator to complete Blue Pen pre-marking.</p></div>
// // // // //                     )}

// // // // //                     {/* MODERATOR PANEL */}
// // // // //                     {(hasBeenGraded || submission.status === 'moderated') ? (
// // // // //                         <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
// // // // //                             <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>

// // // // //                             {canModerate && (
// // // // //                                 <div className="sr-role-guide green">
// // // // //                                     <Info size={16} />
// // // // //                                     <div>
// // // // //                                         <strong>Quality Assurance & Endorsement</strong><br />
// // // // //                                         Your Green Pen evaluates the Assessor, not the learner. Use comments to instruct the Assessor on corrections before endorsing this script.
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             )}

// // // // //                             <div className="sr-competency-section">
// // // // //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderation Outcome</label>
// // // // //                                 <div className="sr-comp-toggles">
// // // // //                                     <button className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`} onClick={() => handleModOutcomeSelect('Endorsed')} disabled={!canModerate}><ShieldCheck size={16} /> Endorse Grade</button>
// // // // //                                     <button className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`} onClick={() => handleModOutcomeSelect('Returned')} disabled={!canModerate}><AlertCircle size={16} /> Return to Assessor</button>
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             <div className="sr-overall-feedback">
// // // // //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderator Feedback</label>
// // // // //                                 <textarea className="sr-textarea" rows={3} style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }} placeholder={canModerate ? "Notes for the assessor or internal QA..." : "No moderation feedback."} value={modFeedback} disabled={!canModerate} onChange={e => handleModFeedbackChange(e.target.value)} />
// // // // //                             </div>

// // // // //                             {canModerate && (
// // // // //                                 <div className="sr-action-area">
// // // // //                                     <button className="sr-submit-btn" style={{ background: 'green' }} onClick={triggerSubmitModeration} disabled={saving || !modOutcome}>{saving ? 'Processing...' : 'Finalise QA & Endorse'}</button>
// // // // //                                 </div>
// // // // //                             )}
// // // // //                         </div>
// // // // //                     ) : (
// // // // //                         <div className="sr-summary-card sr-locked-card"><Lock size={28} /><h3>QA Moderation</h3><p>Awaiting Assessor to complete Red Pen official grading.</p></div>
// // // // //                     )}

// // // // //                     {/* 🚀 OFFICIAL AUDIT TRAIL 🚀 */}
// // // // //                     <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
// // // // //                         <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}><ShieldCheck size={18} color="#073f4e" /> Official Audit Trail</h3>

// // // // //                         {(submission.status === 'not_started' && !hasBeenGraded) && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>}

// // // // //                         {submission.status !== 'not_started' && (
// // // // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// // // // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
// // // // //                                 {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
// // // // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
// // // // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</p>
// // // // //                             </div>
// // // // //                         )}

// // // // //                         {hasBeenGraded && (
// // // // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// // // // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
// // // // //                                 {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
// // // // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName}</p>
// // // // //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
// // // // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// // // // //                             </div>
// // // // //                         )}

// // // // //                         {submission.status === 'moderated' && (
// // // // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1rem' }}>
// // // // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation</p>
// // // // //                                 {moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
// // // // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{submission.moderation?.moderatorName}</p>
// // // // //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Outcome: {submission.moderation?.outcome}</p>
// // // // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</p>
// // // // //                             </div>
// // // // //                         )}
// // // // //                     </div>
// // // // //                 </aside>
// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };

// // // // // const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
// // // // //     const filterMap: any = {
// // // // //         black: 'brightness(0)',
// // // // //         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
// // // // //         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
// // // // //         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
// // // // //     };
// // // // //     return <img src={imageUrl} alt="Signature" style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain', marginBottom: '10px', filter: filterMap[color] || 'none' }} />;
// // // // // };


// // // // // // // import React, { useState, useEffect, useRef } from 'react';
// // // // // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // // // // import { doc, getDoc, updateDoc } from 'firebase/firestore';
// // // // // // // import { db } from '../../../lib/firebase';
// // // // // // // import { useStore } from '../../../store/useStore';
// // // // // // // import {
// // // // // // //     ArrowLeft, CheckCircle, AlertCircle, Save,
// // // // // // //     User, GraduationCap, Clock, MessageSquare, Award,
// // // // // // //     ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2
// // // // // // // } from 'lucide-react';
// // // // // // // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // // // // // // import './SubmissionReview.css';

// // // // // // // interface GradeData {
// // // // // // //     score: number;
// // // // // // //     feedback: string;
// // // // // // //     isCorrect?: boolean | null;
// // // // // // // }

// // // // // // // export const SubmissionReview: React.FC = () => {
// // // // // // //     const { submissionId } = useParams<{ submissionId: string }>();
// // // // // // //     const navigate = useNavigate();
// // // // // // //     const { user } = useStore();
// // // // // // //     const toast = useToast();

// // // // // // //     const [loading, setLoading] = useState(true);
// // // // // // //     const [saving, setSaving] = useState(false);

// // // // // // //     const [submission, setSubmission] = useState<any>(null);
// // // // // // //     const [assessment, setAssessment] = useState<any>(null);
// // // // // // //     const [learner, setLearner] = useState<any>(null);

// // // // // // //     // Auth profiles for pulling actual signatures
// // // // // // //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// // // // // // //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// // // // // // //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);

// // // // // // //     // Grading States
// // // // // // //     const [grades, setGrades] = useState<Record<string, GradeData>>({});
// // // // // // //     const [overallFeedback, setOverallFeedback] = useState('');
// // // // // // //     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

// // // // // // //     // Moderation States
// // // // // // //     const [modFeedback, setModFeedback] = useState('');
// // // // // // //     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

// // // // // // //     // 🚀 AUTO-SAVE REF
// // // // // // //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// // // // // // //     // ─── RBAC: PERMISSION FLAGS ────────────────────────────────────────────────
// // // // // // //     const isFacilitator = user?.role === 'facilitator' || user?.role === 'admin';
// // // // // // //     const isAssessor = user?.role === 'assessor' || user?.role === 'admin';
// // // // // // //     const isModerator = user?.role === 'moderator' || user?.role === 'admin';

// // // // // // //     // Facilitator marks first (Blue Pen)
// // // // // // //     const canFacilitatorMark = isFacilitator && submission?.status === 'submitted';

// // // // // // //     // Assessor officially grades only AFTER facilitator review (or if returned - Red Pen)
// // // // // // //     const canGrade = isAssessor && (submission?.status === 'facilitator_reviewed' || submission?.status === 'returned');

// // // // // // //     // Moderator QA (Green Pen)
// // // // // // //     const canModerate = isModerator && submission?.status === 'graded';

// // // // // // //     useEffect(() => {
// // // // // // //         const loadReviewData = async () => {
// // // // // // //             if (!submissionId) return;
// // // // // // //             try {
// // // // // // //                 const subRef = doc(db, 'learner_submissions', submissionId);
// // // // // // //                 const subSnap = await getDoc(subRef);
// // // // // // //                 if (!subSnap.exists()) throw new Error("Submission not found");
// // // // // // //                 const subData = subSnap.data();
// // // // // // //                 setSubmission({ id: subSnap.id, ...subData });

// // // // // // //                 const assRef = doc(db, 'assessments', subData.assessmentId);
// // // // // // //                 const assSnap = await getDoc(assRef);
// // // // // // //                 if (!assSnap.exists()) throw new Error("Assessment template missing");
// // // // // // //                 const assData = assSnap.data();
// // // // // // //                 setAssessment(assData);

// // // // // // //                 // Fetch Learner from learners collection
// // // // // // //                 const learnerRef = doc(db, 'learners', subData.learnerId);
// // // // // // //                 const learnerSnap = await getDoc(learnerRef);
// // // // // // //                 let learnerAuthUid = null;
// // // // // // //                 if (learnerSnap.exists()) {
// // // // // // //                     const lData = learnerSnap.data();
// // // // // // //                     setLearner(lData);
// // // // // // //                     learnerAuthUid = lData.authUid;
// // // // // // //                 }

// // // // // // //                 // Fetch Learner Profile from users collection (to get signatureUrl)
// // // // // // //                 const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || learnerAuthUid || subData.learnerId;
// // // // // // //                 if (targetLearnerUid) {
// // // // // // //                     const lProfSnap = await getDoc(doc(db, 'users', targetLearnerUid));
// // // // // // //                     if (lProfSnap.exists()) setLearnerProfile(lProfSnap.data());
// // // // // // //                 }

// // // // // // //                 // Fetch Assessor profile if graded
// // // // // // //                 if (subData.grading?.gradedBy) {
// // // // // // //                     const assProfRef = doc(db, 'users', subData.grading.gradedBy);
// // // // // // //                     const assProfSnap = await getDoc(assProfRef);
// // // // // // //                     if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
// // // // // // //                 }

// // // // // // //                 // Fetch Moderator profile if moderated
// // // // // // //                 if (subData.moderation?.moderatedBy) {
// // // // // // //                     const modProfRef = doc(db, 'users', subData.moderation.moderatedBy);
// // // // // // //                     const modProfSnap = await getDoc(modProfRef);
// // // // // // //                     if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
// // // // // // //                 }

// // // // // // //                 // 🚀 THE FIX: Always load existing grades if they are in the database, 
// // // // // // //                 // regardless of the current status. This ensures auto-saved data isn't wiped.
// // // // // // //                 const existingBreakdown = subData.grading?.breakdown;

// // // // // // //                 if (existingBreakdown && Object.keys(existingBreakdown).length > 0) {
// // // // // // //                     setGrades(existingBreakdown);
// // // // // // //                     setOverallFeedback(subData.grading?.overallFeedback || '');
// // // // // // //                     setCompetency(subData.competency || null);
// // // // // // //                     setModFeedback(subData.moderation?.feedback || '');
// // // // // // //                     setModOutcome(subData.moderation?.outcome || null);
// // // // // // //                 } else {
// // // // // // //                     // Only auto-grade and start fresh if NO grading data exists at all
// // // // // // //                     const initialGrades: Record<string, GradeData> = {};
// // // // // // //                     assData.blocks?.forEach((block: any) => {
// // // // // // //                         if (block.type === 'mcq') {
// // // // // // //                             const learnerAns = subData.answers?.[block.id];
// // // // // // //                             const isCorrect = learnerAns === block.correctOption;
// // // // // // //                             initialGrades[block.id] = {
// // // // // // //                                 score: isCorrect ? (block.marks || 0) : 0,
// // // // // // //                                 feedback: isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect',
// // // // // // //                                 isCorrect: isCorrect
// // // // // // //                             };
// // // // // // //                         } else if (block.type === 'text') {
// // // // // // //                             initialGrades[block.id] = { score: 0, feedback: '', isCorrect: null };
// // // // // // //                         }
// // // // // // //                     });
// // // // // // //                     setGrades(initialGrades);
// // // // // // //                 }
// // // // // // //             } catch (err: any) {
// // // // // // //                 toast.error(err.message || "Failed to load data.");
// // // // // // //             } finally {
// // // // // // //                 setLoading(false);
// // // // // // //             }
// // // // // // //         };
// // // // // // //         loadReviewData();
// // // // // // //     }, [submissionId]);

// // // // // // //     // ─── AUTO-SAVE ENGINE ──────────────────────────────────────────────────
// // // // // // //     const triggerAutoSave = (updatedGrades: any, updatedOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
// // // // // // //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

// // // // // // //         setSaving(true);
// // // // // // //         saveTimeoutRef.current = setTimeout(async () => {
// // // // // // //             if (!submission?.id) return;
// // // // // // //             try {
// // // // // // //                 const updatePayload: any = {
// // // // // // //                     'grading.breakdown': updatedGrades,
// // // // // // //                     'grading.overallFeedback': updatedOverall,
// // // // // // //                     'moderation.feedback': updatedModFeedback,
// // // // // // //                     lastStaffEditAt: new Date().toISOString()
// // // // // // //                 };

// // // // // // //                 // Only save outcome fields if they are actively evaluating and not finalized
// // // // // // //                 if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
// // // // // // //                 if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

// // // // // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
// // // // // // //             } catch (error) {
// // // // // // //                 console.error("Auto-save failed:", error);
// // // // // // //             } finally {
// // // // // // //                 setSaving(false);
// // // // // // //             }
// // // // // // //         }, 1500); // 1.5 second debounce delay
// // // // // // //     };

// // // // // // //     // ─── VISUAL MARKING HANDLER ──────────────────────────────────────────────
// // // // // // //     const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
// // // // // // //         if (!canGrade && !canFacilitatorMark) return;
// // // // // // //         const newGrades = {
// // // // // // //             ...grades,
// // // // // // //             [blockId]: {
// // // // // // //                 ...grades[blockId],
// // // // // // //                 isCorrect: isCorrect,
// // // // // // //                 score: isCorrect ? maxMarks : 0
// // // // // // //             }
// // // // // // //         };
// // // // // // //         setGrades(newGrades);
// // // // // // //         triggerAutoSave(newGrades, overallFeedback, modFeedback, competency, modOutcome);
// // // // // // //     };

// // // // // // //     const handleScoreChange = (blockId: string, score: number, max: number) => {
// // // // // // //         if (!canGrade && !canFacilitatorMark) return;
// // // // // // //         const validScore = Math.min(Math.max(0, score), max);
// // // // // // //         const newGrades = { ...grades, [blockId]: { ...grades[blockId], score: validScore } };
// // // // // // //         setGrades(newGrades);
// // // // // // //         triggerAutoSave(newGrades, overallFeedback, modFeedback, competency, modOutcome);
// // // // // // //     };

// // // // // // //     const handleFeedbackChange = (blockId: string, feedback: string) => {
// // // // // // //         if (!canGrade && !canFacilitatorMark) return;
// // // // // // //         const newGrades = { ...grades, [blockId]: { ...grades[blockId], feedback } };
// // // // // // //         setGrades(newGrades);
// // // // // // //         triggerAutoSave(newGrades, overallFeedback, modFeedback, competency, modOutcome);
// // // // // // //     };

// // // // // // //     const handleOverallFeedbackChange = (val: string) => {
// // // // // // //         if (!canGrade) return;
// // // // // // //         setOverallFeedback(val);
// // // // // // //         triggerAutoSave(grades, val, modFeedback, competency, modOutcome);
// // // // // // //     };

// // // // // // //     const handleModFeedbackChange = (val: string) => {
// // // // // // //         if (!canModerate) return;
// // // // // // //         setModFeedback(val);
// // // // // // //         triggerAutoSave(grades, overallFeedback, val, competency, modOutcome);
// // // // // // //     };

// // // // // // //     const handleCompetencySelect = (val: 'C' | 'NYC') => {
// // // // // // //         if (!canGrade) return;
// // // // // // //         setCompetency(val);
// // // // // // //         triggerAutoSave(grades, overallFeedback, modFeedback, val, modOutcome);
// // // // // // //     };

// // // // // // //     const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
// // // // // // //         if (!canModerate) return;
// // // // // // //         setModOutcome(val);
// // // // // // //         triggerAutoSave(grades, overallFeedback, modFeedback, competency, val);
// // // // // // //     };

// // // // // // //     const calculateTotals = () => {
// // // // // // //         const totalScore = Object.values(grades).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
// // // // // // //         const maxScore = assessment?.totalMarks || 0;
// // // // // // //         const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
// // // // // // //         return { totalScore, maxScore, percentage };
// // // // // // //     };

// // // // // // //     // ─── FACILITATOR REVIEW ──────────────────────────────────────────────────
// // // // // // //     const handleSubmitFacilitator = async () => {
// // // // // // //         if (!canFacilitatorMark) return;
// // // // // // //         if (!window.confirm("Complete pre-assessment marking? This will send it to the Assessor for official grading.")) return;

// // // // // // //         setSaving(true);
// // // // // // //         const { totalScore } = calculateTotals();

// // // // // // //         try {
// // // // // // //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // // // //                 status: 'facilitator_reviewed',
// // // // // // //                 grading: {
// // // // // // //                     breakdown: grades,
// // // // // // //                     overallFeedback: overallFeedback,
// // // // // // //                     facilitatorId: user?.uid,
// // // // // // //                     facilitatorName: user?.fullName,
// // // // // // //                     facilitatorReviewedAt: new Date().toISOString()
// // // // // // //                 }
// // // // // // //             });
// // // // // // //             toast.success("Script marked and passed to Assessor!");
// // // // // // //             setTimeout(() => navigate(-1), 2000);
// // // // // // //         } catch (error) {
// // // // // // //             toast.error("Failed to save marking.");
// // // // // // //         } finally {
// // // // // // //             setSaving(false);
// // // // // // //         }
// // // // // // //     };

// // // // // // //     // ─── ASSESSOR SUBMIT ─────────────────────────────────────────────────────
// // // // // // //     const handleSubmitGrade = async () => {
// // // // // // //         if (!canGrade) return;
// // // // // // //         if (!competency) return toast.warning("Select Final Competency (C or NYC).");
// // // // // // //         if (!window.confirm("Finalise this grade? This will apply your digital signature and notify moderation.")) return;

// // // // // // //         setSaving(true);
// // // // // // //         const { totalScore } = calculateTotals();

// // // // // // //         try {
// // // // // // //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // // // //                 status: 'graded',
// // // // // // //                 marks: totalScore,
// // // // // // //                 competency: competency,
// // // // // // //                 grading: {
// // // // // // //                     ...submission.grading, // preserve facilitator details if any
// // // // // // //                     breakdown: grades,
// // // // // // //                     overallFeedback: overallFeedback,
// // // // // // //                     gradedBy: user?.uid,
// // // // // // //                     assessorName: user?.fullName,
// // // // // // //                     assessorRegNumber: user?.assessorRegNumber || 'Pending Reg',
// // // // // // //                     gradedAt: new Date().toISOString()
// // // // // // //                 }
// // // // // // //             });
// // // // // // //             toast.success("Workbook graded and signed successfully!");
// // // // // // //             setTimeout(() => window.scrollTo(0, 0), 500);

// // // // // // //             // Re-fetch assessor profile to display signature immediately
// // // // // // //             const assProfSnap = await getDoc(doc(db, 'users', user!.uid));
// // // // // // //             if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());

// // // // // // //             setSubmission((prev: any) => ({ ...prev, status: 'graded', competency, marks: totalScore, grading: { ...prev.grading, gradedAt: new Date().toISOString(), assessorName: user?.fullName } }));
// // // // // // //         } catch (error) {
// // // // // // //             toast.error("Failed to save grades.");
// // // // // // //         } finally {
// // // // // // //             setSaving(false);
// // // // // // //         }
// // // // // // //     };

// // // // // // //     // ─── MODERATOR SUBMIT ────────────────────────────────────────────────────
// // // // // // //     const handleSubmitModeration = async () => {
// // // // // // //         if (!canModerate) return;
// // // // // // //         if (!modOutcome) return toast.warning("Select Moderation Outcome (Endorsed or Returned).");
// // // // // // //         if (!window.confirm("Finalise moderation? The assessor will be notified if returned.")) return;

// // // // // // //         setSaving(true);
// // // // // // //         try {
// // // // // // //             const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';

// // // // // // //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // // // //                 status: newStatus,
// // // // // // //                 moderation: {
// // // // // // //                     outcome: modOutcome,
// // // // // // //                     feedback: modFeedback,
// // // // // // //                     moderatedBy: user?.uid,
// // // // // // //                     moderatorName: user?.fullName,
// // // // // // //                     moderatorRegNumber: user?.assessorRegNumber || 'Pending Reg',
// // // // // // //                     moderatedAt: new Date().toISOString()
// // // // // // //                 }
// // // // // // //             });
// // // // // // //             toast.success("Moderation saved successfully!");
// // // // // // //             setTimeout(() => window.scrollTo(0, 0), 500);

// // // // // // //             const modProfSnap = await getDoc(doc(db, 'users', user!.uid));
// // // // // // //             if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());

// // // // // // //             setSubmission((prev: any) => ({ ...prev, status: newStatus }));
// // // // // // //         } catch (error) {
// // // // // // //             toast.error("Failed to save moderation.");
// // // // // // //         } finally {
// // // // // // //             setSaving(false);
// // // // // // //         }
// // // // // // //     };

// // // // // // //     if (loading) return <div className="sr-loading"><div className="sr-spinner" /> Loading Record…</div>;
// // // // // // //     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

// // // // // // //     const { totalScore, maxScore, percentage } = calculateTotals();
// // // // // // //     const hasBeenGraded = ['graded', 'moderated'].includes(submission.status);
// // // // // // //     const hasBeenReviewed = ['facilitator_reviewed', 'graded', 'moderated'].includes(submission.status);

// // // // // // //     // 🚀 STRICT COMPLIANCE: Determine Pen Colors based on State
// // // // // // //     const isAssessorActive = canGrade || hasBeenGraded;
// // // // // // //     const isFacilitatorActive = canFacilitatorMark || (submission.status === 'facilitator_reviewed' && !canGrade);
// // // // // // //     const printScoreColor = isAssessorActive ? 'red' : (isFacilitatorActive ? 'blue' : 'black');
// // // // // // //     const printOutcomeColor = submission.competency ? 'red' : 'black';

// // // // // // //     return (
// // // // // // //         <div className="sr-root animate-fade-in">
// // // // // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // // // // //             {/* ── TOP NAV ── */}
// // // // // // //             <div className="ap-player-topbar no-print">
// // // // // // //                 <div className="ap-player-topbar__left">
// // // // // // //                     <button className="sr-back-btn" onClick={() => navigate(-1)}>
// // // // // // //                         <ArrowLeft size={13} /> Portfolio
// // // // // // //                     </button>
// // // // // // //                     <div className="ap-player-topbar__separator" />
// // // // // // //                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
// // // // // // //                 </div>

// // // // // // //                 <div className="ap-player-topbar__right">
// // // // // // //                     <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
// // // // // // //                         <Printer size={13} /> Print Audit
// // // // // // //                     </button>
// // // // // // //                     {/* 🚀 AUTO-SAVE UI INDICATOR */}
// // // // // // //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
// // // // // // //                         {saving ? (
// // // // // // //                             <><Loader2 className="ap-spinner-icon" size={12} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
// // // // // // //                         ) : (
// // // // // // //                             <><CheckCircle size={12} /> Auto-saved</>
// // // // // // //                         )}
// // // // // // //                     </span>
// // // // // // //                 </div>
// // // // // // //             </div>

// // // // // // //             <div className="sr-layout">
// // // // // // //                 {/* ── LEFT PANE: WORKBOOK & ANSWERS ── */}
// // // // // // //                 <div className="sr-content-pane print-pane">

// // // // // // //                     {/* 🚀 OFFICIAL QCTO AUDIT HEADER (Visible on Print) 🚀 */}
// // // // // // //                     <div className="sr-print-header">
// // // // // // //                         <h2>OFFICIAL ASSESSMENT RECORD</h2>

// // // // // // //                         <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', borderBottom: '1px solid black', paddingBottom: '1rem' }}>
// // // // // // //                             <div style={{ flex: 1 }}>
// // // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Learner Name:</strong> {learner?.fullName}</p>
// // // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
// // // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
// // // // // // //                             </div>
// // // // // // //                             <div style={{ flex: 1, textAlign: 'right' }}>
// // // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// // // // // // //                                     <strong>Score:</strong> <span style={{ color: printScoreColor, fontWeight: 'bold' }}>{totalScore} / {maxScore} ({percentage}%)</span>
// // // // // // //                                 </p>
// // // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}>
// // // // // // //                                     <strong>Outcome:</strong> <span style={{ color: printOutcomeColor, fontWeight: 'bold' }}>{submission.competency === 'C' ? 'Competent (C)' : (submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending')}</span>
// // // // // // //                                 </p>
// // // // // // //                                 <p style={{ margin: '4px 0', color: 'black' }}><strong>Submitted:</strong> {new Date(submission.submittedAt).toLocaleDateString()}</p>
// // // // // // //                             </div>
// // // // // // //                         </div>

// // // // // // //                         {/* SIGNATURE BLOCKS */}
// // // // // // //                         <div className="sr-signature-block">
// // // // // // //                             {/* Learner Signature (Black Ink) */}
// // // // // // //                             <div className="sr-sig-box" style={{ borderColor: 'black' }}>
// // // // // // //                                 <span style={{ color: 'black' }}>Learner Declaration</span>
// // // // // // //                                 {learnerProfile?.signatureUrl ? (
// // // // // // //                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// // // // // // //                                 ) : (
// // // // // // //                                     <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'black', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // // // // //                                 )}
// // // // // // //                                 <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
// // // // // // //                                 <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
// // // // // // //                                 <div className="sr-sig-line" style={{ color: 'black', borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
// // // // // // //                             </div>

// // // // // // //                             {/* Assessor Signature (Red Ink) */}
// // // // // // //                             {hasBeenGraded && (
// // // // // // //                                 <div className="sr-sig-box" style={{ borderColor: 'red' }}>
// // // // // // //                                     <span style={{ color: 'red' }}>Assessor Sign-off</span>
// // // // // // //                                     {assessorProfile?.signatureUrl ? (
// // // // // // //                                         <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
// // // // // // //                                     ) : (
// // // // // // //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'red', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // // // // //                                     )}
// // // // // // //                                     <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
// // // // // // //                                     <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
// // // // // // //                                     <em style={{ color: 'red' }}>Signed: {new Date(submission.grading?.gradedAt).toLocaleDateString()}</em>
// // // // // // //                                     <div className="sr-sig-line" style={{ color: 'red', borderTopColor: 'red' }}>Digital Signature Confirmed</div>
// // // // // // //                                 </div>
// // // // // // //                             )}

// // // // // // //                             {/* Moderator Signature (Green Ink) */}
// // // // // // //                             {submission.status === 'moderated' && (
// // // // // // //                                 <div className="sr-sig-box" style={{ borderColor: 'green' }}>
// // // // // // //                                     <span style={{ color: 'green' }}>Internal Moderation</span>
// // // // // // //                                     {moderatorProfile?.signatureUrl ? (
// // // // // // //                                         <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
// // // // // // //                                     ) : (
// // // // // // //                                         <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'green', fontStyle: 'italic', fontSize: '0.8rem' }}>No Canvas Signature</div>
// // // // // // //                                     )}
// // // // // // //                                     <strong style={{ color: 'green' }}>{submission.moderation?.moderatorName || 'N/A'}</strong>
// // // // // // //                                     <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
// // // // // // //                                     <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</em>
// // // // // // //                                     <div className="sr-sig-line" style={{ color: 'green', borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
// // // // // // //                                 </div>
// // // // // // //                             )}
// // // // // // //                         </div>
// // // // // // //                     </div>

// // // // // // //                     {!hasBeenGraded && (
// // // // // // //                         <div className="sr-learner-meta no-print">
// // // // // // //                             <User size={18} color="black" />
// // // // // // //                             <span style={{ color: 'black' }}><strong>{learner?.fullName}</strong> ({learner?.idNumber})</span>
// // // // // // //                             <span className="sr-dot" />
// // // // // // //                             <Clock size={14} color="black" />
// // // // // // //                             <span style={{ color: 'black' }}>Submitted: {new Date(submission.submittedAt).toLocaleString()}</span>
// // // // // // //                         </div>
// // // // // // //                     )}

// // // // // // //                     <div className="sr-blocks">
// // // // // // //                         {assessment.blocks?.map((block: any, idx: number) => {
// // // // // // //                             if (block.type === 'section') {
// // // // // // //                                 return <h2 key={block.id} className="sr-section-title" style={{ color: '#073f4e' }}>{block.title}</h2>;
// // // // // // //                             }

// // // // // // //                             if (block.type === 'mcq' || block.type === 'text') {
// // // // // // //                                 const learnerAns = submission.answers?.[block.id];
// // // // // // //                                 const maxM = block.marks || 0;
// // // // // // //                                 const gradeData = grades[block.id] || { score: 0, feedback: '', isCorrect: null };
// // // // // // //                                 const isMCQ = block.type === 'mcq';

// // // // // // //                                 // 🚀 STRICT COMPLIANCE: Determine "Ink" color for this specific block
// // // // // // //                                 let currentPenColor = 'transparent';
// // // // // // //                                 if (isAssessorActive) currentPenColor = 'red';
// // // // // // //                                 else if (isFacilitatorActive) currentPenColor = 'blue';

// // // // // // //                                 return (
// // // // // // //                                     <div key={block.id} className="sr-q-card" style={{ borderColor: '#073f4e', borderTop: '4px solid black' }}>
// // // // // // //                                         <div className="sr-q-header">
// // // // // // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // // // //                                                 <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{idx + 1}</span>
// // // // // // //                                                 <span className="sr-q-text" style={{ color: '#073f4e' }}>{block.question}</span>
// // // // // // //                                             </div>

// // // // // // //                                             {/* 🚀 VISUAL MARKER (Tick/Cross with Pen Color) */}
// // // // // // //                                             <div className="sr-visual-mark">
// // // // // // //                                                 <button
// // // // // // //                                                     onClick={() => handleVisualMark(block.id, true, maxM)}
// // // // // // //                                                     disabled={!canGrade && !canFacilitatorMark}
// // // // // // //                                                     className="sr-mark-btn"
// // // // // // //                                                     style={gradeData.isCorrect === true ? { color: currentPenColor, border: `1px solid ${currentPenColor}`, background: 'white' } : {}}
// // // // // // //                                                     title="Mark Correct"
// // // // // // //                                                 >
// // // // // // //                                                     <Check size={20} />
// // // // // // //                                                 </button>
// // // // // // //                                                 <button
// // // // // // //                                                     onClick={() => handleVisualMark(block.id, false, maxM)}
// // // // // // //                                                     disabled={!canGrade && !canFacilitatorMark}
// // // // // // //                                                     className="sr-mark-btn"
// // // // // // //                                                     style={gradeData.isCorrect === false ? { color: currentPenColor, border: `1px solid ${currentPenColor}`, background: 'white' } : {}}
// // // // // // //                                                     title="Mark Incorrect"
// // // // // // //                                                 >
// // // // // // //                                                     <X size={20} />
// // // // // // //                                                 </button>
// // // // // // //                                             </div>
// // // // // // //                                         </div>

// // // // // // //                                         <div className="sr-q-body">
// // // // // // //                                             {/* Learner's Answer (Black Pen) */}
// // // // // // //                                             <div className="sr-answer-box">
// // // // // // //                                                 <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
// // // // // // //                                                 {isMCQ ? (
// // // // // // //                                                     <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
// // // // // // //                                                         <span style={{ color: 'black' }}>
// // // // // // //                                                             {learnerAns !== undefined
// // // // // // //                                                                 ? `${String.fromCharCode(65 + learnerAns)}. ${block.options[learnerAns]}`
// // // // // // //                                                                 : 'No answer provided.'}
// // // // // // //                                                         </span>
// // // // // // //                                                         {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
// // // // // // //                                                     </div>
// // // // // // //                                                 ) : (
// // // // // // //                                                     <div className="sr-text-ans">
// // // // // // //                                                         {/* RENDER RICH TEXT (QUILL HTML) SAFELY IN BLACK */}
// // // // // // //                                                         {learnerAns ? (
// // // // // // //                                                             <div
// // // // // // //                                                                 className="quill-read-only-content"
// // // // // // //                                                                 style={{ color: 'black' }}
// // // // // // //                                                                 dangerouslySetInnerHTML={{ __html: learnerAns }}
// // // // // // //                                                             />
// // // // // // //                                                         ) : (
// // // // // // //                                                             <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>
// // // // // // //                                                         )}
// // // // // // //                                                     </div>
// // // // // // //                                                 )}

// // // // // // //                                                 {isMCQ && (
// // // // // // //                                                     <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>
// // // // // // //                                                         Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options[block.correctOption]}</strong>
// // // // // // //                                                     </div>
// // // // // // //                                                 )}
// // // // // // //                                             </div>

// // // // // // //                                             {/* Grading Tool (UI standard borders, Pen-colored ink) */}
// // // // // // //                                             <div className={`sr-grade-box ${!(canGrade || canFacilitatorMark) ? 'disabled' : ''}`}>
// // // // // // //                                                 <div className="sr-score-input-wrap">
// // // // // // //                                                     <label>Marks Awarded:</label>
// // // // // // //                                                     <input
// // // // // // //                                                         type="number"
// // // // // // //                                                         className="sr-score-input"
// // // // // // //                                                         style={{ color: currentPenColor !== 'transparent' ? currentPenColor : 'inherit' }}
// // // // // // //                                                         value={gradeData.score ?? 0}
// // // // // // //                                                         disabled={!(canGrade || canFacilitatorMark)}
// // // // // // //                                                         onChange={e => handleScoreChange(block.id, parseInt(e.target.value) || 0, maxM)}
// // // // // // //                                                     />
// // // // // // //                                                     <span>/ {maxM}</span>
// // // // // // //                                                 </div>

// // // // // // //                                                 <div className="sr-feedback-wrap">
// // // // // // //                                                     <Edit3 size={14} color="#94a3b8" />
// // // // // // //                                                     <input
// // // // // // //                                                         type="text"
// // // // // // //                                                         className="sr-feedback-input"
// // // // // // //                                                         style={{ color: currentPenColor !== 'transparent' ? currentPenColor : 'inherit', fontStyle: 'italic', fontWeight: 500 }}
// // // // // // //                                                         placeholder={(canGrade || canFacilitatorMark) ? "Add specific feedback for this answer..." : "No specific feedback provided."}
// // // // // // //                                                         value={gradeData.feedback}
// // // // // // //                                                         disabled={!(canGrade || canFacilitatorMark)}
// // // // // // //                                                         onChange={e => handleFeedbackChange(block.id, e.target.value)}
// // // // // // //                                                     />
// // // // // // //                                                 </div>
// // // // // // //                                             </div>
// // // // // // //                                         </div>
// // // // // // //                                     </div>
// // // // // // //                                 );
// // // // // // //                             }
// // // // // // //                             return null;
// // // // // // //                         })}
// // // // // // //                     </div>
// // // // // // //                 </div>

// // // // // // //                 {/* ── RIGHT PANE: GRADING & MODERATION (No print) ── */}
// // // // // // //                 <aside className="sr-sidebar no-print">

// // // // // // //                     {/* FACILITATOR PRE-MARKING PANEL */}
// // // // // // //                     {(canFacilitatorMark || submission.status === 'facilitator_reviewed') && (
// // // // // // //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid blue' }}>
// // // // // // //                             <h3 className="sr-summary-title" style={{ color: 'blue' }}>Facilitator Pre-Marking</h3>

// // // // // // //                             {/* 🚀 Facilitator QCTO Reminder */}
// // // // // // //                             {canFacilitatorMark && (
// // // // // // //                                 <div className="sr-role-guide blue">
// // // // // // //                                     <Info size={16} />
// // // // // // //                                     <div>
// // // // // // //                                         <strong>Formative Feedback & Coaching</strong><br />
// // // // // // //                                         Use your Blue Pen to provide developmental feedback. Your comments prove to the QCTO auditor that Learner Support took place before official grading.
// // // // // // //                                     </div>
// // // // // // //                                 </div>
// // // // // // //                             )}

// // // // // // //                             <div className="sr-score-display">
// // // // // // //                                 <div className="sr-score-circle" style={{ borderColor: 'blue' }}>
// // // // // // //                                     <span className="sr-score-val" style={{ color: 'blue' }}>{totalScore}</span>
// // // // // // //                                     <span className="sr-score-max" style={{ color: 'blue' }}>/ {maxScore}</span>
// // // // // // //                                 </div>
// // // // // // //                                 <div className="sr-score-percent" style={{ color: 'blue' }}>{percentage}%</div>
// // // // // // //                             </div>

// // // // // // //                             {canFacilitatorMark ? (
// // // // // // //                                 <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={handleSubmitFacilitator} disabled={saving}>
// // // // // // //                                     {saving ? 'Processing...' : 'Send to Assessor'}
// // // // // // //                                 </button>
// // // // // // //                             ) : (
// // // // // // //                                 <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
// // // // // // //                                     <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Marked by Facilitator
// // // // // // //                                 </div>
// // // // // // //                             )}
// // // // // // //                         </div>
// // // // // // //                     )}

// // // // // // //                     {/* ASSESSOR PANEL */}
// // // // // // //                     {(hasBeenReviewed || submission.status === 'returned') ? (
// // // // // // //                         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
// // // // // // //                             <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>

// // // // // // //                             {/* 🚀 Assessor QCTO Reminder */}
// // // // // // //                             {canGrade && (
// // // // // // //                                 <div className="sr-role-guide red">
// // // // // // //                                     <Info size={16} />
// // // // // // //                                     <div>
// // // // // // //                                         <strong>Summative Judgment & Remediation</strong><br />
// // // // // // //                                         Use your Red Pen to declare Competency. You <i>must</i> provide written feedback to justify your marks. If NYC, your comments legally guide the learner's remediation.
// // // // // // //                                     </div>
// // // // // // //                                 </div>
// // // // // // //                             )}

// // // // // // //                             <div className="sr-score-display">
// // // // // // //                                 <div className="sr-score-circle" style={{ borderColor: 'red' }}>
// // // // // // //                                     <span className="sr-score-val" style={{ color: 'red' }}>{totalScore}</span>
// // // // // // //                                     <span className="sr-score-max" style={{ color: 'red' }}>/ {maxScore}</span>
// // // // // // //                                 </div>
// // // // // // //                                 <div className="sr-score-percent" style={{ color: 'red' }}>{percentage}%</div>
// // // // // // //                             </div>

// // // // // // //                             <div className="sr-competency-section">
// // // // // // //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Final Competency</label>
// // // // // // //                                 <div className="sr-comp-toggles">
// // // // // // //                                     <button
// // // // // // //                                         className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`}
// // // // // // //                                         onClick={() => handleCompetencySelect('C')}
// // // // // // //                                         disabled={!canGrade}
// // // // // // //                                     >
// // // // // // //                                         <Award size={16} /> Competent (C)
// // // // // // //                                     </button>
// // // // // // //                                     <button
// // // // // // //                                         className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`}
// // // // // // //                                         onClick={() => handleCompetencySelect('NYC')}
// // // // // // //                                         disabled={!canGrade}
// // // // // // //                                     >
// // // // // // //                                         <AlertCircle size={16} /> Not Yet Competent
// // // // // // //                                     </button>
// // // // // // //                                 </div>
// // // // // // //                             </div>

// // // // // // //                             <div className="sr-overall-feedback">
// // // // // // //                                 <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
// // // // // // //                                 <textarea
// // // // // // //                                     className="sr-textarea"
// // // // // // //                                     rows={3}
// // // // // // //                                     style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: canGrade ? 'red' : '#cbd5e1' }}
// // // // // // //                                     placeholder={canGrade ? "Provide holistic feedback..." : "No remarks provided."}
// // // // // // //                                     value={overallFeedback}
// // // // // // //                                     disabled={!canGrade}
// // // // // // //                                     onChange={e => handleOverallFeedbackChange(e.target.value)}
// // // // // // //                                 />
// // // // // // //                             </div>

// // // // // // //                             {/* Assessor Record */}
// // // // // // //                             {hasBeenGraded && (
// // // // // // //                                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
// // // // // // //                                     <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
// // // // // // //                                     {assessorProfile?.signatureUrl ? (
// // // // // // //                                         <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
// // // // // // //                                     ) : (
// // // // // // //                                         <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // // // // // //                                     )}
// // // // // // //                                     <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName}</p>
// // // // // // //                                     <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
// // // // // // //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// // // // // // //                                 </div>
// // // // // // //                             )}

// // // // // // //                             {canGrade && (
// // // // // // //                                 <div className="sr-action-area">
// // // // // // //                                     <button className="sr-submit-btn" style={{ background: 'red' }} onClick={handleSubmitGrade} disabled={saving || !competency}>
// // // // // // //                                         {saving ? 'Processing...' : 'Apply Digital Signature & Finalise'}
// // // // // // //                                     </button>
// // // // // // //                                 </div>
// // // // // // //                             )}
// // // // // // //                         </div>
// // // // // // //                     ) : (
// // // // // // //                         /* 🚀 LOCKED STATE: Waiting for Facilitator */
// // // // // // //                         <div className="sr-summary-card sr-locked-card">
// // // // // // //                             <Lock size={28} />
// // // // // // //                             <h3>Assessor Grading</h3>
// // // // // // //                             <p>Awaiting Facilitator to complete Blue Pen pre-marking.</p>
// // // // // // //                         </div>
// // // // // // //                     )}

// // // // // // //                     {/* MODERATOR PANEL */}
// // // // // //                     {(hasBeenGraded || submission.status === 'moderated') ? (
// // // // // //                         <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
// // // // // //                             <h3 className="sr-summary-title" style={{ color: 'green' }}>QA Moderation Panel</h3>

// // // // // //                             {/* 🚀 Moderator QCTO Reminder */}
// // // // // //                             {canModerate && (
// // // // // //                                 <div className="sr-role-guide green">
// // // // // //                                     <Info size={16} />
// // // // // //                                     <div>
// // // // // //                                         <strong>Quality Assurance & Endorsement</strong><br />
// // // // // //                                         Your Green Pen evaluates the Assessor, not the learner. Use comments to instruct the Assessor on corrections before endorsing this script.
// // // // // //                                     </div>
// // // // // //                                 </div>
// // // // // //                             )}

// // // // // //                             <div className="sr-competency-section">
// // // // // //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderation Outcome</label>
// // // // // //                                 <div className="sr-comp-toggles">
// // // // // //                                     <button
// // // // // //                                         className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`}
// // // // // //                                         onClick={() => handleModOutcomeSelect('Endorsed')}
// // // // // //                                         disabled={!canModerate}
// // // // // //                                     >
// // // // // //                                         <ShieldCheck size={16} /> Endorse Grade
// // // // // //                                     </button>
// // // // // //                                     <button
// // // // // //                                         className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`}
// // // // // //                                         onClick={() => handleModOutcomeSelect('Returned')}
// // // // // //                                         disabled={!canModerate}
// // // // // //                                     >
// // // // // //                                         <AlertCircle size={16} /> Return to Assessor
// // // // // //                                     </button>
// // // // // //                                 </div>
// // // // // //                             </div>

// // // // // // //                             <div className="sr-overall-feedback">
// // // // // // //                                 <label className="sr-sidebar-label" style={{ color: 'green' }}>Moderator Feedback</label>
// // // // // // //                                 <textarea
// // // // // // //                                     className="sr-textarea"
// // // // // // //                                     rows={3}
// // // // // // //                                     style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }}
// // // // // // //                                     placeholder={canModerate ? "Notes for the assessor or internal QA..." : "No moderation feedback."}
// // // // // // //                                     value={modFeedback}
// // // // // // //                                     disabled={!canModerate}
// // // // // // //                                     onChange={e => handleModFeedbackChange(e.target.value)}
// // // // // // //                                 />
// // // // // // //                             </div>

// // // // // // //                             {canModerate && (
// // // // // // //                                 <div className="sr-action-area">
// // // // // // //                                     <button
// // // // // // //                                         className="sr-submit-btn"
// // // // // // //                                         style={{ background: 'green' }}
// // // // // // //                                         onClick={handleSubmitModeration}
// // // // // // //                                         disabled={saving || !modOutcome}
// // // // // // //                                     >
// // // // // // //                                         {saving ? 'Processing...' : 'Finalise QA & Endorse'}
// // // // // // //                                     </button>
// // // // // // //                                 </div>
// // // // // // //                             )}
// // // // // // //                         </div>
// // // // // // //                     ) : (
// // // // // // //                         /* 🚀 LOCKED STATE: Waiting for Assessor */
// // // // // // //                         <div className="sr-summary-card sr-locked-card">
// // // // // // //                             <Lock size={28} />
// // // // // // //                             <h3>QA Moderation</h3>
// // // // // // //                             <p>Awaiting Assessor to complete Red Pen official grading.</p>
// // // // // // //                         </div>
// // // // // // //                     )}

// // // // // // //                     {/* 🚀 OFFICIAL AUDIT TRAIL 🚀 */}
// // // // // // //                     <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
// // // // // // //                         <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}>
// // // // // // //                             <ShieldCheck size={18} color="#073f4e" /> Official Audit Trail
// // // // // // //                         </h3>

// // // // // // //                         {
// // // // // // //                             (submission.status === 'not_started' && !hasBeenGraded) && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>
// // // // // // //                         }

// // // // // // //                         {/* Learner Record */}
// // // // // // //                         {submission.status !== 'not_started' && (
// // // // // // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// // // // // // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
// // // // // // //                                 {learnerProfile?.signatureUrl ? (
// // // // // // //                                     <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// // // // // // //                                 ) : (
// // // // // // //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // // // // // //                                 )}
// // // // // // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
// // // // // // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</p>
// // // // // // //                             </div>
// // // // // // //                         )}

// // // // // // //                         {/* Assessor Record */}
// // // // // // //                         {hasBeenGraded && (
// // // // // // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
// // // // // // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
// // // // // // //                                 {assessorProfile?.signatureUrl ? (
// // // // // // //                                     <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// // // // // // //                                 ) : (
// // // // // // //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // // // // // //                                 )}
// // // // // // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName}</p>
// // // // // // //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
// // // // // // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
// // // // // // //                             </div>
// // // // // // //                         )}

// // // // // // //                         {/* Moderator Record */}
// // // // // // //                         {submission.status === 'moderated' && (
// // // // // // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1rem' }}>
// // // // // // //                                 <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation</p>
// // // // // // //                                 {moderatorProfile?.signatureUrl ? (
// // // // // // //                                     <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
// // // // // // //                                 ) : (
// // // // // // //                                     <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>
// // // // // // //                                 )}
// // // // // // //                                 <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{submission.moderation?.moderatorName}</p>
// // // // // // //                                 <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Outcome: {submission.moderation?.outcome}</p>
// // // // // // //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.moderation?.moderatedAt).toLocaleDateString()}</p>
// // // // // // //                             </div>
// // // // // // //                         )}
// // // // // // //                     </div>
// // // // // // //                 </aside>
// // // // // // //             </div>
// // // // // // //         </div>
// // // // // // //     );
// // // // // // // };

// // // // // // // // 🚀 HELPER COMPONENT (For single-file completeness)
// // // // // // // const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
// // // // // // //     // Pure CSS Pen color transformation
// // // // // // //     const filterMap: any = {
// // // // // // //         black: 'brightness(0)',
// // // // // // //         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
// // // // // // //         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
// // // // // // //         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
// // // // // // //     };

// // // // // // //     return (
// // // // // // //         <img
// // // // // // //             src={imageUrl}
// // // // // // //             alt="Signature"
// // // // // // //             style={{
// // // // // // //                 height: '60px',
// // // // // // //                 width: 'auto',
// // // // // // //                 maxWidth: '100%',
// // // // // // //                 objectFit: 'contain',
// // // // // // //                 marginBottom: '10px',
// // // // // // //                 filter: filterMap[color] || 'none'
// // // // // // //             }}
// // // // // // //         />
// // // // // // //     );
// // // // // // // };

