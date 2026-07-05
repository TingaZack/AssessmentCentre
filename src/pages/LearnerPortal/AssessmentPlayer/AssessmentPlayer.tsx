// src/components/views/AssessmentPlayer/AssessmentPlayer.tsx

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot } from 'firebase/firestore';
import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../components/common/Toast/Toast';
import './AssessmentPlayer.css';
import moment from 'moment';

// Import the three new components
import { AssessmentGate } from './AssessmentGate';
import { AssessmentLockedScreen } from './AssessmentLockedScreen';
import { AssessmentPlayerContent } from './AssessmentPlayerContent';

// ─── LOADING SCREEN ────────────────────────────────────────────────────────
const LoadingScreen: React.FC = () => (
    <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
        <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
    </div>
);

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────
const AssessmentPlayer: React.FC = () => {
    const { assessmentId } = useParams<{ assessmentId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
    const toast = useToast();

    const safeNavigateBack = () => {
        if (location.key === 'default') {
            navigate(user?.role === 'learner' ? '/learner/dashboard' : '/');
        } else {
            navigate(-1);
        }
    };

    // ─── STATE ──────────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isStarting, setIsStarting] = useState(false);

    const [assessment, setAssessment] = useState<any>(null);
    const [submission, setSubmission] = useState<any>(null);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
    const [codeSnapshots, setCodeSnapshots] = useState<Record<string, any>>({});
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [learnerProfile, setLearnerProfile] = useState<any>(null);
    const [learnerEnrollment, setLearnerEnrollment] = useState<any>(null);
    const [assessorProfile, setAssessorProfile] = useState<any>(null);
    const [moderatorProfile, setModeratorProfile] = useState<any>(null);
    const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);
    const [declarationChecked, setDeclarationChecked] = useState(false);
    const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
    const [coachingAckChecked, setCoachingAckChecked] = useState(false);
    const [isAdminIntercept, setIsAdminIntercept] = useState(false);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    const [showAppealModal, setShowAppealModal] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // QCTO Compliance State
    const [moduleLogs, setModuleLogs] = useState<any[]>([]);
    const [passedFormative, setPassedFormative] = useState(false);
    const [approvedLogs, setApprovedLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState<boolean>(false);

    // Timers
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [timeOffset, setTimeOffset] = useState<number>(0);
    const [timeToStart, setTimeToStart] = useState<number | null>(null);

    // ─── REFS ────────────────────────────────────────────────────────────────
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // ─── COMPUTED DERIVED STATES ───────────────────────────────────────────
    const currentStatus = String(submission?.status || '').toLowerCase();
    const isMissed = currentStatus === 'missed';
    const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
    const isAppealUpheld = submission?.appeal?.status === 'upheld';
    const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
    const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
    const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
    const isModDone = ['moderated', 'appealed'].includes(currentStatus);
    const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
    const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
    const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
    const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;
    const isRemediation = (submission?.attemptNumber || 1) > 1;
    const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged && !isAppealUpheld;
    const isNotStarted = currentStatus === 'not_started';
    const showGate = isNotStarted || needsRemediationGate;
    const isGloballyLocked = isSubmitted || isAwaitingSignoff || isMissed;
    const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

    const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
        ? assessment.requiresInvigilation
        : !isPracticalModule;
    const willBeProctored = isInvigilationEnabled && !isGloballyLocked;

    // ─── 🚀 GATE COMPLIANCE RULES ────────────────────────────────────────────
    const isSummative = submission?.type?.toLowerCase().includes('summative') || false;
    const hasOverride = submission?.facilitatorOverride === true;

    // Memoize the pending topics check to prevent unnecessary re-renders
    const pendingTopics = useMemo(() => {
        if (!submission || !moduleLogs) return [];
        return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
    }, [moduleLogs, submission]);

    const isFullyCompliant = pendingTopics.length === 0;

    // ─── IMMUTABLE LOG LOCK RULES ─────────────────────────────────────────
    const isBlockVerified = (blockId: string) => {
        const facGrade = submission?.grading?.facilitatorBreakdown?.[blockId];
        return facGrade?.isCorrect === true || facGrade?.obsDeclaration === true;
    };

    // ─── TIMER HELPERS ──────────────────────────────────────────────────────
    const getSecureNow = () => Date.now() + timeOffset;

    // ─── FETCH TIME OFFSET ──────────────────────────────────────────────────
    useEffect(() => {
        const fetchOffset = async () => {
            try {
                const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC');
                const data = await res.json();
                const secureUTCTime = new Date(data.dateTime + 'Z').getTime();
                setTimeOffset(secureUTCTime - Date.now());
            } catch (err) {
                setTimeOffset(0);
            }
        };
        fetchOffset();
    }, []);

    // ─── FETCH DATA ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (employers.length === 0) fetchEmployers();
        if (staff.length === 0) fetchStaff();

        const load = async () => {
            if (!user?.uid || !assessmentId) return;

            if (user.role && user.role !== 'learner') {
                setIsAdminIntercept(true);
                setLoading(false);
                return;
            }

            try {
                const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
                if (!assSnap.exists()) {
                    toast.error('Assessment template not found.');
                    setLoading(false);
                    return;
                }
                const assData = assSnap.data();
                setAssessment(assData);

                let userProfile: any = {};
                const userDocSnap = await getDoc(doc(db, 'users', user.uid));
                if (userDocSnap.exists()) {
                    userProfile = { id: userDocSnap.id, ...userDocSnap.data() };
                }
                setLearnerProfile(userProfile);

                let targetLearnerId = user.uid;
                let learnerCohortId: string | null = null;
                let validEnrollmentId: string | null = null;

                if (user?.role === 'learner') {
                    try {
                        const enrolQ = query(collection(db, 'enrollments'), where('authUid', '==', user.uid), where('status', '==', 'active'));
                        const enrolSnap = await getDocs(enrolQ);
                        if (!enrolSnap.empty) {
                            const enrolData = enrolSnap.docs[0].data();
                            validEnrollmentId = enrolSnap.docs[0].id;
                            targetLearnerId = enrolData.learnerId || enrolData.id || user.uid;
                            learnerCohortId = enrolData.cohortId;
                        }
                    } catch (e) {
                        console.warn("Enrollment lookup failed.", e);
                    }
                }

                let activeSub: any = null;
                try {
                    const subQuery1 = query(collection(db, 'learner_submissions'), where('assessmentId', '==', assessmentId), where('authUid', '==', user.uid));
                    const subSnap1 = await getDocs(subQuery1);
                    if (!subSnap1.empty) {
                        activeSub = subSnap1.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
                    }
                } catch (qErr) {
                    console.warn("Primary submission query failed.", qErr);
                }

                if (!activeSub && user?.role === 'learner') {
                    const fallbackCohortId = learnerCohortId || assData.cohortId || (assData.cohortIds && assData.cohortIds[0]) || 'unassigned';
                    const isLive = ['active', 'scheduled', 'upcoming', 'published'].includes(assData.status);
                    if (isLive) {
                        const sid = `${fallbackCohortId}_${targetLearnerId}_${assessmentId}`;
                        const newSub = {
                            learnerId: targetLearnerId,
                            enrollmentId: validEnrollmentId || "",
                            authUid: user.uid,
                            qualificationName: userProfile.qualification?.name || "",
                            assessmentId: assessmentId,
                            cohortId: fallbackCohortId,
                            title: assData.title,
                            type: assData.type || 'formative',
                            moduleType: assData.moduleType || 'knowledge',
                            status: assData.status === 'upcoming' ? 'upcoming' : 'not_started',
                            assignedAt: new Date().toISOString(),
                            marks: 0,
                            totalMarks: assData.totalMarks || 0,
                            moduleNumber: assData.moduleInfo?.moduleNumber || "",
                            timeLimit: assData.moduleInfo?.timeLimit || 0,
                            isScheduled: assData.isScheduled || assData.status === 'scheduled' || false,
                            scheduledDate: assData.scheduledDate || null,
                            createdAt: new Date().toISOString(),
                            createdBy: "System_Player_AutoHydration"
                        };
                        await setDoc(doc(db, "learner_submissions", sid), newSub);
                        activeSub = { id: sid, ...newSub };
                    }
                }

                if (activeSub) {
                    setSubmission(activeSub);
                    setAnswers(activeSub.answers || {});
                    if (activeSub.enrollmentId) {
                        const e = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId));
                        if (e.exists()) setLearnerEnrollment(e.data());
                    }
                    if (activeSub.grading?.gradedBy) {
                        const s = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
                        if (s.exists()) setAssessorProfile(s.data());
                    }
                    if (activeSub.moderation?.moderatedBy) {
                        const s = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
                        if (s.exists()) setModeratorProfile(s.data());
                    }
                    const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
                    if (facId) {
                        const s = await getDoc(doc(db, 'users', facId));
                        if (s.exists()) setFacilitatorProfile(s.data());
                    }
                } else {
                    toast.error('Assessment unavailable. It may not be published yet.');
                }
            } catch (err) {
                console.error("Fatal error loading assessment data:", err);
                toast.error('Failed to load assessment data.');
            } finally {
                setLoading(false);
            }
        };

        if (timeOffset !== null) load();
    }, [assessmentId, user?.uid, timeOffset]);

    // ─── FETCH COMPLIANCE LOGS ─────────────────────────────────────────────
    useEffect(() => {
        if (!submission || !user?.uid) return;
        const _isSummative = submission.type?.toLowerCase().includes('summative');
        if (_isSummative) {
            const logsQ = query(
                collection(db, 'curriculum_logs'),
                where('cohortId', '==', submission.cohortId),
                where('moduleCode', '==', submission.moduleNumber)
            );
            const unsubLogs = onSnapshot(logsQ, (snap) => {
                setModuleLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });
            const formQ = query(
                collection(db, 'learner_submissions'),
                where('authUid', '==', user.uid),
                where('moduleNumber', '==', submission.moduleNumber),
                where('status', '==', 'moderated'),
                where('competency', '==', 'C')
            );
            const unsubForm = onSnapshot(formQ, (snap) => {
                setPassedFormative(!snap.empty);
            });
            return () => { unsubLogs(); unsubForm(); };
        }
    }, [submission?.id, user?.uid, submission?.type, submission?.cohortId, submission?.moduleNumber]);

    // ─── COUNTDOWN FOR SCHEDULED ──────────────────────────────────────────
    useEffect(() => {
        if (assessment?.scheduledDate && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed) {
            const interval = setInterval(() => {
                const startTime = moment(assessment.scheduledDate).valueOf();
                const now = getSecureNow();
                const difference = startTime - now;
                if (difference <= 0) {
                    setTimeToStart(0);
                    clearInterval(interval);
                } else {
                    setTimeToStart(difference);
                }
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, timeOffset]);

    const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed;

    // ─── LIVE REAL‑TIME LOCKOUT ────────────────────────────────────────────
    useEffect(() => {
        if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock) {
            const interval = setInterval(() => {
                const baseTimeLimit = assessment.moduleInfo?.timeLimit || 0;
                const extraTime = submission?.extraTimeGranted || 0;
                const totalAllowedTimeMs = baseTimeLimit === 0
                    ? (24 * 60 * 60 * 1000)
                    : ((baseTimeLimit + extraTime + 15) * 60 * 1000);
                const scheduledEnd = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
                if (getSecureNow() >= scheduledEnd) {
                    updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: 'missed',
                        systemNote: `Auto-swept by frontend player: Learner failed to start within the ${baseTimeLimit === 0 ? '24-hour window' : 'allotted timeframe + grace period'}.`
                    }).catch(() => { });
                    setSubmission((prev: any) => ({ ...prev, status: 'missed' }));
                    clearInterval(interval);
                }
            }, 10000);
            return () => clearInterval(interval);
        }
    }, [isNotStarted, assessment, submission]);

    // ─── LIVE COUNTDOWN TICKER ─────────────────────────────────────────────
    useEffect(() => {
        if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed) return;
        const baseLimit = assessment.moduleInfo?.timeLimit || 0;
        if (baseLimit <= 0) return;

        if (timeLeft === null) {
            const now = getSecureNow();
            const extraTime = submission.extraTimeGranted || 0;
            const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;
            let endMs;
            if (assessment.isScheduled && assessment.scheduledDate && !submission.overrideUnlock) {
                endMs = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
            } else if (submission.startedAt) {
                endMs = new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
            }
            if (endMs) {
                setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
            }
            return;
        }

        if (timeLeft <= 0) {
            toast.error("Time is up! Auto-submitting.");
            setAnswers(latestAnswers => {
                if (submission?.id) {
                    forceAutoSubmit(submission.id, latestAnswers);
                }
                return latestAnswers;
            });
            return;
        }

        const id = setInterval(() => {
            const now = getSecureNow();
            const extraTime = submission.extraTimeGranted || 0;
            const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;
            let endMs;
            if (assessment.isScheduled && assessment.scheduledDate && !submission.overrideUnlock) {
                endMs = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
            } else if (submission.startedAt) {
                endMs = new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
            }
            if (endMs) {
                setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
            }
        }, 1000);
        return () => clearInterval(id);
    }, [timeLeft, isGloballyLocked, showGate, submission?.startedAt, isPracticalModule, submission?.extraTimeGranted, isMissed, assessment, submission?.id, submission?.overrideUnlock]);

    // ─── FETCH APPROVED LOGS ──────────────────────────────────────────────
    useEffect(() => {
        const fetchApprovedLogs = async () => {
            if (!user?.uid || assessment?.moduleType !== 'workplace') {
                setLogsLoading(false);
                return;
            }
            try {
                setLogsLoading(true);
                const logsRef = collection(db, 'workplace_logs');
                const q = query(logsRef, where('learnerId', '==', user.uid), where('moduleId', '==', assessment.id), where('status', '==', 'Approved'));
                const snapshot = await getDocs(q);
                const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setApprovedLogs(fetchedLogs);
            } catch (error) {
                console.error('Error fetching approved logs:', error);
                toast.error('Failed to sync verified workplace logs.');
            } finally {
                setLogsLoading(false);
            }
        };
        fetchApprovedLogs();
    }, [user?.uid, assessment?.id, assessment?.moduleType]);


    // ─── GRAND TOTALS ──────────────────────────────────────────────────────
    // const getBlockGrading = (blockId: string) => {
    //     if (!isFacDone) return { score: undefined, feedback: '', facFeedback: '', assFeedback: '', modFeedback: '', facIsCorrect: null, assIsCorrect: null, modIsCorrect: null, isCorrect: null, criteriaResults: [] };
    //     const g = submission?.grading || {};
    //     const m = submission?.moderation || {};
    //     const mLayer = m.breakdown?.[blockId] || {};
    //     const aLayer = g.assessorBreakdown?.[blockId] || {};
    //     const fLayer = g.facilitatorBreakdown?.[blockId] || {};
    //     const legacyLayer = g.breakdown?.[blockId] || {};
    //     let activeLayer: any = legacyLayer;
    //     if (isFacDone) activeLayer = fLayer;
    //     if (isAssDone) activeLayer = aLayer;
    //     if (isModDone) activeLayer = mLayer;
    //     return {
    //         score: activeLayer.score, isCorrect: activeLayer.isCorrect,
    //         facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
    //         assIsCorrect: aLayer.isCorrect, modIsCorrect: mLayer.isCorrect,
    //         feedback: activeLayer.feedback || '', facFeedback: fLayer.feedback || legacyLayer.feedback || '',
    //         assFeedback: aLayer.feedback || '', modFeedback: mLayer.feedback || '',
    //         criteriaResults: activeLayer.criteriaResults || [],
    //     };
    // };

    const getBlockGrading = (blockId: string) => {
        const g = submission?.grading || {};
        const m = submission?.moderation || {};
        const mLayer = m.breakdown?.[blockId] || {};
        const aLayer = g.assessorBreakdown?.[blockId] || {};
        const fLayer = g.facilitatorBreakdown?.[blockId] || {};
        const legacyLayer = g.breakdown?.[blockId] || {};

        // Dynamically use live data from whichever agent has evaluated the item
        let activeLayer = fLayer || legacyLayer || {};
        if (isAssDone || g.assessorBreakdown?.[blockId]) activeLayer = aLayer;
        if (isModDone || m.breakdown?.[blockId]) activeLayer = mLayer;

        return {
            score: activeLayer?.score,
            isCorrect: activeLayer?.isCorrect,
            facIsCorrect: fLayer?.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer?.isCorrect,
            assIsCorrect: aLayer?.isCorrect,
            modIsCorrect: mLayer?.isCorrect,
            feedback: activeLayer?.feedback || '',
            facFeedback: fLayer?.feedback || legacyLayer?.feedback || '',
            assFeedback: aLayer?.feedback || '',
            modFeedback: mLayer?.feedback || '',
            criteriaResults: activeLayer?.criteriaResults || fLayer?.criteriaResults || legacyLayer?.criteriaResults || [],
        };
    };

    let grandTotalAwarded = 0;
    let grandTotalMax = 0;
    const sectionTotals: Record<string, { total: number; awarded: number }> = {};
    let currentSectionId = '';
    if (assessment?.blocks) {
        assessment.blocks.forEach((block: any) => {
            if (block.type === 'section') {
                currentSectionId = block.id;
                sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
            } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
                const { score } = getBlockGrading(block.id);
                const maxMarks = Number(block.marks) || 0;
                const awarded = Number(score) || 0;
                grandTotalMax += maxMarks;
                if (score !== undefined && score !== null) {
                    grandTotalAwarded += awarded;
                }
                if (currentSectionId) {
                    sectionTotals[currentSectionId].total += maxMarks;
                    if (score !== undefined && score !== null) {
                        sectionTotals[currentSectionId].awarded += awarded;
                    }
                }
            }
        });
    }
    const grandTotalPct = grandTotalMax > 0 ? Math.round((grandTotalAwarded / grandTotalMax) * 100) : 0;
    const savedFacRole = submission?.grading?.facilitatorRole || null;

    const getCompetencyStatus = () => {
        if (!isAssDone) return null;
        if (isRemediation && !isGloballyLocked) return null;
        const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
        let isCompetent = compStr === 'c' || compStr === 'competent';
        if (!isWorkplaceModule && !isCompetent && grandTotalAwarded !== undefined && assessment?.totalMarks)
            isCompetent = grandTotalAwarded >= assessment.totalMarks * 0.6;
        return {
            label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
            color: isModDone ? 'var(--mlab-green)' : 'var(--mlab-red)',
            subtext: isModDone ? 'Final Results Verified & Endorsed.' : isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.',
            score: isWorkplaceModule ? undefined : grandTotalAwarded,
            percentage: grandTotalPct,
            isCompetent,
        };
    };
    const outcome = getCompetencyStatus();

    // ─── START ASSESSMENT ──────────────────────────────────────────────────
    const handleStartAssessment = async () => {
        if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)) return;
        setIsStarting(true);
        setSaving(true);
        try {
            const functions = getFunctions();
            const startFn = httpsCallable(functions, 'startAssessment');
            const res = await startFn({ submissionId: submission.id });
            const data = res.data as any;
            const t = data.startedAt || new Date(getSecureNow()).toISOString();

            let payload: any = {};
            if (needsRemediationGate) {
                payload['latestCoachingLog.acknowledged'] = true;
                payload['latestCoachingLog.acknowledgedAt'] = t;
                payload['latestCoachingLog.learnerSignatureUrl'] = learnerProfile?.signatureUrl || null;
                await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
            }

            setSubmission((p: any) => ({
                ...p,
                status: 'in_progress',
                startedAt: t,
                latestCoachingLog: p.latestCoachingLog && needsRemediationGate
                    ? { ...p.latestCoachingLog, acknowledged: true, acknowledgedAt: t, learnerSignatureUrl: learnerProfile?.signatureUrl }
                    : p.latestCoachingLog
            }));

            if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) {
                const extraTime = submission?.extraTimeGranted || 0;
                const totalAllowedTimeMs = (assessment.moduleInfo.timeLimit + extraTime) * 60 * 1000;
                if (assessment.isScheduled && assessment.scheduledDate && !submission.overrideUnlock) {
                    const scheduledEnd = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
                    setTimeLeft(Math.max(0, Math.floor((scheduledEnd - getSecureNow()) / 1000)));
                } else {
                    setTimeLeft((assessment.moduleInfo.timeLimit + extraTime) * 60);
                }
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to start assessment. Please check compliance.');
        } finally {
            setSaving(false);
            setIsStarting(false);
        }
    };

    // ─── AUTOSAVE ──────────────────────────────────────────────────────────
    const triggerAutoSave = (newAnswers: any) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setSaving(true);
        saveTimeoutRef.current = setTimeout(async () => {
            if (!submission?.id) return;
            try {
                await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
            } catch {
                toast.error('Auto-save failed.');
            } finally {
                setSaving(false);
            }
        }, 1200);
    };

    const saveCodeSnapshot = useCallback((blockId: string, snapshot: any) => {
        setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));
    }, []);

    const handleAnswerChange = (blockId: string, value: any) => {
        if (isGloballyLocked || isBlockVerified(blockId)) return;
        setAnswers(p => { const n = { ...p, [blockId]: value }; triggerAutoSave(n); return n; });
    };
    const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
        if (isGloballyLocked || isBlockVerified(blockId)) return;
        setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; triggerAutoSave(n); return n; });
    };
    const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
        if (isGloballyLocked || isBlockVerified(blockId)) return;
        setAnswers(p => {
            const blockAns = p[blockId] || {};
            const raw = blockAns[nestedKey];
            const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
            const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
            triggerAutoSave(n); return n;
        });
    };

    // ─── FILE UPLOAD ──────────────────────────────────────────────────────
    const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
        if (!file || isGloballyLocked || isBlockVerified(blockId)) return;
        const pKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
        setUploadProgress(p => ({ ...p, [pKey]: 0 }));
        setSaving(true);
        toast.info(`Uploading ${file.name}…`);
        try {
            const storage = getStorage();
            const ref = fbStorageRef(storage, `evidence/${submission.id}/${blockId}_${Date.now()}_${file.name}`);
            const task = uploadBytesResumable(ref, file);
            task.on('state_changed',
                snap => setUploadProgress(p => ({ ...p, [pKey]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
                err => {
                    console.error("Firebase Storage Upload Error:", err);
                    toast.error(`Upload failed: ${err.message}. Please try again.`);
                    if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', '');
                    else handleTaskAnswerChange(blockId, 'uploadUrl', '');
                    setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
                    setSaving(false);
                },
                async () => {
                    const url = await getDownloadURL(task.snapshot.ref);
                    if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', url);
                    else handleTaskAnswerChange(blockId, 'uploadUrl', url);
                    toast.success(`Uploaded: ${file.name}`);
                    setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
                    setSaving(false);
                }
            );
        } catch (err: any) {
            toast.error(`Upload failed: ${err.message}`);
            setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
            setSaving(false);
        }
    };

    // ─── FORCE AUTO SUBMIT ─────────────────────────────────────────────────
    const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
        setSaving(true);
        const t = new Date(getSecureNow()).toISOString();
        try {
            await updateDoc(doc(db, 'learner_submissions', subId), {
                answers: currentAnswers, status: 'submitted', submittedAt: t, autoSubmitted: true,
                learnerDeclaration: {
                    agreed: true,
                    timestamp: t,
                    learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
                    learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
                    signatureUrl: learnerProfile?.signatureUrl || null
                },
            });
            toast.success("Time's up! Auto-submitted.");
            setSubmission((p: any) => ({ ...p, status: 'submitted', learnerDeclaration: { signatureUrl: learnerProfile?.signatureUrl || null, timestamp: t, learnerName: learnerProfile?.fullName || 'Unknown' } }));
            setTimeout(() => safeNavigateBack(), 3000);
        } catch (e) { console.error(e); } finally { setSaving(false); }
    };

    // ─── VALIDATE CHECKLIST EVIDENCE ──────────────────────────────────────
    const validateChecklistEvidence = () => {
        for (const block of assessment.blocks || []) {
            if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
                for (let i = 0; i < (block.criteria?.length || 0); i++) {
                    const raw = answers[block.id]?.[`evidence_${i}`];
                    const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
                    const has = ev && ((ev.text && ev.text.replace(/<[^>]*>?/gm, '').trim()) || ev.url?.trim() || ev.code?.trim() || ev.uploadUrl?.trim());
                    if (!has) return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title}".` };
                }
            }
            if (block.type === 'qcto_workplace') {
                const bAns = answers[block.id] || {};
                for (const wa of block.workActivities || []) {
                    if (!bAns[`wa_${wa.id}_declaration`]) return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
                    for (const se of wa.evidenceItems || []) {
                        const ev = bAns[`se_${se.id}`] || {};
                        const has = ev && ((ev.text && ev.text.replace(/<[^>]*>?/gm, '').trim()) || ev.url?.trim() || ev.uploadUrl?.trim());
                        if (!has) return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
                    }
                }
            }
        }
        return { valid: true };
    };

    // ─── SUBMIT TRIGGER ────────────────────────────────────────────────────
    const triggerSubmitConfirm = () => {
        if (assessment?.moduleType === 'workplace') {
            const workplaceBlocks = assessment.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];
            for (const block of workplaceBlocks) {
                for (const wa of block.workActivities || []) {
                    const hasApprovedLog = approvedLogs.some(log => log.workActivityId === wa.id);
                    if (!hasApprovedLog) {
                        toast.error(`Missing approved log for Work Activity: ${wa.code}. You cannot submit until your mentor approves this task.`);
                        return;
                    }
                }
            }
        }
        if (Object.keys(uploadProgress).length > 0) { toast.warning("Files are uploading. Please wait."); return; }
        if (!declarationChecked) { toast.warning('You must agree to the declaration.'); return; }
        if (isAwaitingSignoff || isPracticalModule) {
            const chk = validateChecklistEvidence() as any;
            if (!chk.valid) { toast.warning(chk.message); return; }
        }
        setShowSubmitConfirm(true);
    };

    // // ─── EXECUTE SUBMIT ────────────────────────────────────────────────────
    // const executeSubmit = async () => {
    //     setShowSubmitConfirm(false);
    //     setSaving(true);
    //     const t = new Date(getSecureNow()).toISOString();
    //     const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';
    //     const payload = {
    //         answers,
    //         status: nextStatus,
    //         submittedAt: t,
    //         learnerDeclaration: {
    //             agreed: true,
    //             timestamp: t,
    //             learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
    //             learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
    //             signatureUrl: learnerProfile?.signatureUrl || null
    //         }
    //     };
    //     try {
    //         await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
    //         toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
    //         setSubmission((p: any) => ({ ...p, status: nextStatus, learnerDeclaration: payload.learnerDeclaration }));
    //         setTimeout(() => window.scrollTo(0, 0), 1000);
    //     } catch (error: any) {
    //         console.error("❌ Submission Error:", error);
    //         toast.error(`Failed to submit: ${error.message}`);
    //     } finally { setSaving(false); }
    // };

    // ─── EXECUTE SUBMIT ────────────────────────────────────────────────────
    const executeSubmit = async () => {
        setShowSubmitConfirm(false);
        setSaving(true);

        // CAPTURE STACKBLITZ CODE SANDBOX SNAPSHOTS BEFORE SAVING
        const activeVMs = (window as any).__ACTIVE_VMS || {};
        for (const blockId of Object.keys(activeVMs)) {
            try {
                const vm = activeVMs[blockId];
                // Pull the live file directory tree straight out of the IDE
                const snapshot = await vm.getFsSnapshot();

                // Update the learner's answer payload for this specific block
                answers[blockId] = {
                    snapshot,
                    lastSavedAt: new Date().toISOString()
                };
            } catch (err) {
                console.error(`Failed to capture snapshot for sandbox ${blockId}:`, err);
            }
        }

        const t = new Date(getSecureNow()).toISOString();
        const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

        const payload = {
            answers, //  safely includes all the Code Sandbox snapshots!
            status: nextStatus,
            submittedAt: t,
            learnerDeclaration: {
                agreed: true,
                timestamp: t,
                learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
                learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
                signatureUrl: learnerProfile?.signatureUrl || null
            }
        };

        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
            toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
            setSubmission((p: any) => ({ ...p, status: nextStatus, learnerDeclaration: payload.learnerDeclaration }));
            setTimeout(() => window.scrollTo(0, 0), 1000);
        } catch (error: any) {
            console.error("❌ Submission Error:", error);
            toast.error(`Failed to submit: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ─── EXECUTE APPEAL ────────────────────────────────────────────────────
    const executeAppeal = async (reason: string) => {
        setShowAppealModal(false);
        setSaving(true);
        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                status: 'appealed',
                appeal: { reason, date: new Date().toISOString(), status: 'pending' },
                lastStaffEditAt: new Date().toISOString()
            });
            toast.success("Formal appeal lodged successfully.");
            setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
        } catch {
            toast.error("Failed to lodge appeal.");
        } finally { setSaving(false); }
    };

    // ─── 🚀 SMART PREVENT COPY/PASTE OVERRIDE ──────────────────────────────
    const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride: boolean = false) => {
        // If the module is inherently practical, OR if the child component explicitly requests an override (e.g. for a Code block) -> Allow Paste!
        if (!isGloballyLocked && !isPracticalModule && !allowOverride) {
            if (e.type === 'keydown') {
                const keyEvent = e as React.KeyboardEvent;
                if ((keyEvent.ctrlKey || keyEvent.metaKey) && ['c', 'v', 'x'].includes(keyEvent.key.toLowerCase())) {
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    if (keyEvent.nativeEvent?.stopImmediatePropagation) {
                        keyEvent.nativeEvent.stopImmediatePropagation();
                    }
                    toast.warning("Keyboard shortcuts for Copy/Paste are disabled on Knowledge Modules.", 1500);
                    document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to use Copy/Paste keyboard shortcuts." }));
                }
            } else {
                e.preventDefault();
                e.stopPropagation();
                if (e.nativeEvent?.stopImmediatePropagation) {
                    e.nativeEvent.stopImmediatePropagation();
                }
                toast.warning("Copying, pasting, and dropping content is disabled to ensure academic integrity.", 15000);
                document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to Paste or Drop external content into the assessment." }));
            }
        }
    };

    // ─── GENERATE CALENDAR LINK ──────────────────────────────────────────
    const generateCalendarLink = () => {
        if (!assessment?.scheduledDate) return "#";
        const formatToGCal = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");
        const startTime = new Date(assessment.scheduledDate);
        const durationMinutes = assessment.moduleInfo?.timeLimit || 60;
        const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
        const dtStart = formatToGCal(startTime);
        const dtEnd = formatToGCal(endTime);
        const eventTitle = encodeURIComponent(`mLab Assessment: ${assessment.title}`);
        const eventDetails = encodeURIComponent(
            `Your secure assessment module is scheduled.\n\nAccess Link: ${window.location.origin}/learner/assessment/${assessmentId}`
        );
        return `https://www.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${dtStart}/${dtEnd}&details=${eventDetails}&sf=true&output=xml`;
    };

    // ─── RENDER DECISION TREE ─────────────────────────────────────────────
    if (loading) return <LoadingScreen />;

    if (isAdminIntercept) {
        return (
            <AssessmentLockedScreen
                type="admin"
                assessmentId={assessmentId}
                onBack={safeNavigateBack}
                navigate={navigate}
            />
        );
    }

    if (!assessment || !submission) {
        return (
            <AssessmentLockedScreen
                type="unavailable"
                onBack={safeNavigateBack}
            />
        );
    }

    if (assessment?.status === 'upcoming' && !isAdminIntercept && !submission?.overrideUnlock) {
        return (
            <AssessmentLockedScreen
                type="upcoming"
                onBack={safeNavigateBack}
            />
        );
    }

    if (isScheduledLocked) {
        return (
            <AssessmentLockedScreen
                type="scheduled"
                assessment={assessment}
                timeToStart={timeToStart}
                getSecureNow={getSecureNow}
                generateCalendarLink={generateCalendarLink}
                onBack={safeNavigateBack}
            />
        );
    }

    if (isMissed) {
        return (
            <AssessmentLockedScreen
                type="missed"
                onBack={safeNavigateBack}
            />
        );
    }

    if (showGate) {
        return (
            <AssessmentGate
                assessment={assessment}
                submission={submission}
                learnerProfile={learnerProfile}
                isRemediation={isRemediation}
                needsRemediationGate={needsRemediationGate}
                isAppealUpheld={isAppealUpheld}
                willBeProctored={willBeProctored}
                isSummative={isSummative}
                passedFormative={passedFormative}
                hasOverride={hasOverride}
                isFullyCompliant={isFullyCompliant}
                pendingTopics={pendingTopics}
                saving={saving}
                isStarting={isStarting}
                startDeclarationChecked={startDeclarationChecked}
                coachingAckChecked={coachingAckChecked}
                onStart={handleStartAssessment}
                onBack={safeNavigateBack}
                setStartDeclarationChecked={setStartDeclarationChecked}
                setCoachingAckChecked={setCoachingAckChecked}
                toast={toast}
            />
        );
    }

    // ─── MAIN PLAYER CONTENT ──────────────────────────────────────────────
    return (
        <AssessmentPlayerContent
            user={user}
            assessment={assessment}
            submission={submission}
            answers={answers}
            learnerProfile={learnerProfile}
            learnerEnrollment={learnerEnrollment}
            assessorProfile={assessorProfile}
            moderatorProfile={moderatorProfile}
            facilitatorProfile={facilitatorProfile}
            employers={employers}
            staff={staff}
            moduleLogs={moduleLogs}
            approvedLogs={approvedLogs}
            logsLoading={logsLoading}
            saving={saving}
            setSaving={setSaving}
            uploadProgress={uploadProgress}
            setUploadProgress={setUploadProgress}
            activeTabs={activeTabs}
            setActiveTabs={setActiveTabs}
            timeLeft={timeLeft}
            isGloballyLocked={isGloballyLocked}
            isAwaitingSignoff={isAwaitingSignoff}
            isPracticalModule={isPracticalModule}
            isWorkplaceModule={isWorkplaceModule}
            isRemediation={isRemediation}
            isAppealUpheld={isAppealUpheld}
            isFacDone={isFacDone}
            isAssDone={isAssDone}
            isModDone={isModDone}
            isSubmitted={isSubmitted}
            isMissed={isMissed}
            showGate={showGate}
            showLeaveWarning={showLeaveWarning}
            setShowLeaveWarning={setShowLeaveWarning}
            showSubmitConfirm={showSubmitConfirm}
            setShowSubmitConfirm={setShowSubmitConfirm}
            showAppealModal={showAppealModal}
            setShowAppealModal={setShowAppealModal}
            declarationChecked={declarationChecked}
            setDeclarationChecked={setDeclarationChecked}
            isMobileMenuOpen={isMobileMenuOpen}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            willBeProctored={willBeProctored}
            savedFacRole={savedFacRole}
            grandTotalAwarded={grandTotalAwarded}
            grandTotalMax={grandTotalMax}
            grandTotalPct={grandTotalPct}
            sectionTotals={sectionTotals}
            outcome={outcome}
            safeNavigateBack={safeNavigateBack}
            handleAnswerChange={handleAnswerChange}
            handleTaskAnswerChange={handleTaskAnswerChange}
            handleNestedAnswerChange={handleNestedAnswerChange}
            handleFileUpload={handleFileUpload}
            triggerSubmitConfirm={triggerSubmitConfirm}
            executeSubmit={executeSubmit}
            executeAppeal={executeAppeal}
            preventCopyPasteAndDrop={preventCopyPasteAndDrop}
            getBlockGrading={getBlockGrading}
            isBlockVerified={isBlockVerified}
            getSecureNow={getSecureNow}
            toast={toast}
            codeSnapshots={codeSnapshots}
            saveCodeSnapshot={saveCodeSnapshot}
        />
    );
};

