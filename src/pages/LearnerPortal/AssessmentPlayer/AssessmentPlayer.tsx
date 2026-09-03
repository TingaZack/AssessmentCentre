// src/pages/LearnerDashboard/AssessmentPlayer/AssessmentPlayer.tsx

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, uploadString } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { db, auth } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../components/common/Toast/Toast';
import './AssessmentPlayer.css';
import moment from 'moment';

import { AssessmentGate } from './AssessmentGate';
import { AssessmentLockedScreen } from './AssessmentLockedScreen';
import AssessmentPlayerContent from './AssessmentPlayerContent';
import { SurveyEnginePlayer } from '../../../components/common/SurveyEnginePlayer/SurveyEnginePlayer';
import { ArrowLeft, Info, ShieldAlert, Zap } from 'lucide-react';

const LoadingScreen: React.FC = () => (
    <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
        <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
    </div>
);

export const AssessmentPlayer: React.FC = () => {
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

    // SURVEY PLAYER TRIGGER & STATUS STATES
    const [showSurveyModal, setShowSurveyModal] = useState(false);
    const [isSurveyCompleted, setIsSurveyCompleted] = useState<boolean | null>(null);

    const [moduleLogs, setModuleLogs] = useState<any[]>([]);
    const [passedFormative, setPassedFormative] = useState(false);
    const [approvedLogs, setApprovedLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState<boolean>(false);

    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [timeOffset, setTimeOffset] = useState<number>(0);
    const [timeToStart, setTimeToStart] = useState<number | null>(null);

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const answersRef = useRef(answers);
    useEffect(() => { answersRef.current = answers; }, [answers]);

    const currentStatus = String(submission?.status || '').toLowerCase();
    const isMissed = currentStatus === 'missed';
    const isViolation = currentStatus === 'violation' || currentStatus === 'terminated';

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

    const isGloballyLocked = isSubmitted || isAwaitingSignoff || isMissed || isViolation;
    const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

    const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
        ? assessment.requiresInvigilation
        : !isPracticalModule;

    const willBeProctored = isInvigilationEnabled && !isGloballyLocked;

    const isSummative = submission?.type?.toLowerCase().includes('summative') || false;
    const hasOverride = submission?.facilitatorOverride === true;

    const pendingTopics = useMemo(() => {
        if (!submission || !moduleLogs) return [];
        return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
    }, [moduleLogs, submission]);

    const isFullyCompliant = pendingTopics.length === 0;

    const isBlockVerified = (blockId: string) => {
        const facGrade = submission?.grading?.facilitatorBreakdown?.[blockId];
        return facGrade?.isCorrect === true || facGrade?.obsDeclaration === true;
    };

    const getSecureNow = useCallback(() => Date.now() + timeOffset, [timeOffset]);

    const getAssessmentEndMs = useCallback(() => {
        if (!assessment) return null;
        const baseLimit = assessment.moduleInfo?.timeLimit || assessment.timeLimit || 0;
        if (baseLimit <= 0) return null;

        const extraTime = submission?.extraTimeGranted || 0;

        if (assessment.isScheduled && assessment.scheduledDate && !submission?.overrideUnlock) {
            return moment(assessment.scheduledDate).valueOf() + ((baseLimit + extraTime) * 60 * 1000);
        }

        if (submission?.startedAt) {
            const startMs = new Date(submission.startedAt).getTime();
            return startMs + ((baseLimit + extraTime) * 60 * 1000);
        }

        return null;
    }, [assessment, submission]);

    // 🚀 LEGACY-SAFE SURVEY COMPLETION CHECK
    useEffect(() => {
        const checkSurveyStatus = async () => {
            // Graceful exit for legacy assessments without linked survey
            if (!assessment?.surveyId) {
                setIsSurveyCompleted(null);
                return;
            }

            const currentUid = auth.currentUser?.uid || user?.uid;
            if (!currentUid) {
                setIsSurveyCompleted(false);
                return;
            }

            try {
                const q = query(
                    collection(db, 'survey_responses'),
                    where('surveyId', '==', assessment.surveyId),
                    where('learnerId', '==', currentUid)
                );
                const snap = await getDocs(q);
                setIsSurveyCompleted(!snap.empty);
            } catch (err: any) {
                console.warn("Survey status check bypassed for legacy compatibility:", err.message);
                setIsSurveyCompleted(false);
            }
        };

        checkSurveyStatus();
    }, [assessment?.surveyId, user?.uid]);

    useEffect(() => {
        const fetchOffset = async () => {
            try {
                const res = await fetch(`https://timeapi.io/api/Time/current/zone?timeZone=UTC&nocache=${Date.now()}`, {
                    cache: 'no-store',
                    headers: {
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache'
                    }
                });

                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const data = await res.json();

                const secureUTCTime = new Date(data.dateTime + 'Z').getTime();
                const localTime = Date.now();
                const calculatedOffset = secureUTCTime - localTime;

                if (Math.abs(calculatedOffset) > 5 * 60 * 1000) {
                    setTimeOffset(0);
                } else {
                    setTimeOffset(calculatedOffset);
                }
            } catch (err) {
                setTimeOffset(0);
            }
        };

        fetchOffset();
    }, []);

    useEffect(() => {
        if (employers.length === 0) fetchEmployers();
        if (staff.length === 0) fetchStaff();

        const load = async () => {
            const currentUid = auth.currentUser?.uid || user?.uid;
            if (!currentUid || !assessmentId) return;

            if (user?.role && user.role !== 'learner') {
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
                const userDocSnap = await getDoc(doc(db, 'users', currentUid));
                if (userDocSnap.exists()) {
                    userProfile = { id: userDocSnap.id, ...userDocSnap.data() };
                }
                setLearnerProfile(userProfile);

                let targetLearnerId = currentUid;
                let learnerCohortId: string | null = null;
                let validEnrollmentId: string | null = null;

                if (user?.role === 'learner') {
                    try {
                        const enrolQ = query(
                            collection(db, 'enrollments'),
                            where('authUid', '==', currentUid),
                            where('status', '==', 'active')
                        );
                        const enrolSnap = await getDocs(enrolQ);
                        if (!enrolSnap.empty) {
                            const enrolData = enrolSnap.docs[0].data();
                            validEnrollmentId = enrolSnap.docs[0].id;
                            targetLearnerId = enrolData.learnerId || enrolData.id || currentUid;
                            learnerCohortId = enrolData.cohortId;
                        }
                    } catch (e) {
                        console.warn("Enrollment lookup failed:", e);
                    }
                }

                // LEGACY SUBMISSION LOOKUP FALLBACKS
                let activeSub: any = null;
                try {
                    const subQuery1 = query(
                        collection(db, 'learner_submissions'),
                        where('assessmentId', '==', assessmentId),
                        where('authUid', '==', currentUid)
                    );
                    const subSnap1 = await getDocs(subQuery1);
                    if (!subSnap1.empty) {
                        activeSub = subSnap1.docs
                            .map(d => ({ id: d.id, ...d.data() }))
                            .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
                    } else {
                        // Fallback for legacy records missing authUid in submission schema
                        const subQueryLegacy = query(
                            collection(db, 'learner_submissions'),
                            where('assessmentId', '==', assessmentId),
                            where('learnerId', '==', targetLearnerId)
                        );
                        const subSnapLegacy = await getDocs(subQueryLegacy);
                        if (!subSnapLegacy.empty) {
                            activeSub = subSnapLegacy.docs
                                .map(d => ({ id: d.id, ...d.data() }))
                                .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
                        }
                    }
                } catch (qErr) {
                    console.warn("Primary submission query failed:", qErr);
                }

                if (!activeSub && user?.role === 'learner') {
                    const fallbackCohortId = learnerCohortId || assData.cohortId || (assData.cohortIds && assData.cohortIds[0]) || 'unassigned';
                    const isLive = ['active', 'scheduled', 'upcoming', 'published'].includes(assData.status);
                    if (isLive) {
                        const sid = `${fallbackCohortId}_${targetLearnerId}_${assessmentId}`;
                        const newSub = {
                            learnerId: targetLearnerId,
                            enrollmentId: validEnrollmentId || "",
                            authUid: currentUid,
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
                            timeLimit: assData.moduleInfo?.timeLimit || assData.timeLimit || 0,
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
                    answersRef.current = activeSub.answers || {};
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

    // REAL-TIME SUBMISSION LISTENER
    useEffect(() => {
        const currentUid = auth.currentUser?.uid || user?.uid;
        if (!currentUid || !assessmentId) return;

        const q = query(
            collection(db, 'learner_submissions'),
            where('assessmentId', '==', assessmentId),
            where('authUid', '==', currentUid)
        );

        const unsub = onSnapshot(q, (snap) => {
            if (!snap.empty) {
                const activeSub: any = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

                setSubmission((prev: any) => {
                    if (!prev || JSON.stringify(prev) !== JSON.stringify(activeSub)) {
                        return activeSub;
                    }
                    return prev;
                });
            }
        }, (err) => {
            console.warn("Real-time submission listener handled error:", err.message);
        });

        return () => unsub();
    }, [user?.uid, assessmentId]);

    // SUMMATIVE COMPLIANCE & FORMATIVE CHECK LISTENER
    useEffect(() => {
        const currentUid = auth.currentUser?.uid || user?.uid;
        if (!submission || !currentUid || !submission.cohortId || !submission.moduleNumber) return;

        const _isSummative = submission.type?.toLowerCase().includes('summative');
        if (_isSummative) {
            const logsQ = query(
                collection(db, 'curriculum_logs'),
                where('cohortId', '==', submission.cohortId),
                where('moduleCode', '==', submission.moduleNumber)
            );

            const unsubLogs = onSnapshot(logsQ, (snap) => {
                setModuleLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }, (err) => {
                console.warn("Curriculum logs snapshot handled error:", err.message);
            });

            const formQ = query(
                collection(db, 'learner_submissions'),
                where('authUid', '==', currentUid),
                where('moduleNumber', '==', submission.moduleNumber),
                where('status', '==', 'moderated'),
                where('competency', '==', 'C')
            );

            const unsubForm = onSnapshot(formQ, (snap) => {
                setPassedFormative(!snap.empty);
            }, (err) => {
                console.warn("Formative status check handled error:", err.message);
            });

            return () => { unsubLogs(); unsubForm(); };
        }
    }, [submission?.id, user?.uid, submission?.type, submission?.cohortId, submission?.moduleNumber]);

    useEffect(() => {
        if (assessment?.scheduledDate && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed && !isViolation) {
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
    }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, isViolation, getSecureNow]);

    const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed && !isViolation;

    useEffect(() => {
        if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock && !isViolation) {
            const interval = setInterval(() => {
                const endMs = getAssessmentEndMs();
                if (endMs && getSecureNow() >= endMs) {
                    updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: 'missed',
                        systemNote: `Auto-swept by frontend player: Learner failed to start within the allotted timeframe.`
                    }).catch(() => { });
                    setSubmission((prev: any) => ({ ...prev, status: 'missed' }));
                    clearInterval(interval);
                }
            }, 10000);
            return () => clearInterval(interval);
        }
    }, [isNotStarted, assessment, submission, isViolation, getAssessmentEndMs, getSecureNow]);

    useEffect(() => {
        if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed || isViolation || currentStatus !== 'in_progress') return;

        const updateTimer = () => {
            const now = getSecureNow();
            const endMs = getAssessmentEndMs();
            if (endMs) {
                const calculatedLeft = Math.max(0, Math.floor((endMs - now) / 1000));
                setTimeLeft(calculatedLeft);

                if (calculatedLeft <= 0) {
                    console.warn("⏰ Assessment time expired. Executing auto-submit...");
                    toast.error("Time is up! Auto-submitting.");
                    setAnswers(latestAnswers => {
                        if (submission?.id) {
                            forceAutoSubmit(submission.id, latestAnswers);
                        }
                        return latestAnswers;
                    });
                }
            }
        };

        updateTimer();
        const id = setInterval(updateTimer, 1000);
        return () => clearInterval(id);
    }, [isGloballyLocked, showGate, isPracticalModule, isMissed, isViolation, currentStatus, assessment, submission, getAssessmentEndMs, getSecureNow]);

    useEffect(() => {
        const fetchApprovedLogs = async () => {
            const currentUid = auth.currentUser?.uid || user?.uid;
            if (!currentUid || assessment?.moduleType !== 'workplace' || !assessment?.id) {
                setLogsLoading(false);
                return;
            }
            try {
                setLogsLoading(true);
                const logsRef = collection(db, 'workplace_logs');
                const q = query(
                    logsRef,
                    where('learnerId', '==', currentUid),
                    where('moduleId', '==', assessment.id),
                    where('status', '==', 'Approved')
                );
                const snapshot = await getDocs(q);
                const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setApprovedLogs(fetchedLogs);
            } catch (error: any) {
                console.warn('Error fetching approved workplace logs:', error.message);
            } finally {
                setLogsLoading(false);
            }
        };
        fetchApprovedLogs();
    }, [user?.uid, assessment?.id, assessment?.moduleType]);

    // LEGACY & MULTI-TIER GRADING RESOLVER
    const getBlockGrading = (blockId: string) => {
        const g = submission?.grading || {};
        const m = submission?.moderation || {};
        const mLayer = m.breakdown?.[blockId] || {};
        const aLayer = g.assessorBreakdown?.[blockId] || {};
        const fLayer = g.facilitatorBreakdown?.[blockId] || {};
        const legacyLayer = g.breakdown?.[blockId] || {}; // Legacy flat breakdown

        let activeLayer = fLayer || legacyLayer || {};
        if (isAssDone || g.assessorBreakdown?.[blockId]) activeLayer = aLayer;
        if (isModDone || m.breakdown?.[blockId]) activeLayer = mLayer;

        return {
            score: activeLayer?.score !== undefined ? activeLayer.score : legacyLayer?.score,
            isCorrect: activeLayer?.isCorrect !== undefined ? activeLayer.isCorrect : legacyLayer?.isCorrect,
            facIsCorrect: fLayer?.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer?.isCorrect,
            assIsCorrect: aLayer?.isCorrect,
            modIsCorrect: mLayer?.isCorrect,
            feedback: activeLayer?.feedback || legacyLayer?.feedback || '',
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
        if (!isWorkplaceModule && !isCompetent && grandTotalAwarded !== undefined && (assessment?.totalMarks || grandTotalMax))
            isCompetent = grandTotalAwarded >= (assessment?.totalMarks || grandTotalMax) * 0.6;
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

    const handleStartAssessment = async () => {
        if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked) || isViolation) return;
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

            try {
                const analytics = getAnalytics();
                logEvent(analytics, 'start_assessment', {
                    assessment_id: assessmentId,
                    assessment_title: assessment?.title || '',
                    cohort_id: submission?.cohortId || '',
                    learner_id: user?.uid || '',
                    attempt_number: submission?.attemptNumber || 1
                });
            } catch (e) { /* Analytics blocked */ }

            const timeLim = assessment.moduleInfo?.timeLimit || assessment.timeLimit || 0;
            if (!isPracticalModule && timeLim > 0) {
                const endMs = getAssessmentEndMs();
                if (endMs) {
                    setTimeLeft(Math.max(0, Math.floor((endMs - getSecureNow()) / 1000)));
                } else {
                    const extraTime = submission?.extraTimeGranted || 0;
                    setTimeLeft((timeLim + extraTime) * 60);
                }
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to start assessment. Please check compliance.');
        } finally {
            setSaving(false);
            setIsStarting(false);
        }
    };

    const triggerAutoSave = (newAnswers: any) => {
        if (currentStatus !== 'in_progress') return;
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

    const SNAPSHOT_INLINE_LIMIT = 200_000;
    const codeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const saveCodeSnapshot = useCallback(async (blockId: string, snapshot: any, dependencies?: Record<string, string>, immediate?: boolean) => {
        if (currentStatus !== 'in_progress') return;

        setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));

        const doWrite = async () => {
            if (!submission?.id || currentStatus !== 'in_progress') return;
            setSaving(true);
            try {
                let fieldPayload: any;

                if (typeof snapshot === 'string' && snapshot.length > SNAPSHOT_INLINE_LIMIT) {
                    const path = `code_snapshots/${submission.id}/${blockId}.json`;
                    await uploadString(fbStorageRef(getStorage(), path), snapshot);
                    fieldPayload = { storagePath: path, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
                } else {
                    fieldPayload = { snapshot, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
                }

                const existingBlockAns = answersRef.current[blockId];
                let finalBlockAns: any;

                if (existingBlockAns && typeof existingBlockAns === 'object' && ('text' in existingBlockAns || 'uploadUrl' in existingBlockAns || 'url' in existingBlockAns || 'codeData' in existingBlockAns)) {
                    finalBlockAns = { ...existingBlockAns, codeData: fieldPayload };
                } else {
                    finalBlockAns = fieldPayload;
                }

                const updatedAnswers = { ...answersRef.current, [blockId]: finalBlockAns };
                answersRef.current = updatedAnswers;
                setAnswers(updatedAnswers);

                await updateDoc(doc(db, 'learner_submissions', submission.id), {
                    [`answers.${blockId}`]: finalBlockAns,
                    lastSavedAt: new Date().toISOString()
                });
            } catch (err) {
                console.error(`Failed to save code for block [${blockId}]:`, err);
                toast.error('Failed to save your code changes.');
                throw err;
            } finally {
                setSaving(false);
            }
        };

        if (immediate) {
            if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
            await doWrite();
        } else {
            if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
            codeSaveTimeoutRef.current = setTimeout(() => { doWrite(); }, 1200);
        }
    }, [submission?.id, currentStatus, toast]);

    const handleAnswerChange = (blockId: string, value: any) => {
        if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
        setAnswers(p => { const n = { ...p, [blockId]: value }; answersRef.current = n; triggerAutoSave(n); return n; });
    };
    const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
        if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
        setAnswers(p => {
            const existing = typeof p[blockId] === 'string' ? { text: p[blockId] } : (p[blockId] || {});
            const n = { ...p, [blockId]: { ...existing, [field]: value } };
            answersRef.current = n;
            triggerAutoSave(n);
            return n;
        });
    };
    const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
        if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
        setAnswers(p => {
            const blockAns = typeof p[blockId] === 'object' ? (p[blockId] || {}) : {};
            const raw = blockAns[nestedKey];
            const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
            const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
            answersRef.current = n;
            triggerAutoSave(n); return n;
        });
    };

    const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
        if (!file || isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
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

    const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
        const st = String(submission?.status || '').toLowerCase();
        if (st !== 'in_progress') return;

        setSaving(true);
        const t = new Date(getSecureNow()).toISOString();
        try {
            await runTransaction(db, async (transaction) => {
                const subRef = doc(db, 'learner_submissions', subId);
                const subSnap = await transaction.get(subRef);
                if (!subSnap.exists()) return;

                const currentStatus = String(subSnap.data().status || '').toLowerCase();
                if (['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed', 'missed', 'violation', 'terminated'].includes(currentStatus)) {
                    return;
                }

                transaction.update(subRef, {
                    answers: currentAnswers,
                    status: 'submitted',
                    submittedAt: t,
                    autoSubmitted: true,
                    learnerDeclaration: {
                        agreed: true,
                        timestamp: t,
                        learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
                        learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
                        signatureUrl: learnerProfile?.signatureUrl || null
                    },
                });
            });

            try {
                const analytics = getAnalytics();
                logEvent(analytics, 'submit_assessment', {
                    assessment_id: assessmentId,
                    assessment_title: assessment?.title || '',
                    cohort_id: submission?.cohortId || '',
                    learner_id: user?.uid || '',
                    attempt_number: submission?.attemptNumber || 1,
                    is_auto_submit: true
                });
            } catch (e) { /* Analytics blocked */ }

            toast.success("Time's up! Auto-submitted.");

            if (assessment?.surveyId) {
                setShowSurveyModal(true);
            } else {
                safeNavigateBack();
            }
        } catch (e) {
            console.error("Auto-submit transaction failed:", e);
        } finally {
            setSaving(false);
        }
    };

    const validateChecklistEvidence = () => {
        try {
            for (const block of assessment?.blocks || []) {
                if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
                    for (let i = 0; i < (block.criteria?.length || 0); i++) {
                        const raw = answers?.[block.id]?.[`evidence_${i}`];
                        const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
                        const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
                        const has = !!(textClean || ev?.url?.trim() || ev?.code?.trim() || ev?.uploadUrl?.trim());

                        if (!has) {
                            return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title || 'Checklist'}".` };
                        }
                    }
                }
                if (block.type === 'qcto_workplace') {
                    const bAns = answers?.[block.id] || {};
                    for (const wa of block.workActivities || []) {
                        if (!bAns[`wa_${wa.id}_declaration`]) {
                            return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
                        }
                        for (const se of wa.evidenceItems || []) {
                            const ev = bAns[`se_${se.id}`] || {};
                            const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
                            const has = !!(textClean || ev?.url?.trim() || ev?.uploadUrl?.trim());
                            if (!has) {
                                return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
                            }
                        }
                    }
                }
            }
            return { valid: true };
        } catch (err) {
            return { valid: true };
        }
    };

    const triggerSubmitConfirm = () => {
        if (isViolation) return;
        if (!declarationChecked) {
            toast.warning('Please check the "Learner Final Declaration" box before submitting.');
            return;
        }

        if (Object.keys(uploadProgress).length > 0) {
            toast.warning("Files are currently uploading. Please wait until uploads complete.");
            return;
        }

        if (assessment?.moduleType === 'workplace') {
            const workplaceBlocks = assessment?.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];
            for (const block of workplaceBlocks) {
                for (const wa of block.workActivities || []) {
                    const hasApprovedLog = (approvedLogs || []).some(log => log.workActivityId === wa.id);
                    if (!hasApprovedLog) {
                        toast.error(`Missing approved log for Work Activity: ${wa.code}. You cannot submit until your mentor approves this task.`);
                        return;
                    }
                }
            }
        }

        if (isAwaitingSignoff || isPracticalModule) {
            const chk = validateChecklistEvidence() as any;
            if (!chk.valid) {
                toast.warning(chk.message);
                return;
            }
        }

        setShowSubmitConfirm(true);
    };

    const executeSubmit = async () => {
        if (isViolation) return;
        setShowSubmitConfirm(false);
        setSaving(true);

        const activeVMs = (window as any).__ACTIVE_VMS || {};
        for (const blockId of Object.keys(activeVMs)) {
            try {
                const vm = activeVMs[blockId];
                const snapshot = await vm.getFsSnapshot();

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

        try {
            await runTransaction(db, async (transaction) => {
                const subRef = doc(db, 'learner_submissions', submission.id);
                const subSnap = await transaction.get(subRef);
                if (!subSnap.exists()) throw new Error("Submission not found");

                const currentStatus = String(subSnap.data().status || '').toLowerCase();
                if (['violation', 'terminated', 'missed'].includes(currentStatus)) {
                    throw new Error("Assessment is locked due to a security violation.");
                }

                transaction.update(subRef, {
                    answers,
                    status: nextStatus,
                    submittedAt: t,
                    learnerDeclaration: {
                        agreed: true,
                        timestamp: t,
                        learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
                        learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
                        signatureUrl: learnerProfile?.signatureUrl || null
                    }
                });
            });

            try {
                const analytics = getAnalytics();
                logEvent(analytics, 'submit_assessment', {
                    assessment_id: assessmentId,
                    assessment_title: assessment?.title || '',
                    cohort_id: submission?.cohortId || '',
                    learner_id: user?.uid || '',
                    attempt_number: submission?.attemptNumber || 1,
                    is_auto_submit: false
                });
            } catch (e) { /* Analytics blocked */ }

            toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');

            if (assessment?.surveyId) {
                setShowSurveyModal(true);
            } else {
                safeNavigateBack();
            }

            setTimeout(() => window.scrollTo(0, 0), 1000);
        } catch (error: any) {
            console.error("❌ Submission Error:", error);
            toast.error(`Failed to submit: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const executeAppeal = async (reason: string) => {
        setShowAppealModal(false);
        setSaving(true);
        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                status: 'appealed',
                appeal: { reason, date: new Date().toISOString(), status: 'pending' },
                lastStaffEditAt: new Date().toISOString()
            });

            try {
                const analytics = getAnalytics();
                logEvent(analytics, 'appeal_assessment', {
                    assessment_id: assessmentId,
                    cohort_id: submission?.cohortId || '',
                    learner_id: user?.uid || ''
                });
            } catch (e) { /* Analytics blocked */ }

            toast.success("Formal appeal lodged successfully.");
            setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
        } catch {
            toast.error("Failed to lodge appeal.");
        } finally { setSaving(false); }
    };

    const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride: boolean = false) => {
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

                    try {
                        const analytics = getAnalytics();
                        logEvent(analytics, 'proctor_violation', {
                            type: 'copy_paste_attempt',
                            assessment_id: assessmentId,
                            learner_id: user?.uid || ''
                        });
                    } catch (e) { /* Analytics blocked */ }

                    document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to use Copy/Paste keyboard shortcuts." }));
                }
            } else {
                e.preventDefault();
                e.stopPropagation();
                if (e.nativeEvent?.stopImmediatePropagation) {
                    e.nativeEvent.stopImmediatePropagation();
                }
                toast.warning("Copying, pasting, and dropping content is disabled to ensure academic integrity.", 15000);

                try {
                    const analytics = getAnalytics();
                    logEvent(analytics, 'proctor_violation', {
                        type: 'paste_drop_attempt',
                        assessment_id: assessmentId,
                        learner_id: user?.uid || ''
                    });
                } catch (e) { /* Analytics blocked */ }

                document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to Paste or Drop external content into the assessment." }));
            }
        }
    };

    const generateCalendarLink = () => {
        if (!assessment?.scheduledDate) return "#";
        const formatToGCal = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");
        const startTime = new Date(assessment.scheduledDate);
        const durationMinutes = assessment.moduleInfo?.timeLimit || assessment.timeLimit || 60;
        const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
        const dtStart = formatToGCal(startTime);
        const dtEnd = formatToGCal(endTime);
        const eventTitle = encodeURIComponent(`mLab Assessment: ${assessment.title}`);
        const eventDetails = encodeURIComponent(
            `Your secure assessment module is scheduled.\n\nAccess Link: ${window.location.origin}/learner/assessment/${assessmentId}`
        );
        return `https://www.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${dtStart}/${dtEnd}&details=${eventDetails}&sf=true&output=xml`;
    };

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

    if (isViolation) {
        return (
            <AssessmentViolationScreen
                assessment={assessment}
                submission={submission}
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f8fafc' }}>
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
                showSurveyModalIndicator={isSubmitted && Boolean(assessment?.surveyId)}
                isSurveyCompleted={isSurveyCompleted}
                onOpenSurveyModal={() => setShowSurveyModal(true)}
            />

            {/* REUSED POST-ASSESSMENT SURVEY MODAL PLAYER */}
            {showSurveyModal && assessment?.surveyId && (
                <SurveyEnginePlayer
                    surveyId={assessment.surveyId}
                    context={{
                        assessmentId: assessmentId,
                        cohortId: submission?.cohortId,
                        learnerId: submission?.learnerId || user?.uid || '',
                        learnerName: learnerProfile?.fullName || user?.fullName || '',
                        submissionId: submission?.id
                    }}
                    onComplete={() => {
                        setShowSurveyModal(false);
                        setIsSurveyCompleted(true);
                    }}
                    onSkip={() => {
                        setShowSurveyModal(false);
                    }}
                />
            )}
        </div>
    );
};

export default AssessmentPlayer;

export const AssessmentViolationScreen: React.FC<{
    assessment: any;
    submission: any;
    onBack: () => void;
}> = ({ assessment, submission, onBack }) => {
    const [liveHistory, setLiveHistory] = useState<any[]>([]);

    // 🚀 REAL-TIME LISTENER TO LIVE PROCTORING SESSION BREACH LOGS
    useEffect(() => {
        const targetLearnerUid = submission?.authUid || submission?.learnerId || submission?.learnerDeclaration?.learnerAuthUid;
        const targetAssessmentId = assessment?.id || submission?.assessmentId;

        if (!targetLearnerUid || !targetAssessmentId) return;

        const sessionDocId = `${targetAssessmentId}_${targetLearnerUid}`;
        const unsub = onSnapshot(doc(db, 'live_proctor_sessions', sessionDocId), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (Array.isArray(data?.violationHistory) && data.violationHistory.length > 0) {
                    setLiveHistory(data.violationHistory);
                }
            }
        }, (err) => {
            console.warn("Could not fetch live proctor session history:", err);
        });

        return () => unsub();
    }, [assessment?.id, submission]);

    // MULTI-LAYER FALLBACK RESOLVER TO PREVENT 0 INCIDENTS DISPLAY
    const history = useMemo(() => {
        if (liveHistory.length > 0) return liveHistory;
        if (Array.isArray(submission?.violationHistory) && submission.violationHistory.length > 0) return submission.violationHistory;
        if (Array.isArray(submission?.warnings) && submission.warnings.length > 0) return submission.warnings;
        if (Array.isArray(submission?.incidents) && submission.incidents.length > 0) return submission.incidents;
        if (Array.isArray(submission?.proctorLogs) && submission.proctorLogs.length > 0) return submission.proctorLogs;

        // Guaranteed fallback: Generate a charge from the primary termination cause
        const termReason = submission?.systemNote || submission?.latestWarning;
        if (termReason) {
            return [{
                reason: termReason,
                timestamp: submission?.updatedAt || submission?.submittedAt || new Date().toISOString()
            }];
        }

        return [];
    }, [liveHistory, submission]);

    const terminationReason = submission?.systemNote || submission?.latestWarning || "Proctoring Security Breach";

    return (
        <div className="lfm-overlay" style={{ overflowY: 'auto' }}>
            <div
                className="lfm-modal"
                style={{
                    maxWidth: '720px',
                    border: '2px solid var(--mlab-red)',
                    boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.25)'
                }}
            >
                {/* ── HEADER ── */}
                <div
                    className="lfm-header"
                    style={{
                        background: '#7f1d1d',
                        borderBottom: '3px solid var(--mlab-red)',
                        padding: '1.25rem 1.5rem'
                    }}
                >
                    <h2 className="lfm-header__title">
                        <ShieldAlert size={22} style={{ color: '#fca5a5' }} />
                        <span>Academic Integrity Violation &bull; Assessment Locked</span>
                    </h2>
                </div>

                {/* ── BODY ── */}
                <div className="lfm-body">
                    {/* PRIMARY VIOLATION BANNER */}
                    <div className="lfm-error-banner" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.85rem' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontFamily: 'var(--font-heading)', fontSize: '1rem', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {assessment?.title || 'Proctored Assessment'}
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#b91c1c' }}>
                                <strong>Status:</strong> Security Violation Flagged &bull; Attempt #{submission?.attemptNumber || 1}
                            </p>
                        </div>

                        {/* Cause Log Box */}
                        <div
                            className="lfm-flags-panel"
                            style={{
                                background: 'var(--mlab-white)',
                                borderColor: '#fca5a5',
                                borderLeftColor: 'var(--mlab-red)',
                                padding: '0.75rem 1rem'
                            }}
                        >
                            <span style={{ fontSize: '0.68rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#991b1b', display: 'block', marginBottom: '3px' }}>
                                Primary Termination Cause:
                            </span>
                            <p style={{ margin: 0, fontSize: '0.88rem', color: '#7f1d1d', fontWeight: 'bold', fontStyle: 'italic', lineHeight: 1.4 }}>
                                "{terminationReason}"
                            </p>
                        </div>
                    </div>

                    {/* BREACH CHARGES LIST */}
                    <div>
                        <div className="lfm-section-hdr" style={{ color: '#991b1b', borderColor: 'var(--mlab-red)' }}>
                            <Zap size={14} style={{ color: 'var(--mlab-red)' }} />
                            <span>Recorded Breach Charges ({history.length} Incident{history.length !== 1 ? 's' : ''})</span>
                        </div>

                        {history.length === 0 ? (
                            <div className="lfm-flags-panel" style={{ fontStyle: 'italic', color: 'var(--mlab-grey)', fontSize: '0.85rem' }}>
                                Security breach was flagged and logged directly to the Invigilator Dashboard.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
                                {history.map((item: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="lfm-flags-panel"
                                        style={{
                                            background: 'var(--mlab-bg)',
                                            borderColor: 'var(--mlab-border)',
                                            borderLeftColor: 'var(--mlab-red)',
                                            padding: '0.6rem 0.85rem',
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start'
                                        }}
                                    >
                                        <div>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--mlab-red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Incident #{idx + 1}
                                            </span>
                                            <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
                                                {item.reason || item.message || item.type || "Proctoring Security Warning"}
                                            </p>
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                            {item.timestamp ? moment(item.timestamp).format('HH:mm:ss') : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* NEXT STEPS GUIDANCE */}
                    <div className="lfm-flags-panel" style={{ background: 'var(--mlab-light-blue)', borderLeftColor: 'var(--mlab-blue)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <Info size={14} style={{ color: 'var(--mlab-blue)' }} />
                            <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mlab-blue)' }}>
                                What happens next?
                            </strong>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                            Webcam and screen capture snapshots recorded during this session have been saved to the Invigilator Dashboard. Your Assessor and Facilitator will review the incident logs.
                        </p>
                    </div>
                </div>

                {/* ── FOOTER ── */}
                <div className="lfm-footer">
                    <button
                        type="button"
                        onClick={onBack}
                        className="lfm-btn lfm-btn--primary"
                        style={{ background: '#7f1d1d' }}
                    >
                        <ArrowLeft size={14} /> Return to Portfolio
                    </button>
                </div>
            </div>
        </div>
    );
};

