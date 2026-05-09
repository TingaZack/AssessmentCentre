// src/pages/FacilitatorDashboard/SubmissionReview/SubmissionReview.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, setDoc, deleteField, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    ArrowLeft, CheckCircle, AlertCircle,
    Clock, Award,
    ShieldCheck, Printer, Info, Lock, Loader2, Scale, Undo2,
    ShieldAlert, Unlock,
    FileArchive
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import './SubmissionReview.css';
import { PastAttemptsArchive } from '../../../components/dashboard/PastAttemptsArchive/PastAttemptsArchive';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';

import { createPortal } from 'react-dom';
import { RemediationModal, ResolveAppealModal, ReturnToLearnerModal } from './SubmissionReview/SubmissionReviewModals';
import { RenderBlocks, type CriterionResult, type GradeData } from './SubmissionReview/SubmissionReviewBlocks';
import moment from 'moment';

// ─── REUSABLE REVIEW STAGE CARD ───────────────────────────────────────────
const ReviewStageCard = ({
    colorTheme, title, status,
    lockedMessage, awaitingTitle, awaitingMessage,
    showScore, scoreAwarded, scoreMax, scorePct,
    activeControls,
    feedbackLabel, feedbackValue, onFeedbackChange, feedbackPlaceholder,
    signatureLabel, signatureUrl, signatureName, signatureDate, signatureMeta, signatureTagline,
    onSubmit, submitLabel, isSaving
}: any) => {
    const colorHex = colorTheme === 'blue' ? 'blue' : colorTheme === 'red' ? 'red' : '#22c55e';
    const colorHexDark = colorTheme === 'blue' ? 'blue' : colorTheme === 'red' ? 'red' : '#15803d';
    const bgLight = colorTheme === 'blue' ? '#eff6ff' : colorTheme === 'red' ? '#fef2f2' : '#f0fdf4';

    const themeVar = colorTheme === 'blue' ? 'blue' : `var(--mlab-${colorTheme})`;

    return (
        <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: `4px solid ${themeVar}` }}>
            <h3 className="sr-summary-title" style={{ color: themeVar }}>{title}</h3>

            {status === 'locked' && (
                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1', marginTop: '1rem' }}>
                    <Lock size={24} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                    <strong style={{ color: '#334155', display: 'block', fontSize: '0.9rem' }}>Locked</strong>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>{lockedMessage}</p>
                </div>
            )}

            {status === 'awaiting' && (
                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1', marginTop: '1rem' }}>
                    <Clock size={24} color={colorHex} style={{ margin: '0 auto 10px' }} />
                    <strong style={{ color: colorHexDark, display: 'block', fontSize: '0.9rem' }}>{awaitingTitle}</strong>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>{awaitingMessage}</p>
                </div>
            )}

            {(status === 'active' || status === 'done') && (
                <>
                    {showScore && (
                        <div className="sr-score-display" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                            <div className="sr-score-circle" style={{ borderColor: themeVar }}>
                                <span className="sr-score-val" style={{ color: themeVar }}>{scoreAwarded}</span>
                                <span className="sr-score-max" style={{ color: themeVar }}>/ {scoreMax}</span>
                            </div>
                            <div className="sr-score-percent" style={{ color: themeVar }}>{scorePct}%</div>
                        </div>
                    )}

                    {activeControls}

                    <div className="sr-overall-feedback" style={{ marginTop: showScore || activeControls ? '1.5rem' : '1rem' }}>
                        <label className="sr-sidebar-label" style={{ color: themeVar }}>{feedbackLabel}</label>
                        {status === 'active' ? (
                            <textarea
                                className="sr-textarea" rows={3}
                                style={{ color: themeVar, fontStyle: 'italic', borderColor: themeVar, background: 'whitesmoke', fontWeight: 500 }}
                                placeholder={feedbackPlaceholder}
                                value={feedbackValue}
                                onChange={e => onFeedbackChange(e.target.value)}
                            />
                        ) : (
                            <div style={{ background: bgLight, padding: '10px', borderRadius: '6px', color: colorHexDark, fontStyle: 'italic', fontSize: '0.85rem', borderLeft: `3px solid ${colorHex}`, whiteSpace: 'pre-wrap' }}>
                                {feedbackValue || "No overall remarks provided."}
                            </div>
                        )}
                    </div>

                    {status === 'active' ? (
                        <div className="sr-action-area" style={{ marginTop: '1rem' }}>
                            <button className="sr-submit-btn" style={{ background: themeVar }} onClick={onSubmit} disabled={isSaving}>{submitLabel}</button>
                        </div>
                    ) : (
                        <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
                            <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: themeVar, textTransform: 'uppercase' }}>{signatureLabel}</p>
                            {signatureUrl ? (
                                <img src={signatureUrl} alt="Signature" style={{ height: '40px', objectFit: 'contain', filter: `brightness(0) saturate(100%) ${colorTheme === 'blue' ? 'invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)' : colorTheme === 'red' ? 'invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)' : 'invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'}`, marginBottom: '8px' }} />
                            ) : (
                                <div style={{ height: '40px', color: themeVar, display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>
                            )}
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: themeVar }}>{signatureName}</p>
                            {signatureMeta && <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: themeVar }}>{signatureMeta}</p>}
                            {signatureDate && <p style={{ margin: 0, fontSize: '0.75rem', color: themeVar }}><Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{signatureDate}</p>}
                            {signatureTagline && <div className="sr-sig-line" style={{ borderTop: `1px dashed ${themeVar}`, paddingTop: '6px', marginTop: '6px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: themeVar }}>{signatureTagline}</div>}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────
export const SubmissionReview: React.FC = () => {
    const { submissionId } = useParams<{ submissionId: string }>();
    const navigate = useNavigate();
    const { user } = useStore();
    const toast = useToast();

    // FILTERS FOR PDF PRINT
    const filterBlack = { height: '50px', objectFit: 'contain' as const, filter: 'brightness(0)', marginBottom: '8px' };
    const filterBlue = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)', marginBottom: '8px' };
    const filterRed = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)', marginBottom: '8px' };
    const filterGreen = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)', marginBottom: '8px' };

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
    const [showReturnToLearnerModal, setShowReturnToLearnerModal] = useState(false);
    const [showResolveAppealModal, setShowResolveAppealModal] = useState(false);

    const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sessionStartRef = useRef<number>(performance.now());
    const initialFacTimeRef = useRef<number>(0);
    const initialAssTimeRef = useRef<number>(0);
    const initialModTimeRef = useRef<number>(0);

    const currentStatus = String(submission?.status || '').toLowerCase();
    const currentAttempt = submission?.attemptNumber || 1;

    const hasChecklists = assessment?.blocks?.some((b: any) => b.type === 'checklist');
    const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
    const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
    const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
    const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;

    const isPureKnowledge = hasKnowledgeBlocks && !hasChecklists && !hasWorkplace && !hasLogbook;

    const isAppealUpheld = submission?.appeal?.status === 'upheld';

    const isMissed = currentStatus === 'missed';
    const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
    const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
    const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
    const isModDone = ['moderated', 'appealed'].includes(currentStatus);
    const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';

    // ── ROLE FLAGS ───────────────────────────────────────────────────────────
    const isMentor = user?.role === 'mentor';
    const isFacilitator = user?.role === 'facilitator';
    const isFacilitatorOrMentor = isFacilitator || isMentor;
    const isAssessor = user?.role === 'assessor';
    const isModerator = user?.role === 'moderator';
    const isAdmin = user?.role === 'admin';

    const savedFacRole = submission?.grading?.facilitatorRole;
    const displayFacRole = isFacDone ? savedFacRole : user?.role;

    const facPanelTitle = displayFacRole === 'mentor' ? 'Workplace Mentor Verification' : `Facilitator Pre-Marking`;
    const facRemarksLabel = displayFacRole === 'mentor' ? 'Supervisor Comments' : `Facilitator Remarks`;
    const facSubmitLabel = displayFacRole === 'mentor' ? 'Verify & Send to Assessor' : 'Send to Assessor';
    const facReadOnlyLabel = displayFacRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Mark';

    const canFacilitatorMark = !isAdmin && isFacilitatorOrMentor && (
        currentStatus === 'submitted' ||
        (!isPureKnowledge && ['not_started', 'in_progress'].includes(currentStatus))
    );

    const canGrade = !isAdmin && isAssessor && (currentStatus === 'facilitator_reviewed' || currentStatus === 'returned' || currentStatus === 'missed');
    const canModerate = !isAdmin && isModerator && currentStatus === 'graded';
    const canReturnToLearner = isMentor && ['submitted', 'in_progress'].includes(currentStatus);

    // ─── DATA FETCHING ──────────────────────────────────────────────────────
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

                let lData = null;
                const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || subData.authUid || subData.learnerId;

                const learnerRef = doc(db, 'learners', subData.learnerId || targetLearnerUid);
                const learnerSnap = await getDoc(learnerRef);

                if (learnerSnap.exists()) {
                    lData = learnerSnap.data();
                } else {
                    const fallbackQ = query(collection(db, 'learners'), where('authUid', '==', targetLearnerUid));
                    const fallbackSnap = await getDocs(fallbackQ);
                    if (!fallbackSnap.empty) {
                        lData = fallbackSnap.docs[0].data();
                    } else {
                        const fallbackQ2 = query(collection(db, 'learners'), where('idNumber', '==', subData.learnerId));
                        const fallbackSnap2 = await getDocs(fallbackQ2);
                        if (!fallbackSnap2.empty) lData = fallbackSnap2.docs[0].data();
                    }
                }

                if (lData) {
                    setLearner(lData);
                    setLearnerProfile(lData);
                }

                if (subData.grading?.gradedBy) {
                    const assProfSnap = await getDoc(doc(db, 'users', subData.grading.gradedBy));
                    if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
                }

                if (subData.moderation?.moderatedBy) {
                    const modProfSnap = await getDoc(doc(db, 'users', subData.moderation.moderatedBy));
                    if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
                }

                const facId = subData.latestCoachingLog?.facilitatorId || subData.grading?.facilitatorId;
                if (facId) {
                    const facProfSnap = await getDoc(doc(db, 'users', facId));
                    if (facProfSnap.exists()) setFacilitatorProfile(facProfSnap.data());
                }

                const historyRef = collection(db, 'learner_submissions', submissionId, 'history');
                const historySnapshotsRes = await getDocs(query(historyRef));
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
                        } else if (block.type === 'text' || block.type === 'task') {
                            fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
                        } else if (block.type === 'checklist') {
                            const critInit = block.criteria?.map(() => ({ status: null, comment: '', startTime: '', endTime: '' })) || [];
                            fresh[block.id] = { score: 0, feedback: '', isCorrect: null, criteriaResults: critInit, obsDate: '', obsStartTime: '', obsEndTime: '', obsDeclaration: false };
                        } else if (block.type === 'logbook') {
                            fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
                        } else if (block.type === 'qcto_workplace') {
                            const actInit = block.workActivities?.map(() => ({ status: null, comment: '' })) || [];
                            fresh[block.id] = { score: 0, feedback: '', isCorrect: null, activityResults: actInit, obsDate: '', obsStartTime: '', obsEndTime: '', obsDeclaration: false };
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
                    if (['facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(dbStatus)) {
                        aBreakdown = generateFreshBreakdown(false);
                        assData.blocks?.forEach((b: any) => {
                            if ((b.type === 'checklist' || b.type === 'qcto_workplace') && fBreakdown[b.id]) {
                                aBreakdown[b.id] = { ...JSON.parse(JSON.stringify(fBreakdown[b.id])), score: 0, feedback: '', isCorrect: null };
                            }
                        });
                    } else {
                        aBreakdown = {};
                    }
                }
                setAssBreakdown(aBreakdown);

                if (!mBreakdown || Object.keys(mBreakdown).length === 0) {
                    if (['graded', 'moderated', 'returned', 'appealed'].includes(dbStatus)) {
                        mBreakdown = generateFreshBreakdown(false);
                        assData.blocks?.forEach((b: any) => {
                            if ((b.type === 'checklist' || b.type === 'qcto_workplace') && aBreakdown[b.id]) {
                                mBreakdown[b.id] = { ...JSON.parse(JSON.stringify(aBreakdown[b.id])), score: 0, feedback: '', isCorrect: null };
                            }
                        });
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

    // ─── TIME TRACKING ──────────────────────────────────────────────────────
    const getFacTime = () => initialFacTimeRef.current + (canFacilitatorMark ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
    const getAssTime = () => initialAssTimeRef.current + (canGrade ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
    const getModTime = () => initialModTimeRef.current + (canModerate ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);

    // ─── FACILITATOR OVERRIDES & ZERO GRADE ─────────────────────────────────

    const executeZeroGrade = async () => {
        if (!window.confirm("Are you sure you want to assign a Zero-Grade for this unexcused absence?")) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                status: 'graded',
                marks: 0,
                competency: 'NYC',
                'grading.assessorOverallFeedback': 'Unexcused Absence: Learner failed to attend the scheduled assessment.',
                'grading.gradedBy': user?.uid,
                'grading.assessorName': user?.fullName,
                'grading.assessorSignatureUrl': user?.signatureUrl,
                'grading.assessorRegNumber': user?.assessorRegNumber || 'Pending Reg',
                'grading.gradedAt': new Date().toISOString(),
                lastStaffEditAt: new Date().toISOString()
            });
            toast.success("Zero-Grade officially assigned.");
            setTimeout(() => window.location.reload(), 1000);
        } catch (e) {
            toast.error("Failed to apply unexcused zero grade.");
        } finally {
            setSaving(false);
        }
    };

    const handleReopenMissedAssessment = async () => {
        if (!window.confirm("Are you sure you want to excuse this absence and reopen the assessment? The learner will be able to take it immediately.")) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                status: 'not_started',
                overrideUnlock: true,
                lastStaffEditAt: new Date().toISOString(),
                systemNote: 'Absence Excused: Assessment reopened by Facilitator/Admin.'
            });
            setSubmission((prev: any) => ({ ...prev, status: 'not_started', overrideUnlock: true }));
            toast.success("Assessment reopened successfully!");
        } catch (e) {
            toast.error("Failed to reopen assessment.");
        } finally {
            setSaving(false);
        }
    };

    const grantExtraTime = async (minutes: number) => {
        setSaving(true);
        try {
            const subRef = doc(db, 'learner_submissions', submissionId!);
            await updateDoc(subRef, {
                extraTimeGranted: (submission.extraTimeGranted || 0) + minutes,
                lastStaffEditAt: new Date().toISOString()
            });
            setSubmission((prev: any) => ({
                ...prev,
                extraTimeGranted: (prev.extraTimeGranted || 0) + minutes
            }));
            toast.success(`Added ${minutes} minutes to the learner's clock!`);
        } catch (error) {
            toast.error("Failed to grant extra time.");
        } finally {
            setSaving(false);
        }
    };

    const toggleDeferredAccess = async () => {
        setSaving(true);
        const newState = !submission.overrideUnlock;
        try {
            const subRef = doc(db, 'learner_submissions', submissionId!);
            const payload: any = {
                overrideUnlock: newState,
                lastStaffEditAt: new Date().toISOString()
            };

            await updateDoc(subRef, payload);
            setSubmission((prev: any) => ({
                ...prev,
                overrideUnlock: newState
            }));
            toast.success(newState ? "Deferred access granted. Assessment unlocked!" : "Deferred access revoked. Assessment locked.");
        } catch (error) {
            toast.error("Failed to update access settings.");
        } finally {
            setSaving(false);
        }
    };

    // ─── AUTO‑SAVE ──────────────────────────────────────────────────────────
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

    // ─── BREAKDOWN GETTER/SETTER ────────────────────────────────────────────
    const getActiveBreakdownData = (blockId: string) => {
        if (canFacilitatorMark) return { ...facBreakdown[blockId] };
        if (canGrade) return { ...assBreakdown[blockId] };
        if (canModerate) return { ...modBreakdown[blockId] };
        return null;
    };

    const setActiveBreakdownData = (blockId: string, newData: GradeData) => {
        if (canFacilitatorMark) {
            const next = { ...facBreakdown, [blockId]: newData };
            setFacBreakdown(next); triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canGrade) {
            const next = { ...assBreakdown, [blockId]: newData };
            setAssBreakdown(next); triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canModerate) {
            const next = { ...modBreakdown, [blockId]: newData };
            setModBreakdown(next); triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        }
    };

    // ─── HANDLERS (passed to RenderBlocks) ──────────────────────────────────
    const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        active.isCorrect = isCorrect;
        active.score = isCorrect ? maxMarks : 0;
        setActiveBreakdownData(blockId, active);
    };

    const handleScoreChange = (blockId: string, score: number, max: number) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        active.score = Math.min(Math.max(0, score), max);
        setActiveBreakdownData(blockId, active);
    };

    const handleFeedbackChange = (blockId: string, feedback: string) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        active.feedback = feedback;
        setActiveBreakdownData(blockId, active);
    };

    const handleCriterionChange = (blockId: string, index: number, field: keyof CriterionResult, value: any) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        const crits = [...(active.criteriaResults || [])];
        if (!crits[index]) crits[index] = { status: null, comment: '', startTime: '', endTime: '' };
        crits[index] = { ...crits[index], [field]: value };
        active.criteriaResults = crits;
        const block = assessment?.blocks?.find((b: any) => b.id === blockId);
        const total = block?.criteria?.length || 0;
        if (total > 0 && crits.length >= total && crits.slice(0, total).every((c: any) => c?.status)) {
            active.isCorrect = crits.slice(0, total).every((c: any) => c?.status === 'C');
        }
        setActiveBreakdownData(blockId, active);
    };

    const handleActivityStatusChange = (blockId: string, index: number, status: 'C' | 'NYC') => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        const activities = [...(active.activityResults || [])];
        if (!activities[index]) activities[index] = { status: null, comment: '' };
        activities[index].status = status;
        active.activityResults = activities;
        const block = assessment?.blocks?.find((b: any) => b.id === blockId);
        const total = block?.workActivities?.length || 0;
        if (total > 0 && activities.length >= total && activities.slice(0, total).every((a: any) => a?.status)) {
            active.isCorrect = activities.slice(0, total).every((a: any) => a?.status === 'C');
        }
        setActiveBreakdownData(blockId, active);
    };

    const handleActivityCommentChange = (blockId: string, index: number, comment: string) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        const activities = [...(active.activityResults || [])];
        if (!activities[index]) activities[index] = { status: null, comment: '' };
        activities[index].comment = comment;
        active.activityResults = activities;
        setActiveBreakdownData(blockId, active);
    };

    const handleGlobalChecklistChange = (blockId: string, field: 'obsDate' | 'obsStartTime' | 'obsEndTime' | 'obsDeclaration', value: any) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        (active as any)[field] = value;
        setActiveBreakdownData(blockId, active);
    };

    const handleSetToNow = (blockId: string, field: 'obsDate' | 'obsStartTime' | 'obsEndTime') => {
        if (field === 'obsDate') handleGlobalChecklistChange(blockId, field, moment().format('YYYY-MM-DD'));
        else handleGlobalChecklistChange(blockId, field, moment().format('HH:mm'));
    };

    const handleFacOverallFeedbackChange = (val: string) => { if (!canFacilitatorMark) return; setFacOverallFeedback(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome); };
    const handleAssOverallFeedbackChange = (val: string) => { if (!canGrade) return; setAssOverallFeedback(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome); };
    const handleModFeedbackChange = (val: string) => { if (!canModerate) return; setModFeedback(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome); };
    const handleCompetencySelect = (val: 'C' | 'NYC') => { if (!canGrade) return; setCompetency(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome); };
    const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => { if (!canModerate) return; setModOutcome(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val); };

    // ─── RETURN TO LEARNER ─────────────────────────────────────────────────
    const executeReturnToLearner = async (reason: string) => {
        setShowReturnToLearnerModal(false);
        setSaving(true);
        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                status: 'in_progress',
                mentorReturnReason: reason,
                mentorReturnedAt: new Date().toISOString(),
                mentorReturnedBy: user?.uid,
                mentorReturnedByName: user?.fullName,
                lastStaffEditAt: new Date().toISOString(),
            });
            toast.success("Logbook returned to learner for correction.");
            setTimeout(() => navigate(-1), 1500);
        } catch (err) {
            toast.error("Failed to return logbook to learner.");
        } finally {
            setSaving(false);
        }
    };

    // ─── REMEDIATION ───────────────────────────────────────────────────────
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
                status: 'not_started',
                startedAt: deleteField(),
                competency: deleteField(),
                grading: deleteField(),
                moderation: deleteField(),
                submittedAt: deleteField(),
                learnerDeclaration: deleteField(),
                attemptNumber: (submission.attemptNumber || 1) + 1,
                lastStaffEditAt: new Date().toISOString(),
                latestCoachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName, acknowledged: false }
            });
            toast.success("Workbook grading cleared and unlocked for learner!");
            setTimeout(() => navigate(-1), 1500);
        } catch (err) { toast.error("Failed to unlock for remediation."); } finally { setSaving(false); }
    };

    // ─── RESOLVE APPEAL ────────────────────────────────────────────────────
    const executeAppealResolution = async (decision: 'overturn' | 'new_attempt' | 'reject', notes: string) => {
        setShowResolveAppealModal(false);
        setSaving(true);
        try {
            const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
            await setDoc(historyRef, {
                ...submission, archivedAt: new Date().toISOString(), snapshotReason: `Appeal Resolution: ${decision}`
            });

            const updatePayload: any = {
                'appeal.status': decision === 'overturn' || decision === 'new_attempt' ? 'upheld' : 'rejected',
                'appeal.resolutionNotes': notes,
                'appeal.resolvedBy': user?.uid,
                'appeal.resolvedByName': user?.fullName,
                'appeal.resolvedAt': new Date().toISOString(),
                lastStaffEditAt: new Date().toISOString()
            };

            if (decision === 'overturn') {
                updatePayload.status = 'moderated';
                updatePayload.competency = 'C';
                updatePayload['moderation.outcome'] = 'Endorsed';
                updatePayload['moderation.feedback'] = `APPEAL UPHELD: ${notes}`;
            } else if (decision === 'new_attempt') {
                updatePayload.status = 'not_started';
                updatePayload.startedAt = deleteField();
                updatePayload.competency = deleteField();
                updatePayload.grading = deleteField();
                updatePayload.moderation = deleteField();
                updatePayload.submittedAt = deleteField();
                updatePayload.learnerDeclaration = deleteField();
                updatePayload.attemptNumber = (submission.attemptNumber || 1) + 1;
            } else if (decision === 'reject') {
                updatePayload.status = 'moderated';
            }

            await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
            toast.success("Appeal resolved successfully!");
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            toast.error("Failed to resolve appeal.");
        } finally {
            setSaving(false);
        }
    };

    // ─── TOTALS ────────────────────────────────────────────────────────────
    const getTotals = (breakdown: Record<string, GradeData>) => {
        const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
        const max = assessment?.totalMarks || 0;
        const pct = max > 0 ? Math.round((score / max) * 100) : 0;
        return { score, max, pct };
    };

    const facTotals = getTotals(facBreakdown);
    const assTotals = getTotals(assBreakdown);
    const modTotals = getTotals(modBreakdown);


    const showAssessorPanel = true;
    const showModeratorPanel = true;

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
            } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type) && currentSectionId) {
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

    // ─── VALIDATION ────────────────────────────────────────────────────────
    const validateMentorVerification = (): string | null => {
        if (!assessment?.blocks) return null;
        for (const block of assessment.blocks) {
            const grade = facBreakdown[block.id];
            if (block.type === 'checklist') {
                const criteria = block.criteria || [];
                const results = grade?.criteriaResults || [];
                for (let i = 0; i < criteria.length; i++) {
                    if (!results[i]?.status) {
                        return `Please select "Observed ✓" or "Not Observed ✗" for every criterion in the checklist "${block.title}". Item ${i + 1} is still unverified.`;
                    }
                }
                if (block.requireObservationDeclaration !== false && !grade?.obsDeclaration) {
                    return `Please tick the verification declaration at the bottom of the checklist "${block.title}" before submitting.`;
                }
            }
            if (block.type === 'qcto_workplace') {
                const activities = block.workActivities || [];
                const results = grade?.activityResults || [];
                for (let i = 0; i < activities.length; i++) {
                    if (!results[i]?.status) {
                        return `Please select "Verified ✓" or "Not Verified ✗" for every Work Activity in "${block.weCode} – ${block.weTitle}". Activity ${i + 1} (${activities[i]?.code || `#${i + 1}`}) is still unverified.`;
                    }
                }
                if (block.requireObservationDeclaration !== false && !grade?.obsDeclaration) {
                    return `Please tick the workplace verification sign-off declaration at the bottom of "${block.weCode} – ${block.weTitle}" before submitting.`;
                }
            }
        }
        return null;
    };

    const validateAllMarked = (breakdown: Record<string, GradeData>, isModerating: boolean = false) => {
        if (!assessment?.blocks) return true;
        const isAssessorGrading = canGrade;
        const unmarkedCount = assessment.blocks.filter((block: any) => {
            const grade = breakdown[block.id];

            if (isWorkplaceModule && (isAdmin || isFacilitator) && !isModerating) {
                return false;
            }

            if (['mcq', 'text', 'task'].includes(block.type)) {
                return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
            }

            if (block.type === 'checklist') {
                const declarationRequired = !isModerating && block.requireObservationDeclaration
                    && !grade?.obsDeclaration
                    && !(isAssessorGrading && savedFacRole === 'mentor');
                if (declarationRequired) return true;
                const crits = grade?.criteriaResults || [];
                const total = block.criteria?.length || 0;
                for (let i = 0; i < total; i++) {
                    if (!crits[i] || !crits[i].status) return true;
                }
                const allHaveStatus = crits.slice(0, total).every((c: any) => c?.status);
                if (!allHaveStatus) return true;
                return false;
            }

            if (block.type === 'qcto_workplace') {
                const declarationRequired = !isModerating && block.requireObservationDeclaration
                    && !grade?.obsDeclaration
                    && !(isAssessorGrading && savedFacRole === 'mentor');
                if (declarationRequired) return true;

                if (isMentor) return false;

                const activities = grade?.activityResults || [];
                const total = block.workActivities?.length || 0;
                for (let i = 0; i < total; i++) {
                    if (!activities[i] || !activities[i].status) return true;
                }
                const allHaveStatus = activities.slice(0, total).every((a: any) => a?.status);
                if (!allHaveStatus) return true;
                return false;
            }

            return false;
        }).length;
        return unmarkedCount === 0;
    };

    // ─── SUBMIT HANDLERS ───────────────────────────────────────────────────
    const triggerSubmitFacilitator = () => {
        if (isMentor) {
            const mentorValidationError = validateMentorVerification();
            if (mentorValidationError) {
                return setModalConfig({
                    isOpen: true, type: 'warning', title: 'Incomplete Verification',
                    message: mentorValidationError,
                    confirmText: 'Got it', onConfirm: () => setModalConfig(null)
                });
            }
            if (!facOverallFeedback.trim()) {
                return setModalConfig({
                    isOpen: true, type: 'warning', title: 'Supervisor Comments Required',
                    message: 'Please add your overall Supervisor Comments before verifying this logbook.',
                    confirmText: 'Got it', onConfirm: () => setModalConfig(null)
                });
            }
        } else {
            if (!validateAllMarked(facBreakdown, false)) {
                return setModalConfig({
                    isOpen: true, type: 'warning', title: 'Incomplete Marking',
                    message: 'You must evaluate every question and fully complete all checklists and workplace checkpoints (including declarations) before submitting.',
                    confirmText: 'Got it', onConfirm: () => setModalConfig(null)
                });
            }
            if (!facOverallFeedback.trim()) {
                return setModalConfig({
                    isOpen: true, type: 'warning', title: 'Missing Remarks',
                    message: 'You must provide Overall Facilitator Remarks before sending this script forward.',
                    confirmText: 'Got it', onConfirm: () => setModalConfig(null)
                });
            }
        }

        let newStatus = 'facilitator_reviewed';
        let confirmTitle = isWorkplaceModule ? 'Complete Mentor Verification?' : 'Complete Pre-Marking?';
        let confirmMessage = isWorkplaceModule ? 'This will finalize your verification and send the logbook to the Assessor.' : 'This will finalize your feedback and send the workbook to the Assessor.';
        let confirmBtnText = 'Send to Assessor';

        if (['not_started', 'in_progress'].includes(currentStatus)) {
            if (hasChecklists || hasWorkplace) {
                newStatus = 'awaiting_learner_signoff';
                confirmTitle = isWorkplaceModule ? 'Request Learner Sign-off?' : 'Request Learner Sign-off?';
                confirmMessage = isWorkplaceModule
                    ? 'This will save your verification and prompt the learner to log in, review your supervisor comments, and apply their signature before the logbook goes to the Assessor.'
                    : 'This will save your practical observation and prompt the learner to log in, review your feedback, and officially sign off before it goes to the Assessor.';
                confirmBtnText = isWorkplaceModule ? 'Save & Request Learner Signature' : 'Save & Request Sign-off';
            } else {
                confirmTitle = isWorkplaceModule ? 'Force Verify?' : 'Force Submission?';
                confirmMessage = isWorkplaceModule
                    ? 'The learner has not formally submitted yet. Verifying now will lock the logbook for the learner and pass it directly to the Assessor. Proceed?'
                    : 'The learner has not submitted this workbook yet. Finalising your marking now will lock the workbook and pass it to the Assessor. Proceed?';
                confirmBtnText = isWorkplaceModule ? 'Verify & Force Submit' : 'Force Submit & Send';
            }
        }

        setModalConfig({
            isOpen: true, type: 'info', title: confirmTitle, message: confirmMessage, confirmText: confirmBtnText,
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: newStatus,
                        'grading.facilitatorBreakdown': facBreakdown,
                        'grading.facilitatorOverallFeedback': facOverallFeedback,
                        'grading.facilitatorId': user?.uid,
                        'grading.facilitatorName': user?.fullName,
                        'grading.facilitatorRole': user?.role,
                        'grading.facilitatorSignatureUrl': user?.signatureUrl,
                        'grading.facilitatorReviewedAt': new Date().toISOString(),
                        'grading.facilitatorTimeSpent': getFacTime()
                    });
                    if (newStatus === 'awaiting_learner_signoff') {
                        toast.success(isWorkplaceModule ? "Verification saved! Learner has been requested to sign the logbook." : "Observation saved! Learner has been requested to sign off.");
                    } else {
                        toast.success(isWorkplaceModule ? "Logbook verified and passed to Assessor!" : "Script marked and passed to Assessor!");
                    }
                    setTimeout(() => navigate(-1), 2000);
                } catch (error) { toast.error("Failed to save."); } finally { setSaving(false); }
            }, onCancel: () => setModalConfig(null)
        });
    };

    const triggerSubmitGrade = () => {
        if (!validateAllMarked(assBreakdown, false)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Grading', message: 'You must evaluate every question and fully complete all checklists and workplace checkpoints (including declarations) before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!competency) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a Final Competency (C or NYC) before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!assOverallFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Assessor Remarks justifying your final outcome before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

        setModalConfig({
            isOpen: true, type: 'warning', title: 'Finalise Grade?', message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.', confirmText: 'Apply Signature & Submit',
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: 'graded', marks: assTotals.score, competency,
                        'grading.assessorBreakdown': assBreakdown, 'grading.assessorOverallFeedback': assOverallFeedback,
                        'grading.gradedBy': user?.uid, 'grading.assessorName': user?.fullName,
                        'grading.assessorSignatureUrl': user?.signatureUrl,
                        'grading.assessorRegNumber': user?.assessorRegNumber || 'Pending Reg',
                        'grading.gradedAt': new Date().toISOString(), 'grading.assessorTimeSpent': getAssTime()
                    });
                    toast.success("Workbook graded and signed successfully!"); setTimeout(() => window.location.reload(), 500);
                } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
            }, onCancel: () => setModalConfig(null)
        });
    };

    const triggerSubmitModeration = () => {
        if (!modOutcome) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Decision', message: 'You must select Endorse or Return to Assessor before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (modOutcome === 'Returned' && !modFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Green Pen Instructions Required', message: 'You must provide Green Pen instructions explaining what the Assessor needs to fix before this can be returned.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!isWorkplaceModule && !validateAllMarked(modBreakdown, true)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete QA', message: 'You must verify every question and fully check all blocks before endorsing.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

        setModalConfig({
            isOpen: true, type: 'info',
            title: modOutcome === 'Returned' ? 'Return to Assessor?' : 'Endorse & Finalise?',
            message: modOutcome === 'Returned'
                ? 'This will return the workbook to the Assessor with your Green Pen instructions. The Assessor must address your concerns before re-submitting.'
                : 'This will apply your Green Pen signature and endorse the Assessor\'s judgment. The learner\'s result will be locked in for the QCTO verifier.',
            confirmText: modOutcome === 'Returned' ? 'Confirm Return' : 'Confirm Endorsement',
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: newStatus, 'moderation.breakdown': modBreakdown, 'moderation.outcome': modOutcome,
                        'moderation.feedback': modFeedback, 'moderation.moderatedBy': user?.uid,
                        'moderation.moderatorName': user?.fullName,
                        'moderation.moderatorSignatureUrl': user?.signatureUrl,
                        'moderation.moderatorRegNumber': user?.assessorRegNumber || 'Pending Reg',
                        'moderation.moderatedAt': new Date().toISOString(), 'moderation.timeSpent': getModTime()
                    });
                    toast.success("Moderation saved successfully!"); setTimeout(() => navigate(-1), 1000);
                } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
            }, onCancel: () => setModalConfig(null)
        });
    };

    if (loading) return (
        <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div className="ap-spinner" />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}> Loading Record...</span>
            </div>
        </div>
    );

    if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

    const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');
    const printInkColor = isModDone ? 'green' : (isAssDone ? 'red' : 'blue');
    const canPrint = !['not_started', 'in_progress', 'missed'].includes(currentStatus);

    // ─── STATUS CARD DETERMINATION LOGIC ──────────────────────────────────────
    const getFacilitatorStatus = () => {
        if (isFacDone) return 'done';
        if (canFacilitatorMark) return 'active';
        if (isAwaitingSignoff) return 'awaiting';
        if (['not_started', 'in_progress', 'missed'].includes(currentStatus)) return 'locked';
        return 'awaiting';
    };

    const getAssessorStatus = () => {
        if (isAssDone) return 'done';
        if (canGrade) return 'active';
        if (['not_started', 'in_progress', 'submitted', 'awaiting_learner_signoff'].includes(currentStatus)) return 'locked';
        return 'awaiting';
    };

    const getModeratorStatus = () => {
        if (isModDone) return 'done';
        if (canModerate) return 'active';
        if (currentStatus !== 'graded') return 'locked';
        return 'awaiting';
    };

    const facPanelStatus = getFacilitatorStatus();
    const assPanelStatus = getAssessorStatus();
    const modPanelStatus = getModeratorStatus();

    // ─── JSX RETURN ─────────────────────────────────────────────────────────
    return (
        <div className="sr-root animate-fade-in" style={{ width: '100%', position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* WRAPPED IN CREATE PORTAL */}
            {modalConfig && modalConfig.isOpen && createPortal(
                <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} onClose={modalConfig.onConfirm} onCancel={modalConfig.onCancel} />,
                document.body
            )}

            {/* WRAPPED IN CREATE PORTAL */}
            {showRemediationModal && createPortal(
                <RemediationModal submissionTitle={submission.title} attemptNumber={currentAttempt} onClose={() => setShowRemediationModal(false)} onSubmit={executeRemediation} />,
                document.body
            )}

            {/* WRAPPED IN CREATE PORTAL */}
            {showReturnToLearnerModal && createPortal(
                <ReturnToLearnerModal onClose={() => setShowReturnToLearnerModal(false)} onSubmit={executeReturnToLearner} />,
                document.body
            )}

            {/* WRAPPED IN CREATE PORTAL */}
            {showResolveAppealModal && createPortal(
                <ResolveAppealModal appealReason={submission.appeal?.reason || ''} onClose={() => setShowResolveAppealModal(false)} onSubmit={executeAppealResolution} />,
                document.body
            )}

            {/* TOPBAR */}
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
                        {/* APPEAL GRANTED GLOBAL BADGE */}
                        {isAppealUpheld && (
                            <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: '#22c55e', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <Scale size={12} /> Appeal Granted
                            </span>
                        )}
                        {isMentor && (
                            <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: '#0284c7', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', fontFamily: 'var(--font-heading)' }}>
                                MENTOR VIEW
                            </span>
                        )}
                    </h1>
                </div>
                <div className="ap-player-topbar__right">
                    {/* OPEN BOOK PDF BUTTON IN GRADER TOPBAR */}
                    {assessment?.isOpenBook && assessment?.referenceManualUrl && (
                        <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')} title="Open Reference Manual">
                            <FileArchive size={13} /> View Manual
                        </button>
                    )}

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

            {/* PRINT WRAP */}
            <div className="sr-print-wrap">
                {/* Cover pages */}
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
                                        <tr key={idx}><td>{topic.code ? <strong>{topic.code}: </strong> : ''}{topic.title || topic.name}</td><td style={{ width: '15%' }}>{topic.weight || topic.percentage}%</td></tr>
                                    ))
                                    : assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
                                        const secTotal = sectionTotals[sec.id]?.total || 0;
                                        const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
                                        return <tr key={idx}><td><strong>Section {idx + 1}: </strong>{sec.title}</td><td style={{ width: '15%' }}>{secTotal > 0 ? `${pct}%` : '—'}</td></tr>;
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

                    {/* OFFICIAL REMEDIATION RECORD (PRINT ONLY) */}
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
                                    {(submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl) ? (
                                        <img src={submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" style={filterBlue} />
                                    ) : <div className="sr-sig-no-image" style={{ color: 'blue', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
                                    <strong style={{ color: 'blue' }}>{submission.latestCoachingLog.facilitatorName}</strong>
                                    <em style={{ color: 'blue' }}>Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</em>
                                    <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>Coaching Conducted</div>
                                </div>
                                {/* Learner Sig */}
                                <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
                                    <span style={{ color: 'black' }}>Learner Acknowledgement</span>
                                    {submission.latestCoachingLog.acknowledged ? (
                                        <>
                                            {(submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl) ? (
                                                <img src={submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl} alt="Learner Signature" style={filterBlack} />
                                            ) : <div className="sr-sig-no-image" style={{ color: 'black', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>Digitally Authenticated</div>}
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
                                <p><strong>Module:</strong> {assessment?.moduleInfo?.moduleNumber}</p>
                                <p><strong>Score:</strong> <span style={{ color: isWorkplaceModule ? '#64748b' : (isFacDone ? printInkColor : '#94a3b8'), fontWeight: 'bold' }}>{isWorkplaceModule ? 'N/A (Competency Based)' : (isFacDone ? `${activeTotals.score} / ${activeTotals.max} (${activeTotals.pct}%)` : 'Pending Review')}</span></p>
                                <p><strong>Outcome:</strong> <span style={{ color: isAssDone ? printOutcomeColor : '#94a3b8', fontWeight: 'bold' }}>{isAssDone ? (submission.competency === 'C' ? 'Competent (C)' : submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending') : 'Pending Assessment'}</span></p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sr-blocks">
                    <RenderBlocks
                        assessment={assessment} submission={submission} facBreakdown={facBreakdown} assBreakdown={assBreakdown} modBreakdown={modBreakdown}
                        activeTabs={activeTabs} setActiveTabs={setActiveTabs} sectionTotals={sectionTotals} isPrintMode={true}
                        canFacilitatorMark={canFacilitatorMark} canGrade={canGrade} canModerate={canModerate}
                        isFacDone={isFacDone} isAssDone={isAssDone} isModDone={isModDone} isMentor={isMentor} isWorkplaceModule={isWorkplaceModule}
                        savedFacRole={savedFacRole} facReadOnlyLabel={facReadOnlyLabel}
                        handleVisualMark={handleVisualMark} handleScoreChange={handleScoreChange} handleFeedbackChange={handleFeedbackChange}
                        handleCriterionChange={handleCriterionChange} handleActivityStatusChange={handleActivityStatusChange}
                        handleActivityCommentChange={handleActivityCommentChange} handleGlobalChecklistChange={handleGlobalChecklistChange}
                        handleSetToNow={handleSetToNow}
                    />
                </div>

                {/* Print overall feedback */}
                <div className="print-page" style={{ marginTop: '20px' }}>
                    <h3 style={{ borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '15px' }}>Overall Assessment Feedback</h3>
                    {facOverallFeedback && (
                        <div style={{ borderLeft: '4px solid blue', padding: '15px', background: '#eff6ff', marginBottom: '15px', borderRadius: '4px' }}>
                            <h4 style={{ color: 'blue', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>{displayFacRole === 'mentor' ? 'Mentor Supervisor Comments' : `Facilitator Pre-Marking Remarks`}</h4>
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1e3a8a', fontStyle: 'italic', lineHeight: 1.5 }}>{facOverallFeedback}</p>
                        </div>
                    )}
                    {assOverallFeedback && (
                        <div style={{ borderLeft: '4px solid red', padding: '15px', background: '#fef2f2', marginBottom: '15px', borderRadius: '4px' }}>
                            <h4 style={{ color: 'red', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>Assessor Grading Remarks</h4>
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#7f1d1d', fontStyle: 'italic', lineHeight: 1.5 }}>{assOverallFeedback}</p>
                        </div>
                    )}
                    {modFeedback && (
                        <div style={{ borderLeft: '4px solid green', padding: '15px', background: '#f0fdf4', marginBottom: '15px', borderRadius: '4px' }}>
                            <h4 style={{ color: 'green', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>Moderator QA Notes</h4>
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#14532d', fontStyle: 'italic', lineHeight: 1.5 }}>{modFeedback}</p>
                        </div>
                    )}

                    {submission?.appeal?.status && (
                        <div className={`print-fb print-fb--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                            <h4 className={`print-fb__title print-fb__title--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                Formal Appeal Record — {submission.appeal.status === 'upheld' ? 'Appeal Granted' : submission.appeal.status === 'pending' ? 'Appeal Pending' : 'Appeal Rejected'}
                            </h4>
                            <p className="print-fb__appeal-reason"><strong>Learner's Reason:</strong> "{submission.appeal.reason}"</p>
                            {submission.appeal.status !== 'pending' && (
                                <p className={`print-fb__body print-fb__body--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                    <strong>Board Resolution:</strong> "{submission.appeal.resolutionNotes}"
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Signature block */}
                <div className="sr-signature-block">
                    <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black' }}>
                        <span style={{ color: 'black' }}>Learner Declaration</span>
                        {isSubmitted ? (
                            <>
                                {(submission.learnerDeclaration?.signatureUrl || learnerProfile?.signatureUrl) ? (
                                    <img src={submission.learnerDeclaration?.signatureUrl || learnerProfile?.signatureUrl} alt="Learner signature" style={filterBlack} />
                                ) : <div className="sr-sig-no-image" style={{ color: 'black', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>Digitally Authenticated</div>}
                                <strong style={{ color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</strong>
                                <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
                            </>
                        ) : <div className="sr-sig-no-image" style={{ color: 'black' }}>Awaiting Submission</div>}
                    </div>
                    <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue' }}>
                        <span style={{ color: 'blue' }}>{displayFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</span>
                        {isFacDone ? (
                            <>
                                {(submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl) ? (
                                    <img src={submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" style={filterBlue} />
                                ) : <div className="sr-sig-no-image" style={{ color: 'blue', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
                                <strong style={{ color: 'blue' }}>{submission.grading?.facilitatorName || 'Facilitator'}</strong>
                                <em style={{ color: 'blue' }}>Signed: {new Date(submission.grading?.facilitatorReviewedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>{displayFacRole === 'mentor' ? 'Verification Confirmed' : 'Pre-Marking Completed'}</div>
                            </>
                        ) : <div className="sr-sig-no-image" style={{ color: 'blue' }}>Awaiting Verification</div>}
                    </div>
                    <div className="sr-sig-box" style={{ borderColor: 'red', color: 'red' }}>
                        <span style={{ color: 'red' }}>Assessor Sign-off</span>
                        {isAssDone ? (
                            <>
                                {(submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl) ? (
                                    <img src={submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl} alt="Assessor Signature" style={filterRed} />
                                ) : <div className="sr-sig-no-image" style={{ color: 'red', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
                                <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
                                <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
                                <em style={{ color: 'red' }}>Signed: {new Date(submission.grading.gradedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'red' }}>Digital Signature Confirmed</div>
                            </>
                        ) : <div className="sr-sig-no-image" style={{ color: 'red' }}>Awaiting Assessment</div>}
                    </div>
                    <div className="sr-sig-box" style={{ borderColor: 'green', color: 'green' }}>
                        <span style={{ color: 'green' }}>Internal Moderation</span>
                        {isModDone ? (
                            <>
                                {(submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl) ? (
                                    <img src={submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl} alt="Moderator Signature" style={filterGreen} />
                                ) : <div className="sr-sig-no-image" style={{ color: 'green', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
                                <strong style={{ color: 'green' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</strong>
                                <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
                                <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
                            </>
                        ) : <div className="sr-sig-no-image" style={{ color: 'green' }}>Awaiting Moderation</div>}
                    </div>
                </div>
            </div>

            {/* SCREEN LAYOUT */}
            <div className="sr-layout no-print">
                <div className="sr-content-pane">
                    {/* Banners */}
                    {submission?.latestCoachingLog && currentAttempt > 1 && (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontSize: '0.9rem', textTransform: 'uppercase' }}><CheckCircle size={16} /> Remediation Coaching Logged</h4>
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#15803d' }}><strong>Date:</strong> {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#15803d', fontStyle: 'italic', wordBreak: 'break-word' }}>"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
                        </div>
                    )}

                    {/* MISSED ASSESSMENT BANNER */}
                    {isMissed && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.25rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', fontSize: '0.95rem' }}>
                                        <ShieldAlert size={18} /> Assessment Missed
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#b91c1c', lineHeight: 1.5, maxWidth: '600px' }}>
                                        This learner failed to attend the scheduled assessment window. Please determine if this is an <strong>Excused Absence</strong> (reopen for the learner) or an <strong>Unexcused Absence</strong> (assign a zero grade).
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {(isAdmin || isFacilitator) && (
                                        <button className="mlab-btn mlab-btn--sm" style={{ background: '#10b981', color: 'white', border: 'none' }} onClick={handleReopenMissedAssessment} disabled={saving}>
                                            <Unlock size={14} style={{ marginRight: '4px' }} /> Excuse Absence & Reopen
                                        </button>
                                    )}
                                    {canGrade && (
                                        <button className="mlab-btn mlab-btn--sm mlab-btn--error" onClick={executeZeroGrade} disabled={saving}>
                                            Assign Zero Grade (Unexcused)
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="sr-blocks">
                        <RenderBlocks
                            assessment={assessment} submission={submission} facBreakdown={facBreakdown} assBreakdown={assBreakdown} modBreakdown={modBreakdown}
                            activeTabs={activeTabs} setActiveTabs={setActiveTabs} sectionTotals={sectionTotals} isPrintMode={false}
                            canFacilitatorMark={canFacilitatorMark} canGrade={canGrade} canModerate={canModerate}
                            isFacDone={isFacDone} isAssDone={isAssDone} isModDone={isModDone} isMentor={isMentor} isWorkplaceModule={isWorkplaceModule}
                            savedFacRole={savedFacRole} facReadOnlyLabel={facReadOnlyLabel}
                            handleVisualMark={handleVisualMark} handleScoreChange={handleScoreChange} handleFeedbackChange={handleFeedbackChange}
                            handleCriterionChange={handleCriterionChange} handleActivityStatusChange={handleActivityStatusChange}
                            handleActivityCommentChange={handleActivityCommentChange} handleGlobalChecklistChange={handleGlobalChecklistChange}
                            handleSetToNow={handleSetToNow}
                        />
                    </div>
                </div>

                <aside className="sr-sidebar no-print">

                    <ReviewStageCard
                        colorTheme="blue"
                        title={facPanelTitle}
                        status={facPanelStatus}
                        lockedMessage="The learner has not submitted this assessment yet. Marking and feedback are locked until they complete their attempt."
                        awaitingTitle={isAwaitingSignoff ? 'Awaiting Learner Signature' : 'Awaiting Facilitator Review'}
                        awaitingMessage={isAwaitingSignoff ? 'You have saved your verification. The learner must now log in, review your supervisor comments, and apply their signature before the logbook goes to the Assessor.' : 'The learner has submitted this assessment. Awaiting the Facilitator to complete their pre-marking.'}
                        showScore={!isWorkplaceModule && displayFacRole !== 'mentor'}
                        scoreAwarded={facTotals.score}
                        scoreMax={facTotals.max}
                        scorePct={facTotals.pct}
                        feedbackLabel={facRemarksLabel}
                        feedbackPlaceholder="Add overall coaching comments..."
                        feedbackValue={facOverallFeedback}
                        onFeedbackChange={handleFacOverallFeedbackChange}
                        submitLabel={facSubmitLabel}
                        onSubmit={triggerSubmitFacilitator}
                        isSaving={saving}
                        signatureLabel={displayFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}
                        signatureName={submission.grading?.facilitatorName || 'Facilitator'}
                        signatureUrl={submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl}
                        signatureDate={submission.grading?.facilitatorReviewedAt ? new Date(submission.grading.facilitatorReviewedAt).toLocaleDateString() : undefined}
                        signatureTagline={displayFacRole === 'mentor' ? 'Verification Confirmed' : 'Pre-Marking Completed'}
                        activeControls={
                            <>
                                {canReturnToLearner && (
                                    <button
                                        className="mlab-btn mlab-btn--ghost"
                                        style={{ width: '100%', marginTop: '10px', borderColor: '#bfdbfe', color: '#1d4ed8' }}
                                        onClick={() => setShowReturnToLearnerModal(true)}
                                        disabled={saving}
                                    >
                                        <Undo2 size={14} style={{ marginRight: '6px' }} /> Return to Learner for Corrections
                                    </button>
                                )}

                                {/* EXTRA TIME AND DEFERRED ACCESS (FOR FACILITATORS/ADMINS) */}
                                {!isMentor && ((submission.status === 'in_progress' && assessment?.moduleInfo?.timeLimit > 0) || submission.status === 'not_started') && (
                                    <div className="no-print" style={{ marginTop: '10px', background: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                                        <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#1e3a8a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <ShieldAlert size={14} /> Facilitator Overrides
                                        </p>

                                        {/* Time Extension (Only shows if they have actually started) */}
                                        {submission.status === 'in_progress' && assessment?.moduleInfo?.timeLimit > 0 && (
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                                <button onClick={() => grantExtraTime(15)} className="mlab-btn mlab-btn--sm" style={{ background: '#3b82f6', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none' }}>+15 Mins</button>
                                                <button onClick={() => grantExtraTime(30)} className="mlab-btn mlab-btn--sm" style={{ background: '#2563eb', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none' }}>+30 Mins</button>
                                                {submission.extraTimeGranted > 0 && <span style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: 'bold' }}>({submission.extraTimeGranted} min active)</span>}
                                            </div>
                                        )}

                                        {/* Deferred Access / Unlock (Shows if not started) */}
                                        {(submission.status === 'not_started') && (
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <button
                                                    onClick={toggleDeferredAccess}
                                                    className="mlab-btn mlab-btn--sm"
                                                    style={{ background: submission.overrideUnlock ? '#ef4444' : '#10b981', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    {submission.overrideUnlock ? <><Lock size={12} /> Revoke Access</> : <><Unlock size={12} /> Grant Deferred Access</>}
                                                </button>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    {submission.overrideUnlock ? "Learner can bypass scheduling locks." : "Bound by global schedule."}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        }
                    />

                    <ReviewStageCard
                        colorTheme="red"
                        title="Official Assessor Grading"
                        status={assPanelStatus}
                        lockedMessage="Awaiting prior steps to be completed before grading can begin."
                        awaitingTitle="Awaiting Assessor Grading"
                        awaitingMessage="This submission is ready and waiting for the Assessor to assign final marks."
                        showScore={!isWorkplaceModule}
                        scoreAwarded={assTotals.score}
                        scoreMax={assTotals.max}
                        scorePct={assTotals.pct}
                        feedbackLabel="Assessor Remarks"
                        feedbackPlaceholder="Provide holistic feedback..."
                        feedbackValue={assOverallFeedback}
                        onFeedbackChange={handleAssOverallFeedbackChange}
                        submitLabel="Apply Signature & Finalise"
                        onSubmit={triggerSubmitGrade}
                        isSaving={saving}
                        signatureLabel="Assessor Signature"
                        signatureName={submission.grading?.assessorName || 'Assessor'}
                        signatureUrl={submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl}
                        signatureDate={submission.grading?.gradedAt ? new Date(submission.grading.gradedAt).toLocaleDateString() : undefined}
                        signatureMeta={`Reg: ${assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}`}
                        signatureTagline="Digital Signature Confirmed"
                        activeControls={
                            canGrade && !isMissed && (
                                <div className="sr-competency-section">
                                    <div className="sr-role-guide red"><Info size={16} /><div><strong>Summative Judgment</strong><br />Declare Competency. You must justify your marks.</div></div>
                                    <label className="sr-sidebar-label" style={{ color: 'red', marginTop: '1rem' }}>Final Competency</label>
                                    <div className="sr-comp-toggles">
                                        <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')}><Award size={16} /> Competent (C)</button>
                                        <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')}><AlertCircle size={16} /> Not Yet Competent</button>
                                    </div>
                                </div>
                            )
                        }
                    />

                    <ReviewStageCard
                        colorTheme="green"
                        title="Internal Moderation (QA)"
                        status={modPanelStatus}
                        lockedMessage="Awaiting Assessor to complete official grading before moderation can occur."
                        awaitingTitle="Awaiting Moderation"
                        awaitingMessage="This submission is ready and waiting for QA review by the Moderator."
                        showScore={true}
                        scoreAwarded={modTotals.score}
                        scoreMax={modTotals.max}
                        scorePct={modTotals.pct}
                        feedbackLabel="Moderator Feedback"
                        feedbackPlaceholder="Moderation feedback..."
                        feedbackValue={modFeedback}
                        onFeedbackChange={handleModFeedbackChange}
                        submitLabel="Finalise QA & Endorse"
                        onSubmit={triggerSubmitModeration}
                        isSaving={saving}
                        signatureLabel="Moderator QA"
                        signatureName={submission.moderation?.moderatorName || moderatorProfile?.fullName || 'Moderator'}
                        signatureUrl={submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl}
                        signatureDate={submission.moderation?.moderatedAt ? new Date(submission.moderation.moderatedAt).toLocaleDateString() : undefined}
                        signatureMeta={`Outcome: ${submission.moderation?.outcome || modOutcome}`}
                        signatureTagline="QA Sign-off Confirmed"
                        activeControls={
                            (canModerate || isModDone) && (
                                <>
                                    <div className="sr-competency-section">
                                        <label className="sr-sidebar-label" style={{ color: 'green' }}>Assessor's Declared Competency</label>
                                        <div className="sr-comp-toggles">
                                            <button className={`sr-comp-btn ${submission.competency === 'C' ? 'active-c-green' : ''}`} disabled style={{ opacity: submission.competency === 'C' ? 1 : 0.5, cursor: 'default' }}><Award size={16} /> Competent (C)</button>
                                            <button className={`sr-comp-btn ${submission.competency === 'NYC' ? 'active-nyc-green' : ''}`} disabled style={{ opacity: submission.competency === 'NYC' ? 1 : 0.5, cursor: 'default' }}><AlertCircle size={16} /> Not Yet Competent</button>
                                        </div>
                                    </div>
                                    {canModerate && (
                                        <div className="sr-competency-section" style={{ marginTop: '1.5rem' }}>
                                            <label className="sr-sidebar-label" style={{ color: 'green' }}>Your Moderation Decision</label>
                                            <div className="sr-comp-toggles">
                                                <button className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`} onClick={() => handleModOutcomeSelect('Endorsed')}><ShieldCheck size={16} /> Endorse Grade</button>
                                                <button className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`} onClick={() => handleModOutcomeSelect('Returned')}><AlertCircle size={16} /> Return to Assessor</button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )
                        }
                    />
                    <PastAttemptsArchive historySnapshots={historySnapshots} assessment={assessment} />
                </aside>
            </div>
        </div>
    );
};

export default SubmissionReview;