export default AssessmentPlayer;



// // src/components/views/AssessmentPlayer/AssessmentPlayer.tsx

// import React, { useState, useEffect, useRef, useMemo } from 'react';
// import { useParams, useNavigate, useLocation } from 'react-router-dom';
// import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot } from 'firebase/firestore';
// import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import {
//     ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
//     AlertCircle, Play, Clock, GraduationCap,
//     BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
//     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
//     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
//     Briefcase, Menu, FileArchive, Video, CalendarDays
// } from 'lucide-react';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';
// import moment from 'moment';
// import './AssessmentPlayer.css';
// import { createPortal } from 'react-dom';

// import { UploadProgress } from '../../../components/common/UploadProgress';
// import { UrlPreview } from '../../../components/common/UrlPreview';
// import { ConfirmModal } from '../../../components/common/ConfirmModal';

// import mLabLogo from '../../../assets/logo/mlab_logo.png';
// import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
// import { FilePreview } from '../../FacilitatorDashboard/SubmissionReview/SubmissionReview/SubmissionReviewPreviews';

// const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] };
// const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// /* ─── HELPER: CLEAN RICH TEXT ────────────────────────────────────────────── */
// const cleanRichText = (html?: string) => {
//     if (!html) return '';
//     return html.replace(/&nbsp;/g, ' ');
// };

// /* ─── HELPER: EXTRACT PLAIN TEXT FROM HTML ───────────────────────────────── */
// const extractPlainText = (htmlString?: string) => {
//     if (!htmlString) return '';
//     const tmp = document.createElement("DIV");
//     tmp.innerHTML = htmlString;
//     return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
// };

// /* ─── PROGRESS RING COMPONENT ──────────────────────────────────────────────── */
// const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
//     const radius = (size - strokeWidth) / 2;
//     const circumference = 2 * Math.PI * radius;
//     const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;

//     return (
//         <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
//             <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
//             <circle
//                 cx={size / 2}
//                 cy={size / 2}
//                 r={radius}
//                 stroke={color}
//                 strokeWidth={strokeWidth}
//                 fill="none"
//                 strokeDasharray={circumference}
//                 strokeDashoffset={strokeDashoffset}
//                 strokeLinecap="round"
//                 style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
//             />
//         </svg>
//     );
// };

// /* ─── APPEAL MODAL ─────────────────────────────────────────────────────────── */
// const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
//     const [reason, setReason] = useState('');
//     useEffect(() => {
//         const s = document.createElement('style');
//         s.innerHTML = 'body,html{overflow:hidden!important}';
//         document.head.appendChild(s);
//         return () => { document.head.removeChild(s); };
//     }, []);
//     return createPortal(
//         <div className="ap-modal">
//             <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
//                 <div className="ap-modal-header ap-modal-header--danger">
//                     <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
//                     <div>
//                         <h2 className="ap-modal-title">Lodge Formal Appeal</h2>
//                         <p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p>
//                     </div>
//                 </div>
//                 <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
//                     <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
//                     <div className="ap-form-group">
//                         <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
//                         <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
//                     </div>
//                     <div className="ap-modal-footer">
//                         <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
//                         <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
//                     </div>
//                 </form>
//             </div>
//         </div>,
//         document.body
//     );
// };

// /* ═══════════════════════════════════════════════════════════════════════════
//    MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════ */
// const AssessmentPlayer: React.FC = () => {
//     const { assessmentId } = useParams<{ assessmentId: string }>();
//     const navigate = useNavigate();
//     const location = useLocation();

//     const safeNavigateBack = () => {
//         if (location.key === 'default') {
//             navigate(user?.role === 'learner' ? '/learner/dashboard' : '/');
//         } else {
//             navigate(-1);
//         }
//     };
//     const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
//     const toast = useToast();

//     const [loading, setLoading] = useState(true);
//     const [saving, setSaving] = useState(false);
//     const [isStarting, setIsStarting] = useState(false);

//     const [assessment, setAssessment] = useState<any>(null);
//     const [submission, setSubmission] = useState<any>(null);
//     const [answers, setAnswers] = useState<Record<string, any>>({});
//     const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
//     const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
//     const [learnerProfile, setLearnerProfile] = useState<any>(null);
//     const [learnerEnrollment, setLearnerEnrollment] = useState<any>(null);
//     const [assessorProfile, setAssessorProfile] = useState<any>(null);
//     const [moderatorProfile, setModeratorProfile] = useState<any>(null);
//     const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);
//     const [declarationChecked, setDeclarationChecked] = useState(false);
//     const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
//     const [coachingAckChecked, setCoachingAckChecked] = useState(false);
//     const [isAdminIntercept, setIsAdminIntercept] = useState(false);
//     const [showLeaveWarning, setShowLeaveWarning] = useState(false);
//     const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
//     const [showAppealModal, setShowAppealModal] = useState(false);
//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

//     const [moduleLogs, setModuleLogs] = useState<any[]>([]);
//     const [passedFormative, setPassedFormative] = useState(false);

//     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
//     const [timeLeft, setTimeLeft] = useState<number | null>(null);
//     const [timeOffset, setTimeOffset] = useState<number>(0);
//     const [timeToStart, setTimeToStart] = useState<number | null>(null);

//     const currentStatus = String(submission?.status || '').toLowerCase();
//     const isMissed = currentStatus === 'missed';
//     const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
//     const isAppealUpheld = submission?.appeal?.status === 'upheld';
//     const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
//     const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
//     const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
//     const isModDone = ['moderated', 'appealed'].includes(currentStatus);
//     const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
//     const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
//     const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
//     const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;
//     const isRemediation = (submission?.attemptNumber || 1) > 1;
//     const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged && !isAppealUpheld;
//     const isNotStarted = currentStatus === 'not_started';
//     const showGate = isNotStarted || needsRemediationGate;
//     const isLocked = isSubmitted || isAwaitingSignoff || isMissed;
//     const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

//     // QCTO Auto-Hydration States
//     const [approvedLogs, setApprovedLogs] = useState<any[]>([]);
//     const [logsLoading, setLogsLoading] = useState<boolean>(false);

//     const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
//         ? assessment.requiresInvigilation
//         : !isPracticalModule;

//     const willBeProctored = isInvigilationEnabled && !isLocked;

//     const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent) => {
//         if (!isLocked && !isPracticalModule) {
//             if (e.type === 'keydown') {
//                 const keyEvent = e as React.KeyboardEvent;
//                 if ((keyEvent.ctrlKey || keyEvent.metaKey) && ['c', 'v', 'x'].includes(keyEvent.key.toLowerCase())) {
//                     keyEvent.preventDefault();
//                     keyEvent.stopPropagation();
//                     if (keyEvent.nativeEvent?.stopImmediatePropagation) {
//                         keyEvent.nativeEvent.stopImmediatePropagation();
//                     }
//                     toast.warning("Keyboard shortcuts for Copy/Paste are disabled on Knowledge Modules.", 1500);
//                     document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to use Copy/Paste keyboard shortcuts." }));
//                 }
//             } else {
//                 e.preventDefault();
//                 e.stopPropagation();
//                 if (e.nativeEvent?.stopImmediatePropagation) {
//                     e.nativeEvent.stopImmediatePropagation();
//                 }
//                 toast.warning("Copying, pasting, and dropping content is disabled to ensure academic integrity.", 15000);
//                 document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to Paste or Drop external content into the assessment." }));
//             }
//         }
//     };

//     const workplaceInfo = useMemo(() => {
//         if (!learnerEnrollment) return null;
//         const employer = learnerEnrollment.employerId ? employers.find((e: any) => e.id === learnerEnrollment.employerId) : null;
//         const mentor = learnerEnrollment.mentorId ? staff.find((s: any) => s.id === learnerEnrollment.mentorId) : null;
//         return { employer, mentor };
//     }, [learnerEnrollment, employers, staff]);

//     const getBlockGrading = (blockId: string) => {
//         if (!isFacDone) return { score: undefined, feedback: '', facFeedback: '', assFeedback: '', modFeedback: '', facIsCorrect: null, assIsCorrect: null, modIsCorrect: null, isCorrect: null, criteriaResults: [] };
//         const g = submission?.grading || {};
//         const m = submission?.moderation || {};
//         const mLayer = m.breakdown?.[blockId] || {};
//         const aLayer = g.assessorBreakdown?.[blockId] || {};
//         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
//         const legacyLayer = g.breakdown?.[blockId] || {};
//         let activeLayer: any = legacyLayer;
//         if (isFacDone) activeLayer = fLayer;
//         if (isAssDone) activeLayer = aLayer;
//         if (isModDone) activeLayer = mLayer;
//         return {
//             score: activeLayer.score, isCorrect: activeLayer.isCorrect,
//             facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
//             assIsCorrect: aLayer.isCorrect, modIsCorrect: mLayer.isCorrect,
//             feedback: activeLayer.feedback || '', facFeedback: fLayer.feedback || legacyLayer.feedback || '',
//             assFeedback: aLayer.feedback || '', modFeedback: mLayer.feedback || '',
//             criteriaResults: activeLayer.criteriaResults || [],
//         };
//     };

//     let grandTotalAwarded = 0;
//     let grandTotalMax = 0;
//     const sectionTotals: Record<string, { total: number; awarded: number }> = {};
//     let currentSectionId = '';

//     if (assessment?.blocks) {
//         assessment.blocks.forEach((block: any) => {
//             if (block.type === 'section') {
//                 currentSectionId = block.id;
//                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
//             }
//             else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
//                 const { score } = getBlockGrading(block.id);
//                 const maxMarks = Number(block.marks) || 0;
//                 const awarded = Number(score) || 0;

//                 grandTotalMax += maxMarks;
//                 if (score !== undefined && score !== null) {
//                     grandTotalAwarded += awarded;
//                 }

//                 if (currentSectionId) {
//                     sectionTotals[currentSectionId].total += maxMarks;
//                     if (score !== undefined && score !== null) {
//                         sectionTotals[currentSectionId].awarded += awarded;
//                     }
//                 }
//             }
//         });
//     }

//     const grandTotalPct = grandTotalMax > 0 ? Math.round((grandTotalAwarded / grandTotalMax) * 100) : 0;
//     const savedFacRole = submission?.grading?.facilitatorRole || null;

//     const getCompetencyStatus = () => {
//         if (!isAssDone) return null;
//         if (isRemediation && !isLocked) return null;
//         const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
//         let isCompetent = compStr === 'c' || compStr === 'competent';

//         if (!isWorkplaceModule && !isCompetent && grandTotalAwarded !== undefined && assessment?.totalMarks)
//             isCompetent = grandTotalAwarded >= assessment.totalMarks * 0.6;

//         return {
//             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
//             color: isModDone ? 'var(--mlab-green)' : 'var(--mlab-red)',
//             subtext: isModDone ? 'Final Results Verified & Endorsed.' : isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.',
//             score: isWorkplaceModule ? undefined : grandTotalAwarded,
//             percentage: grandTotalPct,
//             isCompetent,
//         };
//     };
//     const outcome = getCompetencyStatus();

//     const getSafeDate = (ds: string) => {
//         if (!ds) return 'recently';
//         const d = new Date(ds);
//         return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
//     };

//     useEffect(() => {
//         const fetchOffset = async () => {
//             try {
//                 const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC');
//                 const data = await res.json();

//                 // Appended 'Z' to force JavaScript to parse this explicitly as UTC time.
//                 // Without the 'Z', the browser assumes SAST, throwing the clock off by exactly 2 hours.
//                 const secureUTCTime = new Date(data.dateTime + 'Z').getTime();

//                 setTimeOffset(secureUTCTime - Date.now());
//             } catch (err) {
//                 setTimeOffset(0);
//             }
//         };
//         fetchOffset();
//     }, []);

//     // useEffect(() => {
//     //     const fetchOffset = async () => {
//     //         try {
//     //             const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC');
//     //             const data = await res.json();
//     //             setTimeOffset(new Date(data.dateTime).getTime() - Date.now());
//     //         } catch (err) {
//     //             setTimeOffset(0);
//     //         }
//     //     };
//     //     fetchOffset();
//     // }, []);

//     const getSecureNow = () => Date.now() + timeOffset;

//     // 🚀 FIXED: Extremely robust direct-link data loader
//     useEffect(() => {
//         if (employers.length === 0) fetchEmployers();
//         if (staff.length === 0) fetchStaff();

//         const load = async () => {
//             if (!user?.uid || !assessmentId) return;

//             if (user.role && user.role !== 'learner') {
//                 setIsAdminIntercept(true);
//                 setLoading(false);
//                 return;
//             }

//             try {
//                 // 1. Fetch Assessment Data
//                 const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
//                 if (!assSnap.exists()) {
//                     toast.error('Assessment template not found.');
//                     setLoading(false); return;
//                 }
//                 const assData = assSnap.data();
//                 setAssessment(assData);

//                 // 2. Fetch User Profile
//                 let userProfile: any = {};
//                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
//                 if (userDocSnap.exists()) {
//                     userProfile = { id: userDocSnap.id, ...userDocSnap.data() };
//                 }
//                 setLearnerProfile(userProfile);

//                 // 3. Resolve exact identity and cohort mapping for current Learner
//                 let targetLearnerId = user.uid;
//                 let learnerCohortId: string | null = null;
//                 let validEnrollmentId: string | null = null;

//                 if (user?.role === 'learner') {
//                     try {
//                         const enrolQ = query(collection(db, 'enrollments'), where('authUid', '==', user.uid), where('status', '==', 'active'));
//                         const enrolSnap = await getDocs(enrolQ);
//                         if (!enrolSnap.empty) {
//                             const enrolData = enrolSnap.docs[0].data();
//                             validEnrollmentId = enrolSnap.docs[0].id;
//                             targetLearnerId = enrolData.learnerId || enrolData.id || user.uid;
//                             learnerCohortId = enrolData.cohortId;
//                         }
//                     } catch (e) {
//                         console.warn("Enrollment lookup failed. Using defaults.", e);
//                     }
//                 }

//                 // 4. Look for an existing submission securely using authUid
//                 let activeSub: any = null;
//                 try {
//                     const subQuery1 = query(collection(db, 'learner_submissions'), where('assessmentId', '==', assessmentId), where('authUid', '==', user.uid));
//                     const subSnap1 = await getDocs(subQuery1);

//                     if (!subSnap1.empty) {
//                         activeSub = subSnap1.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
//                     }
//                 } catch (qErr) {
//                     console.warn("Primary submission query failed.", qErr);
//                 }

//                 // 5. If missing, automatically generate it on the fly! (Overrides strict array-contains failure)
//                 if (!activeSub && user?.role === 'learner') {
//                     const fallbackCohortId = learnerCohortId || assData.cohortId || (assData.cohortIds && assData.cohortIds[0]) || 'unassigned';
//                     const isLive = ['active', 'scheduled', 'upcoming', 'published'].includes(assData.status);

//                     if (isLive) {
//                         const sid = `${fallbackCohortId}_${targetLearnerId}_${assessmentId}`;
//                         const newSub = {
//                             learnerId: targetLearnerId,
//                             enrollmentId: validEnrollmentId || "",
//                             authUid: user.uid,
//                             qualificationName: userProfile.qualification?.name || "",
//                             assessmentId: assessmentId,
//                             cohortId: fallbackCohortId,
//                             title: assData.title,
//                             type: assData.type || 'formative',
//                             moduleType: assData.moduleType || 'knowledge',
//                             status: assData.status === 'upcoming' ? 'upcoming' : 'not_started',
//                             assignedAt: new Date().toISOString(),
//                             marks: 0,
//                             totalMarks: assData.totalMarks || 0,
//                             moduleNumber: assData.moduleInfo?.moduleNumber || "",
//                             timeLimit: assData.moduleInfo?.timeLimit || 0,
//                             isScheduled: assData.isScheduled || assData.status === 'scheduled' || false,
//                             scheduledDate: assData.scheduledDate || null,
//                             createdAt: new Date().toISOString(),
//                             createdBy: "System_Player_AutoHydration"
//                         };

//                         await setDoc(doc(db, "learner_submissions", sid), newSub);
//                         activeSub = { id: sid, ...newSub };
//                     }
//                 }

//                 if (activeSub) {
//                     setSubmission(activeSub);
//                     setAnswers(activeSub.answers || {});

//                     if (activeSub.enrollmentId) { const e = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId)); if (e.exists()) setLearnerEnrollment(e.data()); }
//                     if (activeSub.grading?.gradedBy) { const s = await getDoc(doc(db, 'users', activeSub.grading.gradedBy)); if (s.exists()) setAssessorProfile(s.data()); }
//                     if (activeSub.moderation?.moderatedBy) { const s = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy)); if (s.exists()) setModeratorProfile(s.data()); }

//                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
//                     if (facId) { const s = await getDoc(doc(db, 'users', facId)); if (s.exists()) setFacilitatorProfile(s.data()); }
//                 } else {
//                     toast.error('Assessment unavailable. It may not be published yet.');
//                 }
//             } catch (err) {
//                 console.error("Fatal error loading assessment data:", err);
//                 toast.error('Failed to load assessment data.');
//             } finally {
//                 setLoading(false);
//             }
//         };

//         if (timeOffset !== null) load();
//     }, [assessmentId, user?.uid, timeOffset]);

//     // ─── FETCH COMPLIANCE LOGS FOR THE GATES ────────────────────────
//     useEffect(() => {
//         if (!submission || !user?.uid) return;

//         const _isSummative = submission.type?.toLowerCase().includes('summative');

//         if (_isSummative) {
//             const logsQ = query(
//                 collection(db, 'curriculum_logs'),
//                 where('cohortId', '==', submission.cohortId),
//                 where('moduleCode', '==', submission.moduleNumber)
//             );

//             const unsubLogs = onSnapshot(logsQ, (snap) => {
//                 setModuleLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
//             });

//             // RULE COMPLIANT
//             const formQ = query(
//                 collection(db, 'learner_submissions'),
//                 where('authUid', '==', user.uid),
//                 where('moduleNumber', '==', submission.moduleNumber),
//                 where('status', '==', 'moderated'),
//                 where('competency', '==', 'C')
//             );

//             const unsubForm = onSnapshot(formQ, (snap) => {
//                 setPassedFormative(!snap.empty);
//             });

//             return () => { unsubLogs(); unsubForm(); };
//         }
//     }, [submission?.id, user?.uid, submission?.type, submission?.cohortId, submission?.moduleNumber, submission?.learnerId]);

//     // ─── COUNTDOWN FOR SCHEDULED ASSESSMENT ─────────────────────────────────
//     useEffect(() => {
//         if (assessment?.scheduledDate && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed) {
//             const interval = setInterval(() => {
//                 const startTime = moment(assessment.scheduledDate).valueOf();
//                 const now = getSecureNow();
//                 const difference = startTime - now;

//                 if (difference <= 0) {
//                     setTimeToStart(0);
//                     clearInterval(interval);
//                 } else {
//                     setTimeToStart(difference);
//                 }
//             }, 1000);

//             return () => clearInterval(interval);
//         }
//     }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, timeOffset]);

//     const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed;

//     // ─── LIVE REAL-TIME LOCKOUT FOR "NOT STARTED" USERS ──────────────────────
//     useEffect(() => {
//         if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock) {
//             const interval = setInterval(() => {
//                 const baseTimeLimit = assessment.moduleInfo?.timeLimit || 0;
//                 const extraTime = submission?.extraTimeGranted || 0;

//                 const totalAllowedTimeMs = baseTimeLimit === 0
//                     ? (24 * 60 * 60 * 1000)
//                     : ((baseTimeLimit + extraTime + 15) * 60 * 1000);

//                 const scheduledEnd = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;

//                 if (getSecureNow() >= scheduledEnd) {
//                     updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         status: 'missed',
//                         systemNote: `Auto-swept by frontend player: Learner failed to start within the ${baseTimeLimit === 0 ? '24-hour window' : 'allotted timeframe + grace period'}.`
//                     }).catch(() => { });
//                     setSubmission((prev: any) => ({ ...prev, status: 'missed' }));
//                     clearInterval(interval);
//                 }
//             }, 10000);
//             return () => clearInterval(interval);
//         }
//     }, [isNotStarted, assessment, submission]);


//     // ─── LIVE COUNTDOWN TICKER FOR "IN PROGRESS" USERS ──────────────────────
//     useEffect(() => {
//         // Added strict null checks for assessment and submission!
//         if (!assessment || !submission || isPracticalModule || isLocked || showGate || isMissed) return;

//         const baseLimit = assessment.moduleInfo?.timeLimit || 0;
//         if (baseLimit <= 0) return; // Untimed assessment

//         // Auto-initialize the timer if it's null (e.g., after a page refresh)
//         if (timeLeft === null) {
//             const now = getSecureNow();
//             const extraTime = submission.extraTimeGranted || 0;
//             const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;
//             let endMs;

//             if (assessment.isScheduled && assessment.scheduledDate && !submission.overrideUnlock) {
//                 endMs = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
//             } else if (submission.startedAt) {
//                 endMs = new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
//             }

//             if (endMs) {
//                 setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
//             }
//             return;
//         }

//         // STALE CLOSURE FIX: We securely grab the LATEST answers right before auto-submitting
//         if (timeLeft <= 0) {
//             toast.error("Time is up! Auto-submitting.");
//             setAnswers(latestAnswers => {
//                 // Double-check submission.id exists before executing the save
//                 if (submission?.id) {
//                     forceAutoSubmit(submission.id, latestAnswers);
//                 }
//                 return latestAnswers; // return state unchanged
//             });
//             return;
//         }

//         const id = setInterval(() => {
//             const now = getSecureNow();
//             const extraTime = submission.extraTimeGranted || 0;
//             const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;

//             let endMs;

//             if (assessment.isScheduled && assessment.scheduledDate && !submission.overrideUnlock) {
//                 endMs = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
//             } else if (submission.startedAt) {
//                 endMs = new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
//             }

//             if (endMs) {
//                 setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
//             }
//         }, 1000);

//         return () => clearInterval(id);
//     }, [timeLeft, isLocked, showGate, submission?.startedAt, isPracticalModule, submission?.extraTimeGranted, isMissed, assessment, submission?.id, submission?.overrideUnlock]);


//     // // ─── LIVE COUNTDOWN TICKER FOR "IN PROGRESS" USERS ──────────────────────
//     // useEffect(() => {
//     //     if (isPracticalModule || timeLeft === null || isLocked || showGate || isMissed) return;
//     //     if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }

//     //     const id = setInterval(() => {
//     //         const now = getSecureNow();
//     //         const extraTime = submission.extraTimeGranted || 0;
//     //         const totalAllowedTimeMs = (assessment.moduleInfo.timeLimit + extraTime) * 60 * 1000;

//     //         let endMs;

//     //         if (assessment.isScheduled && assessment.scheduledDate && !submission.overrideUnlock) {
//     //             endMs = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
//     //         } else {
//     //             endMs = new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
//     //         }

//     //         setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
//     //     }, 1000);

//     //     return () => clearInterval(id);
//     // }, [timeLeft, isLocked, showGate, submission?.startedAt, isPracticalModule, submission?.extraTimeGranted, isMissed, assessment]);


//     useEffect(() => {
//         const fetchApprovedLogs = async () => {
//             // Only run this for workplace modules if the user is authenticated
//             if (!user?.uid || assessment?.moduleType !== 'workplace') {
//                 setLogsLoading(false);
//                 return;
//             }

//             try {
//                 setLogsLoading(true);
//                 const logsRef = collection(db, 'workplace_logs');
//                 const q = query(
//                     logsRef,
//                     where('learnerId', '==', user.uid),
//                     // Adjust 'moduleId' below to match however your logs relate to the assessment
//                     where('moduleId', '==', assessment.id),
//                     where('status', '==', 'Approved')
//                 );

//                 const snapshot = await getDocs(q);
//                 const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

//                 setApprovedLogs(fetchedLogs);
//             } catch (error) {
//                 console.error('Error fetching approved logs:', error);
//                 toast.error('Failed to sync verified workplace logs.');
//             } finally {
//                 setLogsLoading(false);
//             }
//         };

//         fetchApprovedLogs();
//     }, [user?.uid, assessment?.id, assessment?.moduleType]);

//     const formatTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`; };

//     const formatCountdown = (ms: number) => {
//         const days = Math.floor(ms / (1000 * 60 * 60 * 24));
//         const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
//         const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
//         const seconds = Math.floor((ms % (1000 * 60)) / 1000);

//         if (days > 0) {
//             return `${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
//         }

//         return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
//     };

//     const isSummative = submission?.type?.toLowerCase().includes('summative') || false;
//     const hasOverride = submission?.facilitatorOverride === true;
//     const pendingTopics = useMemo(() => {
//         if (!submission || !moduleLogs) return [];
//         return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
//     }, [moduleLogs, submission]);
//     const isFullyCompliant = pendingTopics.length === 0;

//     const handleStartAssessment = async () => {
//         if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)) return;
//         setIsStarting(true);
//         setSaving(true);
//         try {
//             const functions = getFunctions();
//             const startFn = httpsCallable(functions, 'startAssessment');
//             const res = await startFn({ submissionId: submission.id });
//             const data = res.data as any;
//             const t = data.startedAt || new Date(getSecureNow()).toISOString();

//             let payload: any = {};
//             if (needsRemediationGate) {
//                 payload['latestCoachingLog.acknowledged'] = true;
//                 payload['latestCoachingLog.acknowledgedAt'] = t;
//                 payload['latestCoachingLog.learnerSignatureUrl'] = learnerProfile?.signatureUrl || null;
//                 await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
//             }

//             setSubmission((p: any) => ({
//                 ...p,
//                 status: 'in_progress',
//                 startedAt: t,
//                 latestCoachingLog: p.latestCoachingLog && needsRemediationGate
//                     ? { ...p.latestCoachingLog, acknowledged: true, acknowledgedAt: t, learnerSignatureUrl: learnerProfile?.signatureUrl }
//                     : p.latestCoachingLog
//             }));

//             if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) {
//                 const extraTime = submission?.extraTimeGranted || 0;
//                 const totalAllowedTimeMs = (assessment.moduleInfo.timeLimit + extraTime) * 60 * 1000;

//                 if (assessment.isScheduled && assessment.scheduledDate && !submission.overrideUnlock) {
//                     const scheduledEnd = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
//                     setTimeLeft(Math.max(0, Math.floor((scheduledEnd - getSecureNow()) / 1000)));
//                 } else {
//                     setTimeLeft((assessment.moduleInfo.timeLimit + extraTime) * 60);
//                 }
//             }
//         } catch (err: any) {
//             toast.error(err.message || 'Failed to start assessment. Please check compliance.');
//         } finally {
//             setSaving(false);
//             setIsStarting(false);
//         }
//     };

//     const triggerAutoSave = (newAnswers: any) => {
//         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
//         setSaving(true);
//         saveTimeoutRef.current = setTimeout(async () => {
//             if (!submission?.id) return;
//             try { await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() }); }
//             catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
//         }, 1200);
//     };

//     const handleAnswerChange = (blockId: string, value: any) => {
//         if (isLocked && !isAwaitingSignoff) return;
//         setAnswers(p => { const n = { ...p, [blockId]: value }; triggerAutoSave(n); return n; });
//     };
//     const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
//         if (isLocked && !isAwaitingSignoff) return;
//         setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; triggerAutoSave(n); return n; });
//     };
//     const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
//         if (isLocked && !isAwaitingSignoff) return;
//         setAnswers(p => {
//             const blockAns = p[blockId] || {};
//             const raw = blockAns[nestedKey];
//             const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
//             const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
//             triggerAutoSave(n); return n;
//         });
//     };

//     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
//         if (!file) return;
//         const pKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
//         setUploadProgress(p => ({ ...p, [pKey]: 0 })); setSaving(true); toast.info(`Uploading ${file.name}…`);
//         try {
//             const storage = getStorage();
//             const ref = fbStorageRef(storage, `evidence/${submission.id}/${blockId}_${Date.now()}_${file.name}`);
//             const task = uploadBytesResumable(ref, file);
//             task.on('state_changed',
//                 snap => setUploadProgress(p => ({ ...p, [pKey]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
//                 err => {
//                     console.error("Firebase Storage Upload Error:", err);
//                     toast.error(`Upload failed: ${err.message}. Please try again.`);
//                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', '');
//                     else handleTaskAnswerChange(blockId, 'uploadUrl', '');
//                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
//                     setSaving(false);
//                 },
//                 async () => {
//                     const url = await getDownloadURL(task.snapshot.ref);
//                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', url);
//                     else handleTaskAnswerChange(blockId, 'uploadUrl', url);
//                     toast.success(`Uploaded: ${file.name}`);
//                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; }); setSaving(false);
//                 }
//             );
//         } catch (err: any) {
//             toast.error(`Upload failed: ${err.message}`);
//             setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
//             setSaving(false);
//         }
//     };

//     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
//         setSaving(true);
//         const t = new Date(getSecureNow()).toISOString();
//         try {
//             await updateDoc(doc(db, 'learner_submissions', subId), {
//                 answers: currentAnswers, status: 'submitted', submittedAt: t, autoSubmitted: true,
//                 learnerDeclaration: {
//                     agreed: true,
//                     timestamp: t,
//                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
//                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
//                     signatureUrl: learnerProfile?.signatureUrl || null
//                 },
//             });
//             toast.success("Time's up! Auto-submitted.");
//             setSubmission((p: any) => ({ ...p, status: 'submitted', learnerDeclaration: { signatureUrl: learnerProfile?.signatureUrl || null, timestamp: t, learnerName: learnerProfile?.fullName || 'Unknown' } }));
//             setTimeout(() => safeNavigateBack(), 3000);
//         } catch (e) { console.error(e); } finally { setSaving(false); }
//     };

//     const handleNavigationLeave = () => {
//         if (Object.keys(uploadProgress).length > 0) { toast.warning("Files are uploading. Please wait."); return; }
//         if (!isLocked && !isPracticalModule && assessment.moduleInfo?.timeLimit > 0 && !showGate && !isMissed) setShowLeaveWarning(true);
//         else safeNavigateBack();
//     };

//     const validateChecklistEvidence = () => {
//         for (const block of assessment.blocks || []) {
//             if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
//                 for (let i = 0; i < (block.criteria?.length || 0); i++) {
//                     const raw = answers[block.id]?.[`evidence_${i}`];
//                     const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
//                     const has = ev && ((ev.text && ev.text.replace(/<[^>]*>?/gm, '').trim()) || ev.url?.trim() || ev.code?.trim() || ev.uploadUrl?.trim());
//                     if (!has) return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title}".` };
//                 }
//             }
//             if (block.type === 'qcto_workplace') {
//                 const bAns = answers[block.id] || {};
//                 for (const wa of block.workActivities || []) {
//                     if (!bAns[`wa_${wa.id}_declaration`]) return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
//                     for (const se of wa.evidenceItems || []) {
//                         const ev = bAns[`se_${se.id}`] || {};
//                         const has = ev && ((ev.text && ev.text.replace(/<[^>]*>?/gm, '').trim()) || ev.url?.trim() || ev.uploadUrl?.trim());
//                         if (!has) return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
//                     }
//                 }
//             }
//         }
//         return { valid: true };
//     };

//     const triggerSubmitConfirm = () => {

//         // QCTO Ironclad Gate: Ensure all Work Activities have an approved log mapped
//         if (assessment?.moduleType === 'workplace') {
//             const workplaceBlocks = assessment.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];

//             for (const block of workplaceBlocks) {
//                 for (const wa of block.workActivities || []) {
//                     // Check if any approved log maps to this specific Work Activity ID
//                     const hasApprovedLog = approvedLogs.some(log => log.workActivityId === wa.id);

//                     if (!hasApprovedLog) {
//                         toast.error(`Missing approved log for Work Activity: ${wa.code}. You cannot submit until your mentor approves this task.`);
//                         return; // Block submission entirely
//                     }
//                 }
//             }
//         }

//         if (Object.keys(uploadProgress).length > 0) { toast.warning("Files are uploading. Please wait."); return; }
//         if (!declarationChecked) { toast.warning('You must agree to the declaration.'); return; }
//         if (isAwaitingSignoff || isPracticalModule) {
//             const chk = validateChecklistEvidence() as any;
//             if (!chk.valid) { toast.warning(chk.message); return; }
//         }
//         setShowSubmitConfirm(true);
//     };

//     const executeSubmit = async () => {
//         setShowSubmitConfirm(false);
//         setSaving(true);
//         const t = new Date(getSecureNow()).toISOString();
//         const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

//         const payload = {
//             answers,
//             status: nextStatus,
//             submittedAt: t,
//             learnerDeclaration: {
//                 agreed: true,
//                 timestamp: t,
//                 learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
//                 learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
//                 signatureUrl: learnerProfile?.signatureUrl || null
//             }
//         };

//         try {
//             await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
//             toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
//             setSubmission((p: any) => ({ ...p, status: nextStatus, learnerDeclaration: payload.learnerDeclaration }));
//             setTimeout(() => window.scrollTo(0, 0), 1000);
//         } catch (error: any) {
//             console.error("❌ Submission Error:", error);
//             toast.error(`Failed to submit: ${error.message}`);
//         } finally { setSaving(false); }
//     };

//     const executeAppeal = async (reason: string) => {
//         setShowAppealModal(false); setSaving(true);
//         try {
//             await updateDoc(doc(db, 'learner_submissions', submission.id), { status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' }, lastStaffEditAt: new Date().toISOString() });
//             toast.success("Formal appeal lodged successfully.");
//             setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
//         } catch { toast.error("Failed to lodge appeal."); } finally { setSaving(false); }
//     };

//     const renderBlockImage = (block: any) => {
//         if (!block.imageUrl) return null;
//         return (
//             <div style={{ margin: '1rem 0', textAlign: 'center' }}>
//                 <img
//                     src={block.imageUrl}
//                     alt={block.imageCaption || "Assessment attachment"}
//                     style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }}
//                 />
//                 {block.imageCaption && (
//                     <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>
//                         {block.imageCaption}
//                     </p>
//                 )}
//             </div>
//         );
//     };

//     const generateCalendarLink = () => {
//         if (!assessment?.scheduledDate) return "#";

//         const formatToGCal = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");

//         const startTime = new Date(assessment.scheduledDate);
//         const durationMinutes = assessment.moduleInfo?.timeLimit || 60;
//         const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

//         const dtStart = formatToGCal(startTime);
//         const dtEnd = formatToGCal(endTime);

//         const eventTitle = encodeURIComponent(`mLab Assessment: ${assessment.title}`);
//         const eventDetails = encodeURIComponent(
//             `Your secure assessment module is scheduled.\n\nAccess Link: ${window.location.origin}/learner/assessment/${assessmentId}`
//         );

//         return `https://www.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${dtStart}/${dtEnd}&details=${eventDetails}&sf=true&output=xml`;
//     };

//     if (loading) return (
//         <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
//             <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
//         </div>
//     );

//     if (isAdminIntercept) return (
//         <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
//             <div className="ap-state-card">
//                 <div className="ap-state-card__icon-wrap"><ShieldAlert size={32} color="var(--mlab-blue)" /></div>
//                 <h1 className="ap-state-card__title">Staff Access Detected</h1>
//                 <p className="ap-state-card__desc">This area is restricted to learners only.<br />Use Preview mode to view assessments without affecting learner data.</p>
//                 <div className="ap-state-card__actions">
//                     <button style={{ borderRadius: 0 }} className="ap-btn ap-btn--outline" onClick={() => safeNavigateBack()}><ArrowLeft size={14} /> Go Back</button>
//                     <button style={{ borderRadius: 0 }} className="ap-btn ap-btn--primary" onClick={() => navigate(`/admin/assessment/preview/${assessmentId}`)}>Open Preview Mode</button>
//                 </div>
//             </div>
//         </div>
//     );

//     if (!assessment || !submission) return (
//         <div className="ap-fullscreen" style={{ position: 'absolute', right: 0, left: 0, bottom: 0, top: 0 }}>
//             <div className="ap-state-card">
//                 <div className="ap-state-card__icon-wrap ap-state-card__icon-wrap--dim"><AlertCircle size={32} color="var(--mlab-grey)" /></div>
//                 <h2 className="ap-state-card__title">Assessment Unavailable</h2>
//                 <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Contact your facilitator if you believe this is an error.</p>
//                 <div className="ap-state-card__actions">
//                     <button className="ap-btn ap-btn--outline" onClick={() => safeNavigateBack()}>
//                         <ArrowLeft size={14} /> Return to Portfolio
//                     </button>
//                 </div>
//             </div>
//         </div>
//     );

//     if (isScheduledLocked) {
//         const remaining = timeToStart !== null && timeToStart > 0 ? timeToStart : Math.max(0, moment(assessment.scheduledDate).valueOf() - getSecureNow());
//         const startDate = moment(assessment.scheduledDate);
//         const remainingMinutes = Math.floor(remaining / 60000);
//         let timerColor = 'var(--mlab-blue)';
//         let timerBorderColor = 'var(--mlab-blue)';
//         let timerAnimation = '';

//         if (remainingMinutes <= 2) {
//             timerColor = '#dc2626';
//             timerBorderColor = '#dc2626';
//             timerAnimation = 'pulse 1s infinite';
//         } else if (remainingMinutes <= 10) {
//             timerColor = '#f97316';
//             timerBorderColor = '#f97316';
//         }

//         return (
//             <div className="lfm-overlay">
//                 <div className="lfm-modal" style={{
//                     width: '95%',
//                     maxWidth: '900px',
//                     animation: 'lfm-fadeIn 0.3s ease both',
//                     margin: '20px auto',
//                     background: 'white',
//                     boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
//                 }}>
//                     <div className="lfm-header" style={{
//                         padding: '1.5rem 2rem',
//                         borderBottom: '5px solid var(--mlab-green)'
//                     }}>
//                         <h2 className="lfm-header__title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                             <ShieldCheck size={24} color="var(--mlab-green)" />
//                             Assessment Locked & Scheduled
//                         </h2>
//                     </div>

//                     <div className="lfm-body" style={{ padding: '0' }}>
//                         <div style={{
//                             display: 'grid',
//                             gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
//                             gap: '0'
//                         }}>
//                             <div style={{
//                                 padding: '2rem',
//                                 textAlign: 'left',
//                                 borderRight: '1px solid var(--mlab-border)',
//                                 background: '#fcfcfc'
//                             }}>
//                                 <div style={{ marginBottom: '1.5rem' }}>
//                                     <h1 style={{ fontSize: '1.5rem', color: 'var(--mlab-midnight)', margin: '0 0 8px 0', fontWeight: 800 }}>
//                                         {assessment.title}
//                                     </h1>
//                                     <div style={{ display: 'flex', gap: '8px', color: 'var(--mlab-grey)', fontSize: '0.85rem', fontWeight: 600 }}>
//                                         <BookOpen size={14} />
//                                         <span>Module {assessment.moduleInfo?.moduleNumber || '—'}</span>
//                                     </div>
//                                 </div>

//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
//                                     <section>
//                                         <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--mlab-blue)', letterSpacing: '0.05em', marginBottom: '8px' }}>
//                                             About this Assessment
//                                         </h4>
//                                         <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
//                                             This assessment is strictly scheduled and currently secured. To ensure academic integrity and a synchronized start for all learners, access is restricted until the official commencement time.
//                                         </p>
//                                     </section>

//                                     <section style={{ padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '4px solid var(--mlab-green)', borderRadius: '4px' }}>
//                                         <div style={{ display: 'flex', gap: '12px' }}>
//                                             <Info size={20} color="var(--mlab-green)" style={{ flexShrink: 0 }} />
//                                             <div>
//                                                 <strong style={{ display: 'block', fontSize: '0.85rem', color: '#166534', marginBottom: '4px' }}>Learner Flexibility</strong>
//                                                 <p style={{ fontSize: '0.85rem', color: '#166534', lineHeight: 1.5, margin: 0 }}>
//                                                     You are <strong>not required</strong> to keep this tab open. You may close this window and return to the Learner Portal exactly at the start time. If you choose to stay, this page will automatically unlock once the countdown reaches zero.
//                                                 </p>
//                                             </div>
//                                         </div>
//                                     </section>

//                                     <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
//                                         <strong>Note:</strong> Standard invigilation and proctoring rules will apply immediately upon the assessment unlocking. Ensure your camera and microphone are ready <b style={{ color: 'red' }}>IF APPLICABLE</b>.
//                                     </p>
//                                 </div>
//                             </div>

//                             <div style={{
//                                 padding: '2rem',
//                                 display: 'flex',
//                                 flexDirection: 'column',
//                                 justifyContent: 'center',
//                                 alignItems: 'center',
//                                 gap: '1.5rem',
//                                 background: 'white'
//                             }}>
//                                 <div style={{ textAlign: 'center' }}>
//                                     <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--mlab-grey)', letterSpacing: '0.1em' }}>Commencement Time</span>
//                                     <div style={{
//                                         marginTop: '8px',
//                                         padding: '8px 16px',
//                                         background: 'var(--mlab-blue)',
//                                         color: 'white',
//                                         borderRadius: '4px',
//                                         fontWeight: 700,
//                                         fontSize: '1rem'
//                                     }}>
//                                         {startDate.format("dddd, D MMMM YYYY [at] HH:mm")}
//                                     </div>
//                                 </div>

//                                 <div style={{
//                                     background: 'var(--mlab-bg)',
//                                     border: `2px solid ${timerBorderColor}`,
//                                     borderLeft: `5px solid ${timerColor}`,
//                                     width: '100%',
//                                     padding: '1.5rem',
//                                     borderRadius: '4px',
//                                     textAlign: 'center',
//                                     transition: 'border-color 0.3s ease'
//                                 }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
//                                         <Clock size={18} color={timerColor} />
//                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
//                                             System Unlocks In
//                                         </span>
//                                     </div>
//                                     <div style={{
//                                         fontSize: 'clamp(2.5rem, 8vw, 3.5rem)',
//                                         fontWeight: '900',
//                                         fontFamily: 'monospace',
//                                         color: timerColor,
//                                         letterSpacing: '2px',
//                                         lineHeight: 1,
//                                         animation: timerAnimation
//                                     }}>
//                                         {formatCountdown(remaining)}
//                                     </div>
//                                 </div>

//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
//                                     <div style={{
//                                         display: 'flex',
//                                         alignItems: 'center',
//                                         gap: '8px',
//                                         padding: '10px',
//                                         background: '#fffbeb',
//                                         border: '1px solid #fef3c7',
//                                         borderRadius: '4px',
//                                         textAlign: 'left'
//                                     }}>
//                                         <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0 }} />
//                                         <span style={{ fontSize: '0.75rem', color: '#92400e', lineHeight: 1.4 }}>
//                                             You must be signed into <strong>Google/Gmail</strong> to receive a calendar reminder.
//                                         </span>
//                                     </div>

//                                     <a
//                                         href={generateCalendarLink()}
//                                         target="_blank"
//                                         rel="noopener noreferrer"
//                                         className="ap-btn ap-btn--primary"
//                                         style={{
//                                             justifyContent: 'center',
//                                             gap: '8px',
//                                             width: '100%',
//                                             textDecoration: 'none',
//                                             background: '#4285F4',
//                                             borderColor: '#4285F4',
//                                             borderRadius: '4px',
//                                             padding: '14px',
//                                             fontWeight: 600
//                                         }}
//                                     >
//                                         <CalendarDays size={18} /> Sync to Google Calendar
//                                     </a>

//                                     <button
//                                         onClick={() => safeNavigateBack()}
//                                         className="ap-btn ap-btn--outline"
//                                         style={{
//                                             justifyContent: 'center',
//                                             gap: '8px',
//                                             width: '100%',
//                                             color: 'var(--mlab-grey)',
//                                             borderRadius: '4px',
//                                             padding: '14px'
//                                         }}
//                                     >
//                                         <ArrowLeft size={16} /> Return to Dashboard
//                                     </button>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             </div>
//         );
//     }

//     if (isMissed) {
//         return (
//             <div className="lfm-overlay">
//                 <div className="lfm-modal" style={{ width: '95%', maxWidth: '600px', margin: '20px auto', border: '2px solid var(--mlab-red)' }}>
//                     <div className="lfm-header" style={{ borderBottom: '3px solid var(--mlab-red)', background: 'var(--mlab-red)' }}>
//                         <h2 className="lfm-header__title">
//                             <ShieldAlert size={20} color="var(--mlab-white)" />
//                             Assessment Missed
//                         </h2>
//                     </div>
//                     <div className="lfm-body">
//                         <div className="lfm-error-banner">
//                             <AlertTriangle size={20} />
//                             <span>The scheduled time window for this assessment has closed. Because you did not begin the assessment within the allowed timeframe, it has been automatically locked.</span>
//                         </div>
//                         <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
//                             <button className="lfm-btn lfm-btn--primary" onClick={() => safeNavigateBack()} style={{ background: 'var(--mlab-red)' }}>
//                                 <ArrowLeft size={16} /> Return to Portfolio
//                             </button>
//                         </div>
//                     </div>
//                 </div>
//             </div>
//         );
//     }

//     if (assessment?.status === 'upcoming' && !isAdminIntercept && !submission?.overrideUnlock) {
//         return (
//             <div className="ap-fullscreen" style={{ position: 'absolute', right: 0, left: 0, bottom: 0, top: 0, backgroundColor: '#f8fafc' }}>
//                 <div className="ap-state-card" style={{ borderTop: '4px solid var(--mlab-blue)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
//                     <div className="ap-state-card__icon-wrap ap-state-card__icon-wrap--dim" style={{ background: '#e0f2fe' }}>
//                         <Lock size={32} color="#0284c7" />
//                     </div>
//                     <h2 className="ap-state-card__title" style={{ color: '#0f172a' }}>Module Coming Soon</h2>
//                     <p className="ap-state-card__desc">This workbook is currently locked by your facilitator. It will automatically unlock as you progress through the curriculum.</p>
//                     <div className="ap-state-card__actions">
//                         <button className="ap-btn ap-btn--primary" onClick={() => safeNavigateBack()}>
//                             <ArrowLeft size={14} /> Return to Portfolio
//                         </button>
//                     </div>
//                 </div>
//             </div>
//         );
//     }

//     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
//         if (block.type === 'section') {
//             acc.push({ type: 'section', label: block.title, id: block.id });
//         } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
//             const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
//             acc.push({ type: 'q', label: cleanLabel, id: block.id });
//         }
//         return acc;
//     }, []) || [];

//     let displayStatus = submission.status.replace('_', ' ');
//     if (submission.status === 'returned') displayStatus = 'revision required';
//     const canEditTask = !isLocked || isAwaitingSignoff;
//     const canEditChecklist = isAwaitingSignoff;
//     const canEditLogbook = !isLocked || isAwaitingSignoff;
//     const canEditWorkplace = !isLocked || isAwaitingSignoff;
//     let qNum = 0;

//     if (showGate) return (
//         <div className="ap-gate ap-animate" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
//             <div className="ap-gate-topbar">
//                 <button className="ap-gate-topbar__back" onClick={() => safeNavigateBack()}>
//                     <ArrowLeft size={14} /> Back to Portfolio
//                 </button>
//                 <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
//             </div>
//             <div className="ap-gate-body">
//                 <div className="ap-gate-left">
//                     <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
//                     <h1 className="ap-gate-left__title">
//                         {assessment.title}
//                         {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
//                         {isAppealUpheld && <span className="ap-gate-appeal-badge">Appeal Granted</span>}
//                     </h1>
//                     <p className="ap-gate-left__sub">
//                         {isAppealUpheld ? "A new attempt has been granted by the Academic Board following your successful appeal."
//                             : isRemediation ? "This is a fresh attempt. Use the Facilitator's Coaching Notes below to correct your answers."
//                                 : "Read all instructions carefully before starting."}
//                     </p>

//                     {willBeProctored && (
//                         <div className="ap-workplace-banner " style={{ background: '#fff1f2', padding: 16, marginBottom: 16, borderColor: '#fecdd3', borderLeftColor: '#e11d48' }}>
//                             <strong className="ap-workplace-banner__title ap-info-card__label" style={{ color: '#be123c', fontSize: 14 }}>
//                                 <ShieldAlert size={16} /> Secure Proctored Environment
//                             </strong>
//                             <p className="ap-workplace-banner__text" style={{ color: '#881337' }}>
//                                 This is a strictly invigilated assessment. You will be required to grant <strong>Camera and Microphone</strong> permissions and complete the test in <strong>Fullscreen Mode</strong>. Exiting fullscreen or switching browser tabs will immediately log a security violation to your Assessor.
//                             </p>
//                         </div>
//                     )}

//                     {assessment?.isOpenBook && assessment?.referenceManualUrl && (
//                         <div className="ap-openbook-banner" style={{ marginBottom: 16 }}>
//                             <strong className="ap-openbook-banner__title ap-info-card__label" style={{ textTransform: 'uppercase', fontSize: 14 }}><FileArchive size={16} /> Open Book Assessment</strong>
//                             <p className="ap-openbook-banner__text">This is an open-book assessment. An official Reference Manual has been provided by your facilitator. You can access it inside the player at any time.</p>
//                         </div>
//                     )}

//                     {assessment?.moduleType === 'workplace' && (
//                         <div className="ap-workplace-banner">
//                             <strong className="ap-workplace-banner__title"><Briefcase size={16} /> Workplace Experience Logbook</strong>
//                             <p className="ap-workplace-banner__text">This module is a <strong>Learner Logbook</strong>. It tracks and verifies your real-world workplace experience. You will map tasks to specific Work Activities (WA), record your hours, and upload Supporting Evidence (SE) for review by your designated Workplace Mentor.</p>
//                         </div>
//                     )}

//                     {needsRemediationGate && (
//                         <div className="ap-coaching-log">
//                             <strong className="ap-coaching-log__title"><MessageSquare size={16} /> Remediation Coaching Log</strong>
//                             <p className="ap-coaching-log__desc">Before beginning Attempt #{submission.attemptNumber}, QCTO compliance requires you to acknowledge the feedback session conducted by your facilitator.</p>
//                             <div className="ap-coaching-log__quote">
//                                 <span className="ap-coaching-log__quote-label">Facilitator Notes ({getSafeDate(submission.latestCoachingLog.date)}):</span>
//                                 <p className="ap-coaching-log__quote-text">"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
//                             </div>
//                             <label className="ap-coaching-log__ack">
//                                 <input type="checkbox" checked={coachingAckChecked} onChange={e => setCoachingAckChecked(e.target.checked)} />
//                                 <span className="ap-coaching-log__ack-label">I acknowledge that I received the coaching/feedback detailed above.</span>
//                             </label>
//                         </div>
//                     )}

//                     <div className="ap-info-grid">
//                         <div className="ap-info-card"><div className="ap-info-card__label"><BookOpen size={12} /> Module</div><div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div><div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div></div>
//                         <div className="ap-info-card"><div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div><div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div><div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div></div>
//                         <div className="ap-info-card">
//                             <div className="ap-info-card__label"><Clock size={12} /> Time Limit</div>
//                             <div className="ap-info-card__value">
//                                 {assessment.moduleInfo?.timeLimit
//                                     ? `${assessment.moduleInfo.timeLimit + (submission.extraTimeGranted || 0)} Min`
//                                     : 'No Limit'}
//                             </div>
//                             <div className="ap-info-card__sub">
//                                 {submission.extraTimeGranted ? <span style={{ color: 'var(--mlab-green)' }}>Includes +{submission.extraTimeGranted} min extension.</span> : assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}
//                             </div>
//                         </div>
//                         {!isWorkplaceModule
//                             ? <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Total Marks</div><div className="ap-info-card__value">{assessment.totalMarks}</div><div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div></div>
//                             : <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Grading</div><div className="ap-info-card__value">C / NYC</div><div className="ap-info-card__sub">Competency-based. No numerical score.</div></div>}
//                     </div>

//                     <div className="ap-note-block">
//                         <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
//                         <div className="ap-note-block__text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.') }} />

//                         {assessment.purpose && (
//                             <>
//                                 <div className="ap-note-block__heading"><Info size={12} /> Purpose</div>
//                                 <div className="ap-note-block__text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.purpose) }} />
//                             </>
//                         )}
//                     </div>
//                 </div>

//                 <div className="ap-gate-right">
//                     <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
//                     <ul className="ap-rules-list">
//                         {willBeProctored && (
//                             <li className="ap-rule-item">
//                                 <div className="ap-rule-icon" style={{ background: '#fff1f2', color: '#e11d48' }}><Video size={18} /></div>
//                                 <div>
//                                     <span className="ap-rule-title" style={{ color: '#be123c' }}>Live Invigilation</span>
//                                     <p className="ap-rule-desc">Your webcam and screen activity are actively monitored. Tab-switching is disabled.</p>
//                                 </div>
//                             </li>
//                         )}
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or unauthorized AI tools violate QCTO guidelines.</p></div></li>
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly a group project, no collaboration is permitted.</p></div></li>
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
//                         {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser. Plan your time carefully.</p></div></li>}
//                     </ul>

//                     {isSummative && !passedFormative && !hasOverride && !isAppealUpheld ? (
//                         <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
//                             <strong style={{ color: '#be123c', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
//                                 <ShieldAlert size={18} /> Readiness Not Met
//                             </strong>
//                             <p style={{ color: '#9f1239', fontSize: '0.85rem', margin: 0 }}>
//                                 You must achieve Competency (C) in your Formative Assessment before unlocking this Summative Exam.
//                             </p>
//                         </div>
//                     ) : !isFullyCompliant ? (
//                         <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
//                             <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
//                                 <AlertTriangle size={18} /> Compliance Action Required
//                             </strong>
//                             <p style={{ color: '#92400e', fontSize: '0.85rem', marginBottom: '1rem' }}>
//                                 Acknowledge the delivery of these module topics before the exam will unlock:
//                             </p>
//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                 {pendingTopics.map((log: any) => (
//                                     <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #fde68a' }}>
//                                         <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>{log.topicTitle}</span>
//                                         <button
//                                             className="mlab-btn mlab-btn--sm"
//                                             style={{ background: 'var(--mlab-green)', color: 'white', border: 'none', padding: '4px 8px', fontSize: '0.7rem' }}
//                                             onClick={async () => {
//                                                 try {
//                                                     const ackFn = httpsCallable(getFunctions(), 'acknowledgeCurriculumTopic');
//                                                     await ackFn({ logId: log.id, learnerId: submission.learnerId });
//                                                     toast.success("Topic Acknowledged!");
//                                                 } catch {
//                                                     toast.error("Failed to acknowledge.");
//                                                 }
//                                             }}
//                                         >
//                                             Acknowledge
//                                         </button>
//                                     </div>
//                                 ))}
//                             </div>
//                         </div>
//                     ) : (
//                         <div className="ap-declaration">
//                             <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
//                                 <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
//                                 <span className="ap-declaration-check__text"><strong>Declaration of Authenticity</strong> I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.</span>
//                             </label>
//                             <button className={`ap-start-btn${(startDeclarationChecked && (!needsRemediationGate || coachingAckChecked)) ? ' ap-start-btn--ready' : ''}`} onClick={handleStartAssessment} disabled={saving || isStarting || !startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)}>
//                                 {saving || isStarting ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> {needsRemediationGate ? `Acknowledge & Resume Attempt #${submission.attemptNumber}` : 'I Agree, Begin Assessment'}</>}
//                             </button>
//                         </div>
//                     )}
//                 </div>
//             </div>
//         </div>
//     );

//     return (
//         <ProctoringWrapper
//             assessmentId={assessmentId || ''}
//             learnerId={user?.uid || ''}
//             isProctored={willBeProctored}
//         >
//             <div className="ap-player ap-animate">
//                 <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//                 {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

//                 {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={() => safeNavigateBack()} onCancel={() => setShowLeaveWarning(false)} />}
//                 {showSubmitConfirm && <ConfirmModal title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"} message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."} confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"} cancelText="Go Back" onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}
//                 {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

//                 {/* ── TOP BAR ── */}
//                 <div className="ap-player-topbar no-print">
//                     <div className="ap-player-topbar__left">
//                         <button className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
//                         <button className="ap-player-topbar__back" onClick={handleNavigationLeave}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
//                         <div className="ap-player-topbar__separator ap-hide-mobile" />
//                         <h1 className="ap-player-topbar__title">
//                             {assessment.title}
//                             {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
//                         </h1>
//                     </div>
//                     <div className="ap-player-topbar__right">
//                         {assessment?.isOpenBook && assessment?.referenceManualUrl && (
//                             <button className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}>
//                                 <FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span>
//                             </button>
//                         )}
//                         {isLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
//                         {/* {!isLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>} */}
//                         {/* Active Countdown Timer */}
//                         {!isLocked && !isPracticalModule && timeLeft !== null && (
//                             <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}>
//                                 <Timer size={14} /> {formatTime(timeLeft)}
//                             </div>
//                         )}

//                         {/* Frozen 'Time Taken' Badge (Shows ONLY when submitted) */}
//                         {isLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && (
//                             <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}>
//                                 <Timer size={14} />
//                                 {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken
//                             </div>
//                         )}

//                         {!isLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
//                         <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>
//                             {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}
//                         </span>
//                         <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
//                     </div>
//                 </div>

//                 {/* ── BODY ── */}
//                 <div className={`ap-player-body${isLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>

//                     {/* ── LEFT SIDEBAR ── */}
//                     <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
//                         <button className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>

//                         <div className="ap-sidebar__meta-block">
//                             <div className="ap-sidebar__meta-title">{assessment.title}</div>
//                             {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
//                             <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
//                             {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
//                             {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
//                         </div>

//                         {/* SCORE DISPLAY FOR LEARNER */}
//                         {!isWorkplaceModule && isFacDone && (
//                             <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
//                                 <div className="ap-score-card__stripe" aria-hidden="true" />

//                                 <div className="ap-score-card__state">
//                                     {isModDone ? (
//                                         <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</>
//                                     ) : (
//                                         <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>
//                                     )}
//                                 </div>

//                                 <div className="ap-score-card__body">
//                                     <div className="ap-score-card__ring-wrap">
//                                         <ProgressRing
//                                             progress={grandTotalPct}
//                                             size={72}
//                                             strokeWidth={5}
//                                             color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'}
//                                         />
//                                         <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>
//                                             {grandTotalPct}%
//                                         </span>
//                                     </div>
//                                     <div className="ap-score-card__divider" aria-hidden="true" />
//                                     <div className="ap-score-card__fraction">
//                                         <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
//                                         <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
//                                         <span className="ap-score-card__pass-note">
//                                             Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)
//                                         </span>
//                                     </div>
//                                 </div>

//                                 {isModDone && outcome && (
//                                     <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>
//                                         {outcome.isCompetent
//                                             ? <><CheckCircle size={13} /> Competent (C)</>
//                                             : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}
//                                     </div>
//                                 )}
//                             </div>
//                         )}

//                         {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
//                             <>
//                                 <div className="ap-sidebar__label">Status Tracking</div>
//                                 <div className="ap-sidebar__status-box">
//                                     {isAssDone && outcome ? (
//                                         <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
//                                             <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
//                                             {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
//                                             {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
//                                             <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
//                                         </div>
//                                     ) : (
//                                         <div className="ap-sidebar__awaiting">
//                                             <Clock size={20} color="rgba(255,255,255,0.25)" />
//                                             <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
//                                             <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
//                                         </div>
//                                     )}
//                                     {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
//                                     {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
//                                     {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

//                                     {submission?.appeal?.status && submission.appeal.status !== 'pending' && (
//                                         <div className="ap-sidebar__feedback" style={{ background: submission.appeal.status === 'upheld' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)', borderLeftColor: submission.appeal.status === 'upheld' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)' }}>
//                                             <strong className="ap-sidebar__feedback__heading" style={{ color: submission.appeal.status === 'upheld' ? '#4ade80' : '#ef4444' }}>
//                                                 <Scale size={11} /> Board Appeal {submission.appeal.status === 'upheld' ? 'Granted' : 'Rejected'}
//                                             </strong>
//                                             <p className="ap-sidebar__feedback__text" style={{ color: submission.appeal.status === 'upheld' ? '#4ade80' : '#ef4444' }}>
//                                                 "{submission.appeal.resolutionNotes}"
//                                             </p>
//                                         </div>
//                                     )}

//                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? (savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator') : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div></div>
//                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
//                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>
//                                 </div>
//                             </>
//                         )}

//                         <div className="ap-sidebar__label">Workbook Contents</div>
//                         <div className="ap-sidebar__nav">
//                             {navItems.map((item: any) =>
//                                 item.type === 'section'
//                                     ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
//                                     : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
//                             )}
//                         </div>
//                     </nav>

//                     {/* ── CONTENT ── */}
//                     <div className="ap-player-content print-pane">

//                         {/* Print cover */}
//                         {isLocked && !isAwaitingSignoff && (
//                             <div className="print-only-cover">
//                                 <div className="print-page print-page--cover">
//                                     <div className="print-cover__logo-bar">
//                                         <img height={50} src={mLabLogo} alt="Institution Logo" />
//                                         <span className="print-cover__doc-type">Official Assessment Workbook</span>
//                                     </div>
//                                     <div className="print-cover__title-block">
//                                         <h1 className="print-cover__module-title">
//                                             {assessment?.moduleInfo?.moduleName || assessment?.title}
//                                         </h1>
//                                         <div className="print-cover__meta-chips">
//                                             <span className="print-cover__chip">NQF Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</span>
//                                             <span className="print-cover__chip">Credits: {assessment?.moduleInfo?.credits || 'N/A'}</span>
//                                             <span className="print-cover__chip">Hours: {assessment?.moduleInfo?.notionalHours || 'N/A'}</span>
//                                             {submission?.attemptNumber > 1 && <span className="print-cover__chip print-cover__chip--attempt">Attempt #{submission.attemptNumber}</span>}
//                                         </div>
//                                         <h2 className="print-cover__doc-subtitle">
//                                             LEARNER {assessment?.moduleType === 'workplace' ? 'WORKPLACE LOGBOOK' : 'WORKBOOK'}
//                                         </h2>
//                                     </div>

//                                     {/* Timing & Duration Audit */}
//                                     {isLocked && !isPracticalModule && (
//                                         <div className="ap-print-only-timing-block" style={{
//                                             marginTop: '20px',
//                                             marginBottom: '20px',
//                                             borderRadius: '8px',
//                                         }}>
//                                             <div className="print-cover__table-heading">TIMING & DURATION AUDIT</div>
//                                             <table className="print-table">
//                                                 <tbody>
//                                                     <tr><td className="print-table__label">Maximum Allowed Time: </td><td> {(assessment?.moduleInfo?.timeLimit || 0) + (submission?.extraTimeGranted || 0) > 0
//                                                         ? `${(assessment?.moduleInfo?.timeLimit || 0) + (submission?.extraTimeGranted || 0)} Minutes`
//                                                         : 'Untimed'}</td></tr>
//                                                     <tr><td className="print-table__label">Actual Time Taken:  </td><td>{submission?.startedAt && submission?.submittedAt
//                                                         ? formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))
//                                                         : 'N/A'}</td></tr>
//                                                     <tr><td className="print-table__label">Session Started: </td><td>{submission?.startedAt ? getSafeDate(submission.startedAt) : 'N/A'}</td></tr>
//                                                     <tr><td className="print-table__label">Session Submitted:</td><td>{submission?.submittedAt ? getSafeDate(submission.submittedAt) : 'N/A'}</td></tr>
//                                                 </tbody>
//                                             </table>
//                                         </div>
//                                     )}
//                                     <div className="print-cover__tables">
//                                         <div className="print-cover__table-group">
//                                             <div className="print-cover__table-heading">MODULE INFORMATION</div>
//                                             <table className="print-table">
//                                                 <tbody>
//                                                     <tr><td className="print-table__label">Module Number</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
//                                                     <tr><td className="print-table__label">NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
//                                                     <tr><td className="print-table__label">Notional Hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
//                                                     <tr><td className="print-table__label">Credits</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
//                                                     <tr><td className="print-table__label">Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
//                                                     <tr><td className="print-table__label">SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
//                                                     <tr><td className="print-table__label">Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
//                                                 </tbody>
//                                             </table>
//                                         </div>
//                                         <div className="print-cover__table-group">
//                                             <div className="print-cover__table-heading">LEARNER CONTACT INFORMATION</div>
//                                             <table className="print-table">
//                                                 <tbody>
//                                                     <tr><td className="print-table__label">Full Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '________________________'}</td></tr>
//                                                     <tr><td className="print-table__label">ID Number</td><td>{submission?.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber || '________________________'}</td></tr>
//                                                     <tr><td className="print-table__label">Email Address</td><td>{learnerProfile?.email || user?.email || '________________________'}</td></tr>
//                                                     <tr><td className="print-table__label">Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
//                                                     <tr><td className="print-table__label">Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
//                                                     <tr><td className="print-table__label">Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
//                                                 </tbody>
//                                             </table>
//                                         </div>
//                                     </div>
//                                     {assessment?.moduleType === 'workplace' && workplaceInfo?.employer && (
//                                         <div className="print-cover__table-group">
//                                             <div className="print-cover__table-heading">WORKPLACE PLACEMENT DETAILS</div>
//                                             <table className="print-table">
//                                                 <tbody>
//                                                     <tr><td className="print-table__label">Host Company Name</td><td>{workplaceInfo.employer.name}</td></tr>
//                                                     <tr><td className="print-table__label">Registration / SETA Number</td><td>{workplaceInfo.employer.registrationNumber || 'N/A'}</td></tr>
//                                                     <tr><td className="print-table__label">Physical Address</td><td>{workplaceInfo.employer.physicalAddress || '________________________'}</td></tr>
//                                                     <tr><td className="print-table__label">Contact Person</td><td>{workplaceInfo.employer.contactPerson}</td></tr>
//                                                     <tr><td className="print-table__label">Assigned Workplace Mentor</td><td>{workplaceInfo.mentor?.fullName || '________________________'}</td></tr>
//                                                     <tr><td className="print-table__label">Mentor Contact</td><td>{workplaceInfo.employer.contactEmail || workplaceInfo.mentor?.email}</td></tr>
//                                                 </tbody>
//                                             </table>
//                                         </div>
//                                     )}
//                                     <div className="print-cover__footer-bar">
//                                         <span>Printed: {new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
//                                         <span>Submission ID: {submission?.id?.slice(0, 12) || 'N/A'}</span>
//                                     </div>
//                                 </div>

//                                 <div className="print-page print-page--instructions">
//                                     <h2 className="print-section-heading">Note to the Learner</h2>
//                                     {/* 🚀 FIXED HTML PARSING FOR PRINT */}
//                                     <div className="print-body-text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment?.instructions || '') }} />

//                                     {assessment?.purpose && (
//                                         <>
//                                             <h2 className="print-section-heading">Purpose of this Module</h2>
//                                             {/* 🚀 FIXED HTML PARSING FOR PRINT */}
//                                             <div className="print-body-text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment?.purpose || '') }} />
//                                         </>
//                                     )}
//                                     <h2 className="print-section-heading">Topic Elements Covered</h2>
//                                     <table className="print-table print-table--topics">
//                                         <thead><tr><th className="print-table__th">Section</th><th className="print-table__th print-table__th--narrow">Weighting</th></tr></thead>
//                                         <tbody>
//                                             {assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, i: number) => {
//                                                 const tot = sectionTotals[sec.id]?.total || 0;
//                                                 return (
//                                                     <tr key={i}>
//                                                         <td><strong>Section {i + 1}: </strong>{sec.title}</td>
//                                                         <td className="print-table__td--center">
//                                                             {isWorkplaceModule ? 'Competency Based' : (tot > 0 && assessment.totalMarks ? `${Math.round((tot / assessment.totalMarks) * 100)}%` : '—')}
//                                                         </td>
//                                                     </tr>
//                                                 );
//                                             })}
//                                         </tbody>
//                                     </table>
//                                 </div>

//                                 {/* Remediation record page */}
//                                 {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
//                                     <div className="print-page print-page--remediation">
//                                         <h2 className="print-section-heading">Record of Developmental Intervention (Remediation)</h2>
//                                         <p className="print-body-text">Official evidence of a developmental intervention conducted prior to Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>
//                                         <table className="print-table">
//                                             <tbody>
//                                                 <tr><td className="print-table__label">Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
//                                                 <tr><td className="print-table__label">Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString('en-ZA')}</td></tr>
//                                                 <tr><td className="print-table__label">Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
//                                                 <tr><td className="print-table__label print-table__label--vtop">Coaching Notes</td><td className="print-table__td--prewrap">{submission.latestCoachingLog.notes}</td></tr>
//                                             </tbody>
//                                         </table>
//                                         <div className="sr-signature-block print-sig-row">
//                                             <div className="sr-sig-box sr-sig-box--fac">
//                                                 <span className="sr-sig-box__label sr-sig-box__label--fac">Facilitator Declaration</span>
//                                                 {submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl
//                                                     ? <img src={submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
//                                                     : <div className="sr-sig-no-image">No Canvas Signature</div>}
//                                                 <strong className="sr-sig-box__name sr-sig-box__name--fac">{submission.latestCoachingLog.facilitatorName}</strong>
//                                                 <em className="sr-sig-box__meta sr-sig-box__meta--fac">Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString('en-ZA')}</em>
//                                                 <div className="sr-sig-line sr-sig-line--fac">Coaching Conducted</div>
//                                             </div>
//                                             <div className="sr-sig-box sr-sig-box--learner">
//                                                 <span className="sr-sig-box__label sr-sig-box__label--learner">Learner Acknowledgement</span>
//                                                 {submission.latestCoachingLog.acknowledged ? (
//                                                     <>
//                                                         {submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl
//                                                             ? <img src={submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl} alt="Learner Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
//                                                             : <div className="sr-sig-no-image">No Canvas Signature</div>}
//                                                         <strong className="sr-sig-box__name sr-sig-box__name--learner">{learnerProfile?.fullName || user?.fullName}</strong>
//                                                         <em className="sr-sig-box__meta sr-sig-box__meta--learner">Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString('en-ZA')}</em>
//                                                         <div className="sr-sig-line sr-sig-line--learner">Intervention Received</div>
//                                                     </>
//                                                 ) : (
//                                                     <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span></div>
//                                                 )}
//                                             </div>
//                                         </div>
//                                     </div>
//                                 )}
//                             </div>
//                         )}

//                         <div className="ap-blocks">
//                             {assessment.blocks?.map((block: any) => {

//                                 /* Section */
//                                 if (block.type === 'section') {
//                                     const totals = sectionTotals[block.id];
//                                     return (
//                                         <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
//                                             <span>{block.title}</span>
//                                             {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
//                                             {/* FIXED HTML PARSING FOR SECTION */}
//                                             {block.content && <div className="quill-read-only-content ap-block-section__content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />}
//                                             {renderBlockImage(block)}
//                                         </div>
//                                     );
//                                 }

//                                 /* Info */
//                                 if (block.type === 'info') return (
//                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
//                                         <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
//                                         {/* FIXED HTML PARSING FOR INFO CONTENT */}
//                                         <div className="quill-read-only-content ap-block-info__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
//                                         {renderBlockImage(block)}
//                                     </div>
//                                 );

//                                 /* Question blocks */
//                                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
//                                     qNum++;
//                                     const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
//                                     const learnerAns = answers[block.id];
//                                     let inkColor = '#64748b';
//                                     if (isModDone) inkColor = 'var(--mlab-green)';
//                                     else if (isAssDone) inkColor = 'var(--mlab-red)';
//                                     else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';
//                                     const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
//                                     const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);
//                                     const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
//                                     const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : `Q${qNum}.`;

//                                     return (
//                                         <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
//                                             <div className="ap-block-question__header">
//                                                 <div className="ap-block-question__text-wrap">
//                                                     <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column' }}>
//                                                         <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

//                                                         {/* FIXED HTML PARSING FOR QUESTIONS */}
//                                                         {block.type === 'qcto_workplace' ? (
//                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
//                                                         ) : block.question ? (
//                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
//                                                         ) : block.title ? (
//                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title) }} />
//                                                         ) : null}
//                                                     </span>
//                                                     <div className="ap-grade-indicators">
//                                                         {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac" title="Facilitator Pre-Mark">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
//                                                         {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass" title="Assessor Grade">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
//                                                         {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod" title="Moderator QA">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
//                                                     </div>
//                                                 </div>
//                                                 <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
//                                             </div>

//                                             <div className="ap-block-question__body">
//                                                 {renderBlockImage(block)}
//                                                 {/* MCQ */}
//                                                 {block.type === 'mcq' && (
//                                                     <div className="ap-mcq-options">
//                                                         {block.options?.map((opt: string, i: number) => {
//                                                             const selected = learnerAns === i;
//                                                             return (
//                                                                 <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
//                                                                     <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={!canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
//                                                                     <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
//                                                                     <span className="ap-mcq-label__text">{opt}</span>
//                                                                 </label>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 {/* TEXT */}
//                                                 {block.type === 'text' && (
//                                                     <div
//                                                         className={`ap-quill-wrapper${!canEditTask ? ' locked' : ''}`}
//                                                         onCopyCapture={preventCopyPasteAndDrop}
//                                                         onCutCapture={preventCopyPasteAndDrop}
//                                                         onPasteCapture={preventCopyPasteAndDrop}
//                                                         onDropCapture={preventCopyPasteAndDrop}
//                                                         onKeyDownCapture={preventCopyPasteAndDrop}
//                                                     >
//                                                         {isLocked && !isAwaitingSignoff ? (
//                                                             // FIXED HTML PARSING FOR LEARNER ANSWER (READ ONLY)
//                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
//                                                         ) : (
//                                                             <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder={!canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
//                                                         )}
//                                                     </div>
//                                                 )}

//                                                 {/* TASK */}
//                                                 {block.type === 'task' && (() => {
//                                                     const taskTabs = [
//                                                         { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text },
//                                                         { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl },
//                                                         { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url },
//                                                         { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl },
//                                                         { id: 'code', icon: <Code size={13} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code },
//                                                     ].filter(t => t.allowed);
//                                                     const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
//                                                     const progress = uploadProgress[block.id];
//                                                     return (
//                                                         <div className="ap-evidence-container">
//                                                             {isPracticalModule && !isAwaitingSignoff && !isSubmitted && <div className="ap-evidence-lock-banner"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>}
//                                                             <div className="ap-tab-bar no-print">
//                                                                 {taskTabs.map(t => <button key={t.id} className={`ap-tab${activeTabId === t.id ? ' ap-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={11} className="ap-tab__done" />}</button>)}
//                                                             </div>
//                                                             <div className="ap-tab-panel">
//                                                                 {activeTabId === 'text' && (
//                                                                     <div
//                                                                         className={`ap-quill-wrapper${!canEditTask ? ' locked' : ''}`}
//                                                                         onCopyCapture={preventCopyPasteAndDrop}
//                                                                         onCutCapture={preventCopyPasteAndDrop}
//                                                                         onPasteCapture={preventCopyPasteAndDrop}
//                                                                         onDropCapture={preventCopyPasteAndDrop}
//                                                                         onKeyDownCapture={preventCopyPasteAndDrop}
//                                                                     >
//                                                                         {isLocked && !isAwaitingSignoff ? (
//                                                                             // FIXED HTML PARSING FOR TASK ANSWER
//                                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns?.text) || '<em>No answer provided.</em>' }} />
//                                                                         ) : (
//                                                                             <ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" />
//                                                                         )}
//                                                                     </div>
//                                                                 )}
//                                                                 {activeTabId === 'audio' && (learnerAns?.audioUrl ? <audio controls src={learnerAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{!canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
//                                                                 {activeTabId === 'url' && <div>{canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{learnerAns?.url && !canEditTask ? <UrlPreview url={learnerAns.url} /> : <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={!canEditTask} placeholder="https://…" />}</div>}
//                                                                 {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : learnerAns?.uploadUrl ? <FilePreview url={learnerAns.uploadUrl} onRemove={canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={!canEditTask} /> : <div className="ap-upload-empty">{!canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes})</p><input type="file" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id)} style={{ fontSize: '0.82rem' }} /></>}</div>)}
//                                                                 {activeTabId === 'code' && <textarea className="ap-code-textarea" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={!canEditTask} placeholder="Paste your code here…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
//                                                             </div>
//                                                         </div>
//                                                     );
//                                                 })()}

//                                                 {/* CHECKLIST */}
//                                                 {block.type === 'checklist' && (
//                                                     <div className="ap-checklist">
//                                                         <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item. Upload evidence for each if required below.</p>
//                                                         {!isAwaitingSignoff && !isSubmitted && <div className="ap-checklist__lock-notice"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>}
//                                                         {block.criteria?.map((crit: string, i: number) => {
//                                                             const res = criteriaResults?.[i] || {};
//                                                             const critKey = `evidence_${i}`;
//                                                             const raw = learnerAns?.[critKey];
//                                                             const critEv = typeof raw === 'string' ? { text: raw } : (raw || {});
//                                                             const cTabKey = `${block.id}_${i}`;
//                                                             const allTabs = [
//                                                                 { id: 'upload', icon: <UploadCloud size={12} />, label: 'File', val: critEv?.uploadUrl },
//                                                                 { id: 'url', icon: <LinkIcon size={12} />, label: 'Link', val: critEv?.url },
//                                                                 { id: 'code', icon: <Code size={12} />, label: 'Code', val: critEv?.code },
//                                                                 { id: 'text', icon: <FileText size={12} />, label: 'Notes', val: critEv?.text },
//                                                             ];
//                                                             const tabs = !canEditChecklist ? allTabs.filter(t => t.val) : allTabs;
//                                                             const activeCtab = activeTabs[cTabKey] || tabs[0]?.id || 'upload';
//                                                             const progress = uploadProgress[`${block.id}_${critKey}`];
//                                                             return (
//                                                                 <div key={i} className="ap-checklist__item">
//                                                                     <p className="ap-checklist__item-title">{i + 1}. {crit}</p>
//                                                                     <div className="ap-checklist__assessor-row">
//                                                                         {isFacDone ? (
//                                                                             <><span className={`ap-checklist__status-chip${res.status === 'C' ? ' ap-checklist__status-chip--c' : res.status === 'NYC' ? ' ap-checklist__status-chip--nyc' : ' ap-checklist__status-chip--pending'}`}>{res.status ? (savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')) : 'Not Graded'}</span>{res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}</>
//                                                                         ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
//                                                                     </div>
//                                                                     {block.requireEvidencePerCriterion !== false && (
//                                                                         <div className="ap-checklist__evidence-tabs">
//                                                                             <div className="ap-checklist__tab-bar">
//                                                                                 {tabs.length > 0 ? tabs.map(t => <button key={t.id} className={`ap-checklist__tab${activeCtab === t.id ? ' ap-checklist__tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [cTabKey]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}</button>) : <div className="ap-checklist__no-evidence">No evidence provided.</div>}
//                                                                             </div>
//                                                                             {tabs.length > 0 && (
//                                                                                 <div className="ap-checklist__tab-panel">
//                                                                                     {activeCtab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : critEv.uploadUrl ? <FilePreview url={critEv.uploadUrl} onRemove={canEditChecklist ? () => handleNestedAnswerChange(block.id, critKey, 'uploadUrl', '') : undefined} disabled={!canEditChecklist} /> : <input type="file" disabled={!canEditChecklist} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, critKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
//                                                                                     {activeCtab === 'url' && (<div>{canEditChecklist && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{critEv.url && !canEditChecklist ? <UrlPreview url={critEv.url} /> : <input type="url" className="ab-input" value={critEv.url || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'url', e.target.value)} disabled={!canEditChecklist} placeholder="https://…" />}</div>)}
//                                                                                     {activeCtab === 'code' && <textarea className="ap-code-textarea" rows={3} value={critEv.code || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'code', e.target.value)} disabled={!canEditChecklist} placeholder="Paste code snippet…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
//                                                                                     {activeCtab === 'text' && (
//                                                                                         <div className={`ap-quill-wrapper${!canEditChecklist ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
//                                                                                             {isLocked && !isAwaitingSignoff ? (
//                                                                                                 // FIXED HTML PARSING FOR CHECKLIST TEXT
//                                                                                                 <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(critEv.text) || '<em>No notes provided.</em>' }} />
//                                                                                             ) : (
//                                                                                                 <ReactQuill theme="snow" value={critEv.text || ''} onChange={c => handleNestedAnswerChange(block.id, critKey, 'text', c)} readOnly={!canEditChecklist} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" />
//                                                                                             )}
//                                                                                         </div>
//                                                                                     )}
//                                                                                 </div>
//                                                                             )}
//                                                                         </div>
//                                                                     )}
//                                                                 </div>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 {/* LOGBOOK */}
//                                                 {block.type === 'logbook' && (
//                                                     <div className="ap-logbook">
//                                                         {/* FIXED HTML PARSING FOR LOGBOOK TITLE */}
//                                                         <div className="quill-read-only-content ap-logbook__desc" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
//                                                         <table className="ap-logbook__table">
//                                                             <thead className="ap-logbook__thead">
//                                                                 <tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{canEditLogbook && <th style={{ width: '40px' }}></th>}</tr>
//                                                             </thead>
//                                                             <tbody>
//                                                                 {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
//                                                                     <tr key={i} className="ap-logbook__tbody">
//                                                                         <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                         <td className="ap-logbook__td ap-logbook__task-cell">
//                                                                             <div className={`ap-quill-wrapper ap-quill-wrapper--logbook${!canEditLogbook ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
//                                                                                 {isLocked && !isAwaitingSignoff ? (
//                                                                                     // FIXED HTML PARSING FOR LOGBOOK ENTRY
//                                                                                     <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} />
//                                                                                 ) : (
//                                                                                     <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={!canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />
//                                                                                 )}
//                                                                             </div>
//                                                                             {entry.uploadUrl && <div style={{ marginTop: '10px' }}><FilePreview url={entry.uploadUrl} disabled /></div>}
//                                                                             {entry.url && <div style={{ marginTop: '10px' }}><UrlPreview url={entry.url} /></div>}
//                                                                         </td>
//                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                         <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
//                                                                         {canEditLogbook && <td className="ap-logbook__td"><button className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
//                                                                     </tr>
//                                                                 ))}
//                                                                 {canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
//                                                                 <tr className="ap-logbook__totals-row">
//                                                                     <td colSpan={4} className="ap-logbook__totals-label">Total Logged Hours:</td>
//                                                                     <td className="ap-logbook__totals-val" style={(() => { const logged = (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0); return block.requiredHours && logged < block.requiredHours ? { color: '#dc2626', fontWeight: 'bold' } : {}; })()}>
//                                                                         {(Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0)}
//                                                                         {block.requiredHours && (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0) < block.requiredHours && <span className="ap-logbook__hours-warning">⚠ Required: {block.requiredHours} hrs</span>}
//                                                                     </td>
//                                                                     {canEditLogbook && <td></td>}
//                                                                 </tr>
//                                                             </tbody>
//                                                         </table>
//                                                     </div>
//                                                 )}

//                                                 {/* QCTO WORKPLACE */}
//                                                 {block.type === 'qcto_workplace' && (
//                                                     <div className="ap-workplace">
//                                                         <div className="quill-read-only-content" style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
//                                                         {block.workActivities?.map((wa: any) => {
//                                                             const waTask = learnerAns?.[`wa_${wa.id}_task`] || '';
//                                                             const waDate = learnerAns?.[`wa_${wa.id}_date`] || new Date().toISOString().split('T')[0];
//                                                             const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
//                                                             return (
//                                                                 <div key={wa.id} className="ap-workplace__activity">
//                                                                     <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>

//                                                                     {/* <div className="ap-workplace__fields">
//                                                                         <div className="ap-workplace__field">
//                                                                             <label className="ap-workplace__field-label">Task Performed</label>
//                                                                             {isLocked && !isAwaitingSignoff ? (
//                                                                                 // FIXED HTML PARSING FOR WORKPLACE TASK
//                                                                                 <div className="quill-read-only-content" style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(waTask) || '<em>No task description provided.</em>' }} />
//                                                                             ) : (
//                                                                                 <input type="text" className="ap-workplace__input" value={waTask} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_task`, e.target.value)} disabled={!canEditWorkplace} placeholder="What did you do?" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />
//                                                                             )}
//                                                                         </div>
//                                                                         <div className="ap-workplace__field ap-workplace__field--date"><label className="ap-workplace__field-label">Date</label><input type="date" className="ap-workplace__input" value={waDate} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_date`, e.target.value)} disabled={!canEditWorkplace} /></div>
//                                                                     </div> */}
//                                                                     <div className="ap-workplace__fields">
//                                                                         {/* Auto-Hydrated Task View */}
//                                                                         <div className="ap-workplace__field">
//                                                                             <label className="ap-workplace__field-label">Verified Task (Auto-pulled from Logbook)</label>

//                                                                             {(() => {
//                                                                                 // Find the specific approved log for this Work Activity
//                                                                                 const matchedLog = approvedLogs.find(log => log.workActivityId === wa.id);

//                                                                                 if (logsLoading) return <div className="ap-spinner ap-spinner--sm" />;

//                                                                                 if (matchedLog) {
//                                                                                     return (
//                                                                                         <div className="quill-read-only-content" style={{ padding: '0.75rem', background: '#ecfdf5', border: '1px solid #10b981', borderRadius: '4px' }}>
//                                                                                             <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 'bold', marginBottom: '4px' }}>
//                                                                                                 ✓ Mentor Approved on {new Date(matchedLog.approvedAt || matchedLog.date).toLocaleDateString()}
//                                                                                             </div>
//                                                                                             <div dangerouslySetInnerHTML={{ __html: cleanRichText(matchedLog.taskDescription) }} />
//                                                                                         </div>
//                                                                                     );
//                                                                                 }

//                                                                                 return (
//                                                                                     <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #ef4444', borderRadius: '4px', color: '#b91c1c', fontSize: '0.9rem' }}>
//                                                                                         ⚠ No approved log found for this activity. Please complete this task in your daily logbook and await mentor approval.
//                                                                                     </div>
//                                                                                 );
//                                                                             })()}
//                                                                         </div>
//                                                                     </div>


//                                                                     {(wa.evidenceItems || []).length > 0 && (
//                                                                         <div className="ap-workplace__se-block">
//                                                                             <span className="ap-workplace__se-title">Supporting Evidence Required:</span>
//                                                                             {wa.evidenceItems.map((se: any) => {
//                                                                                 const seKey = `se_${se.id}`;
//                                                                                 const seData = learnerAns?.[seKey] || {};
//                                                                                 const seTabs = [{ id: 'upload', icon: <UploadCloud size={13} />, label: 'Document', val: seData.uploadUrl }, { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', val: seData.url }, { id: 'text', icon: <FileText size={13} />, label: 'Reflection', val: seData.text }];
//                                                                                 const activeSeTab = activeTabs[`${block.id}_${se.id}`] || seTabs[0].id;
//                                                                                 const progress = uploadProgress[`${block.id}_${seKey}`];
//                                                                                 return (
//                                                                                     <div key={se.id} className="ap-workplace__se-item">
//                                                                                         <strong className="ap-workplace__se-item__code">{se.code}: {se.description}</strong>
//                                                                                         <div className="ap-workplace__se-tabs">
//                                                                                             <div className="ap-workplace__se-tab-bar no-print">{seTabs.map(t => <button key={t.id} className={`ap-workplace__se-tab${activeSeTab === t.id ? ' ap-workplace__se-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [`${block.id}_${se.id}`]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}</button>)}</div>
//                                                                                             <div className="ap-workplace__se-tab-panel">
//                                                                                                 {activeSeTab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : seData.uploadUrl ? <FilePreview url={seData.uploadUrl} onRemove={canEditWorkplace ? () => handleNestedAnswerChange(block.id, seKey, 'uploadUrl', '') : undefined} disabled={!canEditWorkplace} /> : <input type="file" disabled={!canEditWorkplace} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, seKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
//                                                                                                 {activeSeTab === 'url' && <div>{canEditWorkplace && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{seData.url && !canEditWorkplace ? <UrlPreview url={seData.url} /> : <input type="url" className="ab-input" value={seData.url || ''} onChange={e => handleNestedAnswerChange(block.id, seKey, 'url', e.target.value)} disabled={!canEditWorkplace} placeholder="https://…" />}</div>}
//                                                                                                 {activeSeTab === 'text' && (
//                                                                                                     <div className={`ap-quill-wrapper${!canEditWorkplace ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
//                                                                                                         {isLocked && !isAwaitingSignoff ? (
//                                                                                                             // FIXED HTML PARSING FOR WORKPLACE EVIDENCE
//                                                                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(seData.text) || '<em>No notes provided.</em>' }} />
//                                                                                                         ) : (
//                                                                                                             <ReactQuill theme="snow" value={seData.text || ''} onChange={c => handleNestedAnswerChange(block.id, seKey, 'text', c)} readOnly={!canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" />
//                                                                                                         )}
//                                                                                                     </div>
//                                                                                                 )}
//                                                                                             </div>
//                                                                                         </div>
//                                                                                     </div>
//                                                                                 );
//                                                                             })}
//                                                                         </div>
//                                                                     )}
//                                                                     <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
//                                                                         <input type="checkbox" disabled={!canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
//                                                                         <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
//                                                                     </label>
//                                                                 </div>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 {/* Per-question feedback */}
//                                                 {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
//                                                 {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
//                                                 {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
//                                             </div>
//                                         </div>
//                                     );
//                                 }
//                                 return null;
//                             })}
//                         </div>

//                         {/* PRINT-ONLY: OVERALL FEEDBACK + APPEAL RECORD */}
//                         {isLocked && !isAwaitingSignoff && (
//                             <div className="print-page print-page--feedback print-only">
//                                 <h2 className="print-section-heading">Overall Assessment Feedback</h2>

//                                 {submission.grading?.facilitatorOverallFeedback && (
//                                     <div className="print-fb print-fb--fac">
//                                         <h4 className="print-fb__title print-fb__title--fac">
//                                             {submission.grading?.facilitatorRole === 'mentor' ? 'Mentor / Supervisor Comments' : 'Facilitator Remarks'}
//                                         </h4>
//                                         <p className="print-fb__body print-fb__body--fac">{submission.grading.facilitatorOverallFeedback}</p>
//                                     </div>
//                                 )}

//                                 {(submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
//                                     <div className="print-fb print-fb--ass">
//                                         <h4 className="print-fb__title print-fb__title--ass">Assessor Grading Remarks</h4>
//                                         <p className="print-fb__body print-fb__body--ass">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p>
//                                     </div>
//                                 )}

//                                 {submission.moderation?.feedback && (
//                                     <div className="print-fb print-fb--mod">
//                                         <h4 className="print-fb__title print-fb__title--mod">Moderator QA Notes</h4>
//                                         <p className="print-fb__body print-fb__body--mod">{submission.moderation.feedback}</p>
//                                     </div>
//                                 )}

//                                 {submission?.appeal?.status && (
//                                     <div className={`print-fb print-fb--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                                         <h4 className={`print-fb__title print-fb__title--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                                             Formal Appeal Record — {submission.appeal.status === 'upheld' ? 'Appeal Granted' : submission.appeal.status === 'pending' ? 'Appeal Pending' : 'Appeal Rejected'}
//                                         </h4>
//                                         <p className="print-fb__appeal-reason"><strong>Learner's Reason:</strong> "{submission.appeal.reason}"</p>
//                                         {submission.appeal.status !== 'pending' && (
//                                             <p className={`print-fb__body print-fb__body--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                                                 <strong>Board Resolution:</strong> "{submission.appeal.resolutionNotes}"
//                                             </p>
//                                         )}
//                                     </div>
//                                 )}
//                             </div>
//                         )}

//                         {/* PRINT-ONLY + SCREEN: SIGNATURE BLOCK */}
//                         {isLocked && !isAwaitingSignoff && (
//                             <div className="print-page print-page--signatures print-only">
//                                 <h2 className="print-section-heading">Official Signatures &amp; Declarations</h2>
//                                 <div className="sr-signature-block print-sig-row">

//                                     <div className="sr-sig-box sr-sig-box--learner">
//                                         <span className="sr-sig-box__label sr-sig-box__label--learner">Learner Declaration</span>
//                                         {isSubmitted ? (
//                                             <>
//                                                 {submission.learnerDeclaration?.signatureUrl
//                                                     ? <img src={submission.learnerDeclaration.signatureUrl} alt="Learner signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
//                                                     : <div className="sr-sig-no-image">Digitally Authenticated<br />(ECTA Compliant)</div>}
//                                                 <strong className="sr-sig-box__name sr-sig-box__name--learner">{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '—'}</strong>
//                                                 <em className="sr-sig-box__meta sr-sig-box__meta--learner">Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString('en-ZA')}</em>
//                                                 <div className="sr-sig-line sr-sig-line--learner">Digital Timestamp Authenticated</div>
//                                             </>
//                                         ) : (
//                                             <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--learner">Awaiting Submission</div></div>
//                                         )}
//                                     </div>

//                                     <div className="sr-sig-box sr-sig-box--fac">
//                                         <span className="sr-sig-box__label sr-sig-box__label--fac">
//                                             {submission.grading?.facilitatorRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Marking'}
//                                         </span>
//                                         {isFacDone && submission.grading?.facilitatorReviewedAt ? (
//                                             <>
//                                                 {submission.grading?.facilitatorSignatureUrl
//                                                     ? <img src={submission.grading.facilitatorSignatureUrl} alt="Facilitator Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
//                                                     : <div className="sr-sig-no-image">System Authenticated</div>}
//                                                 <strong className="sr-sig-box__name sr-sig-box__name--fac">{submission.grading?.facilitatorName || 'Facilitator'}</strong>
//                                                 <em className="sr-sig-box__meta sr-sig-box__meta--fac">Signed: {new Date(submission.grading.facilitatorReviewedAt).toLocaleDateString('en-ZA')}</em>
//                                                 <div className="sr-sig-line sr-sig-line--fac">
//                                                     {submission.grading?.facilitatorRole === 'mentor' ? 'Workplace Verification Confirmed' : 'Pre-Marking Completed'}
//                                                 </div>
//                                             </>
//                                         ) : (
//                                             <div className="sr-sig-pending"><span className="sr-sig-pending__text">Digitally Authenticated</span><div className="sr-sig-line sr-sig-line--fac">Verification</div></div>
//                                         )}
//                                     </div>

//                                     <div className="sr-sig-box sr-sig-box--ass">
//                                         <span className="sr-sig-box__label sr-sig-box__label--ass">Assessor Sign-off</span>
//                                         {isAssDone && submission.grading?.gradedAt ? (
//                                             <>
//                                                 {submission.grading?.assessorSignatureUrl
//                                                     ? <img src={submission.grading.assessorSignatureUrl} alt="Assessor Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
//                                                     : <div className="sr-sig-no-image">No Canvas Signature</div>}
//                                                 <strong className="sr-sig-box__name sr-sig-box__name--ass">{submission.grading?.assessorName || '—'}</strong>
//                                                 <em className="sr-sig-box__meta sr-sig-box__meta--ass">Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
//                                                 <em className="sr-sig-box__meta sr-sig-box__meta--ass">Signed: {new Date(submission.grading.gradedAt).toLocaleDateString('en-ZA')}</em>
//                                                 <div className="sr-sig-line sr-sig-line--ass">Digital Signature Confirmed</div>
//                                             </>
//                                         ) : (
//                                             <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--ass">Awaiting Assessment</div></div>
//                                         )}
//                                     </div>

//                                     <div className="sr-sig-box sr-sig-box--mod">
//                                         <span className="sr-sig-box__label sr-sig-box__label--mod">Internal Moderation</span>
//                                         {isModDone && submission.moderation?.moderatedAt ? (
//                                             <>
//                                                 {submission.moderation?.moderatorSignatureUrl
//                                                     ? <img src={submission.moderation.moderatorSignatureUrl} alt="Moderator Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
//                                                     : moderatorProfile?.signatureUrl
//                                                         ? <img src={moderatorProfile.signatureUrl} alt="Moderator fallback" />
//                                                         : <div className="sr-sig-no-image">No Canvas Signature</div>}
//                                                 <strong className="sr-sig-box__name sr-sig-box__name--mod">{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</strong>
//                                                 <em className="sr-sig-box__meta sr-sig-box__meta--mod">Outcome: {submission.moderation?.outcome}</em>
//                                                 <em className="sr-sig-box__meta sr-sig-box__meta--mod">Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString('en-ZA')}</em>
//                                                 <div className="sr-sig-line sr-sig-line--mod">QA Sign-off Confirmed</div>
//                                             </>
//                                         ) : (
//                                             <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--mod">Awaiting Moderation</div></div>
//                                         )}
//                                     </div>

//                                     {submission?.appeal?.status && submission.appeal.status !== 'pending' && (
//                                         <div className={`sr-sig-box sr-sig-box--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                                             <span className={`sr-sig-box__label sr-sig-box__label--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                                                 Appeal Resolution
//                                             </span>
//                                             {submission.appeal?.resolvedBySignatureUrl ? (
//                                                 <img src={submission.appeal.resolvedBySignatureUrl} alt="Board Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
//                                             ) : <div className="sr-sig-no-image">Resolved Digitally</div>}
//                                             <strong className={`sr-sig-box__name sr-sig-box__name--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                                                 {submission.appeal?.resolvedByName || 'Academic Board'}
//                                             </strong>
//                                             <em className={`sr-sig-box__meta sr-sig-box__meta--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                                                 Resolved: {submission.appeal?.resolvedAt ? new Date(submission.appeal.resolvedAt).toLocaleDateString('en-ZA') : 'N/A'}
//                                             </em>
//                                             <div className={`sr-sig-line sr-sig-line--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                                                 Board Decision Finalised
//                                             </div>
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         )}

//                         {/* ── FOOTER ── */}
//                         {isAwaitingSignoff ? (
//                             <div className="ap-footer ap-footer--signoff no-print">
//                                 <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
//                                 <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
//                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
//                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
//                                     <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
//                                 </label>
//                                 <div className="ap-footer-actions">
//                                     <span className="ap-autosave-label">{saving && <><div className="ap-spinner ap-spinner--sm" /> Saving…</>}{Object.keys(uploadProgress).length > 0 && <span className="ap-uploads-label ap-uploads-label--amber">Uploads in progress…</span>}</span>
//                                     <button className="ap-btn ap-btn--amber" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}><Save size={14} /> Acknowledge & Submit for Grading</button>
//                                 </div>
//                             </div>
//                         ) : !isLocked ? (
//                             <div className="ap-footer no-print">
//                                 <h3 className="ap-footer__title">Final Submission</h3>
//                                 <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
//                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
//                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
//                                     <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
//                                 </label>
//                                 <div className="ap-footer-actions">
//                                     <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}{Object.keys(uploadProgress).length > 0 && <span className="ap-uploads-label">Uploads in progress…</span>}</span>
//                                     <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}><Save size={14} /> Submit for Grading</button>
//                                 </div>
//                             </div>
//                         ) : (
//                             <div className="ap-footer ap-footer--locked no-print">
//                                 <div className="ap-footer--locked__icon-wrap">
//                                     {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
//                                 </div>
//                                 {isModDone && outcome?.isCompetent === false ? (
//                                     <>
//                                         <h3 className="ap-footer--locked__title ap-footer--locked__title--amber">Assessment Outcome: Not Yet Competent (NYC)</h3>
//                                         <div className="ap-remediation-box">
//                                             <p>Your assessment has been fully verified. At this stage, you have not yet met all the requirements for competency.</p>
//                                             {(submission.attemptNumber || 1) >= 3 ? (
//                                                 <div className="ap-remediation-box__lockout">
//                                                     <h4 className="ap-remediation-box__lockout-title"><ShieldAlert size={15} /> Maximum Attempts Reached</h4>
//                                                     <p>You have exhausted all 3 permitted attempts. Under QCTO regulations, this workbook is permanently locked. You must re-enrol in the module or lodge a formal appeal.</p>
//                                                 </div>
//                                             ) : (
//                                                 <><h4 className="ap-remediation-box__steps-title">What happens next?</h4><ol className="ap-remediation-box__steps"><li><strong>Review Feedback:</strong> Scroll up and review the Assessor's feedback on your incorrect answers.</li><li><strong>Coaching:</strong> Your facilitator will schedule a brief intervention to discuss the feedback.</li><li><strong>Remediation:</strong> Your facilitator will unlock this workbook for Attempt {submission.attemptNumber ? submission.attemptNumber + 1 : 2} of 3.</li></ol></>
//                                             )}
//                                             <div className="ap-remediation-box__appeal-section">
//                                                 <p className="ap-remediation-box__appeal">
//                                                     <strong>Academic Rights:</strong> If you disagree with this outcome, you have the right to lodge a formal appeal.
//                                                 </p>
//                                                 {submission.appeal?.status === 'pending' ? (
//                                                     <div className="ap-appeal-status ap-appeal-status--pending"><Clock size={15} /> <span><strong>Appeal Pending:</strong> Your formal appeal is currently under investigation by the Academic Board.</span></div>
//                                                 ) : submission.appeal?.status === 'rejected' ? (
//                                                     <div className="ap-appeal-status ap-appeal-status--rejected"><X size={15} /> <span><strong>Appeal Concluded:</strong> Your appeal was reviewed and the original outcome was upheld.</span></div>
//                                                 ) : (
//                                                     <button className="ap-btn ap-btn--outline ap-btn--outline-danger" onClick={() => setShowAppealModal(true)}><AlertTriangle size={14} /> Lodge Formal Appeal</button>
//                                                 )}
//                                             </div>
//                                         </div>
//                                     </>
//                                 ) : isModDone && outcome?.isCompetent === true ? (
//                                     <>
//                                         <h3 className="ap-footer--locked__title" style={{ color: 'var(--mlab-green)' }}>Congratulations! You are Competent.</h3>
//                                         <p className="ap-footer--locked__desc">Your final score is <strong>{grandTotalPct}% ({grandTotalAwarded}/{grandTotalMax} marks)</strong>. This result has been fully verified and endorsed by the internal moderator.</p>
//                                     </>
//                                 ) : isAssDone && outcome?.isCompetent === true ? (
//                                     <>
//                                         <h3 className="ap-footer--locked__title" style={{ color: 'var(--mlab-blue)' }}>Assessor Grading Complete</h3>
//                                         <p className="ap-footer--locked__desc">Your provisional score is <strong>{grandTotalPct}% ({grandTotalAwarded}/{grandTotalMax} marks)</strong>. Awaiting final moderator QA.</p>
//                                     </>
//                                 ) : (
//                                     <>
//                                         <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
//                                         <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. {isAssDone ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}</p>
//                                         {!isWorkplaceModule && isFacDone && !isAssDone && (
//                                             <p style={{ marginTop: '8px', color: 'var(--mlab-blue)', fontWeight: 'bold' }}>Provisional Score: {grandTotalPct}% ({grandTotalAwarded}/{grandTotalMax} marks)</p>
//                                         )}
//                                     </>
//                                 )}
//                                 <button className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={() => safeNavigateBack()}><ArrowLeft size={14} /> Return to Portfolio</button>
//                             </div>
//                         )}
//                     </div>

//                     {/* ── RIGHT AUDIT SIDEBAR ── */}
//                     {isLocked && !isAwaitingSignoff && (
//                         <aside className="ap-right-sidebar no-print">
//                             <h3 className="ap-right-sidebar__title"><ShieldCheck size={15} color="var(--mlab-blue)" /> Official Audit Trail</h3>

//                             <div className="ap-audit-card">
//                                 <span className="ap-audit-card__label">Learner Declaration</span>
//                                 <div className="ap-audit-card__sig-wrap">
//                                     {submission.learnerDeclaration?.signatureUrl
//                                         ? <img src={submission.learnerDeclaration.signatureUrl} alt="Learner signature" />
//                                         : learnerProfile?.signatureUrl
//                                             ? <img src={learnerProfile.signatureUrl} alt="Learner signature fallback" />
//                                             : <span className="ap-audit-card__sig-placeholder">Digitally Authenticated<br />(ECTA Compliant)</span>}
//                                 </div>
//                                 <span className="ap-audit-card__name">{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}</span>
//                                 <span className="ap-audit-card__sub"><Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}</span>
//                             </div>

//                             {submission?.appeal?.status && submission?.appeal?.status !== 'pending' && (
//                                 <div className="ap-audit-card" style={{ borderTopColor: submission.appeal.status === 'upheld' ? '#22c55e' : '#ef4444' }}>
//                                     <span className="ap-audit-card__label" style={{ color: submission.appeal.status === 'upheld' ? '#166534' : '#991b1b', display: 'flex', alignItems: 'center', gap: '4px' }}><Scale size={12} /> Appeal Resolution</span>
//                                     <span className="ap-audit-card__name" style={{ color: submission.appeal.status === 'upheld' ? '#22c55e' : '#ef4444' }}>{submission.appeal.status === 'upheld' ? 'Appeal Granted' : 'Appeal Rejected'}</span>
//                                     <span className="ap-audit-card__reg" style={{ color: '#64748b' }}>{submission.appeal?.resolvedByName || 'Academic Board'}</span>
//                                     <span className="ap-audit-card__sub" style={{ color: '#64748b' }}><Clock size={11} /> {submission.appeal?.resolvedAt ? moment(submission.appeal.resolvedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
//                                 </div>
//                             )}

//                             {outcome ? (
//                                 <div className="ap-audit-outcome" style={{ borderLeftColor: outcome.color }}>
//                                     <div className="ap-audit-outcome__label" style={{ color: outcome.color }}>{outcome.label}</div>
//                                     {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Score: {outcome.score} / {assessment.totalMarks} ({outcome.percentage}%)</div>}
//                                     {isWorkplaceModule && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Grading: Competency-Based</div>}
//                                     <div className="ap-audit-outcome__note">{outcome.subtext}</div>
//                                 </div>
//                             ) : (
//                                 <div className="ap-audit-card" style={{ textAlign: 'center', padding: '1.5rem', background: '#f8fafc', border: '1px dashed var(--mlab-border)' }}>
//                                     <Clock size={24} color="#94a3b8" style={{ margin: '0 auto 0.5rem' }} />
//                                     <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', fontWeight: 700 }}>Pending Outcome</span>
//                                     <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Your workbook is currently being evaluated.</span>
//                                 </div>
//                             )}

//                             {isFacDone && (
//                                 <div className="ap-audit-card" style={{ borderTopColor: '#3b82f6' }}>
//                                     <span className="ap-audit-card__label" style={{ color: '#3b82f6' }}>{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</span>
//                                     <span className="ap-audit-card__name" style={{ color: '#3b82f6' }}>{submission.grading?.facilitatorName || 'Facilitator'}</span>
//                                     <div className="ap-audit-card__sig-wrap">
//                                         {submission.grading?.facilitatorSignatureUrl
//                                             ? <img src={submission.grading.facilitatorSignatureUrl} alt="Facilitator Signature" />
//                                             : facilitatorProfile?.signatureUrl
//                                                 ? <img src={facilitatorProfile.signatureUrl} alt="Facilitator fallback" />
//                                                 : <span className="ap-audit-card__sig-placeholder" style={{ color: '#3b82f6' }}>System Authenticated</span>}
//                                     </div>
//                                     <span className="ap-audit-card__sub" style={{ color: '#3b82f6' }}><Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
//                                 </div>
//                             )}
//                             {isAssDone && (
//                                 <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-red)' }}>
//                                     <span className="ap-audit-card__label" style={{ color: 'var(--mlab-red)' }}>{isWorkplaceModule ? 'Assessor Evaluation' : 'Assessor Verification'}</span>
//                                     <div className="ap-audit-card__sig-wrap">
//                                         {submission.grading?.assessorSignatureUrl
//                                             ? <img src={submission.grading.assessorSignatureUrl} alt="Assessor Signature" />
//                                             : assessorProfile?.signatureUrl
//                                                 ? <img src={assessorProfile.signatureUrl} alt="Assessor fallback" />
//                                                 : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-red)' }}>Awaiting Signature</span>}
//                                     </div>
//                                     <span className="ap-audit-card__name" style={{ color: 'var(--mlab-red)' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</span>
//                                     <span className="ap-audit-card__reg" style={{ color: 'var(--mlab-red)' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</span>
//                                     <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-red)' }}><Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
//                                 </div>
//                             )}
//                             {isModDone && (
//                                 <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-green)' }}>
//                                     <span className="ap-audit-card__label" style={{ color: 'var(--mlab-green)' }}>Internal Moderation QA</span>
//                                     <div className="ap-audit-card__sig-wrap">
//                                         {submission.moderation?.moderatorSignatureUrl
//                                             ? <img src={submission.moderation.moderatorSignatureUrl} alt="Moderator Signature" />
//                                             : moderatorProfile?.signatureUrl
//                                                 ? <img src={moderatorProfile.signatureUrl} alt="Moderator fallback" />
//                                                 : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-green)' }}>Awaiting Signature</span>}
//                                     </div>
//                                     <span className="ap-audit-card__name" style={{ color: 'var(--mlab-green)' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</span>
//                                     <span className="ap-audit-card__reg" style={{ color: submission.moderation?.outcome === 'Returned' ? 'var(--mlab-red)' : 'var(--mlab-green)' }}>Outcome: {submission.moderation?.outcome === 'Endorsed' ? 'Endorsed ✓' : submission.moderation?.outcome === 'Returned' ? 'Returned ✗' : submission.moderation?.outcome}</span>
//                                     <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-green)' }}><Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
//                                 </div>
//                             )}
//                         </aside>
//                     )}
//                 </div>
//             </div>
//         </ProctoringWrapper>
//     );
// };

// export default AssessmentPlayer;




// // // src/components/views/AssessmentPlayer/AssessmentPlayer.tsx

// // import React, { useState, useEffect, useRef, useMemo } from 'react';
// // import { useParams, useNavigate, useLocation } from 'react-router-dom';
// // import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot } from 'firebase/firestore';
// // import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
// // import { getFunctions, httpsCallable } from 'firebase/functions';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import {
// //     ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
// //     AlertCircle, Play, Clock, GraduationCap,
// //     BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
// //     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
// //     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
// //     Briefcase, Menu, FileArchive, Video, CalendarDays
// // } from 'lucide-react';
// // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // import ReactQuill from 'react-quill-new';
// // import 'react-quill-new/dist/quill.snow.css';
// // import moment from 'moment';
// // import './AssessmentPlayer.css';
// // import { createPortal } from 'react-dom';

// // import { UploadProgress } from '../../../components/common/UploadProgress';
// // import { UrlPreview } from '../../../components/common/UrlPreview';
// // import { ConfirmModal } from '../../../components/common/ConfirmModal';

// // import mLabLogo from '../../../assets/logo/mlab_logo.png';
// // import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
// // import { FilePreview } from '../../FacilitatorDashboard/SubmissionReview/SubmissionReview/SubmissionReviewPreviews';

// // const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] };
// // const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// // /* ─── HELPER: CLEAN RICH TEXT (FIXES WORD-BREAK BUG) ─────────────────────── */
// // const cleanRichText = (html?: string) => {
// //     if (!html) return '';
// //     return html.replace(/&nbsp;/g, ' ');
// // };

// // /* ─── HELPER: EXTRACT PLAIN TEXT FROM HTML ───────────────────────────────── */
// // const extractPlainText = (htmlString?: string) => {
// //     if (!htmlString) return '';
// //     const tmp = document.createElement("DIV");
// //     tmp.innerHTML = htmlString;
// //     return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
// // };

// // /* ─── PROGRESS RING COMPONENT ──────────────────────────────────────────────── */
// // const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
// //     const radius = (size - strokeWidth) / 2;
// //     const circumference = 2 * Math.PI * radius;
// //     const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;

// //     return (
// //         <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
// //             <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
// //             <circle
// //                 cx={size / 2}
// //                 cy={size / 2}
// //                 r={radius}
// //                 stroke={color}
// //                 strokeWidth={strokeWidth}
// //                 fill="none"
// //                 strokeDasharray={circumference}
// //                 strokeDashoffset={strokeDashoffset}
// //                 strokeLinecap="round"
// //                 style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
// //             />
// //         </svg>
// //     );
// // };

// // /* ─── APPEAL MODAL ─────────────────────────────────────────────────────────── */
// // const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
// //     const [reason, setReason] = useState('');
// //     useEffect(() => {
// //         const s = document.createElement('style');
// //         s.innerHTML = 'body,html{overflow:hidden!important}';
// //         document.head.appendChild(s);
// //         return () => { document.head.removeChild(s); };
// //     }, []);
// //     return createPortal(
// //         <div className="ap-modal">
// //             <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
// //                 <div className="ap-modal-header ap-modal-header--danger">
// //                     <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
// //                     <div>
// //                         <h2 className="ap-modal-title">Lodge Formal Appeal</h2>
// //                         <p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p>
// //                     </div>
// //                 </div>
// //                 <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
// //                     <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
// //                     <div className="ap-form-group">
// //                         <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
// //                         <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
// //                     </div>
// //                     <div className="ap-modal-footer">
// //                         <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
// //                         <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };

// // /* ═══════════════════════════════════════════════════════════════════════════
// //    MAIN COMPONENT
// // ═══════════════════════════════════════════════════════════════════════════ */
// // const AssessmentPlayer: React.FC = () => {
// //     const { assessmentId } = useParams<{ assessmentId: string }>();
// //     const navigate = useNavigate();
// //     const location = useLocation();

// //     const safeNavigateBack = () => {
// //         if (location.key === 'default') {
// //             navigate(user?.role === 'learner' ? '/learner/dashboard' : '/');
// //         } else {
// //             navigate(-1);
// //         }
// //     };
// //     const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
// //     const toast = useToast();

// //     const [loading, setLoading] = useState(true);
// //     const [saving, setSaving] = useState(false);
// //     const [isStarting, setIsStarting] = useState(false);

// //     const [assessment, setAssessment] = useState<any>(null);
// //     const [submission, setSubmission] = useState<any>(null);
// //     const [answers, setAnswers] = useState<Record<string, any>>({});
// //     const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
// //     const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
// //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// //     const [learnerEnrollment, setLearnerEnrollment] = useState<any>(null);
// //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);
// //     const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);
// //     const [declarationChecked, setDeclarationChecked] = useState(false);
// //     const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
// //     const [coachingAckChecked, setCoachingAckChecked] = useState(false);
// //     const [isAdminIntercept, setIsAdminIntercept] = useState(false);
// //     const [showLeaveWarning, setShowLeaveWarning] = useState(false);
// //     const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
// //     const [showAppealModal, setShowAppealModal] = useState(false);
// //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

// //     const [moduleLogs, setModuleLogs] = useState<any[]>([]);
// //     const [passedFormative, setPassedFormative] = useState(false);

// //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// //     const [timeLeft, setTimeLeft] = useState<number | null>(null);
// //     const [timeOffset, setTimeOffset] = useState<number>(0);
// //     const [timeToStart, setTimeToStart] = useState<number | null>(null);

// //     const currentStatus = String(submission?.status || '').toLowerCase();
// //     const isMissed = currentStatus === 'missed';
// //     const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
// //     const isAppealUpheld = submission?.appeal?.status === 'upheld';
// //     const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// //     const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// //     const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
// //     const isModDone = ['moderated', 'appealed'].includes(currentStatus);
// //     const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
// //     const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
// //     const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
// //     const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;
// //     const isRemediation = (submission?.attemptNumber || 1) > 1;
// //     const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged && !isAppealUpheld;
// //     const isNotStarted = currentStatus === 'not_started';
// //     const showGate = isNotStarted || needsRemediationGate;
// //     const isLocked = isSubmitted || isAwaitingSignoff || isMissed;
// //     const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

// //     const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
// //         ? assessment.requiresInvigilation
// //         : !isPracticalModule;

// //     const willBeProctored = isInvigilationEnabled && !isLocked;

// //     const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent) => {
// //         if (!isLocked && !isPracticalModule) {
// //             if (e.type === 'keydown') {
// //                 const keyEvent = e as React.KeyboardEvent;
// //                 if ((keyEvent.ctrlKey || keyEvent.metaKey) && ['c', 'v', 'x'].includes(keyEvent.key.toLowerCase())) {
// //                     keyEvent.preventDefault();
// //                     keyEvent.stopPropagation();
// //                     if (keyEvent.nativeEvent?.stopImmediatePropagation) {
// //                         keyEvent.nativeEvent.stopImmediatePropagation();
// //                     }
// //                     toast.warning("Keyboard shortcuts for Copy/Paste are disabled on Knowledge Modules.", 1500);
// //                     document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to use Copy/Paste keyboard shortcuts." }));
// //                 }
// //             } else {
// //                 e.preventDefault();
// //                 e.stopPropagation();
// //                 if (e.nativeEvent?.stopImmediatePropagation) {
// //                     e.nativeEvent.stopImmediatePropagation();
// //                 }
// //                 toast.warning("Copying, pasting, and dropping content is disabled to ensure academic integrity.", 15000);
// //                 document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to Paste or Drop external content into the assessment." }));
// //             }
// //         }
// //     };

// //     const workplaceInfo = useMemo(() => {
// //         if (!learnerEnrollment) return null;
// //         const employer = learnerEnrollment.employerId ? employers.find((e: any) => e.id === learnerEnrollment.employerId) : null;
// //         const mentor = learnerEnrollment.mentorId ? staff.find((s: any) => s.id === learnerEnrollment.mentorId) : null;
// //         return { employer, mentor };
// //     }, [learnerEnrollment, employers, staff]);

// //     const getBlockGrading = (blockId: string) => {
// //         if (!isFacDone) return { score: undefined, feedback: '', facFeedback: '', assFeedback: '', modFeedback: '', facIsCorrect: null, assIsCorrect: null, modIsCorrect: null, isCorrect: null, criteriaResults: [] };
// //         const g = submission?.grading || {};
// //         const m = submission?.moderation || {};
// //         const mLayer = m.breakdown?.[blockId] || {};
// //         const aLayer = g.assessorBreakdown?.[blockId] || {};
// //         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
// //         const legacyLayer = g.breakdown?.[blockId] || {};
// //         let activeLayer: any = legacyLayer;
// //         if (isFacDone) activeLayer = fLayer;
// //         if (isAssDone) activeLayer = aLayer;
// //         if (isModDone) activeLayer = mLayer;
// //         return {
// //             score: activeLayer.score, isCorrect: activeLayer.isCorrect,
// //             facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
// //             assIsCorrect: aLayer.isCorrect, modIsCorrect: mLayer.isCorrect,
// //             feedback: activeLayer.feedback || '', facFeedback: fLayer.feedback || legacyLayer.feedback || '',
// //             assFeedback: aLayer.feedback || '', modFeedback: mLayer.feedback || '',
// //             criteriaResults: activeLayer.criteriaResults || [],
// //         };
// //     };

// //     let grandTotalAwarded = 0;
// //     let grandTotalMax = 0;
// //     const sectionTotals: Record<string, { total: number; awarded: number }> = {};
// //     let currentSectionId = '';

// //     if (assessment?.blocks) {
// //         assessment.blocks.forEach((block: any) => {
// //             if (block.type === 'section') {
// //                 currentSectionId = block.id;
// //                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
// //             }
// //             else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
// //                 const { score } = getBlockGrading(block.id);
// //                 const maxMarks = Number(block.marks) || 0;
// //                 const awarded = Number(score) || 0;

// //                 grandTotalMax += maxMarks;
// //                 if (score !== undefined && score !== null) {
// //                     grandTotalAwarded += awarded;
// //                 }

// //                 if (currentSectionId) {
// //                     sectionTotals[currentSectionId].total += maxMarks;
// //                     if (score !== undefined && score !== null) {
// //                         sectionTotals[currentSectionId].awarded += awarded;
// //                     }
// //                 }
// //             }
// //         });
// //     }

// //     const grandTotalPct = grandTotalMax > 0 ? Math.round((grandTotalAwarded / grandTotalMax) * 100) : 0;
// //     const savedFacRole = submission?.grading?.facilitatorRole || null;

// //     const getCompetencyStatus = () => {
// //         if (!isAssDone) return null;
// //         if (isRemediation && !isLocked) return null;
// //         const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
// //         let isCompetent = compStr === 'c' || compStr === 'competent';

// //         if (!isWorkplaceModule && !isCompetent && grandTotalAwarded !== undefined && assessment?.totalMarks)
// //             isCompetent = grandTotalAwarded >= assessment.totalMarks * 0.6;

// //         return {
// //             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
// //             color: isModDone ? 'var(--mlab-green)' : 'var(--mlab-red)',
// //             subtext: isModDone ? 'Final Results Verified & Endorsed.' : isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.',
// //             score: isWorkplaceModule ? undefined : grandTotalAwarded,
// //             percentage: grandTotalPct,
// //             isCompetent,
// //         };
// //     };
// //     const outcome = getCompetencyStatus();

// //     const getSafeDate = (ds: string) => {
// //         if (!ds) return 'recently';
// //         const d = new Date(ds);
// //         return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// //     };

// //     useEffect(() => {
// //         const fetchOffset = async () => {
// //             try { const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC'); const data = await res.json(); setTimeOffset(new Date(data.utc_datetime).getTime() - Date.now()); } catch { setTimeOffset(0); }
// //         };
// //         fetchOffset();
// //     }, []);
// //     const getSecureNow = () => Date.now() + timeOffset;

// //     useEffect(() => {
// //         if (employers.length === 0) fetchEmployers();
// //         if (staff.length === 0) fetchStaff();

// //         const load = async () => {
// //             if (!user?.uid || !assessmentId) return;

// //             if (user.role && user.role !== 'learner') {
// //                 setIsAdminIntercept(true);
// //                 setLoading(false);
// //                 return;
// //             }

// //             try {
// //                 const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
// //                 if (!assSnap.exists()) {
// //                     toast.error('Assessment template not found.');
// //                     setLoading(false); return;
// //                 }
// //                 const assData = assSnap.data();
// //                 setAssessment(assData);

// //                 let resolvedLearnerProfile: any = {};
// //                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
// //                 if (userDocSnap.exists()) {
// //                     resolvedLearnerProfile = { id: userDocSnap.id, ...userDocSnap.data() };
// //                 }

// //                 if (user?.role === 'learner') {
// //                     const learnersRef = collection(db, 'learners');
// //                     const authSnap = await getDocs(query(learnersRef, where('authUid', '==', user.uid)));
// //                     if (!authSnap.empty) {
// //                         resolvedLearnerProfile = {
// //                             ...resolvedLearnerProfile,
// //                             ...authSnap.docs[0].data(),
// //                             learnerDocId: authSnap.docs[0].id
// //                         };
// //                     }
// //                 }

// //                 setLearnerProfile(resolvedLearnerProfile);

// //                 const subRef = collection(db, 'learner_submissions');
// //                 const subQuery = query(subRef, where('authUid', '==', user.uid));
// //                 const subSnap = await getDocs(subQuery);

// //                 let activeSub: any = null;

// //                 if (!subSnap.empty) {
// //                     const mySubsForThisExam = subSnap.docs
// //                         .map(d => ({ id: d.id, ...d.data() } as any))
// //                         .filter(sub => sub.assessmentId === assessmentId);

// //                     if (mySubsForThisExam.length > 0) {
// //                         const activeCohortId = resolvedLearnerProfile?.cohortId;
// //                         const cohortMatch = mySubsForThisExam.find(d => d.cohortId === activeCohortId);

// //                         if (cohortMatch) {
// //                             activeSub = cohortMatch;
// //                         } else {
// //                             activeSub = mySubsForThisExam.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
// //                         }
// //                     }
// //                 }

// //                 if (!activeSub && user?.role === 'learner' && resolvedLearnerProfile?.cohortId) {
// //                     const belongsToCohort = assData.cohortIds?.includes(resolvedLearnerProfile.cohortId) || assData.cohortId === resolvedLearnerProfile.cohortId;
// //                     const isLive = assData.status === 'active' || assData.status === 'scheduled';

// //                     if (belongsToCohort && isLive) {
// //                         const targetHumanId = resolvedLearnerProfile.learnerId || resolvedLearnerProfile.id;
// //                         const activeCohortId = resolvedLearnerProfile.cohortId;
// //                         const enrolId = `${activeCohortId}_${targetHumanId}`;
// //                         const sid = `${activeCohortId}_${targetHumanId}_${assessmentId}`;

// //                         const newSub = {
// //                             learnerId: targetHumanId,
// //                             enrollmentId: enrolId,
// //                             authUid: user.uid,
// //                             qualificationName: resolvedLearnerProfile.qualification?.name || "",
// //                             assessmentId: assessmentId,
// //                             cohortId: activeCohortId,
// //                             title: assData.title,
// //                             type: assData.type || 'formative',
// //                             moduleType: assData.moduleType || 'knowledge',
// //                             status: "not_started",
// //                             assignedAt: new Date().toISOString(),
// //                             marks: 0,
// //                             totalMarks: assData.totalMarks || 0,
// //                             moduleNumber: assData.moduleInfo?.moduleNumber || "",
// //                             createdAt: new Date().toISOString(),
// //                             createdBy: "System_Player_AutoHydration"
// //                         };

// //                         await setDoc(doc(db, "learner_submissions", sid), newSub);
// //                         activeSub = { id: sid, ...newSub };
// //                     }
// //                 }

// //                 if (activeSub) {
// //                     setSubmission(activeSub);
// //                     setAnswers(activeSub.answers || {});

// //                     if (activeSub.enrollmentId) { const e = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId)); if (e.exists()) setLearnerEnrollment(e.data()); }
// //                     if (activeSub.grading?.gradedBy) { const s = await getDoc(doc(db, 'users', activeSub.grading.gradedBy)); if (s.exists()) setAssessorProfile(s.data()); }
// //                     if (activeSub.moderation?.moderatedBy) { const s = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy)); if (s.exists()) setModeratorProfile(s.data()); }

// //                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
// //                     if (facId) { const s = await getDoc(doc(db, 'users', facId)); if (s.exists()) setFacilitatorProfile(s.data()); }
// //                 } else {
// //                     toast.error('You are not assigned to this assessment.');
// //                 }
// //             } catch (err) {
// //                 console.error("Fatal error loading assessment data:", err);
// //                 toast.error('Failed to load assessment data.');
// //             } finally {
// //                 setLoading(false);
// //             }
// //         };

// //         if (timeOffset !== null) load();
// //     }, [assessmentId, user?.uid, timeOffset]);

// //     // ─── FETCH COMPLIANCE LOGS FOR THE GATES ────────────────────────
// //     useEffect(() => {
// //         if (!submission || !user?.uid) return;

// //         const _isSummative = submission.type?.toLowerCase().includes('summative');

// //         if (_isSummative) {
// //             const logsQ = query(
// //                 collection(db, 'curriculum_logs'),
// //                 where('cohortId', '==', submission.cohortId),
// //                 where('moduleCode', '==', submission.moduleNumber)
// //             );

// //             const unsubLogs = onSnapshot(logsQ, (snap) => {
// //                 setModuleLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// //             });

// //             const formQ = query(
// //                 collection(db, 'learner_submissions'),
// //                 where('learnerId', '==', submission.learnerId),
// //                 where('moduleNumber', '==', submission.moduleNumber),
// //                 where('status', '==', 'moderated'),
// //                 where('competency', '==', 'C')
// //             );

// //             const unsubForm = onSnapshot(formQ, (snap) => {
// //                 setPassedFormative(!snap.empty);
// //             });

// //             return () => { unsubLogs(); unsubForm(); };
// //         }
// //     }, [submission?.id, user?.uid, submission?.type, submission?.cohortId, submission?.moduleNumber, submission?.learnerId]);

// //     // ─── COUNTDOWN FOR SCHEDULED ASSESSMENT ─────────────────────────────────
// //     useEffect(() => {
// //         if (assessment?.scheduledDate && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed) {
// //             const interval = setInterval(() => {
// //                 const startTime = moment(assessment.scheduledDate).valueOf();
// //                 const now = Date.now();
// //                 const difference = startTime - now;

// //                 if (difference <= 0) {
// //                     setTimeToStart(0);
// //                     clearInterval(interval);
// //                 } else {
// //                     setTimeToStart(difference);
// //                 }
// //             }, 1000);

// //             return () => clearInterval(interval);
// //         }
// //     }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed]);

// //     const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > Date.now() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed;

// //     // ─── LIVE REAL-TIME LOCKOUT FOR "NOT STARTED" USERS ──────────────────────
// //     useEffect(() => {
// //         if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock) {
// //             const interval = setInterval(() => {
// //                 const extraTime = submission?.extraTimeGranted || 0;
// //                 const totalAllowedTimeMs = (assessment.moduleInfo?.timeLimit + extraTime) * 60 * 1000;
// //                 const scheduledEnd = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;

// //                 if (getSecureNow() >= scheduledEnd) {
// //                     updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: 'missed',
// //                         systemNote: 'Auto-swept by frontend player: Learner missed schedule window.'
// //                     }).catch(() => { });
// //                     setSubmission((prev: any) => ({ ...prev, status: 'missed' }));
// //                     clearInterval(interval);
// //                 }
// //             }, 1000);
// //             return () => clearInterval(interval);
// //         }
// //     }, [isNotStarted, assessment, submission]);


// //     // ─── LIVE COUNTDOWN TICKER FOR "IN PROGRESS" USERS ──────────────────────
// //     useEffect(() => {
// //         if (isPracticalModule || timeLeft === null || isLocked || showGate || isMissed) return;
// //         if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }

// //         const id = setInterval(() => {
// //             const now = getSecureNow();
// //             const extraTime = submission.extraTimeGranted || 0;
// //             const totalAllowedTimeMs = (assessment.moduleInfo.timeLimit + extraTime) * 60 * 1000;

// //             let endMs;

// //             if (assessment.isScheduled && assessment.scheduledDate && !submission.overrideUnlock) {
// //                 endMs = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
// //             } else {
// //                 endMs = new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
// //             }

// //             setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
// //         }, 1000);

// //         return () => clearInterval(id);
// //     }, [timeLeft, isLocked, showGate, submission?.startedAt, isPracticalModule, submission?.extraTimeGranted, isMissed, assessment]);

// //     const formatTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`; };

// //     const formatCountdown = (ms: number) => {
// //         const days = Math.floor(ms / (1000 * 60 * 60 * 24));
// //         const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
// //         const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
// //         const seconds = Math.floor((ms % (1000 * 60)) / 1000);

// //         if (days > 0) {
// //             return `${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
// //         }

// //         return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
// //     };

// //     // ─── GATE VARIABLES ───
// //     const isSummative = submission?.type?.toLowerCase().includes('summative') || false;
// //     const hasOverride = submission?.facilitatorOverride === true;
// //     const pendingTopics = useMemo(() => {
// //         if (!submission || !moduleLogs) return [];
// //         return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
// //     }, [moduleLogs, submission]);
// //     const isFullyCompliant = pendingTopics.length === 0;

// //     // ─── START EXAM HANDLER ──────────────────────────
// //     const handleStartAssessment = async () => {
// //         if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)) return;
// //         setIsStarting(true);
// //         setSaving(true);
// //         try {
// //             const functions = getFunctions();
// //             const startFn = httpsCallable(functions, 'startAssessment');
// //             const res = await startFn({ submissionId: submission.id });
// //             const data = res.data as any;
// //             const t = data.startedAt || new Date(getSecureNow()).toISOString();

// //             let payload: any = {};
// //             if (needsRemediationGate) {
// //                 payload['latestCoachingLog.acknowledged'] = true;
// //                 payload['latestCoachingLog.acknowledgedAt'] = t;
// //                 payload['latestCoachingLog.learnerSignatureUrl'] = learnerProfile?.signatureUrl || null;
// //                 await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
// //             }

// //             setSubmission((p: any) => ({
// //                 ...p,
// //                 status: 'in_progress',
// //                 startedAt: t,
// //                 latestCoachingLog: p.latestCoachingLog && needsRemediationGate
// //                     ? { ...p.latestCoachingLog, acknowledged: true, acknowledgedAt: t, learnerSignatureUrl: learnerProfile?.signatureUrl }
// //                     : p.latestCoachingLog
// //             }));

// //             if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) {
// //                 const extraTime = submission?.extraTimeGranted || 0;
// //                 const totalAllowedTimeMs = (assessment.moduleInfo.timeLimit + extraTime) * 60 * 1000;

// //                 if (assessment.isScheduled && assessment.scheduledDate && !submission.overrideUnlock) {
// //                     const scheduledEnd = moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
// //                     setTimeLeft(Math.max(0, Math.floor((scheduledEnd - getSecureNow()) / 1000)));
// //                 } else {
// //                     setTimeLeft((assessment.moduleInfo.timeLimit + extraTime) * 60);
// //                 }
// //             }
// //         } catch (err: any) {
// //             toast.error(err.message || 'Failed to start assessment. Please check compliance.');
// //         } finally {
// //             setSaving(false);
// //             setIsStarting(false);
// //         }
// //     };

// //     const triggerAutoSave = (newAnswers: any) => {
// //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// //         setSaving(true);
// //         saveTimeoutRef.current = setTimeout(async () => {
// //             if (!submission?.id) return;
// //             try { await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() }); }
// //             catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
// //         }, 1200);
// //     };

// //     const handleAnswerChange = (blockId: string, value: any) => {
// //         if (isLocked && !isAwaitingSignoff) return;
// //         setAnswers(p => { const n = { ...p, [blockId]: value }; triggerAutoSave(n); return n; });
// //     };
// //     const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
// //         if (isLocked && !isAwaitingSignoff) return;
// //         setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; triggerAutoSave(n); return n; });
// //     };
// //     const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
// //         if (isLocked && !isAwaitingSignoff) return;
// //         setAnswers(p => {
// //             const blockAns = p[blockId] || {};
// //             const raw = blockAns[nestedKey];
// //             const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
// //             const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
// //             triggerAutoSave(n); return n;
// //         });
// //     };

// //     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
// //         if (!file) return;
// //         const pKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
// //         setUploadProgress(p => ({ ...p, [pKey]: 0 })); setSaving(true); toast.info(`Uploading ${file.name}…`);
// //         try {
// //             const storage = getStorage();
// //             const ref = fbStorageRef(storage, `evidence/${submission.id}/${blockId}_${Date.now()}_${file.name}`);
// //             const task = uploadBytesResumable(ref, file);
// //             task.on('state_changed',
// //                 snap => setUploadProgress(p => ({ ...p, [pKey]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
// //                 err => {
// //                     console.error("Firebase Storage Upload Error:", err);
// //                     toast.error(`Upload failed: ${err.message}. Please try again.`);
// //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', '');
// //                     else handleTaskAnswerChange(blockId, 'uploadUrl', '');
// //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// //                     setSaving(false);
// //                 },
// //                 async () => {
// //                     const url = await getDownloadURL(task.snapshot.ref);
// //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', url);
// //                     else handleTaskAnswerChange(blockId, 'uploadUrl', url);
// //                     toast.success(`Uploaded: ${file.name}`);
// //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; }); setSaving(false);
// //                 }
// //             );
// //         } catch (err: any) {
// //             toast.error(`Upload failed: ${err.message}`);
// //             setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// //             setSaving(false);
// //         }
// //     };

// //     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
// //         setSaving(true);
// //         const t = new Date(getSecureNow()).toISOString();
// //         try {
// //             await updateDoc(doc(db, 'learner_submissions', subId), {
// //                 answers: currentAnswers, status: 'submitted', submittedAt: t, autoSubmitted: true,
// //                 learnerDeclaration: {
// //                     agreed: true,
// //                     timestamp: t,
// //                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// //                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// //                     signatureUrl: learnerProfile?.signatureUrl || null
// //                 },
// //             });
// //             toast.success("Time's up! Auto-submitted.");
// //             setSubmission((p: any) => ({ ...p, status: 'submitted', learnerDeclaration: { signatureUrl: learnerProfile?.signatureUrl || null, timestamp: t, learnerName: learnerProfile?.fullName || 'Unknown' } }));
// //             setTimeout(() => safeNavigateBack(), 3000);
// //         } catch (e) { console.error(e); } finally { setSaving(false); }
// //     };

// //     const handleNavigationLeave = () => {
// //         if (Object.keys(uploadProgress).length > 0) { toast.warning("Files are uploading. Please wait."); return; }
// //         if (!isLocked && !isPracticalModule && assessment.moduleInfo?.timeLimit > 0 && !showGate && !isMissed) setShowLeaveWarning(true);
// //         else safeNavigateBack();
// //     };

// //     const validateChecklistEvidence = () => {
// //         for (const block of assessment.blocks || []) {
// //             if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
// //                 for (let i = 0; i < (block.criteria?.length || 0); i++) {
// //                     const raw = answers[block.id]?.[`evidence_${i}`];
// //                     const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
// //                     const has = ev && ((ev.text && ev.text.replace(/<[^>]*>?/gm, '').trim()) || ev.url?.trim() || ev.code?.trim() || ev.uploadUrl?.trim());
// //                     if (!has) return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title}".` };
// //                 }
// //             }
// //             if (block.type === 'qcto_workplace') {
// //                 const bAns = answers[block.id] || {};
// //                 for (const wa of block.workActivities || []) {
// //                     if (!bAns[`wa_${wa.id}_declaration`]) return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
// //                     for (const se of wa.evidenceItems || []) {
// //                         const ev = bAns[`se_${se.id}`] || {};
// //                         const has = ev && ((ev.text && ev.text.replace(/<[^>]*>?/gm, '').trim()) || ev.url?.trim() || ev.uploadUrl?.trim());
// //                         if (!has) return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
// //                     }
// //                 }
// //             }
// //         }
// //         return { valid: true };
// //     };

// //     const triggerSubmitConfirm = () => {
// //         if (Object.keys(uploadProgress).length > 0) { toast.warning("Files are uploading. Please wait."); return; }
// //         if (!declarationChecked) { toast.warning('You must agree to the declaration.'); return; }
// //         if (isAwaitingSignoff || isPracticalModule) {
// //             const chk = validateChecklistEvidence() as any;
// //             if (!chk.valid) { toast.warning(chk.message); return; }
// //         }
// //         setShowSubmitConfirm(true);
// //     };

// //     const executeSubmit = async () => {
// //         setShowSubmitConfirm(false);
// //         setSaving(true);
// //         const t = new Date(getSecureNow()).toISOString();
// //         const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

// //         const payload = {
// //             answers,
// //             status: nextStatus,
// //             submittedAt: t,
// //             learnerDeclaration: {
// //                 agreed: true,
// //                 timestamp: t,
// //                 learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// //                 learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// //                 signatureUrl: learnerProfile?.signatureUrl || null
// //             }
// //         };

// //         try {
// //             await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
// //             toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
// //             setSubmission((p: any) => ({ ...p, status: nextStatus, learnerDeclaration: payload.learnerDeclaration }));
// //             setTimeout(() => window.scrollTo(0, 0), 1000);
// //         } catch (error: any) {
// //             console.error("❌ Submission Error:", error);
// //             toast.error(`Failed to submit: ${error.message}`);
// //         } finally { setSaving(false); }
// //     };

// //     const executeAppeal = async (reason: string) => {
// //         setShowAppealModal(false); setSaving(true);
// //         try {
// //             await updateDoc(doc(db, 'learner_submissions', submission.id), { status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' }, lastStaffEditAt: new Date().toISOString() });
// //             toast.success("Formal appeal lodged successfully.");
// //             setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
// //         } catch { toast.error("Failed to lodge appeal."); } finally { setSaving(false); }
// //     };

// //     const renderBlockImage = (block: any) => {
// //         if (!block.imageUrl) return null;
// //         return (
// //             <div style={{ margin: '1rem 0', textAlign: 'center' }}>
// //                 <img
// //                     src={block.imageUrl}
// //                     alt={block.imageCaption || "Assessment attachment"}
// //                     style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }}
// //                 />
// //                 {block.imageCaption && (
// //                     <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>
// //                         {block.imageCaption}
// //                     </p>
// //                 )}
// //             </div>
// //         );
// //     };

// //     const generateCalendarLink = () => {
// //         if (!assessment?.scheduledDate) return "#";

// //         const formatToGCal = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");

// //         const startTime = new Date(assessment.scheduledDate);
// //         const durationMinutes = assessment.moduleInfo?.timeLimit || 60;
// //         const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

// //         const dtStart = formatToGCal(startTime);
// //         const dtEnd = formatToGCal(endTime);

// //         const eventTitle = encodeURIComponent(`mLab Assessment: ${assessment.title}`);
// //         const eventDetails = encodeURIComponent(
// //             `Your secure assessment module is scheduled.\n\nAccess Link: ${window.location.origin}/learner/assessment/${assessmentId}`
// //         );

// //         return `https://www.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${dtStart}/${dtEnd}&details=${eventDetails}&sf=true&output=xml`;
// //     };

// //     // ─────────────────────────────────────────────────────────────────────────────
// //     // EARLY RETURNS: LOADING & ERRORS
// //     // ─────────────────────────────────────────────────────────────────────────────
// //     if (loading) return (
// //         <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
// //             <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
// //         </div>
// //     );

// //     if (isAdminIntercept) return (
// //         <div className="ap-fullscreen">
// //             <div className="ap-state-card">
// //                 <div className="ap-state-card__icon-wrap"><ShieldAlert size={32} color="var(--mlab-blue)" /></div>
// //                 <h1 className="ap-state-card__title">Staff Access Detected</h1>
// //                 <p className="ap-state-card__desc">This area is restricted to learners only.<br />Use Preview mode to view assessments without affecting learner data.</p>
// //                 <div className="ap-state-card__actions">
// //                     <button className="ap-btn ap-btn--outline" onClick={() => safeNavigateBack()}><ArrowLeft size={14} /> Go Back</button>
// //                     <button className="ap-btn ap-btn--primary" onClick={() => navigate(`/admin/assessment/preview/${assessmentId}`)}>Open Preview Mode</button>
// //                 </div>
// //             </div>
// //         </div>
// //     );

// //     if (!assessment || !submission) return (
// //         <div className="ap-fullscreen" style={{ position: 'absolute', right: 0, left: 0, bottom: 0, top: 0 }}>
// //             <div className="ap-state-card">
// //                 <div className="ap-state-card__icon-wrap ap-state-card__icon-wrap--dim"><AlertCircle size={32} color="var(--mlab-grey)" /></div>
// //                 <h2 className="ap-state-card__title">Assessment Unavailable</h2>
// //                 <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Contact your facilitator if you believe this is an error.</p>
// //                 <div className="ap-state-card__actions">
// //                     <button className="ap-btn ap-btn--outline" onClick={() => safeNavigateBack()}>
// //                         <ArrowLeft size={14} /> Return to Portfolio
// //                     </button>
// //                 </div>
// //             </div>
// //         </div>
// //     );

// //     if (isScheduledLocked) {
// //         const remaining = timeToStart !== null && timeToStart > 0 ? timeToStart : (moment(assessment.scheduledDate).valueOf() - Date.now());
// //         const startDate = moment(assessment.scheduledDate);
// //         const remainingMinutes = Math.floor(remaining / 60000);
// //         let timerColor = 'var(--mlab-blue)';
// //         let timerBorderColor = 'var(--mlab-blue)';
// //         let timerAnimation = '';

// //         if (remainingMinutes <= 2) {
// //             timerColor = '#dc2626';     // red
// //             timerBorderColor = '#dc2626';
// //             timerAnimation = 'pulse 1s infinite';
// //         } else if (remainingMinutes <= 10) {
// //             timerColor = '#f97316';     // orange
// //             timerBorderColor = '#f97316';
// //         }

// //         return (
// //             <div className="lfm-overlay">
// //                 <div className="lfm-modal" style={{
// //                     width: '95%',
// //                     maxWidth: '900px',
// //                     animation: 'lfm-fadeIn 0.3s ease both',
// //                     margin: '20px auto',
// //                     background: 'white',
// //                     boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
// //                 }}>
// //                     <div className="lfm-header" style={{
// //                         padding: '1.5rem 2rem',
// //                         borderBottom: '5px solid var(--mlab-green)'
// //                     }}>
// //                         <h2 className="lfm-header__title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                             <ShieldCheck size={24} color="var(--mlab-green)" />
// //                             Assessment Locked & Scheduled
// //                         </h2>
// //                     </div>

// //                     <div className="lfm-body" style={{ padding: '0' }}>
// //                         <div style={{
// //                             display: 'grid',
// //                             gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
// //                             gap: '0'
// //                         }}>
// //                             <div style={{
// //                                 padding: '2rem',
// //                                 textAlign: 'left',
// //                                 borderRight: '1px solid var(--mlab-border)',
// //                                 background: '#fcfcfc'
// //                             }}>
// //                                 <div style={{ marginBottom: '1.5rem' }}>
// //                                     <h1 style={{ fontSize: '1.5rem', color: 'var(--mlab-midnight)', margin: '0 0 8px 0', fontWeight: 800 }}>
// //                                         {assessment.title}
// //                                     </h1>
// //                                     <div style={{ display: 'flex', gap: '8px', color: 'var(--mlab-grey)', fontSize: '0.85rem', fontWeight: 600 }}>
// //                                         <BookOpen size={14} />
// //                                         <span>Module {assessment.moduleInfo?.moduleNumber || '—'}</span>
// //                                     </div>
// //                                 </div>

// //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
// //                                     <section>
// //                                         <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--mlab-blue)', letterSpacing: '0.05em', marginBottom: '8px' }}>
// //                                             About this Assessment
// //                                         </h4>
// //                                         <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
// //                                             This assessment is strictly scheduled and currently secured. To ensure academic integrity and a synchronized start for all learners, access is restricted until the official commencement time.
// //                                         </p>
// //                                     </section>

// //                                     <section style={{ padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '4px solid var(--mlab-green)', borderRadius: '4px' }}>
// //                                         <div style={{ display: 'flex', gap: '12px' }}>
// //                                             <Info size={20} color="var(--mlab-green)" style={{ flexShrink: 0 }} />
// //                                             <div>
// //                                                 <strong style={{ display: 'block', fontSize: '0.85rem', color: '#166534', marginBottom: '4px' }}>Learner Flexibility</strong>
// //                                                 <p style={{ fontSize: '0.85rem', color: '#166534', lineHeight: 1.5, margin: 0 }}>
// //                                                     You are <strong>not required</strong> to keep this tab open. You may close this window and return to the Learner Portal exactly at the start time. If you choose to stay, this page will automatically unlock once the countdown reaches zero.
// //                                                 </p>
// //                                             </div>
// //                                         </div>
// //                                     </section>

// //                                     <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
// //                                         <strong>Note:</strong> Standard invigilation and proctoring rules will apply immediately upon the assessment unlocking. Ensure your camera and microphone are ready <b style={{ color: 'red' }}>IF APPLICABLE</b>.
// //                                     </p>
// //                                 </div>
// //                             </div>

// //                             <div style={{
// //                                 padding: '2rem',
// //                                 display: 'flex',
// //                                 flexDirection: 'column',
// //                                 justifyContent: 'center',
// //                                 alignItems: 'center',
// //                                 gap: '1.5rem',
// //                                 background: 'white'
// //                             }}>
// //                                 <div style={{ textAlign: 'center' }}>
// //                                     <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--mlab-grey)', letterSpacing: '0.1em' }}>Commencement Time</span>
// //                                     <div style={{
// //                                         marginTop: '8px',
// //                                         padding: '8px 16px',
// //                                         background: 'var(--mlab-blue)',
// //                                         color: 'white',
// //                                         borderRadius: '4px',
// //                                         fontWeight: 700,
// //                                         fontSize: '1rem'
// //                                     }}>
// //                                         {startDate.format("dddd, D MMMM YYYY [at] HH:mm")}
// //                                     </div>
// //                                 </div>

// //                                 <div style={{
// //                                     background: 'var(--mlab-bg)',
// //                                     border: `2px solid ${timerBorderColor}`,
// //                                     borderLeft: `5px solid ${timerColor}`,
// //                                     width: '100%',
// //                                     padding: '1.5rem',
// //                                     borderRadius: '4px',
// //                                     textAlign: 'center',
// //                                     transition: 'border-color 0.3s ease'
// //                                 }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
// //                                         <Clock size={18} color={timerColor} />
// //                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
// //                                             System Unlocks In
// //                                         </span>
// //                                     </div>
// //                                     <div style={{
// //                                         fontSize: 'clamp(2.5rem, 8vw, 3.5rem)',
// //                                         fontWeight: '900',
// //                                         fontFamily: 'monospace',
// //                                         color: timerColor,
// //                                         letterSpacing: '2px',
// //                                         lineHeight: 1,
// //                                         animation: timerAnimation
// //                                     }}>
// //                                         {formatCountdown(remaining)}
// //                                     </div>
// //                                 </div>

// //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
// //                                     <div style={{
// //                                         display: 'flex',
// //                                         alignItems: 'center',
// //                                         gap: '8px',
// //                                         padding: '10px',
// //                                         background: '#fffbeb',
// //                                         border: '1px solid #fef3c7',
// //                                         borderRadius: '4px',
// //                                         textAlign: 'left'
// //                                     }}>
// //                                         <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0 }} />
// //                                         <span style={{ fontSize: '0.75rem', color: '#92400e', lineHeight: 1.4 }}>
// //                                             You must be signed into <strong>Google/Gmail</strong> to receive a calendar reminder.
// //                                         </span>
// //                                     </div>

// //                                     <a
// //                                         href={generateCalendarLink()}
// //                                         target="_blank"
// //                                         rel="noopener noreferrer"
// //                                         className="ap-btn ap-btn--primary"
// //                                         style={{
// //                                             justifyContent: 'center',
// //                                             gap: '8px',
// //                                             width: '100%',
// //                                             textDecoration: 'none',
// //                                             background: '#4285F4',
// //                                             borderColor: '#4285F4',
// //                                             borderRadius: '4px',
// //                                             padding: '14px',
// //                                             fontWeight: 600
// //                                         }}
// //                                     >
// //                                         <CalendarDays size={18} /> Sync to Google Calendar
// //                                     </a>

// //                                     <button
// //                                         onClick={() => safeNavigateBack()}
// //                                         className="ap-btn ap-btn--outline"
// //                                         style={{
// //                                             justifyContent: 'center',
// //                                             gap: '8px',
// //                                             width: '100%',
// //                                             color: 'var(--mlab-grey)',
// //                                             borderRadius: '4px',
// //                                             padding: '14px'
// //                                         }}
// //                                     >
// //                                         <ArrowLeft size={16} /> Return to Dashboard
// //                                     </button>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 </div>
// //             </div>
// //         );
// //     }

// //     if (isMissed) {
// //         return (
// //             <div className="lfm-overlay">
// //                 <div className="lfm-modal" style={{ width: '95%', maxWidth: '600px', margin: '20px auto', border: '2px solid var(--mlab-red)' }}>
// //                     <div className="lfm-header" style={{ borderBottom: '3px solid var(--mlab-red)', background: 'var(--mlab-red)' }}>
// //                         <h2 className="lfm-header__title">
// //                             <ShieldAlert size={20} color="var(--mlab-white)" />
// //                             Assessment Missed
// //                         </h2>
// //                     </div>
// //                     <div className="lfm-body">
// //                         <div className="lfm-error-banner">
// //                             <AlertTriangle size={20} />
// //                             <span>The scheduled time window for this assessment has closed. Because you did not begin the assessment within the allowed timeframe, it has been automatically locked.</span>
// //                         </div>
// //                         <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
// //                             <button className="lfm-btn lfm-btn--primary" onClick={() => safeNavigateBack()} style={{ background: 'var(--mlab-red)' }}>
// //                                 <ArrowLeft size={16} /> Return to Portfolio
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             </div>
// //         );
// //     }

// //     if (assessment?.status === 'upcoming' && !isAdminIntercept && !submission?.overrideUnlock) {
// //         return (
// //             <div className="ap-fullscreen" style={{ position: 'absolute', right: 0, left: 0, bottom: 0, top: 0, backgroundColor: '#f8fafc' }}>
// //                 <div className="ap-state-card" style={{ borderTop: '4px solid var(--mlab-blue)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
// //                     <div className="ap-state-card__icon-wrap ap-state-card__icon-wrap--dim" style={{ background: '#e0f2fe' }}>
// //                         <Lock size={32} color="#0284c7" />
// //                     </div>
// //                     <h2 className="ap-state-card__title" style={{ color: '#0f172a' }}>Module Coming Soon</h2>
// //                     <p className="ap-state-card__desc">This workbook is currently locked by your facilitator. It will automatically unlock as you progress through the curriculum.</p>
// //                     <div className="ap-state-card__actions">
// //                         <button className="ap-btn ap-btn--primary" onClick={() => safeNavigateBack()}>
// //                             <ArrowLeft size={14} /> Return to Portfolio
// //                         </button>
// //                     </div>
// //                 </div>
// //             </div>
// //         );
// //     }

// //     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
// //         if (block.type === 'section') {
// //             acc.push({ type: 'section', label: block.title, id: block.id });
// //         } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
// //             const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
// //             acc.push({ type: 'q', label: cleanLabel, id: block.id });
// //         }
// //         return acc;
// //     }, []) || [];

// //     let displayStatus = submission.status.replace('_', ' ');
// //     if (submission.status === 'returned') displayStatus = 'revision required';
// //     const canEditTask = !isLocked || isAwaitingSignoff;
// //     const canEditChecklist = isAwaitingSignoff;
// //     const canEditLogbook = !isLocked || isAwaitingSignoff;
// //     const canEditWorkplace = !isLocked || isAwaitingSignoff;
// //     let qNum = 0;

// //     // START GATE SCREEN
// //     if (showGate) return (
// //         <div className="ap-gate ap-animate" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// //             <div className="ap-gate-topbar">
// //                 <button className="ap-gate-topbar__back" onClick={() => safeNavigateBack()}>
// //                     <ArrowLeft size={14} /> Back to Portfolio
// //                 </button>
// //                 <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
// //             </div>
// //             <div className="ap-gate-body">
// //                 <div className="ap-gate-left">
// //                     <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
// //                     <h1 className="ap-gate-left__title">
// //                         {assessment.title}
// //                         {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
// //                         {isAppealUpheld && <span className="ap-gate-appeal-badge">Appeal Granted</span>}
// //                     </h1>
// //                     <p className="ap-gate-left__sub">
// //                         {isAppealUpheld ? "A new attempt has been granted by the Academic Board following your successful appeal."
// //                             : isRemediation ? "This is a fresh attempt. Use the Facilitator's Coaching Notes below to correct your answers."
// //                                 : "Read all instructions carefully before starting."}
// //                     </p>

// //                     {willBeProctored && (
// //                         <div className="ap-workplace-banner " style={{ background: '#fff1f2', padding: 16, marginBottom: 16, borderColor: '#fecdd3', borderLeftColor: '#e11d48' }}>
// //                             <strong className="ap-workplace-banner__title ap-info-card__label" style={{ color: '#be123c', fontSize: 14 }}>
// //                                 <ShieldAlert size={16} /> Secure Proctored Environment
// //                             </strong>
// //                             <p className="ap-workplace-banner__text" style={{ color: '#881337' }}>
// //                                 This is a strictly invigilated assessment. You will be required to grant <strong>Camera and Microphone</strong> permissions and complete the test in <strong>Fullscreen Mode</strong>. Exiting fullscreen or switching browser tabs will immediately log a security violation to your Assessor.
// //                             </p>
// //                         </div>
// //                     )}

// //                     {assessment?.isOpenBook && assessment?.referenceManualUrl && (
// //                         <div className="ap-openbook-banner" style={{ marginBottom: 16 }}>
// //                             <strong className="ap-openbook-banner__title ap-info-card__label" style={{ textTransform: 'uppercase', fontSize: 14 }}><FileArchive size={16} /> Open Book Assessment</strong>
// //                             <p className="ap-openbook-banner__text">This is an open-book assessment. An official Reference Manual has been provided by your facilitator. You can access it inside the player at any time.</p>
// //                         </div>
// //                     )}

// //                     {assessment?.moduleType === 'workplace' && (
// //                         <div className="ap-workplace-banner">
// //                             <strong className="ap-workplace-banner__title"><Briefcase size={16} /> Workplace Experience Logbook</strong>
// //                             <p className="ap-workplace-banner__text">This module is a <strong>Learner Logbook</strong>. It tracks and verifies your real-world workplace experience. You will map tasks to specific Work Activities (WA), record your hours, and upload Supporting Evidence (SE) for review by your designated Workplace Mentor.</p>
// //                         </div>
// //                     )}

// //                     {needsRemediationGate && (
// //                         <div className="ap-coaching-log">
// //                             <strong className="ap-coaching-log__title"><MessageSquare size={16} /> Remediation Coaching Log</strong>
// //                             <p className="ap-coaching-log__desc">Before beginning Attempt #{submission.attemptNumber}, QCTO compliance requires you to acknowledge the feedback session conducted by your facilitator.</p>
// //                             <div className="ap-coaching-log__quote">
// //                                 <span className="ap-coaching-log__quote-label">Facilitator Notes ({getSafeDate(submission.latestCoachingLog.date)}):</span>
// //                                 <p className="ap-coaching-log__quote-text">"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
// //                             </div>
// //                             <label className="ap-coaching-log__ack">
// //                                 <input type="checkbox" checked={coachingAckChecked} onChange={e => setCoachingAckChecked(e.target.checked)} />
// //                                 <span className="ap-coaching-log__ack-label">I acknowledge that I received the coaching/feedback detailed above.</span>
// //                             </label>
// //                         </div>
// //                     )}

// //                     <div className="ap-info-grid">
// //                         <div className="ap-info-card"><div className="ap-info-card__label"><BookOpen size={12} /> Module</div><div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div><div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div></div>
// //                         <div className="ap-info-card"><div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div><div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div><div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div></div>
// //                         <div className="ap-info-card">
// //                             <div className="ap-info-card__label"><Clock size={12} /> Time Limit</div>
// //                             <div className="ap-info-card__value">
// //                                 {assessment.moduleInfo?.timeLimit
// //                                     ? `${assessment.moduleInfo.timeLimit + (submission.extraTimeGranted || 0)} Min`
// //                                     : 'No Limit'}
// //                             </div>
// //                             <div className="ap-info-card__sub">
// //                                 {submission.extraTimeGranted ? <span style={{ color: 'var(--mlab-green)' }}>Includes +{submission.extraTimeGranted} min extension.</span> : assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}
// //                             </div>
// //                         </div>
// //                         {!isWorkplaceModule
// //                             ? <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Total Marks</div><div className="ap-info-card__value">{assessment.totalMarks}</div><div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div></div>
// //                             : <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Grading</div><div className="ap-info-card__value">C / NYC</div><div className="ap-info-card__sub">Competency-based. No numerical score.</div></div>}
// //                     </div>

// //                     <div className="ap-note-block">
// //                         <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
// //                         {/* 🚀 FIXED HTML PARSING */}
// //                         <div className="ap-note-block__text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.') }} />

// //                         {assessment.purpose && (
// //                             <>
// //                                 <div className="ap-note-block__heading"><Info size={12} /> Purpose</div>
// //                                 {/* 🚀 FIXED HTML PARSING */}
// //                                 <div className="ap-note-block__text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.purpose) }} />
// //                             </>
// //                         )}
// //                     </div>
// //                 </div>

// //                 <div className="ap-gate-right">
// //                     <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
// //                     <ul className="ap-rules-list">
// //                         {willBeProctored && (
// //                             <li className="ap-rule-item">
// //                                 <div className="ap-rule-icon" style={{ background: '#fff1f2', color: '#e11d48' }}><Video size={18} /></div>
// //                                 <div>
// //                                     <span className="ap-rule-title" style={{ color: '#be123c' }}>Live Invigilation</span>
// //                                     <p className="ap-rule-desc">Your webcam and screen activity are actively monitored. Tab-switching is disabled.</p>
// //                                 </div>
// //                             </li>
// //                         )}
// //                         <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or unauthorized AI tools violate QCTO guidelines.</p></div></li>
// //                         <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly a group project, no collaboration is permitted.</p></div></li>
// //                         <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
// //                         {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser. Plan your time carefully.</p></div></li>}
// //                     </ul>

// //                     {/* NEW: The Smart Tollbooth Logic */}
// //                     {isSummative && !passedFormative && !hasOverride && !isAppealUpheld ? (
// //                         <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
// //                             <strong style={{ color: '#be123c', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
// //                                 <ShieldAlert size={18} /> Readiness Not Met
// //                             </strong>
// //                             <p style={{ color: '#9f1239', fontSize: '0.85rem', margin: 0 }}>
// //                                 You must achieve Competency (C) in your Formative Assessment before unlocking this Summative Exam.
// //                             </p>
// //                         </div>
// //                     ) : !isFullyCompliant ? (
// //                         <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '1.5rem', borderRadius: '8px', marginTop: '1.5rem' }}>
// //                             <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
// //                                 <AlertTriangle size={18} /> Compliance Action Required
// //                             </strong>
// //                             <p style={{ color: '#92400e', fontSize: '0.85rem', marginBottom: '1rem' }}>
// //                                 Acknowledge the delivery of these module topics before the exam will unlock:
// //                             </p>
// //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                                 {pendingTopics.map((log: any) => (
// //                                     <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #fde68a' }}>
// //                                         <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>{log.topicTitle}</span>
// //                                         <button
// //                                             className="mlab-btn mlab-btn--sm"
// //                                             style={{ background: 'var(--mlab-green)', color: 'white', border: 'none', padding: '4px 8px', fontSize: '0.7rem' }}
// //                                             onClick={async () => {
// //                                                 try {
// //                                                     const ackFn = httpsCallable(getFunctions(), 'acknowledgeCurriculumTopic');
// //                                                     await ackFn({ logId: log.id, learnerId: submission.learnerId });
// //                                                     toast.success("Topic Acknowledged!");
// //                                                 } catch {
// //                                                     toast.error("Failed to acknowledge.");
// //                                                 }
// //                                             }}
// //                                         >
// //                                             Acknowledge
// //                                         </button>
// //                                     </div>
// //                                 ))}
// //                             </div>
// //                         </div>
// //                     ) : (
// //                         <div className="ap-declaration">
// //                             <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
// //                                 <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
// //                                 <span className="ap-declaration-check__text"><strong>Declaration of Authenticity</strong> I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.</span>
// //                             </label>
// //                             <button className={`ap-start-btn${(startDeclarationChecked && (!needsRemediationGate || coachingAckChecked)) ? ' ap-start-btn--ready' : ''}`} onClick={handleStartAssessment} disabled={saving || isStarting || !startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)}>
// //                                 {saving || isStarting ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> {needsRemediationGate ? `Acknowledge & Resume Attempt #${submission.attemptNumber}` : 'I Agree, Begin Assessment'}</>}
// //                             </button>
// //                         </div>
// //                     )}
// //                 </div>
// //             </div>
// //         </div>
// //     );

// //     // ─── MAIN ASSESSMENT PLAYER ──────────────────────────────────────────────
// //     return (
// //         <ProctoringWrapper
// //             assessmentId={assessmentId || ''}
// //             learnerId={user?.uid || ''}
// //             isProctored={willBeProctored}
// //         >
// //             <div className="ap-player ap-animate">
// //                 <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //                 {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

// //                 {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={() => safeNavigateBack()} onCancel={() => setShowLeaveWarning(false)} />}
// //                 {showSubmitConfirm && <ConfirmModal title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"} message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."} confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"} cancelText="Go Back" onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}
// //                 {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

// //                 {/* ── TOP BAR ── */}
// //                 <div className="ap-player-topbar no-print">
// //                     <div className="ap-player-topbar__left">
// //                         <button className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
// //                         <button className="ap-player-topbar__back" onClick={handleNavigationLeave}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
// //                         <div className="ap-player-topbar__separator ap-hide-mobile" />
// //                         <h1 className="ap-player-topbar__title">
// //                             {assessment.title}
// //                             {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
// //                         </h1>
// //                     </div>
// //                     <div className="ap-player-topbar__right">
// //                         {assessment?.isOpenBook && assessment?.referenceManualUrl && (
// //                             <button className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}>
// //                                 <FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span>
// //                             </button>
// //                         )}
// //                         {isLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
// //                         {!isLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
// //                         {!isLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
// //                         <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>
// //                             {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}
// //                         </span>
// //                         <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
// //                     </div>
// //                 </div>


// //                 {/* ── BODY ── */}
// //                 <div className={`ap-player-body${isLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>

// //                     {/* ── LEFT SIDEBAR ── */}
// //                     <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
// //                         <button className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>

// //                         <div className="ap-sidebar__meta-block">
// //                             <div className="ap-sidebar__meta-title">{assessment.title}</div>
// //                             {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
// //                             <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
// //                             {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
// //                             {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
// //                         </div>

// //                         {/* SCORE DISPLAY FOR LEARNER */}
// //                         {!isWorkplaceModule && isFacDone && (
// //                             <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
// //                                 <div className="ap-score-card__stripe" aria-hidden="true" />

// //                                 <div className="ap-score-card__state">
// //                                     {isModDone ? (
// //                                         <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</>
// //                                     ) : (
// //                                         <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>
// //                                     )}
// //                                 </div>

// //                                 <div className="ap-score-card__body">
// //                                     <div className="ap-score-card__ring-wrap">
// //                                         <ProgressRing
// //                                             progress={grandTotalPct}
// //                                             size={72}
// //                                             strokeWidth={5}
// //                                             color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'}
// //                                         />
// //                                         <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>
// //                                             {grandTotalPct}%
// //                                         </span>
// //                                     </div>
// //                                     <div className="ap-score-card__divider" aria-hidden="true" />
// //                                     <div className="ap-score-card__fraction">
// //                                         <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
// //                                         <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
// //                                         <span className="ap-score-card__pass-note">
// //                                             Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)
// //                                         </span>
// //                                     </div>
// //                                 </div>

// //                                 {isModDone && outcome && (
// //                                     <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>
// //                                         {outcome.isCompetent
// //                                             ? <><CheckCircle size={13} /> Competent (C)</>
// //                                             : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         )}

// //                         {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
// //                             <>
// //                                 <div className="ap-sidebar__label">Status Tracking</div>
// //                                 <div className="ap-sidebar__status-box">
// //                                     {isAssDone && outcome ? (
// //                                         <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
// //                                             <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
// //                                             {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
// //                                             {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
// //                                             <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
// //                                         </div>
// //                                     ) : (
// //                                         <div className="ap-sidebar__awaiting">
// //                                             <Clock size={20} color="rgba(255,255,255,0.25)" />
// //                                             <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
// //                                             <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
// //                                         </div>
// //                                     )}
// //                                     {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
// //                                     {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
// //                                     {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

// //                                     {submission?.appeal?.status && submission.appeal.status !== 'pending' && (
// //                                         <div className="ap-sidebar__feedback" style={{ background: submission.appeal.status === 'upheld' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)', borderLeftColor: submission.appeal.status === 'upheld' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)' }}>
// //                                             <strong className="ap-sidebar__feedback__heading" style={{ color: submission.appeal.status === 'upheld' ? '#4ade80' : '#ef4444' }}>
// //                                                 <Scale size={11} /> Board Appeal {submission.appeal.status === 'upheld' ? 'Granted' : 'Rejected'}
// //                                             </strong>
// //                                             <p className="ap-sidebar__feedback__text" style={{ color: submission.appeal.status === 'upheld' ? '#4ade80' : '#ef4444' }}>
// //                                                 "{submission.appeal.resolutionNotes}"
// //                                             </p>
// //                                         </div>
// //                                     )}

// //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? (savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator') : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div></div>
// //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
// //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>
// //                                 </div>
// //                             </>
// //                         )}

// //                         <div className="ap-sidebar__label">Workbook Contents</div>
// //                         <div className="ap-sidebar__nav">
// //                             {navItems.map((item: any) =>
// //                                 item.type === 'section'
// //                                     ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
// //                                     : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
// //                             )}
// //                         </div>
// //                     </nav>

// //                     {/* ── CONTENT ── */}
// //                     <div className="ap-player-content print-pane">

// //                         {/* Print cover */}
// //                         {isLocked && !isAwaitingSignoff && (
// //                             <div className="print-only-cover">
// //                                 <div className="print-page print-page--cover">
// //                                     <div className="print-cover__logo-bar">
// //                                         <img height={50} src={mLabLogo} alt="Institution Logo" />
// //                                         <span className="print-cover__doc-type">Official Assessment Workbook</span>
// //                                     </div>
// //                                     <div className="print-cover__title-block">
// //                                         <h1 className="print-cover__module-title">
// //                                             {assessment?.moduleInfo?.moduleName || assessment?.title}
// //                                         </h1>
// //                                         <div className="print-cover__meta-chips">
// //                                             <span className="print-cover__chip">NQF Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</span>
// //                                             <span className="print-cover__chip">Credits: {assessment?.moduleInfo?.credits || 'N/A'}</span>
// //                                             <span className="print-cover__chip">Hours: {assessment?.moduleInfo?.notionalHours || 'N/A'}</span>
// //                                             {submission?.attemptNumber > 1 && <span className="print-cover__chip print-cover__chip--attempt">Attempt #{submission.attemptNumber}</span>}
// //                                         </div>
// //                                         <h2 className="print-cover__doc-subtitle">
// //                                             LEARNER {assessment?.moduleType === 'workplace' ? 'WORKPLACE LOGBOOK' : 'WORKBOOK'}
// //                                         </h2>
// //                                     </div>
// //                                     <div className="print-cover__tables">
// //                                         <div className="print-cover__table-group">
// //                                             <div className="print-cover__table-heading">MODULE INFORMATION</div>
// //                                             <table className="print-table">
// //                                                 <tbody>
// //                                                     <tr><td className="print-table__label">Module Number</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
// //                                                     <tr><td className="print-table__label">NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
// //                                                     <tr><td className="print-table__label">Notional Hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
// //                                                     <tr><td className="print-table__label">Credits</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
// //                                                     <tr><td className="print-table__label">Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
// //                                                     <tr><td className="print-table__label">SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
// //                                                     <tr><td className="print-table__label">Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
// //                                                 </tbody>
// //                                             </table>
// //                                         </div>
// //                                         <div className="print-cover__table-group">
// //                                             <div className="print-cover__table-heading">LEARNER CONTACT INFORMATION</div>
// //                                             <table className="print-table">
// //                                                 <tbody>
// //                                                     <tr><td className="print-table__label">Full Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '________________________'}</td></tr>
// //                                                     <tr><td className="print-table__label">ID Number</td><td>{submission?.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber || '________________________'}</td></tr>
// //                                                     <tr><td className="print-table__label">Email Address</td><td>{learnerProfile?.email || user?.email || '________________________'}</td></tr>
// //                                                     <tr><td className="print-table__label">Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
// //                                                     <tr><td className="print-table__label">Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
// //                                                     <tr><td className="print-table__label">Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
// //                                                 </tbody>
// //                                             </table>
// //                                         </div>
// //                                     </div>
// //                                     {assessment?.moduleType === 'workplace' && workplaceInfo?.employer && (
// //                                         <div className="print-cover__table-group">
// //                                             <div className="print-cover__table-heading">WORKPLACE PLACEMENT DETAILS</div>
// //                                             <table className="print-table">
// //                                                 <tbody>
// //                                                     <tr><td className="print-table__label">Host Company Name</td><td>{workplaceInfo.employer.name}</td></tr>
// //                                                     <tr><td className="print-table__label">Registration / SETA Number</td><td>{workplaceInfo.employer.registrationNumber || 'N/A'}</td></tr>
// //                                                     <tr><td className="print-table__label">Physical Address</td><td>{workplaceInfo.employer.physicalAddress || '________________________'}</td></tr>
// //                                                     <tr><td className="print-table__label">Contact Person</td><td>{workplaceInfo.employer.contactPerson}</td></tr>
// //                                                     <tr><td className="print-table__label">Assigned Workplace Mentor</td><td>{workplaceInfo.mentor?.fullName || '________________________'}</td></tr>
// //                                                     <tr><td className="print-table__label">Mentor Contact</td><td>{workplaceInfo.employer.contactEmail || workplaceInfo.mentor?.email}</td></tr>
// //                                                 </tbody>
// //                                             </table>
// //                                         </div>
// //                                     )}
// //                                     <div className="print-cover__footer-bar">
// //                                         <span>Printed: {new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
// //                                         <span>Submission ID: {submission?.id?.slice(0, 12) || 'N/A'}</span>
// //                                     </div>
// //                                 </div>

// //                                 <div className="print-page print-page--instructions">
// //                                     <h2 className="print-section-heading">Note to the Learner</h2>
// //                                     {/* 🚀 FIXED HTML PARSING FOR PRINT */}
// //                                     <div className="print-body-text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment?.instructions || '') }} />

// //                                     {assessment?.purpose && (
// //                                         <>
// //                                             <h2 className="print-section-heading">Purpose of this Module</h2>
// //                                             {/* 🚀 FIXED HTML PARSING FOR PRINT */}
// //                                             <div className="print-body-text quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment?.purpose || '') }} />
// //                                         </>
// //                                     )}
// //                                     <h2 className="print-section-heading">Topic Elements Covered</h2>
// //                                     <table className="print-table print-table--topics">
// //                                         <thead><tr><th className="print-table__th">Section</th><th className="print-table__th print-table__th--narrow">Weighting</th></tr></thead>
// //                                         <tbody>
// //                                             {assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, i: number) => {
// //                                                 const tot = sectionTotals[sec.id]?.total || 0;
// //                                                 return (
// //                                                     <tr key={i}>
// //                                                         <td><strong>Section {i + 1}: </strong>{sec.title}</td>
// //                                                         <td className="print-table__td--center">
// //                                                             {isWorkplaceModule ? 'Competency Based' : (tot > 0 && assessment.totalMarks ? `${Math.round((tot / assessment.totalMarks) * 100)}%` : '—')}
// //                                                         </td>
// //                                                     </tr>
// //                                                 );
// //                                             })}
// //                                         </tbody>
// //                                     </table>
// //                                 </div>

// //                                 {/* Remediation record page */}
// //                                 {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
// //                                     <div className="print-page print-page--remediation">
// //                                         <h2 className="print-section-heading">Record of Developmental Intervention (Remediation)</h2>
// //                                         <p className="print-body-text">Official evidence of a developmental intervention conducted prior to Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>
// //                                         <table className="print-table">
// //                                             <tbody>
// //                                                 <tr><td className="print-table__label">Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
// //                                                 <tr><td className="print-table__label">Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString('en-ZA')}</td></tr>
// //                                                 <tr><td className="print-table__label">Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
// //                                                 <tr><td className="print-table__label print-table__label--vtop">Coaching Notes</td><td className="print-table__td--prewrap">{submission.latestCoachingLog.notes}</td></tr>
// //                                             </tbody>
// //                                         </table>
// //                                         <div className="sr-signature-block print-sig-row">
// //                                             <div className="sr-sig-box sr-sig-box--fac">
// //                                                 <span className="sr-sig-box__label sr-sig-box__label--fac">Facilitator Declaration</span>
// //                                                 {submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl
// //                                                     ? <img src={submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
// //                                                     : <div className="sr-sig-no-image">No Canvas Signature</div>}
// //                                                 <strong className="sr-sig-box__name sr-sig-box__name--fac">{submission.latestCoachingLog.facilitatorName}</strong>
// //                                                 <em className="sr-sig-box__meta sr-sig-box__meta--fac">Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString('en-ZA')}</em>
// //                                                 <div className="sr-sig-line sr-sig-line--fac">Coaching Conducted</div>
// //                                             </div>
// //                                             <div className="sr-sig-box sr-sig-box--learner">
// //                                                 <span className="sr-sig-box__label sr-sig-box__label--learner">Learner Acknowledgement</span>
// //                                                 {submission.latestCoachingLog.acknowledged ? (
// //                                                     <>
// //                                                         {submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl
// //                                                             ? <img src={submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl} alt="Learner Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
// //                                                             : <div className="sr-sig-no-image">No Canvas Signature</div>}
// //                                                         <strong className="sr-sig-box__name sr-sig-box__name--learner">{learnerProfile?.fullName || user?.fullName}</strong>
// //                                                         <em className="sr-sig-box__meta sr-sig-box__meta--learner">Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString('en-ZA')}</em>
// //                                                         <div className="sr-sig-line sr-sig-line--learner">Intervention Received</div>
// //                                                     </>
// //                                                 ) : (
// //                                                     <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span></div>
// //                                                 )}
// //                                             </div>
// //                                         </div>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         )}

// //                         <div className="ap-blocks">
// //                             {assessment.blocks?.map((block: any) => {

// //                                 /* Section */
// //                                 if (block.type === 'section') {
// //                                     const totals = sectionTotals[block.id];
// //                                     return (
// //                                         <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
// //                                             <span>{block.title}</span>
// //                                             {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
// //                                             {/* FIXED HTML PARSING FOR SECTION */}
// //                                             {block.content && <div className="quill-read-only-content ap-block-section__content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />}
// //                                             {renderBlockImage(block)}
// //                                         </div>
// //                                     );
// //                                 }

// //                                 /* Info */
// //                                 if (block.type === 'info') return (
// //                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
// //                                         <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
// //                                         {/* FIXED HTML PARSING FOR INFO CONTENT */}
// //                                         <div className="quill-read-only-content ap-block-info__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
// //                                         {renderBlockImage(block)}
// //                                     </div>
// //                                 );

// //                                 /* Question blocks */
// //                                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
// //                                     qNum++;
// //                                     const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
// //                                     const learnerAns = answers[block.id];
// //                                     let inkColor = '#64748b';
// //                                     if (isModDone) inkColor = 'var(--mlab-green)';
// //                                     else if (isAssDone) inkColor = 'var(--mlab-red)';
// //                                     else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';
// //                                     const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
// //                                     const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);
// //                                     const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
// //                                     const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : `Q${qNum}.`;

// //                                     return (
// //                                         <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
// //                                             <div className="ap-block-question__header">
// //                                                 <div className="ap-block-question__text-wrap">
// //                                                     <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column' }}>
// //                                                         <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

// //                                                         {/* FIXED HTML PARSING FOR QUESTIONS */}
// //                                                         {block.type === 'qcto_workplace' ? (
// //                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
// //                                                         ) : block.question ? (
// //                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
// //                                                         ) : block.title ? (
// //                                                             <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title) }} />
// //                                                         ) : null}
// //                                                     </span>
// //                                                     <div className="ap-grade-indicators">
// //                                                         {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac" title="Facilitator Pre-Mark">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
// //                                                         {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass" title="Assessor Grade">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
// //                                                         {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod" title="Moderator QA">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
// //                                                     </div>
// //                                                 </div>
// //                                                 <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
// //                                             </div>

// //                                             <div className="ap-block-question__body">
// //                                                 {renderBlockImage(block)}
// //                                                 {/* MCQ */}
// //                                                 {block.type === 'mcq' && (
// //                                                     <div className="ap-mcq-options">
// //                                                         {block.options?.map((opt: string, i: number) => {
// //                                                             const selected = learnerAns === i;
// //                                                             return (
// //                                                                 <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
// //                                                                     <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={!canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
// //                                                                     <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
// //                                                                     <span className="ap-mcq-label__text">{opt}</span>
// //                                                                 </label>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* TEXT */}
// //                                                 {block.type === 'text' && (
// //                                                     <div
// //                                                         className={`ap-quill-wrapper${!canEditTask ? ' locked' : ''}`}
// //                                                         onCopyCapture={preventCopyPasteAndDrop}
// //                                                         onCutCapture={preventCopyPasteAndDrop}
// //                                                         onPasteCapture={preventCopyPasteAndDrop}
// //                                                         onDropCapture={preventCopyPasteAndDrop}
// //                                                         onKeyDownCapture={preventCopyPasteAndDrop}
// //                                                     >
// //                                                         {isLocked && !isAwaitingSignoff ? (
// //                                                             // FIXED HTML PARSING FOR LEARNER ANSWER (READ ONLY)
// //                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
// //                                                         ) : (
// //                                                             <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder={!canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
// //                                                         )}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* TASK */}
// //                                                 {block.type === 'task' && (() => {
// //                                                     const taskTabs = [
// //                                                         { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text },
// //                                                         { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl },
// //                                                         { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url },
// //                                                         { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl },
// //                                                         { id: 'code', icon: <Code size={13} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code },
// //                                                     ].filter(t => t.allowed);
// //                                                     const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
// //                                                     const progress = uploadProgress[block.id];
// //                                                     return (
// //                                                         <div className="ap-evidence-container">
// //                                                             {isPracticalModule && !isAwaitingSignoff && !isSubmitted && <div className="ap-evidence-lock-banner"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>}
// //                                                             <div className="ap-tab-bar no-print">
// //                                                                 {taskTabs.map(t => <button key={t.id} className={`ap-tab${activeTabId === t.id ? ' ap-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={11} className="ap-tab__done" />}</button>)}
// //                                                             </div>
// //                                                             <div className="ap-tab-panel">
// //                                                                 {activeTabId === 'text' && (
// //                                                                     <div
// //                                                                         className={`ap-quill-wrapper${!canEditTask ? ' locked' : ''}`}
// //                                                                         onCopyCapture={preventCopyPasteAndDrop}
// //                                                                         onCutCapture={preventCopyPasteAndDrop}
// //                                                                         onPasteCapture={preventCopyPasteAndDrop}
// //                                                                         onDropCapture={preventCopyPasteAndDrop}
// //                                                                         onKeyDownCapture={preventCopyPasteAndDrop}
// //                                                                     >
// //                                                                         {isLocked && !isAwaitingSignoff ? (
// //                                                                             // FIXED HTML PARSING FOR TASK ANSWER
// //                                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns?.text) || '<em>No answer provided.</em>' }} />
// //                                                                         ) : (
// //                                                                             <ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" />
// //                                                                         )}
// //                                                                     </div>
// //                                                                 )}
// //                                                                 {activeTabId === 'audio' && (learnerAns?.audioUrl ? <audio controls src={learnerAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{!canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
// //                                                                 {activeTabId === 'url' && <div>{canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{learnerAns?.url && !canEditTask ? <UrlPreview url={learnerAns.url} /> : <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={!canEditTask} placeholder="https://…" />}</div>}
// //                                                                 {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : learnerAns?.uploadUrl ? <FilePreview url={learnerAns.uploadUrl} onRemove={canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={!canEditTask} /> : <div className="ap-upload-empty">{!canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes})</p><input type="file" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id)} style={{ fontSize: '0.82rem' }} /></>}</div>)}
// //                                                                 {activeTabId === 'code' && <textarea className="ap-code-textarea" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={!canEditTask} placeholder="Paste your code here…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
// //                                                             </div>
// //                                                         </div>
// //                                                     );
// //                                                 })()}

// //                                                 {/* CHECKLIST */}
// //                                                 {block.type === 'checklist' && (
// //                                                     <div className="ap-checklist">
// //                                                         <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item. Upload evidence for each if required below.</p>
// //                                                         {!isAwaitingSignoff && !isSubmitted && <div className="ap-checklist__lock-notice"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>}
// //                                                         {block.criteria?.map((crit: string, i: number) => {
// //                                                             const res = criteriaResults?.[i] || {};
// //                                                             const critKey = `evidence_${i}`;
// //                                                             const raw = learnerAns?.[critKey];
// //                                                             const critEv = typeof raw === 'string' ? { text: raw } : (raw || {});
// //                                                             const cTabKey = `${block.id}_${i}`;
// //                                                             const allTabs = [
// //                                                                 { id: 'upload', icon: <UploadCloud size={12} />, label: 'File', val: critEv?.uploadUrl },
// //                                                                 { id: 'url', icon: <LinkIcon size={12} />, label: 'Link', val: critEv?.url },
// //                                                                 { id: 'code', icon: <Code size={12} />, label: 'Code', val: critEv?.code },
// //                                                                 { id: 'text', icon: <FileText size={12} />, label: 'Notes', val: critEv?.text },
// //                                                             ];
// //                                                             const tabs = !canEditChecklist ? allTabs.filter(t => t.val) : allTabs;
// //                                                             const activeCtab = activeTabs[cTabKey] || tabs[0]?.id || 'upload';
// //                                                             const progress = uploadProgress[`${block.id}_${critKey}`];
// //                                                             return (
// //                                                                 <div key={i} className="ap-checklist__item">
// //                                                                     <p className="ap-checklist__item-title">{i + 1}. {crit}</p>
// //                                                                     <div className="ap-checklist__assessor-row">
// //                                                                         {isFacDone ? (
// //                                                                             <><span className={`ap-checklist__status-chip${res.status === 'C' ? ' ap-checklist__status-chip--c' : res.status === 'NYC' ? ' ap-checklist__status-chip--nyc' : ' ap-checklist__status-chip--pending'}`}>{res.status ? (savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')) : 'Not Graded'}</span>{res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}</>
// //                                                                         ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
// //                                                                     </div>
// //                                                                     {block.requireEvidencePerCriterion !== false && (
// //                                                                         <div className="ap-checklist__evidence-tabs">
// //                                                                             <div className="ap-checklist__tab-bar">
// //                                                                                 {tabs.length > 0 ? tabs.map(t => <button key={t.id} className={`ap-checklist__tab${activeCtab === t.id ? ' ap-checklist__tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [cTabKey]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}</button>) : <div className="ap-checklist__no-evidence">No evidence provided.</div>}
// //                                                                             </div>
// //                                                                             {tabs.length > 0 && (
// //                                                                                 <div className="ap-checklist__tab-panel">
// //                                                                                     {activeCtab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : critEv.uploadUrl ? <FilePreview url={critEv.uploadUrl} onRemove={canEditChecklist ? () => handleNestedAnswerChange(block.id, critKey, 'uploadUrl', '') : undefined} disabled={!canEditChecklist} /> : <input type="file" disabled={!canEditChecklist} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, critKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
// //                                                                                     {activeCtab === 'url' && (<div>{canEditChecklist && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{critEv.url && !canEditChecklist ? <UrlPreview url={critEv.url} /> : <input type="url" className="ab-input" value={critEv.url || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'url', e.target.value)} disabled={!canEditChecklist} placeholder="https://…" />}</div>)}
// //                                                                                     {activeCtab === 'code' && <textarea className="ap-code-textarea" rows={3} value={critEv.code || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'code', e.target.value)} disabled={!canEditChecklist} placeholder="Paste code snippet…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
// //                                                                                     {activeCtab === 'text' && (
// //                                                                                         <div className={`ap-quill-wrapper${!canEditChecklist ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// //                                                                                             {isLocked && !isAwaitingSignoff ? (
// //                                                                                                 // FIXED HTML PARSING FOR CHECKLIST TEXT
// //                                                                                                 <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(critEv.text) || '<em>No notes provided.</em>' }} />
// //                                                                                             ) : (
// //                                                                                                 <ReactQuill theme="snow" value={critEv.text || ''} onChange={c => handleNestedAnswerChange(block.id, critKey, 'text', c)} readOnly={!canEditChecklist} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" />
// //                                                                                             )}
// //                                                                                         </div>
// //                                                                                     )}
// //                                                                                 </div>
// //                                                                             )}
// //                                                                         </div>
// //                                                                     )}
// //                                                                 </div>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* LOGBOOK */}
// //                                                 {block.type === 'logbook' && (
// //                                                     <div className="ap-logbook">
// //                                                         {/* FIXED HTML PARSING FOR LOGBOOK TITLE */}
// //                                                         <div className="quill-read-only-content ap-logbook__desc" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
// //                                                         <table className="ap-logbook__table">
// //                                                             <thead className="ap-logbook__thead">
// //                                                                 <tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{canEditLogbook && <th style={{ width: '40px' }}></th>}</tr>
// //                                                             </thead>
// //                                                             <tbody>
// //                                                                 {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
// //                                                                     <tr key={i} className="ap-logbook__tbody">
// //                                                                         <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// //                                                                         <td className="ap-logbook__td ap-logbook__task-cell">
// //                                                                             <div className={`ap-quill-wrapper ap-quill-wrapper--logbook${!canEditLogbook ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// //                                                                                 {isLocked && !isAwaitingSignoff ? (
// //                                                                                     // FIXED HTML PARSING FOR LOGBOOK ENTRY
// //                                                                                     <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} />
// //                                                                                 ) : (
// //                                                                                     <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={!canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />
// //                                                                                 )}
// //                                                                             </div>
// //                                                                             {entry.uploadUrl && <div style={{ marginTop: '10px' }}><FilePreview url={entry.uploadUrl} disabled /></div>}
// //                                                                             {entry.url && <div style={{ marginTop: '10px' }}><UrlPreview url={entry.url} /></div>}
// //                                                                         </td>
// //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// //                                                                         <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
// //                                                                         {canEditLogbook && <td className="ap-logbook__td"><button className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
// //                                                                     </tr>
// //                                                                 ))}
// //                                                                 {canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
// //                                                                 <tr className="ap-logbook__totals-row">
// //                                                                     <td colSpan={4} className="ap-logbook__totals-label">Total Logged Hours:</td>
// //                                                                     <td className="ap-logbook__totals-val" style={(() => { const logged = (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0); return block.requiredHours && logged < block.requiredHours ? { color: '#dc2626', fontWeight: 'bold' } : {}; })()}>
// //                                                                         {(Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0)}
// //                                                                         {block.requiredHours && (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0) < block.requiredHours && <span className="ap-logbook__hours-warning">⚠ Required: {block.requiredHours} hrs</span>}
// //                                                                     </td>
// //                                                                     {canEditLogbook && <td></td>}
// //                                                                 </tr>
// //                                                             </tbody>
// //                                                         </table>
// //                                                     </div>
// //                                                 )}

// //                                                 {/* QCTO WORKPLACE */}
// //                                                 {block.type === 'qcto_workplace' && (
// //                                                     <div className="ap-workplace">
// //                                                         <div className="quill-read-only-content" style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
// //                                                         {block.workActivities?.map((wa: any) => {
// //                                                             const waTask = learnerAns?.[`wa_${wa.id}_task`] || '';
// //                                                             const waDate = learnerAns?.[`wa_${wa.id}_date`] || new Date().toISOString().split('T')[0];
// //                                                             const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
// //                                                             return (
// //                                                                 <div key={wa.id} className="ap-workplace__activity">
// //                                                                     <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>
// //                                                                     <div className="ap-workplace__fields">
// //                                                                         <div className="ap-workplace__field">
// //                                                                             <label className="ap-workplace__field-label">Task Performed</label>
// //                                                                             {isLocked && !isAwaitingSignoff ? (
// //                                                                                 // FIXED HTML PARSING FOR WORKPLACE TASK
// //                                                                                 <div className="quill-read-only-content" style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(waTask) || '<em>No task description provided.</em>' }} />
// //                                                                             ) : (
// //                                                                                 <input type="text" className="ap-workplace__input" value={waTask} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_task`, e.target.value)} disabled={!canEditWorkplace} placeholder="What did you do?" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />
// //                                                                             )}
// //                                                                         </div>
// //                                                                         <div className="ap-workplace__field ap-workplace__field--date"><label className="ap-workplace__field-label">Date</label><input type="date" className="ap-workplace__input" value={waDate} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_date`, e.target.value)} disabled={!canEditWorkplace} /></div>
// //                                                                     </div>
// //                                                                     {(wa.evidenceItems || []).length > 0 && (
// //                                                                         <div className="ap-workplace__se-block">
// //                                                                             <span className="ap-workplace__se-title">Supporting Evidence Required:</span>
// //                                                                             {wa.evidenceItems.map((se: any) => {
// //                                                                                 const seKey = `se_${se.id}`;
// //                                                                                 const seData = learnerAns?.[seKey] || {};
// //                                                                                 const seTabs = [{ id: 'upload', icon: <UploadCloud size={13} />, label: 'Document', val: seData.uploadUrl }, { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', val: seData.url }, { id: 'text', icon: <FileText size={13} />, label: 'Reflection', val: seData.text }];
// //                                                                                 const activeSeTab = activeTabs[`${block.id}_${se.id}`] || seTabs[0].id;
// //                                                                                 const progress = uploadProgress[`${block.id}_${seKey}`];
// //                                                                                 return (
// //                                                                                     <div key={se.id} className="ap-workplace__se-item">
// //                                                                                         <strong className="ap-workplace__se-item__code">{se.code}: {se.description}</strong>
// //                                                                                         <div className="ap-workplace__se-tabs">
// //                                                                                             <div className="ap-workplace__se-tab-bar no-print">{seTabs.map(t => <button key={t.id} className={`ap-workplace__se-tab${activeSeTab === t.id ? ' ap-workplace__se-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [`${block.id}_${se.id}`]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}</button>)}</div>
// //                                                                                             <div className="ap-workplace__se-tab-panel">
// //                                                                                                 {activeSeTab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : seData.uploadUrl ? <FilePreview url={seData.uploadUrl} onRemove={canEditWorkplace ? () => handleNestedAnswerChange(block.id, seKey, 'uploadUrl', '') : undefined} disabled={!canEditWorkplace} /> : <input type="file" disabled={!canEditWorkplace} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, seKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
// //                                                                                                 {activeSeTab === 'url' && <div>{canEditWorkplace && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{seData.url && !canEditWorkplace ? <UrlPreview url={seData.url} /> : <input type="url" className="ab-input" value={seData.url || ''} onChange={e => handleNestedAnswerChange(block.id, seKey, 'url', e.target.value)} disabled={!canEditWorkplace} placeholder="https://…" />}</div>}
// //                                                                                                 {activeSeTab === 'text' && (
// //                                                                                                     <div className={`ap-quill-wrapper${!canEditWorkplace ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// //                                                                                                         {isLocked && !isAwaitingSignoff ? (
// //                                                                                                             // FIXED HTML PARSING FOR WORKPLACE EVIDENCE
// //                                                                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(seData.text) || '<em>No notes provided.</em>' }} />
// //                                                                                                         ) : (
// //                                                                                                             <ReactQuill theme="snow" value={seData.text || ''} onChange={c => handleNestedAnswerChange(block.id, seKey, 'text', c)} readOnly={!canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" />
// //                                                                                                         )}
// //                                                                                                     </div>
// //                                                                                                 )}
// //                                                                                             </div>
// //                                                                                         </div>
// //                                                                                     </div>
// //                                                                                 );
// //                                                                             })}
// //                                                                         </div>
// //                                                                     )}
// //                                                                     <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
// //                                                                         <input type="checkbox" disabled={!canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
// //                                                                         <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
// //                                                                     </label>
// //                                                                 </div>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* Per-question feedback */}
// //                                                 {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
// //                                                 {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
// //                                                 {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
// //                                             </div>
// //                                         </div>
// //                                     );
// //                                 }
// //                                 return null;
// //                             })}
// //                         </div>

// //                         {/* PRINT-ONLY: OVERALL FEEDBACK + APPEAL RECORD */}
// //                         {isLocked && !isAwaitingSignoff && (
// //                             <div className="print-page print-page--feedback print-only">
// //                                 <h2 className="print-section-heading">Overall Assessment Feedback</h2>

// //                                 {submission.grading?.facilitatorOverallFeedback && (
// //                                     <div className="print-fb print-fb--fac">
// //                                         <h4 className="print-fb__title print-fb__title--fac">
// //                                             {submission.grading?.facilitatorRole === 'mentor' ? 'Mentor / Supervisor Comments' : 'Facilitator Remarks'}
// //                                         </h4>
// //                                         <p className="print-fb__body print-fb__body--fac">{submission.grading.facilitatorOverallFeedback}</p>
// //                                     </div>
// //                                 )}

// //                                 {(submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
// //                                     <div className="print-fb print-fb--ass">
// //                                         <h4 className="print-fb__title print-fb__title--ass">Assessor Grading Remarks</h4>
// //                                         <p className="print-fb__body print-fb__body--ass">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p>
// //                                     </div>
// //                                 )}

// //                                 {submission.moderation?.feedback && (
// //                                     <div className="print-fb print-fb--mod">
// //                                         <h4 className="print-fb__title print-fb__title--mod">Moderator QA Notes</h4>
// //                                         <p className="print-fb__body print-fb__body--mod">{submission.moderation.feedback}</p>
// //                                     </div>
// //                                 )}

// //                                 {submission?.appeal?.status && (
// //                                     <div className={`print-fb print-fb--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                                         <h4 className={`print-fb__title print-fb__title--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                                             Formal Appeal Record — {submission.appeal.status === 'upheld' ? 'Appeal Granted' : submission.appeal.status === 'pending' ? 'Appeal Pending' : 'Appeal Rejected'}
// //                                         </h4>
// //                                         <p className="print-fb__appeal-reason"><strong>Learner's Reason:</strong> "{submission.appeal.reason}"</p>
// //                                         {submission.appeal.status !== 'pending' && (
// //                                             <p className={`print-fb__body print-fb__body--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                                                 <strong>Board Resolution:</strong> "{submission.appeal.resolutionNotes}"
// //                                             </p>
// //                                         )}
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         )}

// //                         {/* PRINT-ONLY + SCREEN: SIGNATURE BLOCK */}
// //                         {isLocked && !isAwaitingSignoff && (
// //                             <div className="print-page print-page--signatures print-only">
// //                                 <h2 className="print-section-heading">Official Signatures &amp; Declarations</h2>
// //                                 <div className="sr-signature-block print-sig-row">

// //                                     <div className="sr-sig-box sr-sig-box--learner">
// //                                         <span className="sr-sig-box__label sr-sig-box__label--learner">Learner Declaration</span>
// //                                         {isSubmitted ? (
// //                                             <>
// //                                                 {submission.learnerDeclaration?.signatureUrl
// //                                                     ? <img src={submission.learnerDeclaration.signatureUrl} alt="Learner signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
// //                                                     : <div className="sr-sig-no-image">Digitally Authenticated<br />(ECTA Compliant)</div>}
// //                                                 <strong className="sr-sig-box__name sr-sig-box__name--learner">{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '—'}</strong>
// //                                                 <em className="sr-sig-box__meta sr-sig-box__meta--learner">Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString('en-ZA')}</em>
// //                                                 <div className="sr-sig-line sr-sig-line--learner">Digital Timestamp Authenticated</div>
// //                                             </>
// //                                         ) : (
// //                                             <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--learner">Awaiting Submission</div></div>
// //                                         )}
// //                                     </div>

// //                                     <div className="sr-sig-box sr-sig-box--fac">
// //                                         <span className="sr-sig-box__label sr-sig-box__label--fac">
// //                                             {submission.grading?.facilitatorRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Marking'}
// //                                         </span>
// //                                         {isFacDone && submission.grading?.facilitatorReviewedAt ? (
// //                                             <>
// //                                                 {submission.grading?.facilitatorSignatureUrl
// //                                                     ? <img src={submission.grading.facilitatorSignatureUrl} alt="Facilitator Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
// //                                                     : <div className="sr-sig-no-image">System Authenticated</div>}
// //                                                 <strong className="sr-sig-box__name sr-sig-box__name--fac">{submission.grading?.facilitatorName || 'Facilitator'}</strong>
// //                                                 <em className="sr-sig-box__meta sr-sig-box__meta--fac">Signed: {new Date(submission.grading.facilitatorReviewedAt).toLocaleDateString('en-ZA')}</em>
// //                                                 <div className="sr-sig-line sr-sig-line--fac">
// //                                                     {submission.grading?.facilitatorRole === 'mentor' ? 'Workplace Verification Confirmed' : 'Pre-Marking Completed'}
// //                                                 </div>
// //                                             </>
// //                                         ) : (
// //                                             <div className="sr-sig-pending"><span className="sr-sig-pending__text">Digitally Authenticated</span><div className="sr-sig-line sr-sig-line--fac">Verification</div></div>
// //                                         )}
// //                                     </div>

// //                                     <div className="sr-sig-box sr-sig-box--ass">
// //                                         <span className="sr-sig-box__label sr-sig-box__label--ass">Assessor Sign-off</span>
// //                                         {isAssDone && submission.grading?.gradedAt ? (
// //                                             <>
// //                                                 {submission.grading?.assessorSignatureUrl
// //                                                     ? <img src={submission.grading.assessorSignatureUrl} alt="Assessor Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
// //                                                     : <div className="sr-sig-no-image">No Canvas Signature</div>}
// //                                                 <strong className="sr-sig-box__name sr-sig-box__name--ass">{submission.grading?.assessorName || '—'}</strong>
// //                                                 <em className="sr-sig-box__meta sr-sig-box__meta--ass">Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
// //                                                 <em className="sr-sig-box__meta sr-sig-box__meta--ass">Signed: {new Date(submission.grading.gradedAt).toLocaleDateString('en-ZA')}</em>
// //                                                 <div className="sr-sig-line sr-sig-line--ass">Digital Signature Confirmed</div>
// //                                             </>
// //                                         ) : (
// //                                             <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--ass">Awaiting Assessment</div></div>
// //                                         )}
// //                                     </div>

// //                                     <div className="sr-sig-box sr-sig-box--mod">
// //                                         <span className="sr-sig-box__label sr-sig-box__label--mod">Internal Moderation</span>
// //                                         {isModDone && submission.moderation?.moderatedAt ? (
// //                                             <>
// //                                                 {submission.moderation?.moderatorSignatureUrl
// //                                                     ? <img src={submission.moderation.moderatorSignatureUrl} alt="Moderator Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
// //                                                     : moderatorProfile?.signatureUrl
// //                                                         ? <img src={moderatorProfile.signatureUrl} alt="Moderator fallback" />
// //                                                         : <div className="sr-sig-no-image">No Canvas Signature</div>}
// //                                                 <strong className="sr-sig-box__name sr-sig-box__name--mod">{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</strong>
// //                                                 <em className="sr-sig-box__meta sr-sig-box__meta--mod">Outcome: {submission.moderation?.outcome}</em>
// //                                                 <em className="sr-sig-box__meta sr-sig-box__meta--mod">Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString('en-ZA')}</em>
// //                                                 <div className="sr-sig-line sr-sig-line--mod">QA Sign-off Confirmed</div>
// //                                             </>
// //                                         ) : (
// //                                             <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--mod">Awaiting Moderation</div></div>
// //                                         )}
// //                                     </div>

// //                                     {submission?.appeal?.status && submission.appeal.status !== 'pending' && (
// //                                         <div className={`sr-sig-box sr-sig-box--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                                             <span className={`sr-sig-box__label sr-sig-box__label--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                                                 Appeal Resolution
// //                                             </span>
// //                                             {submission.appeal?.resolvedBySignatureUrl ? (
// //                                                 <img src={submission.appeal.resolvedBySignatureUrl} alt="Board Signature" style={{ height: '38px', objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: '6px' }} />
// //                                             ) : <div className="sr-sig-no-image">Resolved Digitally</div>}
// //                                             <strong className={`sr-sig-box__name sr-sig-box__name--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                                                 {submission.appeal?.resolvedByName || 'Academic Board'}
// //                                             </strong>
// //                                             <em className={`sr-sig-box__meta sr-sig-box__meta--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                                                 Resolved: {submission.appeal?.resolvedAt ? new Date(submission.appeal.resolvedAt).toLocaleDateString('en-ZA') : 'N/A'}
// //                                             </em>
// //                                             <div className={`sr-sig-line sr-sig-line--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                                                 Board Decision Finalised
// //                                             </div>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             </div>
// //                         )}

// //                         {/* ── FOOTER ── */}
// //                         {isAwaitingSignoff ? (
// //                             <div className="ap-footer ap-footer--signoff no-print">
// //                                 <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
// //                                 <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
// //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// //                                     <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
// //                                 </label>
// //                                 <div className="ap-footer-actions">
// //                                     <span className="ap-autosave-label">{saving && <><div className="ap-spinner ap-spinner--sm" /> Saving…</>}{Object.keys(uploadProgress).length > 0 && <span className="ap-uploads-label ap-uploads-label--amber">Uploads in progress…</span>}</span>
// //                                     <button className="ap-btn ap-btn--amber" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}><Save size={14} /> Acknowledge & Submit for Grading</button>
// //                                 </div>
// //                             </div>
// //                         ) : !isLocked ? (
// //                             <div className="ap-footer no-print">
// //                                 <h3 className="ap-footer__title">Final Submission</h3>
// //                                 <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
// //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// //                                     <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
// //                                 </label>
// //                                 <div className="ap-footer-actions">
// //                                     <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}{Object.keys(uploadProgress).length > 0 && <span className="ap-uploads-label">Uploads in progress…</span>}</span>
// //                                     <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}><Save size={14} /> Submit for Grading</button>
// //                                 </div>
// //                             </div>
// //                         ) : (
// //                             <div className="ap-footer ap-footer--locked no-print">
// //                                 <div className="ap-footer--locked__icon-wrap">
// //                                     {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
// //                                 </div>
// //                                 {isModDone && outcome?.isCompetent === false ? (
// //                                     <>
// //                                         <h3 className="ap-footer--locked__title ap-footer--locked__title--amber">Assessment Outcome: Not Yet Competent (NYC)</h3>
// //                                         <div className="ap-remediation-box">
// //                                             <p>Your assessment has been fully verified. At this stage, you have not yet met all the requirements for competency.</p>
// //                                             {(submission.attemptNumber || 1) >= 3 ? (
// //                                                 <div className="ap-remediation-box__lockout">
// //                                                     <h4 className="ap-remediation-box__lockout-title"><ShieldAlert size={15} /> Maximum Attempts Reached</h4>
// //                                                     <p>You have exhausted all 3 permitted attempts. Under QCTO regulations, this workbook is permanently locked. You must re-enrol in the module or lodge a formal appeal.</p>
// //                                                 </div>
// //                                             ) : (
// //                                                 <><h4 className="ap-remediation-box__steps-title">What happens next?</h4><ol className="ap-remediation-box__steps"><li><strong>Review Feedback:</strong> Scroll up and review the Assessor's feedback on your incorrect answers.</li><li><strong>Coaching:</strong> Your facilitator will schedule a brief intervention to discuss the feedback.</li><li><strong>Remediation:</strong> Your facilitator will unlock this workbook for Attempt {submission.attemptNumber ? submission.attemptNumber + 1 : 2} of 3.</li></ol></>
// //                                             )}
// //                                             <div className="ap-remediation-box__appeal-section">
// //                                                 <p className="ap-remediation-box__appeal">
// //                                                     <strong>Academic Rights:</strong> If you disagree with this outcome, you have the right to lodge a formal appeal.
// //                                                 </p>
// //                                                 {submission.appeal?.status === 'pending' ? (
// //                                                     <div className="ap-appeal-status ap-appeal-status--pending"><Clock size={15} /> <span><strong>Appeal Pending:</strong> Your formal appeal is currently under investigation by the Academic Board.</span></div>
// //                                                 ) : submission.appeal?.status === 'rejected' ? (
// //                                                     <div className="ap-appeal-status ap-appeal-status--rejected"><X size={15} /> <span><strong>Appeal Concluded:</strong> Your appeal was reviewed and the original outcome was upheld.</span></div>
// //                                                 ) : (
// //                                                     <button className="ap-btn ap-btn--outline ap-btn--outline-danger" onClick={() => setShowAppealModal(true)}><AlertTriangle size={14} /> Lodge Formal Appeal</button>
// //                                                 )}
// //                                             </div>
// //                                         </div>
// //                                     </>
// //                                 ) : isModDone && outcome?.isCompetent === true ? (
// //                                     <>
// //                                         <h3 className="ap-footer--locked__title" style={{ color: 'var(--mlab-green)' }}>Congratulations! You are Competent.</h3>
// //                                         <p className="ap-footer--locked__desc">Your final score is <strong>{grandTotalPct}% ({grandTotalAwarded}/{grandTotalMax} marks)</strong>. This result has been fully verified and endorsed by the internal moderator.</p>
// //                                     </>
// //                                 ) : isAssDone && outcome?.isCompetent === true ? (
// //                                     <>
// //                                         <h3 className="ap-footer--locked__title" style={{ color: 'var(--mlab-blue)' }}>Assessor Grading Complete</h3>
// //                                         <p className="ap-footer--locked__desc">Your provisional score is <strong>{grandTotalPct}% ({grandTotalAwarded}/{grandTotalMax} marks)</strong>. Awaiting final moderator QA.</p>
// //                                     </>
// //                                 ) : (
// //                                     <>
// //                                         <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
// //                                         <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. {isAssDone ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}</p>
// //                                         {!isWorkplaceModule && isFacDone && !isAssDone && (
// //                                             <p style={{ marginTop: '8px', color: 'var(--mlab-blue)', fontWeight: 'bold' }}>Provisional Score: {grandTotalPct}% ({grandTotalAwarded}/{grandTotalMax} marks)</p>
// //                                         )}
// //                                     </>
// //                                 )}
// //                                 <button className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={() => safeNavigateBack()}><ArrowLeft size={14} /> Return to Portfolio</button>
// //                             </div>
// //                         )}
// //                     </div>

// //                     {/* ── RIGHT AUDIT SIDEBAR ── */}
// //                     {isLocked && !isAwaitingSignoff && (
// //                         <aside className="ap-right-sidebar no-print">
// //                             <h3 className="ap-right-sidebar__title"><ShieldCheck size={15} color="var(--mlab-blue)" /> Official Audit Trail</h3>

// //                             <div className="ap-audit-card">
// //                                 <span className="ap-audit-card__label">Learner Declaration</span>
// //                                 <div className="ap-audit-card__sig-wrap">
// //                                     {submission.learnerDeclaration?.signatureUrl
// //                                         ? <img src={submission.learnerDeclaration.signatureUrl} alt="Learner signature" />
// //                                         : learnerProfile?.signatureUrl
// //                                             ? <img src={learnerProfile.signatureUrl} alt="Learner signature fallback" />
// //                                             : <span className="ap-audit-card__sig-placeholder">Digitally Authenticated<br />(ECTA Compliant)</span>}
// //                                 </div>
// //                                 <span className="ap-audit-card__name">{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}</span>
// //                                 <span className="ap-audit-card__sub"><Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}</span>
// //                             </div>

// //                             {submission?.appeal?.status && submission?.appeal?.status !== 'pending' && (
// //                                 <div className="ap-audit-card" style={{ borderTopColor: submission.appeal.status === 'upheld' ? '#22c55e' : '#ef4444' }}>
// //                                     <span className="ap-audit-card__label" style={{ color: submission.appeal.status === 'upheld' ? '#166534' : '#991b1b', display: 'flex', alignItems: 'center', gap: '4px' }}><Scale size={12} /> Appeal Resolution</span>
// //                                     <span className="ap-audit-card__name" style={{ color: submission.appeal.status === 'upheld' ? '#22c55e' : '#ef4444' }}>{submission.appeal.status === 'upheld' ? 'Appeal Granted' : 'Appeal Rejected'}</span>
// //                                     <span className="ap-audit-card__reg" style={{ color: '#64748b' }}>{submission.appeal?.resolvedByName || 'Academic Board'}</span>
// //                                     <span className="ap-audit-card__sub" style={{ color: '#64748b' }}><Clock size={11} /> {submission.appeal?.resolvedAt ? moment(submission.appeal.resolvedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
// //                                 </div>
// //                             )}

// //                             {outcome ? (
// //                                 <div className="ap-audit-outcome" style={{ borderLeftColor: outcome.color }}>
// //                                     <div className="ap-audit-outcome__label" style={{ color: outcome.color }}>{outcome.label}</div>
// //                                     {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Score: {outcome.score} / {assessment.totalMarks} ({outcome.percentage}%)</div>}
// //                                     {isWorkplaceModule && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Grading: Competency-Based</div>}
// //                                     <div className="ap-audit-outcome__note">{outcome.subtext}</div>
// //                                 </div>
// //                             ) : (
// //                                 <div className="ap-audit-card" style={{ textAlign: 'center', padding: '1.5rem', background: '#f8fafc', border: '1px dashed var(--mlab-border)' }}>
// //                                     <Clock size={24} color="#94a3b8" style={{ margin: '0 auto 0.5rem' }} />
// //                                     <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', fontWeight: 700 }}>Pending Outcome</span>
// //                                     <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Your workbook is currently being evaluated.</span>
// //                                 </div>
// //                             )}

// //                             {isFacDone && (
// //                                 <div className="ap-audit-card" style={{ borderTopColor: '#3b82f6' }}>
// //                                     <span className="ap-audit-card__label" style={{ color: '#3b82f6' }}>{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</span>
// //                                     <span className="ap-audit-card__name" style={{ color: '#3b82f6' }}>{submission.grading?.facilitatorName || 'Facilitator'}</span>
// //                                     <div className="ap-audit-card__sig-wrap">
// //                                         {submission.grading?.facilitatorSignatureUrl
// //                                             ? <img src={submission.grading.facilitatorSignatureUrl} alt="Facilitator Signature" />
// //                                             : facilitatorProfile?.signatureUrl
// //                                                 ? <img src={facilitatorProfile.signatureUrl} alt="Facilitator fallback" />
// //                                                 : <span className="ap-audit-card__sig-placeholder" style={{ color: '#3b82f6' }}>System Authenticated</span>}
// //                                     </div>
// //                                     <span className="ap-audit-card__sub" style={{ color: '#3b82f6' }}><Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
// //                                 </div>
// //                             )}
// //                             {isAssDone && (
// //                                 <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-red)' }}>
// //                                     <span className="ap-audit-card__label" style={{ color: 'var(--mlab-red)' }}>{isWorkplaceModule ? 'Assessor Evaluation' : 'Assessor Verification'}</span>
// //                                     <div className="ap-audit-card__sig-wrap">
// //                                         {submission.grading?.assessorSignatureUrl
// //                                             ? <img src={submission.grading.assessorSignatureUrl} alt="Assessor Signature" />
// //                                             : assessorProfile?.signatureUrl
// //                                                 ? <img src={assessorProfile.signatureUrl} alt="Assessor fallback" />
// //                                                 : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-red)' }}>Awaiting Signature</span>}
// //                                     </div>
// //                                     <span className="ap-audit-card__name" style={{ color: 'var(--mlab-red)' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</span>
// //                                     <span className="ap-audit-card__reg" style={{ color: 'var(--mlab-red)' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</span>
// //                                     <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-red)' }}><Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
// //                                 </div>
// //                             )}
// //                             {isModDone && (
// //                                 <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-green)' }}>
// //                                     <span className="ap-audit-card__label" style={{ color: 'var(--mlab-green)' }}>Internal Moderation QA</span>
// //                                     <div className="ap-audit-card__sig-wrap">
// //                                         {submission.moderation?.moderatorSignatureUrl
// //                                             ? <img src={submission.moderation.moderatorSignatureUrl} alt="Moderator Signature" />
// //                                             : moderatorProfile?.signatureUrl
// //                                                 ? <img src={moderatorProfile.signatureUrl} alt="Moderator fallback" />
// //                                                 : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-green)' }}>Awaiting Signature</span>}
// //                                     </div>
// //                                     <span className="ap-audit-card__name" style={{ color: 'var(--mlab-green)' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</span>
// //                                     <span className="ap-audit-card__reg" style={{ color: submission.moderation?.outcome === 'Returned' ? 'var(--mlab-red)' : 'var(--mlab-green)' }}>Outcome: {submission.moderation?.outcome === 'Endorsed' ? 'Endorsed ✓' : submission.moderation?.outcome === 'Returned' ? 'Returned ✗' : submission.moderation?.outcome}</span>
// //                                     <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-green)' }}><Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
// //                                 </div>
// //                             )}
// //                         </aside>
// //                     )}
// //                 </div>
// //             </div>
// //         </ProctoringWrapper>
// //     );
// // };

// // export default AssessmentPlayer;

