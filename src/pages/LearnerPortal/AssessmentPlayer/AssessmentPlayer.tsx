// src/pages/LearnerDashboard/AssessmentPlayer/AssessmentPlayer.tsx

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, uploadString } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../components/common/Toast/Toast';
import './AssessmentPlayer.css';
import moment from 'moment';

import { AssessmentGate } from './AssessmentGate';
import { AssessmentLockedScreen } from './AssessmentLockedScreen';
import AssessmentPlayerContent from './AssessmentPlayerContent';
import { ArrowLeft, Info, ShieldAlert, Zap } from 'lucide-react';

const LoadingScreen: React.FC = () => (
    <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
        <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
    </div>
);

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

    // 🚀 DYNAMIC END-TIME CALCULATOR
    const getAssessmentEndMs = useCallback(() => {
        if (!assessment) return null;
        const baseLimit = assessment.moduleInfo?.timeLimit || 0;
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
                console.warn('[TIMER DEBUG] Time API unavailable. Using local device clock:', err);
                setTimeOffset(0);
            }
        };

        fetchOffset();
    }, []);

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

    // 🚀 REAL-TIME SUBMISSION LISTENER
    useEffect(() => {
        if (!user?.uid || !assessmentId) return;

        const q = query(
            collection(db, 'learner_submissions'),
            where('assessmentId', '==', assessmentId),
            where('authUid', '==', user.uid)
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
            console.error("Real-time submission listener error:", err);
        });

        return () => unsub();
    }, [user?.uid, assessmentId]);

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

    // 🚀 LIVE COUNTDOWN TIMER EFFECT (SAFE & REACTIVE)
    useEffect(() => {
        if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed || isViolation || currentStatus !== 'in_progress') return;

        const updateTimer = () => {
            const now = getSecureNow();
            const endMs = getAssessmentEndMs();
            if (endMs) {
                const calculatedLeft = Math.max(0, Math.floor((endMs - now) / 1000));
                setTimeLeft(calculatedLeft);

                // 🚀 AUTO-SUBMIT DIRECTLY FROM FRESH LIVE CALCULATION
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

    const getBlockGrading = (blockId: string) => {
        const g = submission?.grading || {};
        const m = submission?.moderation || {};
        const mLayer = m.breakdown?.[blockId] || {};
        const aLayer = g.assessorBreakdown?.[blockId] || {};
        const fLayer = g.facilitatorBreakdown?.[blockId] || {};
        const legacyLayer = g.breakdown?.[blockId] || {};

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

            if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) {
                const endMs = getAssessmentEndMs();
                if (endMs) {
                    setTimeLeft(Math.max(0, Math.floor((endMs - getSecureNow()) / 1000)));
                } else {
                    const extraTime = submission?.extraTimeGranted || 0;
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

    // 🚀 ATOMIC & SECURE CODE SNAPSHOT SAVER
    const saveCodeSnapshot = useCallback(async (blockId: string, snapshot: any, dependencies?: Record<string, string>, immediate?: boolean) => {
        if (currentStatus !== 'in_progress') return;

        setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));

        const doWrite = async () => {
            if (!submission?.id || currentStatus !== 'in_progress') return;
            setSaving(true);
            try {
                let fieldPayload: any;

                if (typeof snapshot === 'string' && snapshot.length > SNAPSHOT_INLINE_LIMIT) {
                    console.log(`🔥 [FIRESTORE WRITE STARTED] Uploading large snapshot (>200KB) to Storage for block [${blockId}]...`);
                    const path = `code_snapshots/${submission.id}/${blockId}.json`;
                    await uploadString(fbStorageRef(getStorage(), path), snapshot);
                    fieldPayload = { storagePath: path, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
                } else {
                    console.log(`🔥 [FIRESTORE WRITE STARTED] Updating Firestore inline code snapshot for block [${blockId}]...`);
                    fieldPayload = { snapshot, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
                }

                // Check if this block has an existing Task/Evidence object structure
                const existingBlockAns = answersRef.current[blockId];
                let finalBlockAns: any;

                if (existingBlockAns && typeof existingBlockAns === 'object' && ('text' in existingBlockAns || 'uploadUrl' in existingBlockAns || 'url' in existingBlockAns || 'codeData' in existingBlockAns)) {
                    // Task / Evidence structure: Store under codeData property
                    finalBlockAns = { ...existingBlockAns, codeData: fieldPayload };
                } else {
                    // Standalone code sandbox block structure
                    finalBlockAns = fieldPayload;
                }

                // Synchronously update answersRef AND state to prevent auto-save race conditions
                const updatedAnswers = { ...answersRef.current, [blockId]: finalBlockAns };
                answersRef.current = updatedAnswers;
                setAnswers(updatedAnswers);

                // Persist field to Firestore
                await updateDoc(doc(db, 'learner_submissions', submission.id), {
                    [`answers.${blockId}`]: finalBlockAns,
                    lastSavedAt: new Date().toISOString()
                });

                console.log(`✅ [FIRESTORE WRITE SUCCESS] Code snapshot for block [${blockId}] persisted to Firestore!`);
            } catch (err) {
                console.error(`❌ [FIRESTORE WRITE ERROR] Failed to save code for block [${blockId}]:`, err);
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
        setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; answersRef.current = n; triggerAutoSave(n); return n; });
    };
    const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
        if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
        setAnswers(p => {
            const blockAns = p[blockId] || {};
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
        if (st !== 'in_progress') {
            console.warn(`[AUTO-SUBMIT BLOCKED] Cannot auto-submit assessment in '${st}' status.`);
            return;
        }

        setSaving(true);
        const t = new Date(getSecureNow()).toISOString();
        try {
            await runTransaction(db, async (transaction) => {
                const subRef = doc(db, 'learner_submissions', subId);
                const subSnap = await transaction.get(subRef);
                if (!subSnap.exists()) return;

                const currentStatus = String(subSnap.data().status || '').toLowerCase();
                if (['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed', 'missed', 'violation', 'terminated'].includes(currentStatus)) {
                    console.warn("[AUTO SUBMIT] Aborted: Assessment is already in a terminal or violated state.");
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
            toast.success("Time's up! Auto-submitted.");
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
            toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
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



// import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// import { useParams, useNavigate, useLocation } from 'react-router-dom';
// import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot, runTransaction } from 'firebase/firestore';
// import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, uploadString } from 'firebase/storage';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import { useToast } from '../../../components/common/Toast/Toast';
// import './AssessmentPlayer.css';
// import moment from 'moment';

// import { AssessmentGate } from './AssessmentGate';
// import { AssessmentLockedScreen } from './AssessmentLockedScreen';
// import AssessmentPlayerContent from './AssessmentPlayerContent';
// import { ArrowLeft, Info, ShieldAlert, Zap } from 'lucide-react';

// const LoadingScreen: React.FC = () => (
//     <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
//         <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
//     </div>
// );

// const AssessmentPlayer: React.FC = () => {
//     const { assessmentId } = useParams<{ assessmentId: string }>();
//     const navigate = useNavigate();
//     const location = useLocation();

//     const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
//     const toast = useToast();

//     const safeNavigateBack = () => {
//         if (location.key === 'default') {
//             navigate(user?.role === 'learner' ? '/learner/dashboard' : '/');
//         } else {
//             navigate(-1);
//         }
//     };

//     const [loading, setLoading] = useState(true);
//     const [saving, setSaving] = useState(false);
//     const [isStarting, setIsStarting] = useState(false);

//     const [assessment, setAssessment] = useState<any>(null);
//     const [submission, setSubmission] = useState<any>(null);
//     const [answers, setAnswers] = useState<Record<string, any>>({});
//     const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
//     const [codeSnapshots, setCodeSnapshots] = useState<Record<string, any>>({});
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
//     const [approvedLogs, setApprovedLogs] = useState<any[]>([]);
//     const [logsLoading, setLogsLoading] = useState<boolean>(false);

//     const [timeLeft, setTimeLeft] = useState<number | null>(null);
//     const [timeOffset, setTimeOffset] = useState<number>(0);
//     const [timeToStart, setTimeToStart] = useState<number | null>(null);

//     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
//     const answersRef = useRef(answers);
//     useEffect(() => { answersRef.current = answers; }, [answers]);

//     const currentStatus = String(submission?.status || '').toLowerCase();
//     const isMissed = currentStatus === 'missed';
//     const isViolation = currentStatus === 'violation' || currentStatus === 'terminated';

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

//     const isGloballyLocked = isSubmitted || isAwaitingSignoff || isMissed || isViolation;
//     const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

//     const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
//         ? assessment.requiresInvigilation
//         : !isPracticalModule;

//     const willBeProctored = isInvigilationEnabled && !isGloballyLocked;

//     const isSummative = submission?.type?.toLowerCase().includes('summative') || false;
//     const hasOverride = submission?.facilitatorOverride === true;

//     const pendingTopics = useMemo(() => {
//         if (!submission || !moduleLogs) return [];
//         return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
//     }, [moduleLogs, submission]);

//     const isFullyCompliant = pendingTopics.length === 0;

//     const isBlockVerified = (blockId: string) => {
//         const facGrade = submission?.grading?.facilitatorBreakdown?.[blockId];
//         return facGrade?.isCorrect === true || facGrade?.obsDeclaration === true;
//     };

//     const getSecureNow = useCallback(() => Date.now() + timeOffset, [timeOffset]);

//     const getAssessmentEndMs = useCallback(() => {
//         if (!assessment) return null;
//         const baseLimit = assessment.moduleInfo?.timeLimit || 0;
//         if (baseLimit <= 0) return null;

//         const extraTime = submission?.extraTimeGranted || 0;
//         const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;

//         if (assessment.isScheduled && assessment.scheduledDate && !submission?.overrideUnlock) {
//             return moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
//         }

//         if (submission?.startedAt) {
//             return new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
//         }

//         return null;
//     }, [assessment, submission]);

//     useEffect(() => {
//         const fetchOffset = async () => {
//             try {
//                 const res = await fetch(`https://timeapi.io/api/Time/current/zone?timeZone=UTC&nocache=${Date.now()}`, {
//                     cache: 'no-store',
//                     headers: {
//                         'Cache-Control': 'no-cache, no-store, must-revalidate',
//                         'Pragma': 'no-cache'
//                     }
//                 });

//                 if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
//                 const data = await res.json();

//                 const secureUTCTime = new Date(data.dateTime + 'Z').getTime();
//                 const localTime = Date.now();
//                 const calculatedOffset = secureUTCTime - localTime;

//                 if (Math.abs(calculatedOffset) > 5 * 60 * 1000) {
//                     setTimeOffset(0);
//                 } else {
//                     setTimeOffset(calculatedOffset);
//                 }
//             } catch (err) {
//                 console.warn('[TIMER DEBUG] Time API unavailable. Using local device clock:', err);
//                 setTimeOffset(0);
//             }
//         };

//         fetchOffset();
//     }, []);

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
//                 const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
//                 if (!assSnap.exists()) {
//                     toast.error('Assessment template not found.');
//                     setLoading(false);
//                     return;
//                 }
//                 const assData = assSnap.data();
//                 setAssessment(assData);

//                 let userProfile: any = {};
//                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
//                 if (userDocSnap.exists()) {
//                     userProfile = { id: userDocSnap.id, ...userDocSnap.data() };
//                 }
//                 setLearnerProfile(userProfile);

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
//                         console.warn("Enrollment lookup failed.", e);
//                     }
//                 }

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
//                     answersRef.current = activeSub.answers || {};
//                     if (activeSub.enrollmentId) {
//                         const e = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId));
//                         if (e.exists()) setLearnerEnrollment(e.data());
//                     }
//                     if (activeSub.grading?.gradedBy) {
//                         const s = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
//                         if (s.exists()) setAssessorProfile(s.data());
//                     }
//                     if (activeSub.moderation?.moderatedBy) {
//                         const s = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
//                         if (s.exists()) setModeratorProfile(s.data());
//                     }
//                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
//                     if (facId) {
//                         const s = await getDoc(doc(db, 'users', facId));
//                         if (s.exists()) setFacilitatorProfile(s.data());
//                     }
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

//     // 🚀 REAL-TIME SUBMISSION LISTENER
//     useEffect(() => {
//         if (!user?.uid || !assessmentId) return;

//         const q = query(
//             collection(db, 'learner_submissions'),
//             where('assessmentId', '==', assessmentId),
//             where('authUid', '==', user.uid)
//         );

//         const unsub = onSnapshot(q, (snap) => {
//             if (!snap.empty) {
//                 const activeSub: any = snap.docs
//                     .map(d => ({ id: d.id, ...d.data() }))
//                     .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

//                 setSubmission((prev: any) => {
//                     if (!prev || JSON.stringify(prev) !== JSON.stringify(activeSub)) {
//                         return activeSub;
//                     }
//                     return prev;
//                 });
//             }
//         }, (err) => {
//             console.error("Real-time submission listener error:", err);
//         });

//         return () => unsub();
//     }, [user?.uid, assessmentId]);

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
//     }, [submission?.id, user?.uid, submission?.type, submission?.cohortId, submission?.moduleNumber]);

//     useEffect(() => {
//         if (assessment?.scheduledDate && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed && !isViolation) {
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
//     }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, isViolation, getSecureNow]);

//     const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed && !isViolation;

//     useEffect(() => {
//         if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock && !isViolation) {
//             const interval = setInterval(() => {
//                 const endMs = getAssessmentEndMs();
//                 if (endMs && getSecureNow() >= endMs) {
//                     updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         status: 'missed',
//                         systemNote: `Auto-swept by frontend player: Learner failed to start within the allotted timeframe.`
//                     }).catch(() => { });
//                     setSubmission((prev: any) => ({ ...prev, status: 'missed' }));
//                     clearInterval(interval);
//                 }
//             }, 10000);
//             return () => clearInterval(interval);
//         }
//     }, [isNotStarted, assessment, submission, isViolation, getAssessmentEndMs, getSecureNow]);

//     useEffect(() => {
//         if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed || isViolation || currentStatus !== 'in_progress') return;

//         const updateTimer = () => {
//             const now = getSecureNow();
//             const endMs = getAssessmentEndMs();
//             if (endMs) {
//                 setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
//             }
//         };

//         updateTimer();
//         const id = setInterval(updateTimer, 1000);
//         return () => clearInterval(id);
//     }, [isGloballyLocked, showGate, isPracticalModule, isMissed, isViolation, currentStatus, assessment, submission, getAssessmentEndMs, getSecureNow]);

//     useEffect(() => {
//         if (timeLeft !== null && timeLeft <= 0 && currentStatus === 'in_progress') {
//             toast.error("Time is up! Auto-submitting.");
//             setAnswers(latestAnswers => {
//                 if (submission?.id) {
//                     forceAutoSubmit(submission.id, latestAnswers);
//                 }
//                 return latestAnswers;
//             });
//         }
//     }, [timeLeft, currentStatus, submission?.id]);

//     useEffect(() => {
//         const fetchApprovedLogs = async () => {
//             if (!user?.uid || assessment?.moduleType !== 'workplace') {
//                 setLogsLoading(false);
//                 return;
//             }
//             try {
//                 setLogsLoading(true);
//                 const logsRef = collection(db, 'workplace_logs');
//                 const q = query(logsRef, where('learnerId', '==', user.uid), where('moduleId', '==', assessment.id), where('status', '==', 'Approved'));
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

//     const getBlockGrading = (blockId: string) => {
//         const g = submission?.grading || {};
//         const m = submission?.moderation || {};
//         const mLayer = m.breakdown?.[blockId] || {};
//         const aLayer = g.assessorBreakdown?.[blockId] || {};
//         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
//         const legacyLayer = g.breakdown?.[blockId] || {};

//         let activeLayer = fLayer || legacyLayer || {};
//         if (isAssDone || g.assessorBreakdown?.[blockId]) activeLayer = aLayer;
//         if (isModDone || m.breakdown?.[blockId]) activeLayer = mLayer;

//         return {
//             score: activeLayer?.score,
//             isCorrect: activeLayer?.isCorrect,
//             facIsCorrect: fLayer?.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer?.isCorrect,
//             assIsCorrect: aLayer?.isCorrect,
//             modIsCorrect: mLayer?.isCorrect,
//             feedback: activeLayer?.feedback || '',
//             facFeedback: fLayer?.feedback || legacyLayer?.feedback || '',
//             assFeedback: aLayer?.feedback || '',
//             modFeedback: mLayer?.feedback || '',
//             criteriaResults: activeLayer?.criteriaResults || fLayer?.criteriaResults || legacyLayer?.criteriaResults || [],
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
//             } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
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
//         if (isRemediation && !isGloballyLocked) return null;
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

//     const handleStartAssessment = async () => {
//         if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked) || isViolation) return;
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
//                 const endMs = getAssessmentEndMs();
//                 if (endMs) {
//                     setTimeLeft(Math.max(0, Math.floor((endMs - getSecureNow()) / 1000)));
//                 } else {
//                     const extraTime = submission?.extraTimeGranted || 0;
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
//         if (currentStatus !== 'in_progress') return;
//         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
//         setSaving(true);
//         saveTimeoutRef.current = setTimeout(async () => {
//             if (!submission?.id) return;
//             try {
//                 await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
//             } catch {
//                 toast.error('Auto-save failed.');
//             } finally {
//                 setSaving(false);
//             }
//         }, 1200);
//     };

//     const SNAPSHOT_INLINE_LIMIT = 200_000;
//     const codeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

//     // 🚀 ATOMIC & SECURE CODE SNAPSHOT SAVER
//     const saveCodeSnapshot = useCallback(async (blockId: string, snapshot: any, dependencies?: Record<string, string>, immediate?: boolean) => {
//         if (currentStatus !== 'in_progress') return;

//         setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));

//         const doWrite = async () => {
//             if (!submission?.id || currentStatus !== 'in_progress') return;
//             setSaving(true);
//             try {
//                 let fieldPayload: any;

//                 if (typeof snapshot === 'string' && snapshot.length > SNAPSHOT_INLINE_LIMIT) {
//                     console.log(`🔥 [FIRESTORE WRITE STARTED] Uploading large snapshot (>200KB) to Storage for block [${blockId}]...`);
//                     const path = `code_snapshots/${submission.id}/${blockId}.json`;
//                     await uploadString(fbStorageRef(getStorage(), path), snapshot);
//                     fieldPayload = { storagePath: path, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
//                 } else {
//                     console.log(`🔥 [FIRESTORE WRITE STARTED] Updating Firestore inline code snapshot for block [${blockId}]...`);
//                     fieldPayload = { snapshot, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
//                 }

//                 // Check if this block has an existing Task/Evidence object structure
//                 const existingBlockAns = answersRef.current[blockId];
//                 let finalBlockAns: any;

//                 if (existingBlockAns && typeof existingBlockAns === 'object' && ('text' in existingBlockAns || 'uploadUrl' in existingBlockAns || 'url' in existingBlockAns || 'codeData' in existingBlockAns)) {
//                     // Task / Evidence structure: Store under codeData property
//                     finalBlockAns = { ...existingBlockAns, codeData: fieldPayload };
//                 } else {
//                     // Standalone code sandbox block structure
//                     finalBlockAns = fieldPayload;
//                 }

//                 // Synchronously update answersRef AND state to prevent auto-save race conditions
//                 const updatedAnswers = { ...answersRef.current, [blockId]: finalBlockAns };
//                 answersRef.current = updatedAnswers;
//                 setAnswers(updatedAnswers);

//                 // Persist field to Firestore
//                 await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                     [`answers.${blockId}`]: finalBlockAns,
//                     lastSavedAt: new Date().toISOString()
//                 });

//                 console.log(`✅ [FIRESTORE WRITE SUCCESS] Code snapshot for block [${blockId}] persisted to Firestore!`);
//             } catch (err) {
//                 console.error(`❌ [FIRESTORE WRITE ERROR] Failed to save code for block [${blockId}]:`, err);
//                 toast.error('Failed to save your code changes.');
//                 throw err;
//             } finally {
//                 setSaving(false);
//             }
//         };

//         if (immediate) {
//             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
//             await doWrite();
//         } else {
//             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
//             codeSaveTimeoutRef.current = setTimeout(() => { doWrite(); }, 1200);
//         }
//     }, [submission?.id, currentStatus, toast]);

//     const handleAnswerChange = (blockId: string, value: any) => {
//         if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
//         setAnswers(p => { const n = { ...p, [blockId]: value }; answersRef.current = n; triggerAutoSave(n); return n; });
//     };
//     const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
//         if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
//         setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; answersRef.current = n; triggerAutoSave(n); return n; });
//     };
//     const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
//         if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
//         setAnswers(p => {
//             const blockAns = p[blockId] || {};
//             const raw = blockAns[nestedKey];
//             const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
//             const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
//             answersRef.current = n;
//             triggerAutoSave(n); return n;
//         });
//     };

//     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
//         if (!file || isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
//         const pKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
//         setUploadProgress(p => ({ ...p, [pKey]: 0 }));
//         setSaving(true);
//         toast.info(`Uploading ${file.name}…`);
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
//                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
//                     setSaving(false);
//                 }
//             );
//         } catch (err: any) {
//             toast.error(`Upload failed: ${err.message}`);
//             setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
//             setSaving(false);
//         }
//     };

//     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
//         const st = String(submission?.status || '').toLowerCase();
//         if (st !== 'in_progress') {
//             console.warn(`[AUTO-SUBMIT BLOCKED] Cannot auto-submit assessment in '${st}' status.`);
//             return;
//         }

//         setSaving(true);
//         const t = new Date(getSecureNow()).toISOString();
//         try {
//             await runTransaction(db, async (transaction) => {
//                 const subRef = doc(db, 'learner_submissions', subId);
//                 const subSnap = await transaction.get(subRef);
//                 if (!subSnap.exists()) return;

//                 const currentStatus = String(subSnap.data().status || '').toLowerCase();
//                 if (['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed', 'missed', 'violation', 'terminated'].includes(currentStatus)) {
//                     console.warn("[AUTO SUBMIT] Aborted: Assessment is already in a terminal or violated state.");
//                     return;
//                 }

//                 transaction.update(subRef, {
//                     answers: currentAnswers,
//                     status: 'submitted',
//                     submittedAt: t,
//                     autoSubmitted: true,
//                     learnerDeclaration: {
//                         agreed: true,
//                         timestamp: t,
//                         learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
//                         learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
//                         signatureUrl: learnerProfile?.signatureUrl || null
//                     },
//                 });
//             });
//             toast.success("Time's up! Auto-submitted.");
//         } catch (e) {
//             console.error("Auto-submit transaction failed:", e);
//         } finally {
//             setSaving(false);
//         }
//     };

//     const validateChecklistEvidence = () => {
//         try {
//             for (const block of assessment?.blocks || []) {
//                 if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
//                     for (let i = 0; i < (block.criteria?.length || 0); i++) {
//                         const raw = answers?.[block.id]?.[`evidence_${i}`];
//                         const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
//                         const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
//                         const has = !!(textClean || ev?.url?.trim() || ev?.code?.trim() || ev?.uploadUrl?.trim());

//                         if (!has) {
//                             return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title || 'Checklist'}".` };
//                         }
//                     }
//                 }
//                 if (block.type === 'qcto_workplace') {
//                     const bAns = answers?.[block.id] || {};
//                     for (const wa of block.workActivities || []) {
//                         if (!bAns[`wa_${wa.id}_declaration`]) {
//                             return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
//                         }
//                         for (const se of wa.evidenceItems || []) {
//                             const ev = bAns[`se_${se.id}`] || {};
//                             const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
//                             const has = !!(textClean || ev?.url?.trim() || ev?.uploadUrl?.trim());
//                             if (!has) {
//                                 return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
//                             }
//                         }
//                     }
//                 }
//             }
//             return { valid: true };
//         } catch (err) {
//             return { valid: true };
//         }
//     };

//     const triggerSubmitConfirm = () => {
//         if (isViolation) return;
//         if (!declarationChecked) {
//             toast.warning('Please check the "Learner Final Declaration" box before submitting.');
//             return;
//         }

//         if (Object.keys(uploadProgress).length > 0) {
//             toast.warning("Files are currently uploading. Please wait until uploads complete.");
//             return;
//         }

//         if (assessment?.moduleType === 'workplace') {
//             const workplaceBlocks = assessment.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];
//             for (const block of workplaceBlocks) {
//                 for (const wa of block.workActivities || []) {
//                     const hasApprovedLog = (approvedLogs || []).some(log => log.workActivityId === wa.id);
//                     if (!hasApprovedLog) {
//                         toast.error(`Missing approved log for Work Activity: ${wa.code}. You cannot submit until your mentor approves this task.`);
//                         return;
//                     }
//                 }
//             }
//         }

//         if (isAwaitingSignoff || isPracticalModule) {
//             const chk = validateChecklistEvidence() as any;
//             if (!chk.valid) {
//                 toast.warning(chk.message);
//                 return;
//             }
//         }

//         setShowSubmitConfirm(true);
//     };

//     const executeSubmit = async () => {
//         if (isViolation) return;
//         setShowSubmitConfirm(false);
//         setSaving(true);

//         const activeVMs = (window as any).__ACTIVE_VMS || {};
//         for (const blockId of Object.keys(activeVMs)) {
//             try {
//                 const vm = activeVMs[blockId];
//                 const snapshot = await vm.getFsSnapshot();

//                 answers[blockId] = {
//                     snapshot,
//                     lastSavedAt: new Date().toISOString()
//                 };
//             } catch (err) {
//                 console.error(`Failed to capture snapshot for sandbox ${blockId}:`, err);
//             }
//         }

//         const t = new Date(getSecureNow()).toISOString();
//         const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

//         try {
//             await runTransaction(db, async (transaction) => {
//                 const subRef = doc(db, 'learner_submissions', submission.id);
//                 const subSnap = await transaction.get(subRef);
//                 if (!subSnap.exists()) throw new Error("Submission not found");

//                 const currentStatus = String(subSnap.data().status || '').toLowerCase();
//                 if (['violation', 'terminated', 'missed'].includes(currentStatus)) {
//                     throw new Error("Assessment is locked due to a security violation.");
//                 }

//                 transaction.update(subRef, {
//                     answers,
//                     status: nextStatus,
//                     submittedAt: t,
//                     learnerDeclaration: {
//                         agreed: true,
//                         timestamp: t,
//                         learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
//                         learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
//                         signatureUrl: learnerProfile?.signatureUrl || null
//                     }
//                 });
//             });
//             toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
//             setTimeout(() => window.scrollTo(0, 0), 1000);
//         } catch (error: any) {
//             console.error("❌ Submission Error:", error);
//             toast.error(`Failed to submit: ${error.message}`);
//         } finally {
//             setSaving(false);
//         }
//     };

//     const executeAppeal = async (reason: string) => {
//         setShowAppealModal(false);
//         setSaving(true);
//         try {
//             await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                 status: 'appealed',
//                 appeal: { reason, date: new Date().toISOString(), status: 'pending' },
//                 lastStaffEditAt: new Date().toISOString()
//             });
//             toast.success("Formal appeal lodged successfully.");
//             setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
//         } catch {
//             toast.error("Failed to lodge appeal.");
//         } finally { setSaving(false); }
//     };

//     const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride: boolean = false) => {
//         if (!isGloballyLocked && !isPracticalModule && !allowOverride) {
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

//     if (loading) return <LoadingScreen />;

//     if (isAdminIntercept) {
//         return (
//             <AssessmentLockedScreen
//                 type="admin"
//                 assessmentId={assessmentId}
//                 onBack={safeNavigateBack}
//                 navigate={navigate}
//             />
//         );
//     }

//     if (!assessment || !submission) {
//         return (
//             <AssessmentLockedScreen
//                 type="unavailable"
//                 onBack={safeNavigateBack}
//             />
//         );
//     }

//     if (assessment?.status === 'upcoming' && !isAdminIntercept && !submission?.overrideUnlock) {
//         return (
//             <AssessmentLockedScreen
//                 type="upcoming"
//                 onBack={safeNavigateBack}
//             />
//         );
//     }

//     if (isScheduledLocked) {
//         return (
//             <AssessmentLockedScreen
//                 type="scheduled"
//                 assessment={assessment}
//                 timeToStart={timeToStart}
//                 getSecureNow={getSecureNow}
//                 generateCalendarLink={generateCalendarLink}
//                 onBack={safeNavigateBack}
//             />
//         );
//     }

//     if (isViolation) {
//         return (
//             <AssessmentViolationScreen
//                 assessment={assessment}
//                 submission={submission}
//                 onBack={safeNavigateBack}
//             />
//         );
//     }

//     if (isMissed) {
//         return (
//             <AssessmentLockedScreen
//                 type="missed"
//                 onBack={safeNavigateBack}
//             />
//         );
//     }

//     if (showGate) {
//         return (
//             <AssessmentGate
//                 assessment={assessment}
//                 submission={submission}
//                 learnerProfile={learnerProfile}
//                 isRemediation={isRemediation}
//                 needsRemediationGate={needsRemediationGate}
//                 isAppealUpheld={isAppealUpheld}
//                 willBeProctored={willBeProctored}
//                 isSummative={isSummative}
//                 passedFormative={passedFormative}
//                 hasOverride={hasOverride}
//                 isFullyCompliant={isFullyCompliant}
//                 pendingTopics={pendingTopics}
//                 saving={saving}
//                 isStarting={isStarting}
//                 startDeclarationChecked={startDeclarationChecked}
//                 coachingAckChecked={coachingAckChecked}
//                 onStart={handleStartAssessment}
//                 onBack={safeNavigateBack}
//                 setStartDeclarationChecked={setStartDeclarationChecked}
//                 setCoachingAckChecked={setCoachingAckChecked}
//                 toast={toast}
//             />
//         );
//     }

//     return (
//         <AssessmentPlayerContent
//             user={user}
//             assessment={assessment}
//             submission={submission}
//             answers={answers}
//             learnerProfile={learnerProfile}
//             learnerEnrollment={learnerEnrollment}
//             assessorProfile={assessorProfile}
//             moderatorProfile={moderatorProfile}
//             facilitatorProfile={facilitatorProfile}
//             employers={employers}
//             staff={staff}
//             moduleLogs={moduleLogs}
//             approvedLogs={approvedLogs}
//             logsLoading={logsLoading}
//             saving={saving}
//             setSaving={setSaving}
//             uploadProgress={uploadProgress}
//             setUploadProgress={setUploadProgress}
//             activeTabs={activeTabs}
//             setActiveTabs={setActiveTabs}
//             timeLeft={timeLeft}
//             isGloballyLocked={isGloballyLocked}
//             isAwaitingSignoff={isAwaitingSignoff}
//             isPracticalModule={isPracticalModule}
//             isWorkplaceModule={isWorkplaceModule}
//             isRemediation={isRemediation}
//             isAppealUpheld={isAppealUpheld}
//             isFacDone={isFacDone}
//             isAssDone={isAssDone}
//             isModDone={isModDone}
//             isSubmitted={isSubmitted}
//             isMissed={isMissed}
//             showGate={showGate}
//             showLeaveWarning={showLeaveWarning}
//             setShowLeaveWarning={setShowLeaveWarning}
//             showSubmitConfirm={showSubmitConfirm}
//             setShowSubmitConfirm={setShowSubmitConfirm}
//             showAppealModal={showAppealModal}
//             setShowAppealModal={setShowAppealModal}
//             declarationChecked={declarationChecked}
//             setDeclarationChecked={setDeclarationChecked}
//             isMobileMenuOpen={isMobileMenuOpen}
//             setIsMobileMenuOpen={setIsMobileMenuOpen}
//             willBeProctored={willBeProctored}
//             savedFacRole={savedFacRole}
//             grandTotalAwarded={grandTotalAwarded}
//             grandTotalMax={grandTotalMax}
//             grandTotalPct={grandTotalPct}
//             sectionTotals={sectionTotals}
//             outcome={outcome}
//             safeNavigateBack={safeNavigateBack}
//             handleAnswerChange={handleAnswerChange}
//             handleTaskAnswerChange={handleTaskAnswerChange}
//             handleNestedAnswerChange={handleNestedAnswerChange}
//             handleFileUpload={handleFileUpload}
//             triggerSubmitConfirm={triggerSubmitConfirm}
//             executeSubmit={executeSubmit}
//             executeAppeal={executeAppeal}
//             preventCopyPasteAndDrop={preventCopyPasteAndDrop}
//             getBlockGrading={getBlockGrading}
//             isBlockVerified={isBlockVerified}
//             getSecureNow={getSecureNow}
//             toast={toast}
//             codeSnapshots={codeSnapshots}
//             saveCodeSnapshot={saveCodeSnapshot}
//         />
//     );
// };

// export default AssessmentPlayer;


// // // src/pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer.tsx

// // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // import { useParams, useNavigate, useLocation } from 'react-router-dom';
// // import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot, runTransaction } from 'firebase/firestore';
// // import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, uploadString } from 'firebase/storage';
// // import { getFunctions, httpsCallable } from 'firebase/functions';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import { useToast } from '../../../components/common/Toast/Toast';
// // import './AssessmentPlayer.css';
// // import moment from 'moment';

// // import { AssessmentGate } from './AssessmentGate';
// // import { AssessmentLockedScreen } from './AssessmentLockedScreen';
// // import AssessmentPlayerContent from './AssessmentPlayerContent';
// // import { ArrowLeft, Info, ShieldAlert, Zap } from 'lucide-react';

// // const LoadingScreen: React.FC = () => (
// //     <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
// //         <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
// //     </div>
// // );

// // const AssessmentPlayer: React.FC = () => {
// //     const { assessmentId } = useParams<{ assessmentId: string }>();
// //     const navigate = useNavigate();
// //     const location = useLocation();

// //     const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
// //     const toast = useToast();

// //     const safeNavigateBack = () => {
// //         if (location.key === 'default') {
// //             navigate(user?.role === 'learner' ? '/learner/dashboard' : '/');
// //         } else {
// //             navigate(-1);
// //         }
// //     };

// //     const [loading, setLoading] = useState(true);
// //     const [saving, setSaving] = useState(false);
// //     const [isStarting, setIsStarting] = useState(false);

// //     const [assessment, setAssessment] = useState<any>(null);
// //     const [submission, setSubmission] = useState<any>(null);
// //     const [answers, setAnswers] = useState<Record<string, any>>({});
// //     const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
// //     const [codeSnapshots, setCodeSnapshots] = useState<Record<string, any>>({});
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
// //     const [approvedLogs, setApprovedLogs] = useState<any[]>([]);
// //     const [logsLoading, setLogsLoading] = useState<boolean>(false);

// //     const [timeLeft, setTimeLeft] = useState<number | null>(null);
// //     const [timeOffset, setTimeOffset] = useState<number>(0);
// //     const [timeToStart, setTimeToStart] = useState<number | null>(null);

// //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// //     const answersRef = useRef(answers);
// //     useEffect(() => { answersRef.current = answers; }, [answers]);

// //     const currentStatus = String(submission?.status || '').toLowerCase();
// //     const isMissed = currentStatus === 'missed';
// //     const isViolation = currentStatus === 'violation' || currentStatus === 'terminated';

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

// //     const isGloballyLocked = isSubmitted || isAwaitingSignoff || isMissed || isViolation;
// //     const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

// //     const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
// //         ? assessment.requiresInvigilation
// //         : !isPracticalModule;

// //     const willBeProctored = isInvigilationEnabled && !isGloballyLocked;

// //     const isSummative = submission?.type?.toLowerCase().includes('summative') || false;
// //     const hasOverride = submission?.facilitatorOverride === true;

// //     const pendingTopics = useMemo(() => {
// //         if (!submission || !moduleLogs) return [];
// //         return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
// //     }, [moduleLogs, submission]);

// //     const isFullyCompliant = pendingTopics.length === 0;

// //     const isBlockVerified = (blockId: string) => {
// //         const facGrade = submission?.grading?.facilitatorBreakdown?.[blockId];
// //         return facGrade?.isCorrect === true || facGrade?.obsDeclaration === true;
// //     };

// //     const getSecureNow = useCallback(() => Date.now() + timeOffset, [timeOffset]);

// //     const getAssessmentEndMs = useCallback(() => {
// //         if (!assessment) return null;
// //         const baseLimit = assessment.moduleInfo?.timeLimit || 0;
// //         if (baseLimit <= 0) return null;

// //         const extraTime = submission?.extraTimeGranted || 0;
// //         const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;

// //         if (assessment.isScheduled && assessment.scheduledDate && !submission?.overrideUnlock) {
// //             return moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
// //         }

// //         if (submission?.startedAt) {
// //             return new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
// //         }

// //         return null;
// //     }, [assessment, submission]);

// //     useEffect(() => {
// //         const fetchOffset = async () => {
// //             try {
// //                 const res = await fetch(`https://timeapi.io/api/Time/current/zone?timeZone=UTC&nocache=${Date.now()}`, {
// //                     cache: 'no-store',
// //                     headers: {
// //                         'Cache-Control': 'no-cache, no-store, must-revalidate',
// //                         'Pragma': 'no-cache'
// //                     }
// //                 });

// //                 if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
// //                 const data = await res.json();

// //                 const secureUTCTime = new Date(data.dateTime + 'Z').getTime();
// //                 const localTime = Date.now();
// //                 const calculatedOffset = secureUTCTime - localTime;

// //                 if (Math.abs(calculatedOffset) > 5 * 60 * 1000) {
// //                     setTimeOffset(0);
// //                 } else {
// //                     setTimeOffset(calculatedOffset);
// //                 }
// //             } catch (err) {
// //                 console.warn('[TIMER DEBUG] Time API unavailable. Using local device clock:', err);
// //                 setTimeOffset(0);
// //             }
// //         };

// //         fetchOffset();
// //     }, []);

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
// //                     setLoading(false);
// //                     return;
// //                 }
// //                 const assData = assSnap.data();
// //                 setAssessment(assData);

// //                 let userProfile: any = {};
// //                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
// //                 if (userDocSnap.exists()) {
// //                     userProfile = { id: userDocSnap.id, ...userDocSnap.data() };
// //                 }
// //                 setLearnerProfile(userProfile);

// //                 let targetLearnerId = user.uid;
// //                 let learnerCohortId: string | null = null;
// //                 let validEnrollmentId: string | null = null;

// //                 if (user?.role === 'learner') {
// //                     try {
// //                         const enrolQ = query(collection(db, 'enrollments'), where('authUid', '==', user.uid), where('status', '==', 'active'));
// //                         const enrolSnap = await getDocs(enrolQ);
// //                         if (!enrolSnap.empty) {
// //                             const enrolData = enrolSnap.docs[0].data();
// //                             validEnrollmentId = enrolSnap.docs[0].id;
// //                             targetLearnerId = enrolData.learnerId || enrolData.id || user.uid;
// //                             learnerCohortId = enrolData.cohortId;
// //                         }
// //                     } catch (e) {
// //                         console.warn("Enrollment lookup failed.", e);
// //                     }
// //                 }

// //                 let activeSub: any = null;
// //                 try {
// //                     const subQuery1 = query(collection(db, 'learner_submissions'), where('assessmentId', '==', assessmentId), where('authUid', '==', user.uid));
// //                     const subSnap1 = await getDocs(subQuery1);
// //                     if (!subSnap1.empty) {
// //                         activeSub = subSnap1.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
// //                     }
// //                 } catch (qErr) {
// //                     console.warn("Primary submission query failed.", qErr);
// //                 }

// //                 if (!activeSub && user?.role === 'learner') {
// //                     const fallbackCohortId = learnerCohortId || assData.cohortId || (assData.cohortIds && assData.cohortIds[0]) || 'unassigned';
// //                     const isLive = ['active', 'scheduled', 'upcoming', 'published'].includes(assData.status);
// //                     if (isLive) {
// //                         const sid = `${fallbackCohortId}_${targetLearnerId}_${assessmentId}`;
// //                         const newSub = {
// //                             learnerId: targetLearnerId,
// //                             enrollmentId: validEnrollmentId || "",
// //                             authUid: user.uid,
// //                             qualificationName: userProfile.qualification?.name || "",
// //                             assessmentId: assessmentId,
// //                             cohortId: fallbackCohortId,
// //                             title: assData.title,
// //                             type: assData.type || 'formative',
// //                             moduleType: assData.moduleType || 'knowledge',
// //                             status: assData.status === 'upcoming' ? 'upcoming' : 'not_started',
// //                             assignedAt: new Date().toISOString(),
// //                             marks: 0,
// //                             totalMarks: assData.totalMarks || 0,
// //                             moduleNumber: assData.moduleInfo?.moduleNumber || "",
// //                             timeLimit: assData.moduleInfo?.timeLimit || 0,
// //                             isScheduled: assData.isScheduled || assData.status === 'scheduled' || false,
// //                             scheduledDate: assData.scheduledDate || null,
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
// //                     if (activeSub.enrollmentId) {
// //                         const e = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId));
// //                         if (e.exists()) setLearnerEnrollment(e.data());
// //                     }
// //                     if (activeSub.grading?.gradedBy) {
// //                         const s = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
// //                         if (s.exists()) setAssessorProfile(s.data());
// //                     }
// //                     if (activeSub.moderation?.moderatedBy) {
// //                         const s = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
// //                         if (s.exists()) setModeratorProfile(s.data());
// //                     }
// //                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
// //                     if (facId) {
// //                         const s = await getDoc(doc(db, 'users', facId));
// //                         if (s.exists()) setFacilitatorProfile(s.data());
// //                     }
// //                 } else {
// //                     toast.error('Assessment unavailable. It may not be published yet.');
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

// //     // 🚀 REAL-TIME SUBMISSION LISTENER WITH ACCURATE DEEP COMPARISON
// //     useEffect(() => {
// //         if (!user?.uid || !assessmentId) return;

// //         const q = query(
// //             collection(db, 'learner_submissions'),
// //             where('assessmentId', '==', assessmentId),
// //             where('authUid', '==', user.uid)
// //         );

// //         const unsub = onSnapshot(q, (snap) => {
// //             if (!snap.empty) {
// //                 const activeSub: any = snap.docs
// //                     .map(d => ({ id: d.id, ...d.data() }))
// //                     .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

// //                 setSubmission((prev: any) => {
// //                     // Fast deep-check via JSON comparison to ensure ideUnlocks, status, or timestamps update instantly
// //                     if (!prev || JSON.stringify(prev) !== JSON.stringify(activeSub)) {
// //                         if (activeSub.status === 'not_started' && prev?.status === 'violation') {
// //                             setAnswers(activeSub.answers || {});
// //                         }
// //                         return activeSub;
// //                     }
// //                     return prev;
// //                 });
// //             }
// //         }, (err) => {
// //             console.error("Real-time submission listener error:", err);
// //         });

// //         return () => unsub();
// //     }, [user?.uid, assessmentId]);

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
// //                 where('authUid', '==', user.uid),
// //                 where('moduleNumber', '==', submission.moduleNumber),
// //                 where('status', '==', 'moderated'),
// //                 where('competency', '==', 'C')
// //             );
// //             const unsubForm = onSnapshot(formQ, (snap) => {
// //                 setPassedFormative(!snap.empty);
// //             });
// //             return () => { unsubLogs(); unsubForm(); };
// //         }
// //     }, [submission?.id, user?.uid, submission?.type, submission?.cohortId, submission?.moduleNumber]);

// //     useEffect(() => {
// //         if (assessment?.scheduledDate && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed && !isViolation) {
// //             const interval = setInterval(() => {
// //                 const startTime = moment(assessment.scheduledDate).valueOf();
// //                 const now = getSecureNow();
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
// //     }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, isViolation, getSecureNow]);

// //     const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed && !isViolation;

// //     useEffect(() => {
// //         if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock && !isViolation) {
// //             const interval = setInterval(() => {
// //                 const endMs = getAssessmentEndMs();
// //                 if (endMs && getSecureNow() >= endMs) {
// //                     updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: 'missed',
// //                         systemNote: `Auto-swept by frontend player: Learner failed to start within the allotted timeframe.`
// //                     }).catch(() => { });
// //                     setSubmission((prev: any) => ({ ...prev, status: 'missed' }));
// //                     clearInterval(interval);
// //                 }
// //             }, 10000);
// //             return () => clearInterval(interval);
// //         }
// //     }, [isNotStarted, assessment, submission, isViolation, getAssessmentEndMs, getSecureNow]);

// //     useEffect(() => {
// //         if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed || isViolation || currentStatus !== 'in_progress') return;

// //         const updateTimer = () => {
// //             const now = getSecureNow();
// //             const endMs = getAssessmentEndMs();
// //             if (endMs) {
// //                 setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
// //             }
// //         };

// //         updateTimer();
// //         const id = setInterval(updateTimer, 1000);
// //         return () => clearInterval(id);
// //     }, [isGloballyLocked, showGate, isPracticalModule, isMissed, isViolation, currentStatus, assessment, submission, getAssessmentEndMs, getSecureNow]);

// //     useEffect(() => {
// //         if (timeLeft !== null && timeLeft <= 0 && currentStatus === 'in_progress') {
// //             toast.error("Time is up! Auto-submitting.");
// //             setAnswers(latestAnswers => {
// //                 if (submission?.id) {
// //                     forceAutoSubmit(submission.id, latestAnswers);
// //                 }
// //                 return latestAnswers;
// //             });
// //         }
// //     }, [timeLeft, currentStatus, submission?.id]);

// //     useEffect(() => {
// //         const fetchApprovedLogs = async () => {
// //             if (!user?.uid || assessment?.moduleType !== 'workplace') {
// //                 setLogsLoading(false);
// //                 return;
// //             }
// //             try {
// //                 setLogsLoading(true);
// //                 const logsRef = collection(db, 'workplace_logs');
// //                 const q = query(logsRef, where('learnerId', '==', user.uid), where('moduleId', '==', assessment.id), where('status', '==', 'Approved'));
// //                 const snapshot = await getDocs(q);
// //                 const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// //                 setApprovedLogs(fetchedLogs);
// //             } catch (error) {
// //                 console.error('Error fetching approved logs:', error);
// //                 toast.error('Failed to sync verified workplace logs.');
// //             } finally {
// //                 setLogsLoading(false);
// //             }
// //         };
// //         fetchApprovedLogs();
// //     }, [user?.uid, assessment?.id, assessment?.moduleType]);

// //     const getBlockGrading = (blockId: string) => {
// //         const g = submission?.grading || {};
// //         const m = submission?.moderation || {};
// //         const mLayer = m.breakdown?.[blockId] || {};
// //         const aLayer = g.assessorBreakdown?.[blockId] || {};
// //         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
// //         const legacyLayer = g.breakdown?.[blockId] || {};

// //         let activeLayer = fLayer || legacyLayer || {};
// //         if (isAssDone || g.assessorBreakdown?.[blockId]) activeLayer = aLayer;
// //         if (isModDone || m.breakdown?.[blockId]) activeLayer = mLayer;

// //         return {
// //             score: activeLayer?.score,
// //             isCorrect: activeLayer?.isCorrect,
// //             facIsCorrect: fLayer?.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer?.isCorrect,
// //             assIsCorrect: aLayer?.isCorrect,
// //             modIsCorrect: mLayer?.isCorrect,
// //             feedback: activeLayer?.feedback || '',
// //             facFeedback: fLayer?.feedback || legacyLayer?.feedback || '',
// //             assFeedback: aLayer?.feedback || '',
// //             modFeedback: mLayer?.feedback || '',
// //             criteriaResults: activeLayer?.criteriaResults || fLayer?.criteriaResults || legacyLayer?.criteriaResults || [],
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
// //             } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
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
// //         if (isRemediation && !isGloballyLocked) return null;
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

// //     const handleStartAssessment = async () => {
// //         if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked) || isViolation) return;
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
// //                 const endMs = getAssessmentEndMs();
// //                 if (endMs) {
// //                     setTimeLeft(Math.max(0, Math.floor((endMs - getSecureNow()) / 1000)));
// //                 } else {
// //                     const extraTime = submission?.extraTimeGranted || 0;
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
// //         if (currentStatus !== 'in_progress') return;
// //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// //         setSaving(true);
// //         saveTimeoutRef.current = setTimeout(async () => {
// //             if (!submission?.id) return;
// //             try {
// //                 await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
// //             } catch {
// //                 toast.error('Auto-save failed.');
// //             } finally {
// //                 setSaving(false);
// //             }
// //         }, 1200);
// //     };

// //     const SNAPSHOT_INLINE_LIMIT = 200_000;
// //     const codeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// //     const saveCodeSnapshot = useCallback(async (blockId: string, snapshot: any, dependencies?: Record<string, string>, immediate?: boolean) => {
// //         if (currentStatus !== 'in_progress') {
// //             console.warn(`⚠️ [FIRESTORE SAVE BLOCKED] Assessment is in '${currentStatus}' status. Refusing write.`);
// //             return;
// //         }
// //         setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));

// //         const doWrite = async () => {
// //             if (!submission?.id || currentStatus !== 'in_progress') return;
// //             setSaving(true);
// //             try {
// //                 let fieldPayload: any;

// //                 if (typeof snapshot === 'string' && snapshot.length > SNAPSHOT_INLINE_LIMIT) {
// //                     console.log(`🔥 [FIRESTORE WRITE STARTED] Uploading large snapshot (>200KB) to Firebase Storage for block [${blockId}]...`);
// //                     const path = `code_snapshots/${submission.id}/${blockId}.json`;
// //                     await uploadString(fbStorageRef(getStorage(), path), snapshot);
// //                     fieldPayload = { storagePath: path, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
// //                 } else {
// //                     console.log(`🔥 [FIRESTORE WRITE STARTED] Updating Firestore inline snapshot for block [${blockId}]...`);
// //                     fieldPayload = { snapshot, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
// //                 }

// //                 await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                     [`answers.${blockId}`]: fieldPayload,
// //                     lastSavedAt: new Date().toISOString()
// //                 });

// //                 console.log(`✅ [FIRESTORE WRITE SUCCESS] Saved block [${blockId}] to Firestore at ${new Date().toLocaleTimeString()}!`);
// //                 setAnswers(prev => ({ ...prev, [blockId]: fieldPayload }));
// //             } catch (err) {
// //                 console.error(`❌ [FIRESTORE WRITE ERROR] Failed to save code snapshot for block [${blockId}]:`, err);
// //                 toast.error('Failed to save your code changes.');
// //                 throw err;
// //             } finally {
// //                 setSaving(false);
// //             }
// //         };

// //         if (immediate) {
// //             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
// //             await doWrite();
// //         } else {
// //             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
// //             codeSaveTimeoutRef.current = setTimeout(() => { doWrite(); }, 1200);
// //         }
// //     }, [submission?.id, currentStatus, toast]);

// //     const handleAnswerChange = (blockId: string, value: any) => {
// //         if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
// //         setAnswers(p => { const n = { ...p, [blockId]: value }; triggerAutoSave(n); return n; });
// //     };
// //     const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
// //         if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
// //         setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; triggerAutoSave(n); return n; });
// //     };
// //     const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
// //         if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
// //         setAnswers(p => {
// //             const blockAns = p[blockId] || {};
// //             const raw = blockAns[nestedKey];
// //             const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
// //             const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
// //             triggerAutoSave(n); return n;
// //         });
// //     };

// //     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
// //         if (!file || isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
// //         const pKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
// //         setUploadProgress(p => ({ ...p, [pKey]: 0 }));
// //         setSaving(true);
// //         toast.info(`Uploading ${file.name}…`);
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
// //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// //                     setSaving(false);
// //                 }
// //             );
// //         } catch (err: any) {
// //             toast.error(`Upload failed: ${err.message}`);
// //             setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// //             setSaving(false);
// //         }
// //     };

// //     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
// //         const st = String(submission?.status || '').toLowerCase();
// //         if (st !== 'in_progress') {
// //             console.warn(`[AUTO-SUBMIT BLOCKED] Cannot auto-submit assessment in '${st}' status.`);
// //             return;
// //         }

// //         setSaving(true);
// //         const t = new Date(getSecureNow()).toISOString();
// //         try {
// //             await runTransaction(db, async (transaction) => {
// //                 const subRef = doc(db, 'learner_submissions', subId);
// //                 const subSnap = await transaction.get(subRef);
// //                 if (!subSnap.exists()) return;

// //                 const currentStatus = String(subSnap.data().status || '').toLowerCase();
// //                 if (['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed', 'missed', 'violation', 'terminated'].includes(currentStatus)) {
// //                     console.warn("[AUTO SUBMIT] Aborted: Assessment is already in a terminal or violated state.");
// //                     return;
// //                 }

// //                 transaction.update(subRef, {
// //                     answers: currentAnswers,
// //                     status: 'submitted',
// //                     submittedAt: t,
// //                     autoSubmitted: true,
// //                     learnerDeclaration: {
// //                         agreed: true,
// //                         timestamp: t,
// //                         learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// //                         learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// //                         signatureUrl: learnerProfile?.signatureUrl || null
// //                     },
// //                 });
// //             });
// //             toast.success("Time's up! Auto-submitted.");
// //         } catch (e) {
// //             console.error("Auto-submit transaction failed:", e);
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     const validateChecklistEvidence = () => {
// //         try {
// //             for (const block of assessment?.blocks || []) {
// //                 if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
// //                     for (let i = 0; i < (block.criteria?.length || 0); i++) {
// //                         const raw = answers?.[block.id]?.[`evidence_${i}`];
// //                         const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
// //                         const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
// //                         const has = !!(textClean || ev?.url?.trim() || ev?.code?.trim() || ev?.uploadUrl?.trim());

// //                         if (!has) {
// //                             return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title || 'Checklist'}".` };
// //                         }
// //                     }
// //                 }
// //                 if (block.type === 'qcto_workplace') {
// //                     const bAns = answers?.[block.id] || {};
// //                     for (const wa of block.workActivities || []) {
// //                         if (!bAns[`wa_${wa.id}_declaration`]) {
// //                             return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
// //                         }
// //                         for (const se of wa.evidenceItems || []) {
// //                             const ev = bAns[`se_${se.id}`] || {};
// //                             const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
// //                             const has = !!(textClean || ev?.url?.trim() || ev?.uploadUrl?.trim());
// //                             if (!has) {
// //                                 return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
// //                             }
// //                         }
// //                     }
// //                 }
// //             }
// //             return { valid: true };
// //         } catch (err) {
// //             return { valid: true };
// //         }
// //     };

// //     const triggerSubmitConfirm = () => {
// //         if (isViolation) return;
// //         if (!declarationChecked) {
// //             toast.warning('Please check the "Learner Final Declaration" box before submitting.');
// //             return;
// //         }

// //         if (Object.keys(uploadProgress).length > 0) {
// //             toast.warning("Files are currently uploading. Please wait until uploads complete.");
// //             return;
// //         }

// //         if (assessment?.moduleType === 'workplace') {
// //             const workplaceBlocks = assessment.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];
// //             for (const block of workplaceBlocks) {
// //                 for (const wa of block.workActivities || []) {
// //                     const hasApprovedLog = (approvedLogs || []).some(log => log.workActivityId === wa.id);
// //                     if (!hasApprovedLog) {
// //                         toast.error(`Missing approved log for Work Activity: ${wa.code}. You cannot submit until your mentor approves this task.`);
// //                         return;
// //                     }
// //                 }
// //             }
// //         }

// //         if (isAwaitingSignoff || isPracticalModule) {
// //             const chk = validateChecklistEvidence() as any;
// //             if (!chk.valid) {
// //                 toast.warning(chk.message);
// //                 return;
// //             }
// //         }

// //         setShowSubmitConfirm(true);
// //     };

// //     const executeSubmit = async () => {
// //         if (isViolation) return;
// //         setShowSubmitConfirm(false);
// //         setSaving(true);

// //         const activeVMs = (window as any).__ACTIVE_VMS || {};
// //         for (const blockId of Object.keys(activeVMs)) {
// //             try {
// //                 const vm = activeVMs[blockId];
// //                 const snapshot = await vm.getFsSnapshot();

// //                 answers[blockId] = {
// //                     snapshot,
// //                     lastSavedAt: new Date().toISOString()
// //                 };
// //             } catch (err) {
// //                 console.error(`Failed to capture snapshot for sandbox ${blockId}:`, err);
// //             }
// //         }

// //         const t = new Date(getSecureNow()).toISOString();
// //         const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

// //         try {
// //             await runTransaction(db, async (transaction) => {
// //                 const subRef = doc(db, 'learner_submissions', submission.id);
// //                 const subSnap = await transaction.get(subRef);
// //                 if (!subSnap.exists()) throw new Error("Submission not found");

// //                 const currentStatus = String(subSnap.data().status || '').toLowerCase();
// //                 if (['violation', 'terminated', 'missed'].includes(currentStatus)) {
// //                     throw new Error("Assessment is locked due to a security violation.");
// //                 }

// //                 transaction.update(subRef, {
// //                     answers,
// //                     status: nextStatus,
// //                     submittedAt: t,
// //                     learnerDeclaration: {
// //                         agreed: true,
// //                         timestamp: t,
// //                         learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// //                         learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// //                         signatureUrl: learnerProfile?.signatureUrl || null
// //                     }
// //                 });
// //             });
// //             toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
// //             setTimeout(() => window.scrollTo(0, 0), 1000);
// //         } catch (error: any) {
// //             console.error("❌ Submission Error:", error);
// //             toast.error(`Failed to submit: ${error.message}`);
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     const executeAppeal = async (reason: string) => {
// //         setShowAppealModal(false);
// //         setSaving(true);
// //         try {
// //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                 status: 'appealed',
// //                 appeal: { reason, date: new Date().toISOString(), status: 'pending' },
// //                 lastStaffEditAt: new Date().toISOString()
// //             });
// //             toast.success("Formal appeal lodged successfully.");
// //             setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
// //         } catch {
// //             toast.error("Failed to lodge appeal.");
// //         } finally { setSaving(false); }
// //     };

// //     const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride: boolean = false) => {
// //         if (!isGloballyLocked && !isPracticalModule && !allowOverride) {
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

// //     if (loading) return <LoadingScreen />;

// //     if (isAdminIntercept) {
// //         return (
// //             <AssessmentLockedScreen
// //                 type="admin"
// //                 assessmentId={assessmentId}
// //                 onBack={safeNavigateBack}
// //                 navigate={navigate}
// //             />
// //         );
// //     }

// //     if (!assessment || !submission) {
// //         return (
// //             <AssessmentLockedScreen
// //                 type="unavailable"
// //                 onBack={safeNavigateBack}
// //             />
// //         );
// //     }

// //     if (assessment?.status === 'upcoming' && !isAdminIntercept && !submission?.overrideUnlock) {
// //         return (
// //             <AssessmentLockedScreen
// //                 type="upcoming"
// //                 onBack={safeNavigateBack}
// //             />
// //         );
// //     }

// //     if (isScheduledLocked) {
// //         return (
// //             <AssessmentLockedScreen
// //                 type="scheduled"
// //                 assessment={assessment}
// //                 timeToStart={timeToStart}
// //                 getSecureNow={getSecureNow}
// //                 generateCalendarLink={generateCalendarLink}
// //                 onBack={safeNavigateBack}
// //             />
// //         );
// //     }

// //     if (isViolation) {
// //         return (
// //             <AssessmentViolationScreen
// //                 assessment={assessment}
// //                 submission={submission}
// //                 onBack={safeNavigateBack}
// //             />
// //         );
// //     }

// //     if (isMissed) {
// //         return (
// //             <AssessmentLockedScreen
// //                 type="missed"
// //                 onBack={safeNavigateBack}
// //             />
// //         );
// //     }

// //     if (showGate) {
// //         return (
// //             <AssessmentGate
// //                 assessment={assessment}
// //                 submission={submission}
// //                 learnerProfile={learnerProfile}
// //                 isRemediation={isRemediation}
// //                 needsRemediationGate={needsRemediationGate}
// //                 isAppealUpheld={isAppealUpheld}
// //                 willBeProctored={willBeProctored}
// //                 isSummative={isSummative}
// //                 passedFormative={passedFormative}
// //                 hasOverride={hasOverride}
// //                 isFullyCompliant={isFullyCompliant}
// //                 pendingTopics={pendingTopics}
// //                 saving={saving}
// //                 isStarting={isStarting}
// //                 startDeclarationChecked={startDeclarationChecked}
// //                 coachingAckChecked={coachingAckChecked}
// //                 onStart={handleStartAssessment}
// //                 onBack={safeNavigateBack}
// //                 setStartDeclarationChecked={setStartDeclarationChecked}
// //                 setCoachingAckChecked={setCoachingAckChecked}
// //                 toast={toast}
// //             />
// //         );
// //     }

// //     return (
// //         <AssessmentPlayerContent
// //             user={user}
// //             assessment={assessment}
// //             submission={submission}
// //             answers={answers}
// //             learnerProfile={learnerProfile}
// //             learnerEnrollment={learnerEnrollment}
// //             assessorProfile={assessorProfile}
// //             moderatorProfile={moderatorProfile}
// //             facilitatorProfile={facilitatorProfile}
// //             employers={employers}
// //             staff={staff}
// //             moduleLogs={moduleLogs}
// //             approvedLogs={approvedLogs}
// //             logsLoading={logsLoading}
// //             saving={saving}
// //             setSaving={setSaving}
// //             uploadProgress={uploadProgress}
// //             setUploadProgress={setUploadProgress}
// //             activeTabs={activeTabs}
// //             setActiveTabs={setActiveTabs}
// //             timeLeft={timeLeft}
// //             isGloballyLocked={isGloballyLocked}
// //             isAwaitingSignoff={isAwaitingSignoff}
// //             isPracticalModule={isPracticalModule}
// //             isWorkplaceModule={isWorkplaceModule}
// //             isRemediation={isRemediation}
// //             isAppealUpheld={isAppealUpheld}
// //             isFacDone={isFacDone}
// //             isAssDone={isAssDone}
// //             isModDone={isModDone}
// //             isSubmitted={isSubmitted}
// //             isMissed={isMissed}
// //             showGate={showGate}
// //             showLeaveWarning={showLeaveWarning}
// //             setShowLeaveWarning={setShowLeaveWarning}
// //             showSubmitConfirm={showSubmitConfirm}
// //             setShowSubmitConfirm={setShowSubmitConfirm}
// //             showAppealModal={showAppealModal}
// //             setShowAppealModal={setShowAppealModal}
// //             declarationChecked={declarationChecked}
// //             setDeclarationChecked={setDeclarationChecked}
// //             isMobileMenuOpen={isMobileMenuOpen}
// //             setIsMobileMenuOpen={setIsMobileMenuOpen}
// //             willBeProctored={willBeProctored}
// //             savedFacRole={savedFacRole}
// //             grandTotalAwarded={grandTotalAwarded}
// //             grandTotalMax={grandTotalMax}
// //             grandTotalPct={grandTotalPct}
// //             sectionTotals={sectionTotals}
// //             outcome={outcome}
// //             safeNavigateBack={safeNavigateBack}
// //             handleAnswerChange={handleAnswerChange}
// //             handleTaskAnswerChange={handleTaskAnswerChange}
// //             handleNestedAnswerChange={handleNestedAnswerChange}
// //             handleFileUpload={handleFileUpload}
// //             triggerSubmitConfirm={triggerSubmitConfirm}
// //             executeSubmit={executeSubmit}
// //             executeAppeal={executeAppeal}
// //             preventCopyPasteAndDrop={preventCopyPasteAndDrop}
// //             getBlockGrading={getBlockGrading}
// //             isBlockVerified={isBlockVerified}
// //             getSecureNow={getSecureNow}
// //             toast={toast}
// //             codeSnapshots={codeSnapshots}
// //             saveCodeSnapshot={saveCodeSnapshot}
// //         />
// //     );
// // };

// // export default AssessmentPlayer;


// // // // src/components/views/AssessmentPlayer/AssessmentPlayer.tsx

// // // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // // import { useParams, useNavigate, useLocation } from 'react-router-dom';
// // // import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot, runTransaction } from 'firebase/firestore';
// // // import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, uploadString } from 'firebase/storage';
// // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // import { db } from '../../../lib/firebase';
// // // import { useStore } from '../../../store/useStore';
// // // import { useToast } from '../../../components/common/Toast/Toast';
// // // import './AssessmentPlayer.css';
// // // import moment from 'moment';

// // // import { AssessmentGate } from './AssessmentGate';
// // // import { AssessmentLockedScreen } from './AssessmentLockedScreen';
// // // import AssessmentPlayerContent from './AssessmentPlayerContent';
// // // import { ShieldAlert, ArrowLeft, Zap } from 'lucide-react';

// // // const LoadingScreen: React.FC = () => (
// // //     <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
// // //         <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
// // //     </div>
// // // );


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

    // 🚀 MULTI-LAYER FALLBACK RESOLVER TO PREVENT 0 INCIDENTS DISPLAY
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



// // // const AssessmentViolationScreen: React.FC<{
// // //     assessment: any;
// // //     submission: any;
// // //     onBack: () => void;
// // // }> = ({ assessment, submission, onBack }) => {
// // //     const history: any[] = submission?.violationHistory || [];
// // //     const terminationReason = submission?.systemNote || submission?.latestWarning || "Proctoring Security Breach";

// // //     return (
// // //         <div className="ap-fullscreen" style={{ position: 'fixed', inset: 0, zIndex: 999999, background: '#0f172a', overflowY: 'auto', padding: '2rem 1rem' }}>
// // //             <div style={{ maxWidth: '720px', margin: '2rem auto', background: '#ffffff', borderRadius: '12px', border: '2px solid #ef4444', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.25)' }}>
// // //                 <div style={{ background: '#7f1d1d', padding: '1.5rem', color: '#ffffff', borderBottom: '3px solid #ef4444' }}>
// // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
// // //                         <div style={{ background: '#ef4444', padding: '8px', borderRadius: '8px', display: 'flex' }}>
// // //                             <ShieldAlert size={28} color="#ffffff" />
// // //                         </div>
// // //                         <div>
// // //                             <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fca5a5' }}>
// // //                                 Academic Integrity Violation
// // //                             </span>
// // //                             <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 'bold', color: '#ffffff', fontFamily: 'var(--font-heading, sans-serif)' }}>
// // //                                 Assessment Terminated &amp; Locked
// // //                             </h1>
// // //                         </div>
// // //                     </div>
// // //                 </div>

// // //                 <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
// // //                     <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.25rem', borderRadius: '8px' }}>
// // //                         <h3 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: '#991b1b', textTransform: 'uppercase', fontWeight: 'bold' }}>
// // //                             {assessment?.title || 'Proctored Assessment'}
// // //                         </h3>
// // //                         <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#b91c1c' }}>
// // //                             <strong>Status:</strong> Security Violation Flagged &bull; Attempt #{submission?.attemptNumber || 1}
// // //                         </p>
// // //                         <div style={{ background: '#ffffff', border: '1px solid #fca5a5', padding: '10px 12px', borderRadius: '6px' }}>
// // //                             <span style={{ fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#991b1b', display: 'block', marginBottom: '2px' }}>
// // //                                 Primary Termination Cause:
// // //                             </span>
// // //                             <p style={{ margin: 0, fontSize: '0.88rem', color: '#7f1d1d', fontWeight: 'bold', fontStyle: 'italic' }}>
// // //                                 "{terminationReason}"
// // //                             </p>
// // //                         </div>
// // //                     </div>

// // //                     <div>
// // //                         <h3 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                             <Zap size={16} color="#ef4444" /> Recorded Breach Charges ({history.length} Incident{history.length !== 1 ? 's' : ''})
// // //                         </h3>
// // //                         {history.length === 0 ? (
// // //                             <div style={{ padding: '1rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
// // //                                 Security breach was flagged and logged directly to the Invigilator Dashboard.
// // //                             </div>
// // //                         ) : (
// // //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
// // //                                 {history.map((item: any, idx: number) => (
// // //                                     <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '4px solid #ef4444', padding: '10px 12px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
// // //                                         <div>
// // //                                             <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#ef4444', textTransform: 'uppercase' }}>
// // //                                                 Incident #{idx + 1}
// // //                                             </span>
// // //                                             <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', fontWeight: '600', color: '#1e293b' }}>
// // //                                                 {item.reason}
// // //                                             </p>
// // //                                         </div>
// // //                                         <span style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>
// // //                                             {item.timestamp ? moment(item.timestamp).format('HH:mm:ss') : ''}
// // //                                         </span>
// // //                                     </div>
// // //                                 ))}
// // //                             </div>
// // //                         )}
// // //                     </div>

// // //                     <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '1rem', borderRadius: '8px', fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
// // //                         <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px' }}>
// // //                             What happens next?
// // //                         </strong>
// // //                         Webcam and screen capture snapshots recorded during this session have been saved to the Invigilator Dashboard. Your Assessor and Facilitator will review the incident logs.
// // //                     </div>

// // //                     <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
// // //                         <button type="button" onClick={onBack} className="ap-btn" style={{ background: '#0f172a', color: '#ffffff', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
// // //                             <ArrowLeft size={16} /> Return to Portfolio
// // //                         </button>
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // const AssessmentPlayer: React.FC = () => {
// // //     const { assessmentId } = useParams<{ assessmentId: string }>();
// // //     const navigate = useNavigate();
// // //     const location = useLocation();

// // //     const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
// // //     const toast = useToast();

// // //     const safeNavigateBack = () => {
// // //         if (location.key === 'default') {
// // //             navigate(user?.role === 'learner' ? '/learner/dashboard' : '/');
// // //         } else {
// // //             navigate(-1);
// // //         }
// // //     };

// // //     const [loading, setLoading] = useState(true);
// // //     const [saving, setSaving] = useState(false);
// // //     const [isStarting, setIsStarting] = useState(false);

// // //     const [assessment, setAssessment] = useState<any>(null);
// // //     const [submission, setSubmission] = useState<any>(null);
// // //     const [answers, setAnswers] = useState<Record<string, any>>({});
// // //     const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
// // //     const [codeSnapshots, setCodeSnapshots] = useState<Record<string, any>>({});
// // //     const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
// // //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// // //     const [learnerEnrollment, setLearnerEnrollment] = useState<any>(null);
// // //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// // //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);
// // //     const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);
// // //     const [declarationChecked, setDeclarationChecked] = useState(false);
// // //     const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
// // //     const [coachingAckChecked, setCoachingAckChecked] = useState(false);
// // //     const [isAdminIntercept, setIsAdminIntercept] = useState(false);
// // //     const [showLeaveWarning, setShowLeaveWarning] = useState(false);
// // //     const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
// // //     const [showAppealModal, setShowAppealModal] = useState(false);
// // //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

// // //     const [moduleLogs, setModuleLogs] = useState<any[]>([]);
// // //     const [passedFormative, setPassedFormative] = useState(false);
// // //     const [approvedLogs, setApprovedLogs] = useState<any[]>([]);
// // //     const [logsLoading, setLogsLoading] = useState<boolean>(false);

// // //     const [timeLeft, setTimeLeft] = useState<number | null>(null);
// // //     const [timeOffset, setTimeOffset] = useState<number>(0);
// // //     const [timeToStart, setTimeToStart] = useState<number | null>(null);

// // //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// // //     const answersRef = useRef(answers);
// // //     useEffect(() => { answersRef.current = answers; }, [answers]);

// // //     const currentStatus = String(submission?.status || '').toLowerCase();
// // //     const isMissed = currentStatus === 'missed';
// // //     const isViolation = currentStatus === 'violation' || currentStatus === 'terminated';

// // //     const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
// // //     const isAppealUpheld = submission?.appeal?.status === 'upheld';
// // //     const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// // //     const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// // //     const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
// // //     const isModDone = ['moderated', 'appealed'].includes(currentStatus);
// // //     const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
// // //     const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
// // //     const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
// // //     const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;
// // //     const isRemediation = (submission?.attemptNumber || 1) > 1;
// // //     const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged && !isAppealUpheld;
// // //     const isNotStarted = currentStatus === 'not_started';
// // //     const showGate = isNotStarted || needsRemediationGate;

// // //     const isGloballyLocked = isSubmitted || isAwaitingSignoff || isMissed || isViolation;
// // //     const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

// // //     const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
// // //         ? assessment.requiresInvigilation
// // //         : !isPracticalModule;

// // //     const willBeProctored = isInvigilationEnabled && !isGloballyLocked;

// // //     const isSummative = submission?.type?.toLowerCase().includes('summative') || false;
// // //     const hasOverride = submission?.facilitatorOverride === true;

// // //     const pendingTopics = useMemo(() => {
// // //         if (!submission || !moduleLogs) return [];
// // //         return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
// // //     }, [moduleLogs, submission]);

// // //     const isFullyCompliant = pendingTopics.length === 0;

// // //     const isBlockVerified = (blockId: string) => {
// // //         const facGrade = submission?.grading?.facilitatorBreakdown?.[blockId];
// // //         return facGrade?.isCorrect === true || facGrade?.obsDeclaration === true;
// // //     };

// // //     const getSecureNow = useCallback(() => Date.now() + timeOffset, [timeOffset]);

// // //     const getAssessmentEndMs = useCallback(() => {
// // //         if (!assessment) return null;
// // //         const baseLimit = assessment.moduleInfo?.timeLimit || 0;
// // //         if (baseLimit <= 0) return null;

// // //         const extraTime = submission?.extraTimeGranted || 0;
// // //         const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;

// // //         if (assessment.isScheduled && assessment.scheduledDate && !submission?.overrideUnlock) {
// // //             return moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
// // //         }

// // //         if (submission?.startedAt) {
// // //             return new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
// // //         }

// // //         return null;
// // //     }, [assessment, submission]);

// // //     useEffect(() => {
// // //         const fetchOffset = async () => {
// // //             try {
// // //                 const res = await fetch(`https://timeapi.io/api/Time/current/zone?timeZone=UTC&nocache=${Date.now()}`, {
// // //                     cache: 'no-store',
// // //                     headers: {
// // //                         'Cache-Control': 'no-cache, no-store, must-revalidate',
// // //                         'Pragma': 'no-cache'
// // //                     }
// // //                 });

// // //                 if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
// // //                 const data = await res.json();

// // //                 const secureUTCTime = new Date(data.dateTime + 'Z').getTime();
// // //                 const localTime = Date.now();
// // //                 const calculatedOffset = secureUTCTime - localTime;

// // //                 if (Math.abs(calculatedOffset) > 5 * 60 * 1000) {
// // //                     setTimeOffset(0);
// // //                 } else {
// // //                     setTimeOffset(calculatedOffset);
// // //                 }
// // //             } catch (err) {
// // //                 console.warn('[TIMER DEBUG] Time API unavailable. Using local device clock:', err);
// // //                 setTimeOffset(0);
// // //             }
// // //         };

// // //         fetchOffset();
// // //     }, []);

// // //     useEffect(() => {
// // //         if (employers.length === 0) fetchEmployers();
// // //         if (staff.length === 0) fetchStaff();

// // //         const load = async () => {
// // //             if (!user?.uid || !assessmentId) return;

// // //             if (user.role && user.role !== 'learner') {
// // //                 setIsAdminIntercept(true);
// // //                 setLoading(false);
// // //                 return;
// // //             }

// // //             try {
// // //                 const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
// // //                 if (!assSnap.exists()) {
// // //                     toast.error('Assessment template not found.');
// // //                     setLoading(false);
// // //                     return;
// // //                 }
// // //                 const assData = assSnap.data();
// // //                 setAssessment(assData);

// // //                 let userProfile: any = {};
// // //                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
// // //                 if (userDocSnap.exists()) {
// // //                     userProfile = { id: userDocSnap.id, ...userDocSnap.data() };
// // //                 }
// // //                 setLearnerProfile(userProfile);

// // //                 let targetLearnerId = user.uid;
// // //                 let learnerCohortId: string | null = null;
// // //                 let validEnrollmentId: string | null = null;

// // //                 if (user?.role === 'learner') {
// // //                     try {
// // //                         const enrolQ = query(collection(db, 'enrollments'), where('authUid', '==', user.uid), where('status', '==', 'active'));
// // //                         const enrolSnap = await getDocs(enrolQ);
// // //                         if (!enrolSnap.empty) {
// // //                             const enrolData = enrolSnap.docs[0].data();
// // //                             validEnrollmentId = enrolSnap.docs[0].id;
// // //                             targetLearnerId = enrolData.learnerId || enrolData.id || user.uid;
// // //                             learnerCohortId = enrolData.cohortId;
// // //                         }
// // //                     } catch (e) {
// // //                         console.warn("Enrollment lookup failed.", e);
// // //                     }
// // //                 }

// // //                 let activeSub: any = null;
// // //                 try {
// // //                     const subQuery1 = query(collection(db, 'learner_submissions'), where('assessmentId', '==', assessmentId), where('authUid', '==', user.uid));
// // //                     const subSnap1 = await getDocs(subQuery1);
// // //                     if (!subSnap1.empty) {
// // //                         activeSub = subSnap1.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
// // //                     }
// // //                 } catch (qErr) {
// // //                     console.warn("Primary submission query failed.", qErr);
// // //                 }

// // //                 if (!activeSub && user?.role === 'learner') {
// // //                     const fallbackCohortId = learnerCohortId || assData.cohortId || (assData.cohortIds && assData.cohortIds[0]) || 'unassigned';
// // //                     const isLive = ['active', 'scheduled', 'upcoming', 'published'].includes(assData.status);
// // //                     if (isLive) {
// // //                         const sid = `${fallbackCohortId}_${targetLearnerId}_${assessmentId}`;
// // //                         const newSub = {
// // //                             learnerId: targetLearnerId,
// // //                             enrollmentId: validEnrollmentId || "",
// // //                             authUid: user.uid,
// // //                             qualificationName: userProfile.qualification?.name || "",
// // //                             assessmentId: assessmentId,
// // //                             cohortId: fallbackCohortId,
// // //                             title: assData.title,
// // //                             type: assData.type || 'formative',
// // //                             moduleType: assData.moduleType || 'knowledge',
// // //                             status: assData.status === 'upcoming' ? 'upcoming' : 'not_started',
// // //                             assignedAt: new Date().toISOString(),
// // //                             marks: 0,
// // //                             totalMarks: assData.totalMarks || 0,
// // //                             moduleNumber: assData.moduleInfo?.moduleNumber || "",
// // //                             timeLimit: assData.moduleInfo?.timeLimit || 0,
// // //                             isScheduled: assData.isScheduled || assData.status === 'scheduled' || false,
// // //                             scheduledDate: assData.scheduledDate || null,
// // //                             createdAt: new Date().toISOString(),
// // //                             createdBy: "System_Player_AutoHydration"
// // //                         };
// // //                         await setDoc(doc(db, "learner_submissions", sid), newSub);
// // //                         activeSub = { id: sid, ...newSub };
// // //                     }
// // //                 }

// // //                 if (activeSub) {
// // //                     setSubmission(activeSub);
// // //                     setAnswers(activeSub.answers || {});
// // //                     if (activeSub.enrollmentId) {
// // //                         const e = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId));
// // //                         if (e.exists()) setLearnerEnrollment(e.data());
// // //                     }
// // //                     if (activeSub.grading?.gradedBy) {
// // //                         const s = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
// // //                         if (s.exists()) setAssessorProfile(s.data());
// // //                     }
// // //                     if (activeSub.moderation?.moderatedBy) {
// // //                         const s = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
// // //                         if (s.exists()) setModeratorProfile(s.data());
// // //                     }
// // //                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
// // //                     if (facId) {
// // //                         const s = await getDoc(doc(db, 'users', facId));
// // //                         if (s.exists()) setFacilitatorProfile(s.data());
// // //                     }
// // //                 } else {
// // //                     toast.error('Assessment unavailable. It may not be published yet.');
// // //                 }
// // //             } catch (err) {
// // //                 console.error("Fatal error loading assessment data:", err);
// // //                 toast.error('Failed to load assessment data.');
// // //             } finally {
// // //                 setLoading(false);
// // //             }
// // //         };

// // //         if (timeOffset !== null) load();
// // //     }, [assessmentId, user?.uid, timeOffset]);

// // //     // 🚀 INSTANT REAL-TIME SUBMISSION LISTENER (HIGHLY SENSITIVE TO STAFF UNLOCKS & OVERRIDES)
// // //     useEffect(() => {
// // //         if (!user?.uid || !assessmentId) return;

// // //         const q = query(
// // //             collection(db, 'learner_submissions'),
// // //             where('assessmentId', '==', assessmentId),
// // //             where('authUid', '==', user.uid)
// // //         );

// // //         const unsub = onSnapshot(q, (snap) => {
// // //             if (!snap.empty) {
// // //                 const activeSub: any = snap.docs
// // //                     .map(d => ({ id: d.id, ...d.data() }))
// // //                     .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

// // //                 setSubmission((prev: any) => {
// // //                     if (
// // //                         !prev ||
// // //                         prev.id !== activeSub.id ||
// // //                         prev.status !== activeSub.status ||
// // //                         prev.overrideUnlock !== activeSub.overrideUnlock ||
// // //                         prev.extraTimeGranted !== activeSub.extraTimeGranted ||
// // //                         prev.lastStaffEditAt !== activeSub.lastStaffEditAt ||
// // //                         prev.updatedAt !== activeSub.updatedAt
// // //                     ) {
// // //                         if (activeSub.status === 'not_started' && prev?.status === 'violation') {
// // //                             setAnswers(activeSub.answers || {});
// // //                         }
// // //                         return activeSub;
// // //                     }
// // //                     return prev;
// // //                 });
// // //             }
// // //         }, (err) => {
// // //             console.error("Real-time submission listener error:", err);
// // //         });

// // //         return () => unsub();
// // //     }, [user?.uid, assessmentId]);

// // //     useEffect(() => {
// // //         if (!submission || !user?.uid) return;
// // //         const _isSummative = submission.type?.toLowerCase().includes('summative');
// // //         if (_isSummative) {
// // //             const logsQ = query(
// // //                 collection(db, 'curriculum_logs'),
// // //                 where('cohortId', '==', submission.cohortId),
// // //                 where('moduleCode', '==', submission.moduleNumber)
// // //             );
// // //             const unsubLogs = onSnapshot(logsQ, (snap) => {
// // //                 setModuleLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // //             });
// // //             const formQ = query(
// // //                 collection(db, 'learner_submissions'),
// // //                 where('authUid', '==', user.uid),
// // //                 where('moduleNumber', '==', submission.moduleNumber),
// // //                 where('status', '==', 'moderated'),
// // //                 where('competency', '==', 'C')
// // //             );
// // //             const unsubForm = onSnapshot(formQ, (snap) => {
// // //                 setPassedFormative(!snap.empty);
// // //             });
// // //             return () => { unsubLogs(); unsubForm(); };
// // //         }
// // //     }, [submission?.id, user?.uid, submission?.type, submission?.cohortId, submission?.moduleNumber]);

// // //     useEffect(() => {
// // //         if (assessment?.scheduledDate && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed && !isViolation) {
// // //             const interval = setInterval(() => {
// // //                 const startTime = moment(assessment.scheduledDate).valueOf();
// // //                 const now = getSecureNow();
// // //                 const difference = startTime - now;
// // //                 if (difference <= 0) {
// // //                     setTimeToStart(0);
// // //                     clearInterval(interval);
// // //                 } else {
// // //                     setTimeToStart(difference);
// // //                 }
// // //             }, 1000);
// // //             return () => clearInterval(interval);
// // //         }
// // //     }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, isViolation, getSecureNow]);

// // //     const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed && !isViolation;

// // //     useEffect(() => {
// // //         if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock && !isViolation) {
// // //             const interval = setInterval(() => {
// // //                 const endMs = getAssessmentEndMs();
// // //                 if (endMs && getSecureNow() >= endMs) {
// // //                     updateDoc(doc(db, 'learner_submissions', submission.id), {
// // //                         status: 'missed',
// // //                         systemNote: `Auto-swept by frontend player: Learner failed to start within the allotted timeframe.`
// // //                     }).catch(() => { });
// // //                     setSubmission((prev: any) => ({ ...prev, status: 'missed' }));
// // //                     clearInterval(interval);
// // //                 }
// // //             }, 10000);
// // //             return () => clearInterval(interval);
// // //         }
// // //     }, [isNotStarted, assessment, submission, isViolation, getAssessmentEndMs, getSecureNow]);

// // //     useEffect(() => {
// // //         if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed || isViolation || currentStatus !== 'in_progress') return;

// // //         const updateTimer = () => {
// // //             const now = getSecureNow();
// // //             const endMs = getAssessmentEndMs();
// // //             if (endMs) {
// // //                 setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
// // //             }
// // //         };

// // //         updateTimer();
// // //         const id = setInterval(updateTimer, 1000);
// // //         return () => clearInterval(id);
// // //     }, [isGloballyLocked, showGate, isPracticalModule, isMissed, isViolation, currentStatus, assessment, submission, getAssessmentEndMs, getSecureNow]);

// // //     useEffect(() => {
// // //         if (timeLeft !== null && timeLeft <= 0 && currentStatus === 'in_progress') {
// // //             toast.error("Time is up! Auto-submitting.");
// // //             setAnswers(latestAnswers => {
// // //                 if (submission?.id) {
// // //                     forceAutoSubmit(submission.id, latestAnswers);
// // //                 }
// // //                 return latestAnswers;
// // //             });
// // //         }
// // //     }, [timeLeft, currentStatus, submission?.id]);

// // //     useEffect(() => {
// // //         const fetchApprovedLogs = async () => {
// // //             if (!user?.uid || assessment?.moduleType !== 'workplace') {
// // //                 setLogsLoading(false);
// // //                 return;
// // //             }
// // //             try {
// // //                 setLogsLoading(true);
// // //                 const logsRef = collection(db, 'workplace_logs');
// // //                 const q = query(logsRef, where('learnerId', '==', user.uid), where('moduleId', '==', assessment.id), where('status', '==', 'Approved'));
// // //                 const snapshot = await getDocs(q);
// // //                 const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // //                 setApprovedLogs(fetchedLogs);
// // //             } catch (error) {
// // //                 console.error('Error fetching approved logs:', error);
// // //                 toast.error('Failed to sync verified workplace logs.');
// // //             } finally {
// // //                 setLogsLoading(false);
// // //             }
// // //         };
// // //         fetchApprovedLogs();
// // //     }, [user?.uid, assessment?.id, assessment?.moduleType]);

// // //     const getBlockGrading = (blockId: string) => {
// // //         const g = submission?.grading || {};
// // //         const m = submission?.moderation || {};
// // //         const mLayer = m.breakdown?.[blockId] || {};
// // //         const aLayer = g.assessorBreakdown?.[blockId] || {};
// // //         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
// // //         const legacyLayer = g.breakdown?.[blockId] || {};

// // //         let activeLayer = fLayer || legacyLayer || {};
// // //         if (isAssDone || g.assessorBreakdown?.[blockId]) activeLayer = aLayer;
// // //         if (isModDone || m.breakdown?.[blockId]) activeLayer = mLayer;

// // //         return {
// // //             score: activeLayer?.score,
// // //             isCorrect: activeLayer?.isCorrect,
// // //             facIsCorrect: fLayer?.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer?.isCorrect,
// // //             assIsCorrect: aLayer?.isCorrect,
// // //             modIsCorrect: mLayer?.isCorrect,
// // //             feedback: activeLayer?.feedback || '',
// // //             facFeedback: fLayer?.feedback || legacyLayer?.feedback || '',
// // //             assFeedback: aLayer?.feedback || '',
// // //             modFeedback: mLayer?.feedback || '',
// // //             criteriaResults: activeLayer?.criteriaResults || fLayer?.criteriaResults || legacyLayer?.criteriaResults || [],
// // //         };
// // //     };

// // //     let grandTotalAwarded = 0;
// // //     let grandTotalMax = 0;
// // //     const sectionTotals: Record<string, { total: number; awarded: number }> = {};
// // //     let currentSectionId = '';
// // //     if (assessment?.blocks) {
// // //         assessment.blocks.forEach((block: any) => {
// // //             if (block.type === 'section') {
// // //                 currentSectionId = block.id;
// // //                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
// // //             } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
// // //                 const { score } = getBlockGrading(block.id);
// // //                 const maxMarks = Number(block.marks) || 0;
// // //                 const awarded = Number(score) || 0;
// // //                 grandTotalMax += maxMarks;
// // //                 if (score !== undefined && score !== null) {
// // //                     grandTotalAwarded += awarded;
// // //                 }
// // //                 if (currentSectionId) {
// // //                     sectionTotals[currentSectionId].total += maxMarks;
// // //                     if (score !== undefined && score !== null) {
// // //                         sectionTotals[currentSectionId].awarded += awarded;
// // //                     }
// // //                 }
// // //             }
// // //         });
// // //     }
// // //     const grandTotalPct = grandTotalMax > 0 ? Math.round((grandTotalAwarded / grandTotalMax) * 100) : 0;
// // //     const savedFacRole = submission?.grading?.facilitatorRole || null;

// // //     const getCompetencyStatus = () => {
// // //         if (!isAssDone) return null;
// // //         if (isRemediation && !isGloballyLocked) return null;
// // //         const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
// // //         let isCompetent = compStr === 'c' || compStr === 'competent';
// // //         if (!isWorkplaceModule && !isCompetent && grandTotalAwarded !== undefined && assessment?.totalMarks)
// // //             isCompetent = grandTotalAwarded >= assessment.totalMarks * 0.6;
// // //         return {
// // //             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
// // //             color: isModDone ? 'var(--mlab-green)' : 'var(--mlab-red)',
// // //             subtext: isModDone ? 'Final Results Verified & Endorsed.' : isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.',
// // //             score: isWorkplaceModule ? undefined : grandTotalAwarded,
// // //             percentage: grandTotalPct,
// // //             isCompetent,
// // //         };
// // //     };
// // //     const outcome = getCompetencyStatus();

// // //     const handleStartAssessment = async () => {
// // //         if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked) || isViolation) return;
// // //         setIsStarting(true);
// // //         setSaving(true);
// // //         try {
// // //             const functions = getFunctions();
// // //             const startFn = httpsCallable(functions, 'startAssessment');
// // //             const res = await startFn({ submissionId: submission.id });
// // //             const data = res.data as any;
// // //             const t = data.startedAt || new Date(getSecureNow()).toISOString();

// // //             let payload: any = {};
// // //             if (needsRemediationGate) {
// // //                 payload['latestCoachingLog.acknowledged'] = true;
// // //                 payload['latestCoachingLog.acknowledgedAt'] = t;
// // //                 payload['latestCoachingLog.learnerSignatureUrl'] = learnerProfile?.signatureUrl || null;
// // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
// // //             }

// // //             setSubmission((p: any) => ({
// // //                 ...p,
// // //                 status: 'in_progress',
// // //                 startedAt: t,
// // //                 latestCoachingLog: p.latestCoachingLog && needsRemediationGate
// // //                     ? { ...p.latestCoachingLog, acknowledged: true, acknowledgedAt: t, learnerSignatureUrl: learnerProfile?.signatureUrl }
// // //                     : p.latestCoachingLog
// // //             }));

// // //             if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) {
// // //                 const endMs = getAssessmentEndMs();
// // //                 if (endMs) {
// // //                     setTimeLeft(Math.max(0, Math.floor((endMs - getSecureNow()) / 1000)));
// // //                 } else {
// // //                     const extraTime = submission?.extraTimeGranted || 0;
// // //                     setTimeLeft((assessment.moduleInfo.timeLimit + extraTime) * 60);
// // //                 }
// // //             }
// // //         } catch (err: any) {
// // //             toast.error(err.message || 'Failed to start assessment. Please check compliance.');
// // //         } finally {
// // //             setSaving(false);
// // //             setIsStarting(false);
// // //         }
// // //     };

// // //     const triggerAutoSave = (newAnswers: any) => {
// // //         if (currentStatus !== 'in_progress') return;
// // //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// // //         setSaving(true);
// // //         saveTimeoutRef.current = setTimeout(async () => {
// // //             if (!submission?.id) return;
// // //             try {
// // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
// // //             } catch {
// // //                 toast.error('Auto-save failed.');
// // //             } finally {
// // //                 setSaving(false);
// // //             }
// // //         }, 1200);
// // //     };

// // //     const SNAPSHOT_INLINE_LIMIT = 200_000;
// // //     const codeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// // //     const saveCodeSnapshot = useCallback(async (blockId: string, snapshot: any, dependencies?: Record<string, string>, immediate?: boolean) => {
// // //         if (currentStatus !== 'in_progress') return;
// // //         setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));

// // //         const doWrite = async () => {
// // //             if (!submission?.id || currentStatus !== 'in_progress') return;
// // //             setSaving(true);
// // //             try {
// // //                 let fieldPayload: any;

// // //                 if (typeof snapshot === 'string' && snapshot.length > SNAPSHOT_INLINE_LIMIT) {
// // //                     const path = `code_snapshots/${submission.id}/${blockId}.json`;
// // //                     await uploadString(fbStorageRef(getStorage(), path), snapshot);
// // //                     fieldPayload = { storagePath: path, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
// // //                 } else {
// // //                     fieldPayload = { snapshot, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
// // //                 }

// // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // //                     [`answers.${blockId}`]: fieldPayload,
// // //                     lastSavedAt: new Date().toISOString()
// // //                 });

// // //                 setAnswers(prev => ({ ...prev, [blockId]: fieldPayload }));
// // //             } catch (err) {
// // //                 toast.error('Failed to save your code changes.');
// // //                 throw err;
// // //             } finally {
// // //                 setSaving(false);
// // //             }
// // //         };

// // //         if (immediate) {
// // //             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
// // //             await doWrite();
// // //         } else {
// // //             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
// // //             codeSaveTimeoutRef.current = setTimeout(() => { doWrite(); }, 1200);
// // //         }
// // //     }, [submission?.id, currentStatus, toast]);

// // //     const handleAnswerChange = (blockId: string, value: any) => {
// // //         if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
// // //         setAnswers(p => { const n = { ...p, [blockId]: value }; triggerAutoSave(n); return n; });
// // //     };
// // //     const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
// // //         if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
// // //         setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; triggerAutoSave(n); return n; });
// // //     };
// // //     const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
// // //         if (isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
// // //         setAnswers(p => {
// // //             const blockAns = p[blockId] || {};
// // //             const raw = blockAns[nestedKey];
// // //             const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
// // //             const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
// // //             triggerAutoSave(n); return n;
// // //         });
// // //     };

// // //     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
// // //         if (!file || isGloballyLocked || isBlockVerified(blockId) || currentStatus !== 'in_progress') return;
// // //         const pKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
// // //         setUploadProgress(p => ({ ...p, [pKey]: 0 }));
// // //         setSaving(true);
// // //         toast.info(`Uploading ${file.name}…`);
// // //         try {
// // //             const storage = getStorage();
// // //             const ref = fbStorageRef(storage, `evidence/${submission.id}/${blockId}_${Date.now()}_${file.name}`);
// // //             const task = uploadBytesResumable(ref, file);
// // //             task.on('state_changed',
// // //                 snap => setUploadProgress(p => ({ ...p, [pKey]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
// // //                 err => {
// // //                     console.error("Firebase Storage Upload Error:", err);
// // //                     toast.error(`Upload failed: ${err.message}. Please try again.`);
// // //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', '');
// // //                     else handleTaskAnswerChange(blockId, 'uploadUrl', '');
// // //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // //                     setSaving(false);
// // //                 },
// // //                 async () => {
// // //                     const url = await getDownloadURL(task.snapshot.ref);
// // //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', url);
// // //                     else handleTaskAnswerChange(blockId, 'uploadUrl', url);
// // //                     toast.success(`Uploaded: ${file.name}`);
// // //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // //                     setSaving(false);
// // //                 }
// // //             );
// // //         } catch (err: any) {
// // //             toast.error(`Upload failed: ${err.message}`);
// // //             setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // //             setSaving(false);
// // //         }
// // //     };

// // //     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
// // //         const st = String(submission?.status || '').toLowerCase();
// // //         if (st !== 'in_progress') {
// // //             console.warn(`[AUTO-SUBMIT BLOCKED] Cannot auto-submit assessment in '${st}' status.`);
// // //             return;
// // //         }

// // //         setSaving(true);
// // //         const t = new Date(getSecureNow()).toISOString();
// // //         try {
// // //             await runTransaction(db, async (transaction) => {
// // //                 const subRef = doc(db, 'learner_submissions', subId);
// // //                 const subSnap = await transaction.get(subRef);
// // //                 if (!subSnap.exists()) return;

// // //                 const currentStatus = String(subSnap.data().status || '').toLowerCase();
// // //                 if (['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed', 'missed', 'violation', 'terminated'].includes(currentStatus)) {
// // //                     console.warn("[AUTO SUBMIT] Aborted: Assessment is already in a terminal or violated state.");
// // //                     return;
// // //                 }

// // //                 transaction.update(subRef, {
// // //                     answers: currentAnswers,
// // //                     status: 'submitted',
// // //                     submittedAt: t,
// // //                     autoSubmitted: true,
// // //                     learnerDeclaration: {
// // //                         agreed: true,
// // //                         timestamp: t,
// // //                         learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// // //                         learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// // //                         signatureUrl: learnerProfile?.signatureUrl || null
// // //                     },
// // //                 });
// // //             });
// // //             toast.success("Time's up! Auto-submitted.");
// // //         } catch (e) {
// // //             console.error("Auto-submit transaction failed:", e);
// // //         } finally {
// // //             setSaving(false);
// // //         }
// // //     };

// // //     const validateChecklistEvidence = () => {
// // //         try {
// // //             for (const block of assessment?.blocks || []) {
// // //                 if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
// // //                     for (let i = 0; i < (block.criteria?.length || 0); i++) {
// // //                         const raw = answers?.[block.id]?.[`evidence_${i}`];
// // //                         const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
// // //                         const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
// // //                         const has = !!(textClean || ev?.url?.trim() || ev?.code?.trim() || ev?.uploadUrl?.trim());

// // //                         if (!has) {
// // //                             return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title || 'Checklist'}".` };
// // //                         }
// // //                     }
// // //                 }
// // //                 if (block.type === 'qcto_workplace') {
// // //                     const bAns = answers?.[block.id] || {};
// // //                     for (const wa of block.workActivities || []) {
// // //                         if (!bAns[`wa_${wa.id}_declaration`]) {
// // //                             return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
// // //                         }
// // //                         for (const se of wa.evidenceItems || []) {
// // //                             const ev = bAns[`se_${se.id}`] || {};
// // //                             const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
// // //                             const has = !!(textClean || ev?.url?.trim() || ev?.uploadUrl?.trim());
// // //                             if (!has) {
// // //                                 return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
// // //                             }
// // //                         }
// // //                     }
// // //                 }
// // //             }
// // //             return { valid: true };
// // //         } catch (err) {
// // //             return { valid: true };
// // //         }
// // //     };

// // //     const triggerSubmitConfirm = () => {
// // //         if (isViolation) return;
// // //         if (!declarationChecked) {
// // //             toast.warning('Please check the "Learner Final Declaration" box before submitting.');
// // //             return;
// // //         }

// // //         if (Object.keys(uploadProgress).length > 0) {
// // //             toast.warning("Files are currently uploading. Please wait until uploads complete.");
// // //             return;
// // //         }

// // //         if (assessment?.moduleType === 'workplace') {
// // //             const workplaceBlocks = assessment.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];
// // //             for (const block of workplaceBlocks) {
// // //                 for (const wa of block.workActivities || []) {
// // //                     const hasApprovedLog = (approvedLogs || []).some(log => log.workActivityId === wa.id);
// // //                     if (!hasApprovedLog) {
// // //                         toast.error(`Missing approved log for Work Activity: ${wa.code}. You cannot submit until your mentor approves this task.`);
// // //                         return;
// // //                     }
// // //                 }
// // //             }
// // //         }

// // //         if (isAwaitingSignoff || isPracticalModule) {
// // //             const chk = validateChecklistEvidence() as any;
// // //             if (!chk.valid) {
// // //                 toast.warning(chk.message);
// // //                 return;
// // //             }
// // //         }

// // //         setShowSubmitConfirm(true);
// // //     };

// // //     const executeSubmit = async () => {
// // //         if (isViolation) return;
// // //         setShowSubmitConfirm(false);
// // //         setSaving(true);

// // //         const activeVMs = (window as any).__ACTIVE_VMS || {};
// // //         for (const blockId of Object.keys(activeVMs)) {
// // //             try {
// // //                 const vm = activeVMs[blockId];
// // //                 const snapshot = await vm.getFsSnapshot();

// // //                 answers[blockId] = {
// // //                     snapshot,
// // //                     lastSavedAt: new Date().toISOString()
// // //                 };
// // //             } catch (err) {
// // //                 console.error(`Failed to capture snapshot for sandbox ${blockId}:`, err);
// // //             }
// // //         }

// // //         const t = new Date(getSecureNow()).toISOString();
// // //         const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

// // //         try {
// // //             await runTransaction(db, async (transaction) => {
// // //                 const subRef = doc(db, 'learner_submissions', submission.id);
// // //                 const subSnap = await transaction.get(subRef);
// // //                 if (!subSnap.exists()) throw new Error("Submission not found");

// // //                 const currentStatus = String(subSnap.data().status || '').toLowerCase();
// // //                 if (['violation', 'terminated', 'missed'].includes(currentStatus)) {
// // //                     throw new Error("Assessment is locked due to a security violation.");
// // //                 }

// // //                 transaction.update(subRef, {
// // //                     answers,
// // //                     status: nextStatus,
// // //                     submittedAt: t,
// // //                     learnerDeclaration: {
// // //                         agreed: true,
// // //                         timestamp: t,
// // //                         learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// // //                         learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// // //                         signatureUrl: learnerProfile?.signatureUrl || null
// // //                     }
// // //                 });
// // //             });
// // //             toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
// // //             setTimeout(() => window.scrollTo(0, 0), 1000);
// // //         } catch (error: any) {
// // //             console.error("❌ Submission Error:", error);
// // //             toast.error(`Failed to submit: ${error.message}`);
// // //         } finally {
// // //             setSaving(false);
// // //         }
// // //     };

// // //     const executeAppeal = async (reason: string) => {
// // //         setShowAppealModal(false);
// // //         setSaving(true);
// // //         try {
// // //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // //                 status: 'appealed',
// // //                 appeal: { reason, date: new Date().toISOString(), status: 'pending' },
// // //                 lastStaffEditAt: new Date().toISOString()
// // //             });
// // //             toast.success("Formal appeal lodged successfully.");
// // //             setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
// // //         } catch {
// // //             toast.error("Failed to lodge appeal.");
// // //         } finally { setSaving(false); }
// // //     };

// // //     const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride: boolean = false) => {
// // //         if (!isGloballyLocked && !isPracticalModule && !allowOverride) {
// // //             if (e.type === 'keydown') {
// // //                 const keyEvent = e as React.KeyboardEvent;
// // //                 if ((keyEvent.ctrlKey || keyEvent.metaKey) && ['c', 'v', 'x'].includes(keyEvent.key.toLowerCase())) {
// // //                     keyEvent.preventDefault();
// // //                     keyEvent.stopPropagation();
// // //                     if (keyEvent.nativeEvent?.stopImmediatePropagation) {
// // //                         keyEvent.nativeEvent.stopImmediatePropagation();
// // //                     }
// // //                     toast.warning("Keyboard shortcuts for Copy/Paste are disabled on Knowledge Modules.", 1500);
// // //                     document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to use Copy/Paste keyboard shortcuts." }));
// // //                 }
// // //             } else {
// // //                 e.preventDefault();
// // //                 e.stopPropagation();
// // //                 if (e.nativeEvent?.stopImmediatePropagation) {
// // //                     e.nativeEvent.stopImmediatePropagation();
// // //                 }
// // //                 toast.warning("Copying, pasting, and dropping content is disabled to ensure academic integrity.", 15000);
// // //                 document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to Paste or Drop external content into the assessment." }));
// // //             }
// // //         }
// // //     };

// // //     const generateCalendarLink = () => {
// // //         if (!assessment?.scheduledDate) return "#";
// // //         const formatToGCal = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");
// // //         const startTime = new Date(assessment.scheduledDate);
// // //         const durationMinutes = assessment.moduleInfo?.timeLimit || 60;
// // //         const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
// // //         const dtStart = formatToGCal(startTime);
// // //         const dtEnd = formatToGCal(endTime);
// // //         const eventTitle = encodeURIComponent(`mLab Assessment: ${assessment.title}`);
// // //         const eventDetails = encodeURIComponent(
// // //             `Your secure assessment module is scheduled.\n\nAccess Link: ${window.location.origin}/learner/assessment/${assessmentId}`
// // //         );
// // //         return `https://www.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${dtStart}/${dtEnd}&details=${eventDetails}&sf=true&output=xml`;
// // //     };

// // //     if (loading) return <LoadingScreen />;

// // //     if (isAdminIntercept) {
// // //         return (
// // //             <AssessmentLockedScreen
// // //                 type="admin"
// // //                 assessmentId={assessmentId}
// // //                 onBack={safeNavigateBack}
// // //                 navigate={navigate}
// // //             />
// // //         );
// // //     }

// // //     if (!assessment || !submission) {
// // //         return (
// // //             <AssessmentLockedScreen
// // //                 type="unavailable"
// // //                 onBack={safeNavigateBack}
// // //             />
// // //         );
// // //     }

// // //     if (assessment?.status === 'upcoming' && !isAdminIntercept && !submission?.overrideUnlock) {
// // //         return (
// // //             <AssessmentLockedScreen
// // //                 type="upcoming"
// // //                 onBack={safeNavigateBack}
// // //             />
// // //         );
// // //     }

// // //     if (isScheduledLocked) {
// // //         return (
// // //             <AssessmentLockedScreen
// // //                 type="scheduled"
// // //                 assessment={assessment}
// // //                 timeToStart={timeToStart}
// // //                 getSecureNow={getSecureNow}
// // //                 generateCalendarLink={generateCalendarLink}
// // //                 onBack={safeNavigateBack}
// // //             />
// // //         );
// // //     }

// // //     if (isViolation) {
// // //         return (
// // //             <AssessmentViolationScreen
// // //                 assessment={assessment}
// // //                 submission={submission}
// // //                 onBack={safeNavigateBack}
// // //             />
// // //         );
// // //     }

// // //     if (isMissed) {
// // //         return (
// // //             <AssessmentLockedScreen
// // //                 type="missed"
// // //                 onBack={safeNavigateBack}
// // //             />
// // //         );
// // //     }

// // //     if (showGate) {
// // //         return (
// // //             <AssessmentGate
// // //                 assessment={assessment}
// // //                 submission={submission}
// // //                 learnerProfile={learnerProfile}
// // //                 isRemediation={isRemediation}
// // //                 needsRemediationGate={needsRemediationGate}
// // //                 isAppealUpheld={isAppealUpheld}
// // //                 willBeProctored={willBeProctored}
// // //                 isSummative={isSummative}
// // //                 passedFormative={passedFormative}
// // //                 hasOverride={hasOverride}
// // //                 isFullyCompliant={isFullyCompliant}
// // //                 pendingTopics={pendingTopics}
// // //                 saving={saving}
// // //                 isStarting={isStarting}
// // //                 startDeclarationChecked={startDeclarationChecked}
// // //                 coachingAckChecked={coachingAckChecked}
// // //                 onStart={handleStartAssessment}
// // //                 onBack={safeNavigateBack}
// // //                 setStartDeclarationChecked={setStartDeclarationChecked}
// // //                 setCoachingAckChecked={setCoachingAckChecked}
// // //                 toast={toast}
// // //             />
// // //         );
// // //     }

// // //     return (
// // //         <AssessmentPlayerContent
// // //             user={user}
// // //             assessment={assessment}
// // //             submission={submission}
// // //             answers={answers}
// // //             learnerProfile={learnerProfile}
// // //             learnerEnrollment={learnerEnrollment}
// // //             assessorProfile={assessorProfile}
// // //             moderatorProfile={moderatorProfile}
// // //             facilitatorProfile={facilitatorProfile}
// // //             employers={employers}
// // //             staff={staff}
// // //             moduleLogs={moduleLogs}
// // //             approvedLogs={approvedLogs}
// // //             logsLoading={logsLoading}
// // //             saving={saving}
// // //             setSaving={setSaving}
// // //             uploadProgress={uploadProgress}
// // //             setUploadProgress={setUploadProgress}
// // //             activeTabs={activeTabs}
// // //             setActiveTabs={setActiveTabs}
// // //             timeLeft={timeLeft}
// // //             isGloballyLocked={isGloballyLocked}
// // //             isAwaitingSignoff={isAwaitingSignoff}
// // //             isPracticalModule={isPracticalModule}
// // //             isWorkplaceModule={isWorkplaceModule}
// // //             isRemediation={isRemediation}
// // //             isAppealUpheld={isAppealUpheld}
// // //             isFacDone={isFacDone}
// // //             isAssDone={isAssDone}
// // //             isModDone={isModDone}
// // //             isSubmitted={isSubmitted}
// // //             isMissed={isMissed}
// // //             showGate={showGate}
// // //             showLeaveWarning={showLeaveWarning}
// // //             setShowLeaveWarning={setShowLeaveWarning}
// // //             showSubmitConfirm={showSubmitConfirm}
// // //             setShowSubmitConfirm={setShowSubmitConfirm}
// // //             showAppealModal={showAppealModal}
// // //             setShowAppealModal={setShowAppealModal}
// // //             declarationChecked={declarationChecked}
// // //             setDeclarationChecked={setDeclarationChecked}
// // //             isMobileMenuOpen={isMobileMenuOpen}
// // //             setIsMobileMenuOpen={setIsMobileMenuOpen}
// // //             willBeProctored={willBeProctored}
// // //             savedFacRole={savedFacRole}
// // //             grandTotalAwarded={grandTotalAwarded}
// // //             grandTotalMax={grandTotalMax}
// // //             grandTotalPct={grandTotalPct}
// // //             sectionTotals={sectionTotals}
// // //             outcome={outcome}
// // //             safeNavigateBack={safeNavigateBack}
// // //             handleAnswerChange={handleAnswerChange}
// // //             handleTaskAnswerChange={handleTaskAnswerChange}
// // //             handleNestedAnswerChange={handleNestedAnswerChange}
// // //             handleFileUpload={handleFileUpload}
// // //             triggerSubmitConfirm={triggerSubmitConfirm}
// // //             executeSubmit={executeSubmit}
// // //             executeAppeal={executeAppeal}
// // //             preventCopyPasteAndDrop={preventCopyPasteAndDrop}
// // //             getBlockGrading={getBlockGrading}
// // //             isBlockVerified={isBlockVerified}
// // //             getSecureNow={getSecureNow}
// // //             toast={toast}
// // //             codeSnapshots={codeSnapshots}
// // //             saveCodeSnapshot={saveCodeSnapshot}
// // //         />
// // //     );
// // // };

// // // export default AssessmentPlayer;




// // // // // src/components/views/AssessmentPlayer/AssessmentPlayer.tsx

// // // // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // // // import { useParams, useNavigate, useLocation } from 'react-router-dom';
// // // // import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot, runTransaction } from 'firebase/firestore';
// // // // import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, uploadString } from 'firebase/storage';
// // // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // // import { db } from '../../../lib/firebase';
// // // // import { useStore } from '../../../store/useStore';
// // // // import { useToast } from '../../../components/common/Toast/Toast';
// // // // import './AssessmentPlayer.css';
// // // // import moment from 'moment';

// // // // import { AssessmentGate } from './AssessmentGate';
// // // // import { AssessmentLockedScreen } from './AssessmentLockedScreen';
// // // // import AssessmentPlayerContent from './AssessmentPlayerContent';

// // // // const LoadingScreen: React.FC = () => (
// // // //     <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
// // // //         <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
// // // //     </div>
// // // // );

// // // // const AssessmentPlayer: React.FC = () => {
// // // //     const { assessmentId } = useParams<{ assessmentId: string }>();
// // // //     const navigate = useNavigate();
// // // //     const location = useLocation();

// // // //     const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
// // // //     const toast = useToast();

// // // //     const safeNavigateBack = () => {
// // // //         if (location.key === 'default') {
// // // //             navigate(user?.role === 'learner' ? '/learner/dashboard' : '/');
// // // //         } else {
// // // //             navigate(-1);
// // // //         }
// // // //     };

// // // //     const [loading, setLoading] = useState(true);
// // // //     const [saving, setSaving] = useState(false);
// // // //     const [isStarting, setIsStarting] = useState(false);

// // // //     const [assessment, setAssessment] = useState<any>(null);
// // // //     const [submission, setSubmission] = useState<any>(null);
// // // //     const [answers, setAnswers] = useState<Record<string, any>>({});
// // // //     const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
// // // //     const [codeSnapshots, setCodeSnapshots] = useState<Record<string, any>>({});
// // // //     const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
// // // //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// // // //     const [learnerEnrollment, setLearnerEnrollment] = useState<any>(null);
// // // //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// // // //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);
// // // //     const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);
// // // //     const [declarationChecked, setDeclarationChecked] = useState(false);
// // // //     const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
// // // //     const [coachingAckChecked, setCoachingAckChecked] = useState(false);
// // // //     const [isAdminIntercept, setIsAdminIntercept] = useState(false);
// // // //     const [showLeaveWarning, setShowLeaveWarning] = useState(false);
// // // //     const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
// // // //     const [showAppealModal, setShowAppealModal] = useState(false);
// // // //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

// // // //     const [moduleLogs, setModuleLogs] = useState<any[]>([]);
// // // //     const [passedFormative, setPassedFormative] = useState(false);
// // // //     const [approvedLogs, setApprovedLogs] = useState<any[]>([]);
// // // //     const [logsLoading, setLogsLoading] = useState<boolean>(false);

// // // //     const [timeLeft, setTimeLeft] = useState<number | null>(null);
// // // //     const [timeOffset, setTimeOffset] = useState<number>(0);
// // // //     const [timeToStart, setTimeToStart] = useState<number | null>(null);

// // // //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// // // //     const answersRef = useRef(answers);
// // // //     useEffect(() => { answersRef.current = answers; }, [answers]);

// // // //     const currentStatus = String(submission?.status || '').toLowerCase();
// // // //     const isMissed = currentStatus === 'missed';
// // // //     const isViolation = currentStatus === 'violation'; // 🚀 ADDED VIOLATION STATUS
// // // //     const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
// // // //     const isAppealUpheld = submission?.appeal?.status === 'upheld';
// // // //     const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// // // //     const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// // // //     const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
// // // //     const isModDone = ['moderated', 'appealed'].includes(currentStatus);
// // // //     const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
// // // //     const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
// // // //     const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
// // // //     const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;
// // // //     const isRemediation = (submission?.attemptNumber || 1) > 1;
// // // //     const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged && !isAppealUpheld;
// // // //     const isNotStarted = currentStatus === 'not_started';
// // // //     const showGate = isNotStarted || needsRemediationGate;

// // // //     // 🚀 ADDED isViolation HERE SO PROCTORING GATE IS BYPASSED
// // // //     const isGloballyLocked = isSubmitted || isAwaitingSignoff || isMissed || isViolation;
// // // //     const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

// // // //     const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
// // // //         ? assessment.requiresInvigilation
// // // //         : !isPracticalModule;

// // // //     // 🚀 EXPLICITLY PREVENT PROCTORING IF VIOLATED
// // // //     const willBeProctored = isInvigilationEnabled && !isGloballyLocked && !isViolation;

// // // //     const isSummative = submission?.type?.toLowerCase().includes('summative') || false;
// // // //     const hasOverride = submission?.facilitatorOverride === true;

// // // //     const pendingTopics = useMemo(() => {
// // // //         if (!submission || !moduleLogs) return [];
// // // //         return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
// // // //     }, [moduleLogs, submission]);

// // // //     const isFullyCompliant = pendingTopics.length === 0;

// // // //     const isBlockVerified = (blockId: string) => {
// // // //         const facGrade = submission?.grading?.facilitatorBreakdown?.[blockId];
// // // //         return facGrade?.isCorrect === true || facGrade?.obsDeclaration === true;
// // // //     };

// // // //     const getSecureNow = useCallback(() => Date.now() + timeOffset, [timeOffset]);

// // // //     // ─── UNIFIED TIMER END-TIME CALCULATION ──────────────────────────────────
// // // //     const getAssessmentEndMs = useCallback(() => {
// // // //         if (!assessment) return null;
// // // //         const baseLimit = assessment.moduleInfo?.timeLimit || 0;
// // // //         if (baseLimit <= 0) return null;

// // // //         const extraTime = submission?.extraTimeGranted || 0;
// // // //         const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;

// // // //         // Scheduled exams anchor strictly to scheduledDate
// // // //         if (assessment.isScheduled && assessment.scheduledDate && !submission?.overrideUnlock) {
// // // //             return moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
// // // //         }

// // // //         // Non-scheduled / override exams anchor to learner start time
// // // //         if (submission?.startedAt) {
// // // //             return new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
// // // //         }

// // // //         return null;
// // // //     }, [assessment, submission]);

// // // //     // ─── FETCH TIME OFFSET (CACHE-BUSTED & SANITY-CHECKED) ─────────────────
// // // //     useEffect(() => {
// // // //         const fetchOffset = async () => {
// // // //             try {
// // // //                 const res = await fetch(`https://timeapi.io/api/Time/current/zone?timeZone=UTC&nocache=${Date.now()}`, {
// // // //                     cache: 'no-store',
// // // //                     headers: {
// // // //                         'Cache-Control': 'no-cache, no-store, must-revalidate',
// // // //                         'Pragma': 'no-cache'
// // // //                     }
// // // //                 });

// // // //                 if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
// // // //                 const data = await res.json();

// // // //                 const secureUTCTime = new Date(data.dateTime + 'Z').getTime();
// // // //                 const localTime = Date.now();
// // // //                 const calculatedOffset = secureUTCTime - localTime;

// // // //                 if (Math.abs(calculatedOffset) > 5 * 60 * 1000) {
// // // //                     setTimeOffset(0);
// // // //                 } else {
// // // //                     setTimeOffset(calculatedOffset);
// // // //                 }
// // // //             } catch (err) {
// // // //                 console.warn('[TIMER DEBUG] Time API unavailable or blocked. Using local device clock:', err);
// // // //                 setTimeOffset(0);
// // // //             }
// // // //         };

// // // //         fetchOffset();
// // // //     }, []);

// // // //     useEffect(() => {
// // // //         if (employers.length === 0) fetchEmployers();
// // // //         if (staff.length === 0) fetchStaff();

// // // //         const load = async () => {
// // // //             if (!user?.uid || !assessmentId) return;

// // // //             if (user.role && user.role !== 'learner') {
// // // //                 setIsAdminIntercept(true);
// // // //                 setLoading(false);
// // // //                 return;
// // // //             }

// // // //             try {
// // // //                 const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
// // // //                 if (!assSnap.exists()) {
// // // //                     toast.error('Assessment template not found.');
// // // //                     setLoading(false);
// // // //                     return;
// // // //                 }
// // // //                 const assData = assSnap.data();
// // // //                 setAssessment(assData);

// // // //                 let userProfile: any = {};
// // // //                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
// // // //                 if (userDocSnap.exists()) {
// // // //                     userProfile = { id: userDocSnap.id, ...userDocSnap.data() };
// // // //                 }
// // // //                 setLearnerProfile(userProfile);

// // // //                 let targetLearnerId = user.uid;
// // // //                 let learnerCohortId: string | null = null;
// // // //                 let validEnrollmentId: string | null = null;

// // // //                 if (user?.role === 'learner') {
// // // //                     try {
// // // //                         const enrolQ = query(collection(db, 'enrollments'), where('authUid', '==', user.uid), where('status', '==', 'active'));
// // // //                         const enrolSnap = await getDocs(enrolQ);
// // // //                         if (!enrolSnap.empty) {
// // // //                             const enrolData = enrolSnap.docs[0].data();
// // // //                             validEnrollmentId = enrolSnap.docs[0].id;
// // // //                             targetLearnerId = enrolData.learnerId || enrolData.id || user.uid;
// // // //                             learnerCohortId = enrolData.cohortId;
// // // //                         }
// // // //                     } catch (e) {
// // // //                         console.warn("Enrollment lookup failed.", e);
// // // //                     }
// // // //                 }

// // // //                 let activeSub: any = null;
// // // //                 try {
// // // //                     const subQuery1 = query(collection(db, 'learner_submissions'), where('assessmentId', '==', assessmentId), where('authUid', '==', user.uid));
// // // //                     const subSnap1 = await getDocs(subQuery1);
// // // //                     if (!subSnap1.empty) {
// // // //                         activeSub = subSnap1.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
// // // //                     }
// // // //                 } catch (qErr) {
// // // //                     console.warn("Primary submission query failed.", qErr);
// // // //                 }

// // // //                 if (!activeSub && user?.role === 'learner') {
// // // //                     const fallbackCohortId = learnerCohortId || assData.cohortId || (assData.cohortIds && assData.cohortIds[0]) || 'unassigned';
// // // //                     const isLive = ['active', 'scheduled', 'upcoming', 'published'].includes(assData.status);
// // // //                     if (isLive) {
// // // //                         const sid = `${fallbackCohortId}_${targetLearnerId}_${assessmentId}`;
// // // //                         const newSub = {
// // // //                             learnerId: targetLearnerId,
// // // //                             enrollmentId: validEnrollmentId || "",
// // // //                             authUid: user.uid,
// // // //                             qualificationName: userProfile.qualification?.name || "",
// // // //                             assessmentId: assessmentId,
// // // //                             cohortId: fallbackCohortId,
// // // //                             title: assData.title,
// // // //                             type: assData.type || 'formative',
// // // //                             moduleType: assData.moduleType || 'knowledge',
// // // //                             status: assData.status === 'upcoming' ? 'upcoming' : 'not_started',
// // // //                             assignedAt: new Date().toISOString(),
// // // //                             marks: 0,
// // // //                             totalMarks: assData.totalMarks || 0,
// // // //                             moduleNumber: assData.moduleInfo?.moduleNumber || "",
// // // //                             timeLimit: assData.moduleInfo?.timeLimit || 0,
// // // //                             isScheduled: assData.isScheduled || assData.status === 'scheduled' || false,
// // // //                             scheduledDate: assData.scheduledDate || null,
// // // //                             createdAt: new Date().toISOString(),
// // // //                             createdBy: "System_Player_AutoHydration"
// // // //                         };
// // // //                         await setDoc(doc(db, "learner_submissions", sid), newSub);
// // // //                         activeSub = { id: sid, ...newSub };
// // // //                     }
// // // //                 }

// // // //                 if (activeSub) {
// // // //                     setSubmission(activeSub);
// // // //                     setAnswers(activeSub.answers || {});
// // // //                     if (activeSub.enrollmentId) {
// // // //                         const e = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId));
// // // //                         if (e.exists()) setLearnerEnrollment(e.data());
// // // //                     }
// // // //                     if (activeSub.grading?.gradedBy) {
// // // //                         const s = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
// // // //                         if (s.exists()) setAssessorProfile(s.data());
// // // //                     }
// // // //                     if (activeSub.moderation?.moderatedBy) {
// // // //                         const s = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
// // // //                         if (s.exists()) setModeratorProfile(s.data());
// // // //                     }
// // // //                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
// // // //                     if (facId) {
// // // //                         const s = await getDoc(doc(db, 'users', facId));
// // // //                         if (s.exists()) setFacilitatorProfile(s.data());
// // // //                     }
// // // //                 } else {
// // // //                     toast.error('Assessment unavailable. It may not be published yet.');
// // // //                 }
// // // //             } catch (err) {
// // // //                 console.error("Fatal error loading assessment data:", err);
// // // //                 toast.error('Failed to load assessment data.');
// // // //             } finally {
// // // //                 setLoading(false);
// // // //             }
// // // //         };

// // // //         if (timeOffset !== null) load();
// // // //     }, [assessmentId, user?.uid, timeOffset]);

// // // //     // 🚀 REAL-TIME SUBMISSION LISTENER
// // // //     useEffect(() => {
// // // //         if (!user?.uid || !assessmentId || !assessment) return;

// // // //         const q = query(collection(db, 'learner_submissions'), where('assessmentId', '==', assessmentId), where('authUid', '==', user.uid));
// // // //         const unsub = onSnapshot(q, (snap) => {
// // // //             if (!snap.empty) {
// // // //                 const activeSub = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
// // // //                 setSubmission((prev: any) => {
// // // //                     if (!prev || prev.id !== activeSub.id || prev.status !== (activeSub as any).status) {
// // // //                         return activeSub;
// // // //                     }
// // // //                     return prev;
// // // //                 });
// // // //             }
// // // //         });

// // // //         return () => unsub();
// // // //     }, [user?.uid, assessmentId, assessment]);

// // // //     useEffect(() => {
// // // //         if (!submission || !user?.uid) return;
// // // //         const _isSummative = submission.type?.toLowerCase().includes('summative');
// // // //         if (_isSummative) {
// // // //             const logsQ = query(
// // // //                 collection(db, 'curriculum_logs'),
// // // //                 where('cohortId', '==', submission.cohortId),
// // // //                 where('moduleCode', '==', submission.moduleNumber)
// // // //             );
// // // //             const unsubLogs = onSnapshot(logsQ, (snap) => {
// // // //                 setModuleLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // // //             });
// // // //             const formQ = query(
// // // //                 collection(db, 'learner_submissions'),
// // // //                 where('authUid', '==', user.uid),
// // // //                 where('moduleNumber', '==', submission.moduleNumber),
// // // //                 where('status', '==', 'moderated'),
// // // //                 where('competency', '==', 'C')
// // // //             );
// // // //             const unsubForm = onSnapshot(formQ, (snap) => {
// // // //                 setPassedFormative(!snap.empty);
// // // //             });
// // // //             return () => { unsubLogs(); unsubForm(); };
// // // //         }
// // // //     }, [submission?.id, user?.uid, submission?.type, submission?.cohortId, submission?.moduleNumber]);

// // // //     useEffect(() => {
// // // //         if (assessment?.scheduledDate && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed) {
// // // //             const interval = setInterval(() => {
// // // //                 const startTime = moment(assessment.scheduledDate).valueOf();
// // // //                 const now = getSecureNow();
// // // //                 const difference = startTime - now;
// // // //                 if (difference <= 0) {
// // // //                     setTimeToStart(0);
// // // //                     clearInterval(interval);
// // // //                 } else {
// // // //                     setTimeToStart(difference);
// // // //                 }
// // // //             }, 1000);
// // // //             return () => clearInterval(interval);
// // // //         }
// // // //     }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, getSecureNow]);

// // // //     const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed;

// // // //     useEffect(() => {
// // // //         if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock) {
// // // //             const interval = setInterval(() => {
// // // //                 const endMs = getAssessmentEndMs();
// // // //                 if (endMs && getSecureNow() >= endMs) {
// // // //                     updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // //                         status: 'missed',
// // // //                         systemNote: `Auto-swept by frontend player: Learner failed to start within the allotted timeframe.`
// // // //                     }).catch(() => { });
// // // //                     setSubmission((prev: any) => ({ ...prev, status: 'missed' }));
// // // //                     clearInterval(interval);
// // // //                 }
// // // //             }, 10000);
// // // //             return () => clearInterval(interval);
// // // //         }
// // // //     }, [isNotStarted, assessment, submission, getAssessmentEndMs, getSecureNow]);

// // // //     // ─── UNIFIED LIVE COUNTDOWN TICKER ───────────────────────────────────────
// // // //     useEffect(() => {
// // // //         if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed) return;

// // // //         const updateTimer = () => {
// // // //             const now = getSecureNow();
// // // //             const endMs = getAssessmentEndMs();
// // // //             if (endMs) {
// // // //                 setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
// // // //             }
// // // //         };

// // // //         updateTimer();
// // // //         const id = setInterval(updateTimer, 1000);
// // // //         return () => clearInterval(id);
// // // //     }, [isGloballyLocked, showGate, isPracticalModule, isMissed, assessment, submission, getAssessmentEndMs, getSecureNow]);

// // // //     // ─── AUTO-SUBMIT TRIGGER ON TIMER EXPIRATION ────────────────────────────
// // // //     useEffect(() => {
// // // //         if (timeLeft !== null && timeLeft <= 0 && !isGloballyLocked && !showGate && !isMissed && !isViolation) { // 🚀 ADDED !isViolation
// // // //             toast.error("Time is up! Auto-submitting.");
// // // //             setAnswers(latestAnswers => {
// // // //                 if (submission?.id) {
// // // //                     forceAutoSubmit(submission.id, latestAnswers);
// // // //                 }
// // // //                 return latestAnswers;
// // // //             });
// // // //         }
// // // //     }, [timeLeft, isGloballyLocked, showGate, isMissed, isViolation, submission?.id]);

// // // //     useEffect(() => {
// // // //         const fetchApprovedLogs = async () => {
// // // //             if (!user?.uid || assessment?.moduleType !== 'workplace') {
// // // //                 setLogsLoading(false);
// // // //                 return;
// // // //             }
// // // //             try {
// // // //                 setLogsLoading(true);
// // // //                 const logsRef = collection(db, 'workplace_logs');
// // // //                 const q = query(logsRef, where('learnerId', '==', user.uid), where('moduleId', '==', assessment.id), where('status', '==', 'Approved'));
// // // //                 const snapshot = await getDocs(q);
// // // //                 const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // //                 setApprovedLogs(fetchedLogs);
// // // //             } catch (error) {
// // // //                 console.error('Error fetching approved logs:', error);
// // // //                 toast.error('Failed to sync verified workplace logs.');
// // // //             } finally {
// // // //                 setLogsLoading(false);
// // // //             }
// // // //         };
// // // //         fetchApprovedLogs();
// // // //     }, [user?.uid, assessment?.id, assessment?.moduleType]);

// // // //     const getBlockGrading = (blockId: string) => {
// // // //         const g = submission?.grading || {};
// // // //         const m = submission?.moderation || {};
// // // //         const mLayer = m.breakdown?.[blockId] || {};
// // // //         const aLayer = g.assessorBreakdown?.[blockId] || {};
// // // //         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
// // // //         const legacyLayer = g.breakdown?.[blockId] || {};

// // // //         let activeLayer = fLayer || legacyLayer || {};
// // // //         if (isAssDone || g.assessorBreakdown?.[blockId]) activeLayer = aLayer;
// // // //         if (isModDone || m.breakdown?.[blockId]) activeLayer = mLayer;

// // // //         return {
// // // //             score: activeLayer?.score,
// // // //             isCorrect: activeLayer?.isCorrect,
// // // //             facIsCorrect: fLayer?.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer?.isCorrect,
// // // //             assIsCorrect: aLayer?.isCorrect,
// // // //             modIsCorrect: mLayer?.isCorrect,
// // // //             feedback: activeLayer?.feedback || '',
// // // //             facFeedback: fLayer?.feedback || legacyLayer?.feedback || '',
// // // //             assFeedback: aLayer?.feedback || '',
// // // //             modFeedback: mLayer?.feedback || '',
// // // //             criteriaResults: activeLayer?.criteriaResults || fLayer?.criteriaResults || legacyLayer?.criteriaResults || [],
// // // //         };
// // // //     };

// // // //     let grandTotalAwarded = 0;
// // // //     let grandTotalMax = 0;
// // // //     const sectionTotals: Record<string, { total: number; awarded: number }> = {};
// // // //     let currentSectionId = '';
// // // //     if (assessment?.blocks) {
// // // //         assessment.blocks.forEach((block: any) => {
// // // //             if (block.type === 'section') {
// // // //                 currentSectionId = block.id;
// // // //                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
// // // //             } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
// // // //                 const { score } = getBlockGrading(block.id);
// // // //                 const maxMarks = Number(block.marks) || 0;
// // // //                 const awarded = Number(score) || 0;
// // // //                 grandTotalMax += maxMarks;
// // // //                 if (score !== undefined && score !== null) {
// // // //                     grandTotalAwarded += awarded;
// // // //                 }
// // // //                 if (currentSectionId) {
// // // //                     sectionTotals[currentSectionId].total += maxMarks;
// // // //                     if (score !== undefined && score !== null) {
// // // //                         sectionTotals[currentSectionId].awarded += awarded;
// // // //                     }
// // // //                 }
// // // //             }
// // // //         });
// // // //     }
// // // //     const grandTotalPct = grandTotalMax > 0 ? Math.round((grandTotalAwarded / grandTotalMax) * 100) : 0;
// // // //     const savedFacRole = submission?.grading?.facilitatorRole || null;

// // // //     const getCompetencyStatus = () => {
// // // //         if (!isAssDone) return null;
// // // //         if (isRemediation && !isGloballyLocked) return null;
// // // //         const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
// // // //         let isCompetent = compStr === 'c' || compStr === 'competent';
// // // //         if (!isWorkplaceModule && !isCompetent && grandTotalAwarded !== undefined && assessment?.totalMarks)
// // // //             isCompetent = grandTotalAwarded >= assessment.totalMarks * 0.6;
// // // //         return {
// // // //             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
// // // //             color: isModDone ? 'var(--mlab-green)' : 'var(--mlab-red)',
// // // //             subtext: isModDone ? 'Final Results Verified & Endorsed.' : isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.',
// // // //             score: isWorkplaceModule ? undefined : grandTotalAwarded,
// // // //             percentage: grandTotalPct,
// // // //             isCompetent,
// // // //         };
// // // //     };
// // // //     const outcome = getCompetencyStatus();

// // // //     const handleStartAssessment = async () => {
// // // //         if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)) return;
// // // //         setIsStarting(true);
// // // //         setSaving(true);
// // // //         try {
// // // //             const functions = getFunctions();
// // // //             const startFn = httpsCallable(functions, 'startAssessment');
// // // //             const res = await startFn({ submissionId: submission.id });
// // // //             const data = res.data as any;
// // // //             const t = data.startedAt || new Date(getSecureNow()).toISOString();

// // // //             let payload: any = {};
// // // //             if (needsRemediationGate) {
// // // //                 payload['latestCoachingLog.acknowledged'] = true;
// // // //                 payload['latestCoachingLog.acknowledgedAt'] = t;
// // // //                 payload['latestCoachingLog.learnerSignatureUrl'] = learnerProfile?.signatureUrl || null;
// // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
// // // //             }

// // // //             setSubmission((p: any) => ({
// // // //                 ...p,
// // // //                 status: 'in_progress',
// // // //                 startedAt: t,
// // // //                 latestCoachingLog: p.latestCoachingLog && needsRemediationGate
// // // //                     ? { ...p.latestCoachingLog, acknowledged: true, acknowledgedAt: t, learnerSignatureUrl: learnerProfile?.signatureUrl }
// // // //                     : p.latestCoachingLog
// // // //             }));

// // // //             if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) {
// // // //                 const endMs = getAssessmentEndMs();
// // // //                 if (endMs) {
// // // //                     setTimeLeft(Math.max(0, Math.floor((endMs - getSecureNow()) / 1000)));
// // // //                 } else {
// // // //                     const extraTime = submission?.extraTimeGranted || 0;
// // // //                     setTimeLeft((assessment.moduleInfo.timeLimit + extraTime) * 60);
// // // //                 }
// // // //             }
// // // //         } catch (err: any) {
// // // //             toast.error(err.message || 'Failed to start assessment. Please check compliance.');
// // // //         } finally {
// // // //             setSaving(false);
// // // //             setIsStarting(false);
// // // //         }
// // // //     };

// // // //     const triggerAutoSave = (newAnswers: any) => {
// // // //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// // // //         setSaving(true);
// // // //         saveTimeoutRef.current = setTimeout(async () => {
// // // //             if (!submission?.id) return;
// // // //             try {
// // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
// // // //             } catch {
// // // //                 toast.error('Auto-save failed.');
// // // //             } finally {
// // // //                 setSaving(false);
// // // //             }
// // // //         }, 1200);
// // // //     };

// // // //     const SNAPSHOT_INLINE_LIMIT = 200_000;
// // // //     const codeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// // // //     const saveCodeSnapshot = useCallback(async (blockId: string, snapshot: any, dependencies?: Record<string, string>, immediate?: boolean) => {
// // // //         setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));

// // // //         const doWrite = async () => {
// // // //             if (!submission?.id) return;
// // // //             setSaving(true);
// // // //             try {
// // // //                 let fieldPayload: any;

// // // //                 if (typeof snapshot === 'string' && snapshot.length > SNAPSHOT_INLINE_LIMIT) {
// // // //                     const path = `code_snapshots/${submission.id}/${blockId}.json`;
// // // //                     await uploadString(fbStorageRef(getStorage(), path), snapshot);
// // // //                     fieldPayload = { storagePath: path, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
// // // //                 } else {
// // // //                     fieldPayload = { snapshot, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
// // // //                 }

// // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // //                     [`answers.${blockId}`]: fieldPayload,
// // // //                     lastSavedAt: new Date().toISOString()
// // // //                 });

// // // //                 setAnswers(prev => ({ ...prev, [blockId]: fieldPayload }));
// // // //             } catch (err) {
// // // //                 toast.error('Failed to save your code changes.');
// // // //                 throw err;
// // // //             } finally {
// // // //                 setSaving(false);
// // // //             }
// // // //         };

// // // //         if (immediate) {
// // // //             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
// // // //             await doWrite();
// // // //         } else {
// // // //             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
// // // //             codeSaveTimeoutRef.current = setTimeout(() => { doWrite(); }, 1200);
// // // //         }
// // // //     }, [submission?.id, toast]);

// // // //     const handleAnswerChange = (blockId: string, value: any) => {
// // // //         if (isGloballyLocked || isBlockVerified(blockId)) return;
// // // //         setAnswers(p => { const n = { ...p, [blockId]: value }; triggerAutoSave(n); return n; });
// // // //     };
// // // //     const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
// // // //         if (isGloballyLocked || isBlockVerified(blockId)) return;
// // // //         setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; triggerAutoSave(n); return n; });
// // // //     };
// // // //     const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
// // // //         if (isGloballyLocked || isBlockVerified(blockId)) return;
// // // //         setAnswers(p => {
// // // //             const blockAns = p[blockId] || {};
// // // //             const raw = blockAns[nestedKey];
// // // //             const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
// // // //             const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
// // // //             triggerAutoSave(n); return n;
// // // //         });
// // // //     };

// // // //     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
// // // //         if (!file || isGloballyLocked || isBlockVerified(blockId)) return;
// // // //         const pKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
// // // //         setUploadProgress(p => ({ ...p, [pKey]: 0 }));
// // // //         setSaving(true);
// // // //         toast.info(`Uploading ${file.name}…`);
// // // //         try {
// // // //             const storage = getStorage();
// // // //             const ref = fbStorageRef(storage, `evidence/${submission.id}/${blockId}_${Date.now()}_${file.name}`);
// // // //             const task = uploadBytesResumable(ref, file);
// // // //             task.on('state_changed',
// // // //                 snap => setUploadProgress(p => ({ ...p, [pKey]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
// // // //                 err => {
// // // //                     console.error("Firebase Storage Upload Error:", err);
// // // //                     toast.error(`Upload failed: ${err.message}. Please try again.`);
// // // //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', '');
// // // //                     else handleTaskAnswerChange(blockId, 'uploadUrl', '');
// // // //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // // //                     setSaving(false);
// // // //                 },
// // // //                 async () => {
// // // //                     const url = await getDownloadURL(task.snapshot.ref);
// // // //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', url);
// // // //                     else handleTaskAnswerChange(blockId, 'uploadUrl', url);
// // // //                     toast.success(`Uploaded: ${file.name}`);
// // // //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // // //                     setSaving(false);
// // // //                 }
// // // //             );
// // // //         } catch (err: any) {
// // // //             toast.error(`Upload failed: ${err.message}`);
// // // //             setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // // //             setSaving(false);
// // // //         }
// // // //     };

// // // //     // 🚀 BULLETPROOF AUTO-SUBMIT WITH FIRESTORE TRANSACTION
// // // //     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
// // // //         setSaving(true);
// // // //         const t = new Date(getSecureNow()).toISOString();
// // // //         try {
// // // //             await runTransaction(db, async (transaction) => {
// // // //                 const subRef = doc(db, 'learner_submissions', subId);
// // // //                 const subSnap = await transaction.get(subRef);
// // // //                 if (!subSnap.exists()) return;

// // // //                 const currentStatus = String(subSnap.data().status || '').toLowerCase();
// // // //                 // 🚀 PREVENT OVERWRITING TERMINAL OR VIOLATED STATUSES
// // // //                 if (['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed', 'missed', 'violation', 'terminated'].includes(currentStatus)) {
// // // //                     console.warn("[AUTO SUBMIT] Aborted: Assessment is already in a terminal or violated state.");
// // // //                     return;
// // // //                 }

// // // //                 transaction.update(subRef, {
// // // //                     answers: currentAnswers,
// // // //                     status: 'submitted',
// // // //                     submittedAt: t,
// // // //                     autoSubmitted: true,
// // // //                     learnerDeclaration: {
// // // //                         agreed: true,
// // // //                         timestamp: t,
// // // //                         learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// // // //                         learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// // // //                         signatureUrl: learnerProfile?.signatureUrl || null
// // // //                     },
// // // //                 });
// // // //             });
// // // //             toast.success("Time's up! Auto-submitted.");
// // // //             // The onSnapshot listener will automatically sync the local state to 'submitted' (or keep it as 'violation' if the transaction aborted)
// // // //         } catch (e) {
// // // //             console.error("Auto-submit transaction failed:", e);
// // // //         } finally {
// // // //             setSaving(false);
// // // //         }
// // // //     };

// // // //     // ─── SAFE VALIDATION WITH DETAILED CONSOLE LOGS ───────────────────────────
// // // //     const validateChecklistEvidence = () => {
// // // //         try {
// // // //             for (const block of assessment?.blocks || []) {
// // // //                 if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
// // // //                     for (let i = 0; i < (block.criteria?.length || 0); i++) {
// // // //                         const raw = answers?.[block.id]?.[`evidence_${i}`];
// // // //                         const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
// // // //                         const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
// // // //                         const has = !!(textClean || ev?.url?.trim() || ev?.code?.trim() || ev?.uploadUrl?.trim());

// // // //                         if (!has) {
// // // //                             return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title || 'Checklist'}".` };
// // // //                         }
// // // //                     }
// // // //                 }
// // // //                 if (block.type === 'qcto_workplace') {
// // // //                     const bAns = answers?.[block.id] || {};
// // // //                     for (const wa of block.workActivities || []) {
// // // //                         if (!bAns[`wa_${wa.id}_declaration`]) {
// // // //                             return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
// // // //                         }
// // // //                         for (const se of wa.evidenceItems || []) {
// // // //                             const ev = bAns[`se_${se.id}`] || {};
// // // //                             const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
// // // //                             const has = !!(textClean || ev?.url?.trim() || ev?.uploadUrl?.trim());
// // // //                             if (!has) {
// // // //                                 return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
// // // //                             }
// // // //                         }
// // // //                     }
// // // //                 }
// // // //             }
// // // //             return { valid: true };
// // // //         } catch (err) {
// // // //             return { valid: true };
// // // //         }
// // // //     };

// // // //     const triggerSubmitConfirm = () => {
// // // //         if (!declarationChecked) {
// // // //             toast.warning('Please check the "Learner Final Declaration" box before submitting.');
// // // //             return;
// // // //         }

// // // //         if (Object.keys(uploadProgress).length > 0) {
// // // //             toast.warning("Files are currently uploading. Please wait until uploads complete.");
// // // //             return;
// // // //         }

// // // //         if (assessment?.moduleType === 'workplace') {
// // // //             const workplaceBlocks = assessment.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];
// // // //             for (const block of workplaceBlocks) {
// // // //                 for (const wa of block.workActivities || []) {
// // // //                     const hasApprovedLog = (approvedLogs || []).some(log => log.workActivityId === wa.id);
// // // //                     if (!hasApprovedLog) {
// // // //                         toast.error(`Missing approved log for Work Activity: ${wa.code}. You cannot submit until your mentor approves this task.`);
// // // //                         return;
// // // //                     }
// // // //                 }
// // // //             }
// // // //         }

// // // //         if (isAwaitingSignoff || isPracticalModule) {
// // // //             const chk = validateChecklistEvidence() as any;
// // // //             if (!chk.valid) {
// // // //                 toast.warning(chk.message);
// // // //                 return;
// // // //             }
// // // //         }

// // // //         setShowSubmitConfirm(true);
// // // //     };

// // // //     // 🚀 BULLETPROOF EXECUTE SUBMIT WITH FIRESTORE TRANSACTION
// // // //     const executeSubmit = async () => {
// // // //         setShowSubmitConfirm(false);
// // // //         setSaving(true);

// // // //         const activeVMs = (window as any).__ACTIVE_VMS || {};
// // // //         for (const blockId of Object.keys(activeVMs)) {
// // // //             try {
// // // //                 const vm = activeVMs[blockId];
// // // //                 const snapshot = await vm.getFsSnapshot();

// // // //                 answers[blockId] = {
// // // //                     snapshot,
// // // //                     lastSavedAt: new Date().toISOString()
// // // //                 };
// // // //             } catch (err) {
// // // //                 console.error(`Failed to capture snapshot for sandbox ${blockId}:`, err);
// // // //             }
// // // //         }

// // // //         const t = new Date(getSecureNow()).toISOString();
// // // //         const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

// // // //         try {
// // // //             await runTransaction(db, async (transaction) => {
// // // //                 const subRef = doc(db, 'learner_submissions', submission.id);
// // // //                 const subSnap = await transaction.get(subRef);
// // // //                 if (!subSnap.exists()) throw new Error("Submission not found");

// // // //                 const currentStatus = String(subSnap.data().status || '').toLowerCase();
// // // //                 // 🚀 PREVENT OVERWRITING IF IT WAS TERMINATED OR VIOLATED IN THE BACKGROUND
// // // //                 if (['violation', 'terminated', 'missed'].includes(currentStatus)) {
// // // //                     throw new Error("Assessment is locked due to a security violation.");
// // // //                 }

// // // //                 transaction.update(subRef, {
// // // //                     answers,
// // // //                     status: nextStatus,
// // // //                     submittedAt: t,
// // // //                     learnerDeclaration: {
// // // //                         agreed: true,
// // // //                         timestamp: t,
// // // //                         learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// // // //                         learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// // // //                         signatureUrl: learnerProfile?.signatureUrl || null
// // // //                     }
// // // //                 });
// // // //             });
// // // //             toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
// // // //             setTimeout(() => window.scrollTo(0, 0), 1000);
// // // //         } catch (error: any) {
// // // //             console.error("❌ Submission Error:", error);
// // // //             toast.error(`Failed to submit: ${error.message}`);
// // // //         } finally {
// // // //             setSaving(false);
// // // //         }
// // // //     };

// // // //     const executeAppeal = async (reason: string) => {
// // // //         setShowAppealModal(false);
// // // //         setSaving(true);
// // // //         try {
// // // //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // //                 status: 'appealed',
// // // //                 appeal: { reason, date: new Date().toISOString(), status: 'pending' },
// // // //                 lastStaffEditAt: new Date().toISOString()
// // // //             });
// // // //             toast.success("Formal appeal lodged successfully.");
// // // //             setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
// // // //         } catch {
// // // //             toast.error("Failed to lodge appeal.");
// // // //         } finally { setSaving(false); }
// // // //     };

// // // //     const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride: boolean = false) => {
// // // //         if (!isGloballyLocked && !isPracticalModule && !allowOverride) {
// // // //             if (e.type === 'keydown') {
// // // //                 const keyEvent = e as React.KeyboardEvent;
// // // //                 if ((keyEvent.ctrlKey || keyEvent.metaKey) && ['c', 'v', 'x'].includes(keyEvent.key.toLowerCase())) {
// // // //                     keyEvent.preventDefault();
// // // //                     keyEvent.stopPropagation();
// // // //                     if (keyEvent.nativeEvent?.stopImmediatePropagation) {
// // // //                         keyEvent.nativeEvent.stopImmediatePropagation();
// // // //                     }
// // // //                     toast.warning("Keyboard shortcuts for Copy/Paste are disabled on Knowledge Modules.", 1500);
// // // //                     document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to use Copy/Paste keyboard shortcuts." }));
// // // //                 }
// // // //             } else {
// // // //                 e.preventDefault();
// // // //                 e.stopPropagation();
// // // //                 if (e.nativeEvent?.stopImmediatePropagation) {
// // // //                     e.nativeEvent.stopImmediatePropagation();
// // // //                 }
// // // //                 toast.warning("Copying, pasting, and dropping content is disabled to ensure academic integrity.", 15000);
// // // //                 document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to Paste or Drop external content into the assessment." }));
// // // //             }
// // // //         }
// // // //     };

// // // //     const generateCalendarLink = () => {
// // // //         if (!assessment?.scheduledDate) return "#";
// // // //         const formatToGCal = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");
// // // //         const startTime = new Date(assessment.scheduledDate);
// // // //         const durationMinutes = assessment.moduleInfo?.timeLimit || 60;
// // // //         const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
// // // //         const dtStart = formatToGCal(startTime);
// // // //         const dtEnd = formatToGCal(endTime);
// // // //         const eventTitle = encodeURIComponent(`mLab Assessment: ${assessment.title}`);
// // // //         const eventDetails = encodeURIComponent(
// // // //             `Your secure assessment module is scheduled.\n\nAccess Link: ${window.location.origin}/learner/assessment/${assessmentId}`
// // // //         );
// // // //         return `https://www.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${dtStart}/${dtEnd}&details=${eventDetails}&sf=true&output=xml`;
// // // //     };

// // // //     if (loading) return <LoadingScreen />;

// // // //     if (isAdminIntercept) {
// // // //         return (
// // // //             <AssessmentLockedScreen
// // // //                 type="admin"
// // // //                 assessmentId={assessmentId}
// // // //                 onBack={safeNavigateBack}
// // // //                 navigate={navigate}
// // // //             />
// // // //         );
// // // //     }

// // // //     if (!assessment || !submission) {
// // // //         return (
// // // //             <AssessmentLockedScreen
// // // //                 type="unavailable"
// // // //                 onBack={safeNavigateBack}
// // // //             />
// // // //         );
// // // //     }

// // // //     if (assessment?.status === 'upcoming' && !isAdminIntercept && !submission?.overrideUnlock) {
// // // //         return (
// // // //             <AssessmentLockedScreen
// // // //                 type="upcoming"
// // // //                 onBack={safeNavigateBack}
// // // //             />
// // // //         );
// // // //     }

// // // //     if (isScheduledLocked) {
// // // //         return (
// // // //             <AssessmentLockedScreen
// // // //                 type="scheduled"
// // // //                 assessment={assessment}
// // // //                 timeToStart={timeToStart}
// // // //                 getSecureNow={getSecureNow}
// // // //                 generateCalendarLink={generateCalendarLink}
// // // //                 onBack={safeNavigateBack}
// // // //             />
// // // //         );
// // // //     }

// // // //     if (isMissed) {
// // // //         return (
// // // //             <AssessmentLockedScreen
// // // //                 type="missed"
// // // //                 onBack={safeNavigateBack}
// // // //             />
// // // //         );
// // // //     }

// // // //     if (showGate) {
// // // //         return (
// // // //             <AssessmentGate
// // // //                 assessment={assessment}
// // // //                 submission={submission}
// // // //                 learnerProfile={learnerProfile}
// // // //                 isRemediation={isRemediation}
// // // //                 needsRemediationGate={needsRemediationGate}
// // // //                 isAppealUpheld={isAppealUpheld}
// // // //                 willBeProctored={willBeProctored}
// // // //                 isSummative={isSummative}
// // // //                 passedFormative={passedFormative}
// // // //                 hasOverride={hasOverride}
// // // //                 isFullyCompliant={isFullyCompliant}
// // // //                 pendingTopics={pendingTopics}
// // // //                 saving={saving}
// // // //                 isStarting={isStarting}
// // // //                 startDeclarationChecked={startDeclarationChecked}
// // // //                 coachingAckChecked={coachingAckChecked}
// // // //                 onStart={handleStartAssessment}
// // // //                 onBack={safeNavigateBack}
// // // //                 setStartDeclarationChecked={setStartDeclarationChecked}
// // // //                 setCoachingAckChecked={setCoachingAckChecked}
// // // //                 toast={toast}
// // // //             />
// // // //         );
// // // //     }

// // // //     return (
// // // //         <AssessmentPlayerContent
// // // //             user={user}
// // // //             assessment={assessment}
// // // //             submission={submission}
// // // //             answers={answers}
// // // //             learnerProfile={learnerProfile}
// // // //             learnerEnrollment={learnerEnrollment}
// // // //             assessorProfile={assessorProfile}
// // // //             moderatorProfile={moderatorProfile}
// // // //             facilitatorProfile={facilitatorProfile}
// // // //             employers={employers}
// // // //             staff={staff}
// // // //             moduleLogs={moduleLogs}
// // // //             approvedLogs={approvedLogs}
// // // //             logsLoading={logsLoading}
// // // //             saving={saving}
// // // //             setSaving={setSaving}
// // // //             uploadProgress={uploadProgress}
// // // //             setUploadProgress={setUploadProgress}
// // // //             activeTabs={activeTabs}
// // // //             setActiveTabs={setActiveTabs}
// // // //             timeLeft={timeLeft}
// // // //             isGloballyLocked={isGloballyLocked}
// // // //             isAwaitingSignoff={isAwaitingSignoff}
// // // //             isPracticalModule={isPracticalModule}
// // // //             isWorkplaceModule={isWorkplaceModule}
// // // //             isRemediation={isRemediation}
// // // //             isAppealUpheld={isAppealUpheld}
// // // //             isFacDone={isFacDone}
// // // //             isAssDone={isAssDone}
// // // //             isModDone={isModDone}
// // // //             isSubmitted={isSubmitted}
// // // //             isMissed={isMissed}
// // // //             showGate={showGate}
// // // //             showLeaveWarning={showLeaveWarning}
// // // //             setShowLeaveWarning={setShowLeaveWarning}
// // // //             showSubmitConfirm={showSubmitConfirm}
// // // //             setShowSubmitConfirm={setShowSubmitConfirm}
// // // //             showAppealModal={showAppealModal}
// // // //             setShowAppealModal={setShowAppealModal}
// // // //             declarationChecked={declarationChecked}
// // // //             setDeclarationChecked={setDeclarationChecked}
// // // //             isMobileMenuOpen={isMobileMenuOpen}
// // // //             setIsMobileMenuOpen={setIsMobileMenuOpen}
// // // //             willBeProctored={willBeProctored}
// // // //             savedFacRole={savedFacRole}
// // // //             grandTotalAwarded={grandTotalAwarded}
// // // //             grandTotalMax={grandTotalMax}
// // // //             grandTotalPct={grandTotalPct}
// // // //             sectionTotals={sectionTotals}
// // // //             outcome={outcome}
// // // //             safeNavigateBack={safeNavigateBack}
// // // //             handleAnswerChange={handleAnswerChange}
// // // //             handleTaskAnswerChange={handleTaskAnswerChange}
// // // //             handleNestedAnswerChange={handleNestedAnswerChange}
// // // //             handleFileUpload={handleFileUpload}
// // // //             triggerSubmitConfirm={triggerSubmitConfirm}
// // // //             executeSubmit={executeSubmit}
// // // //             executeAppeal={executeAppeal}
// // // //             preventCopyPasteAndDrop={preventCopyPasteAndDrop}
// // // //             getBlockGrading={getBlockGrading}
// // // //             isBlockVerified={isBlockVerified}
// // // //             getSecureNow={getSecureNow}
// // // //             toast={toast}
// // // //             codeSnapshots={codeSnapshots}
// // // //             saveCodeSnapshot={saveCodeSnapshot}
// // // //         />
// // // //     );
// // // // };

// // // // export default AssessmentPlayer;


// // // // // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // // // // import { useParams, useNavigate, useLocation } from 'react-router-dom';
// // // // // import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot } from 'firebase/firestore';
// // // // // import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, uploadString } from 'firebase/storage';
// // // // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // // // import { db } from '../../../lib/firebase';
// // // // // import { useStore } from '../../../store/useStore';
// // // // // import { useToast } from '../../../components/common/Toast/Toast';
// // // // // import './AssessmentPlayer.css';
// // // // // import moment from 'moment';

// // // // // import { AssessmentGate } from './AssessmentGate';
// // // // // import { AssessmentLockedScreen } from './AssessmentLockedScreen';
// // // // // import AssessmentPlayerContent from './AssessmentPlayerContent';

// // // // // const LoadingScreen: React.FC = () => (
// // // // //     <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
// // // // //         <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
// // // // //     </div>
// // // // // );

// // // // // const AssessmentPlayer: React.FC = () => {
// // // // //     const { assessmentId } = useParams<{ assessmentId: string }>();
// // // // //     const navigate = useNavigate();
// // // // //     const location = useLocation();

// // // // //     const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
// // // // //     const toast = useToast();

// // // // //     const safeNavigateBack = () => {
// // // // //         if (location.key === 'default') {
// // // // //             navigate(user?.role === 'learner' ? '/learner/dashboard' : '/');
// // // // //         } else {
// // // // //             navigate(-1);
// // // // //         }
// // // // //     };

// // // // //     const [loading, setLoading] = useState(true);
// // // // //     const [saving, setSaving] = useState(false);
// // // // //     const [isStarting, setIsStarting] = useState(false);

// // // // //     const [assessment, setAssessment] = useState<any>(null);
// // // // //     const [submission, setSubmission] = useState<any>(null);
// // // // //     const [answers, setAnswers] = useState<Record<string, any>>({});
// // // // //     const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
// // // // //     const [codeSnapshots, setCodeSnapshots] = useState<Record<string, any>>({});
// // // // //     const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
// // // // //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// // // // //     const [learnerEnrollment, setLearnerEnrollment] = useState<any>(null);
// // // // //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// // // // //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);
// // // // //     const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);
// // // // //     const [declarationChecked, setDeclarationChecked] = useState(false);
// // // // //     const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
// // // // //     const [coachingAckChecked, setCoachingAckChecked] = useState(false);
// // // // //     const [isAdminIntercept, setIsAdminIntercept] = useState(false);
// // // // //     const [showLeaveWarning, setShowLeaveWarning] = useState(false);
// // // // //     const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
// // // // //     const [showAppealModal, setShowAppealModal] = useState(false);
// // // // //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

// // // // //     const [moduleLogs, setModuleLogs] = useState<any[]>([]);
// // // // //     const [passedFormative, setPassedFormative] = useState(false);
// // // // //     const [approvedLogs, setApprovedLogs] = useState<any[]>([]);
// // // // //     const [logsLoading, setLogsLoading] = useState<boolean>(false);

// // // // //     const [timeLeft, setTimeLeft] = useState<number | null>(null);
// // // // //     const [timeOffset, setTimeOffset] = useState<number>(0);
// // // // //     const [timeToStart, setTimeToStart] = useState<number | null>(null);

// // // // //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// // // // //     const answersRef = useRef(answers);
// // // // //     useEffect(() => { answersRef.current = answers; }, [answers]);

// // // // //     const currentStatus = String(submission?.status || '').toLowerCase();
// // // // //     const isMissed = currentStatus === 'missed';
// // // // //     const isViolation = currentStatus === 'violation'; // 🚀 ADDED VIOLATION STATUS
// // // // //     const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
// // // // //     const isAppealUpheld = submission?.appeal?.status === 'upheld';
// // // // //     const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// // // // //     const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// // // // //     const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
// // // // //     const isModDone = ['moderated', 'appealed'].includes(currentStatus);
// // // // //     const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
// // // // //     const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
// // // // //     const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
// // // // //     const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;
// // // // //     const isRemediation = (submission?.attemptNumber || 1) > 1;
// // // // //     const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged && !isAppealUpheld;
// // // // //     const isNotStarted = currentStatus === 'not_started';
// // // // //     const showGate = isNotStarted || needsRemediationGate;

// // // // //     // 🚀 ADDED isViolation HERE SO PROCTORING GATE IS BYPASSED
// // // // //     const isGloballyLocked = isSubmitted || isAwaitingSignoff || isMissed || isViolation;
// // // // //     const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

// // // // //     const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
// // // // //         ? assessment.requiresInvigilation
// // // // //         : !isPracticalModule;

// // // // //     // 🚀 EXPLICITLY PREVENT PROCTORING IF VIOLATED
// // // // //     const willBeProctored = isInvigilationEnabled && !isGloballyLocked && !isViolation;

// // // // //     const isSummative = submission?.type?.toLowerCase().includes('summative') || false;
// // // // //     const hasOverride = submission?.facilitatorOverride === true;

// // // // //     const pendingTopics = useMemo(() => {
// // // // //         if (!submission || !moduleLogs) return [];
// // // // //         return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
// // // // //     }, [moduleLogs, submission]);

// // // // //     const isFullyCompliant = pendingTopics.length === 0;

// // // // //     const isBlockVerified = (blockId: string) => {
// // // // //         const facGrade = submission?.grading?.facilitatorBreakdown?.[blockId];
// // // // //         return facGrade?.isCorrect === true || facGrade?.obsDeclaration === true;
// // // // //     };

// // // // //     const getSecureNow = useCallback(() => Date.now() + timeOffset, [timeOffset]);

// // // // //     // ─── UNIFIED TIMER END-TIME CALCULATION ──────────────────────────────────
// // // // //     const getAssessmentEndMs = useCallback(() => {
// // // // //         if (!assessment) return null;
// // // // //         const baseLimit = assessment.moduleInfo?.timeLimit || 0;
// // // // //         if (baseLimit <= 0) return null;

// // // // //         const extraTime = submission?.extraTimeGranted || 0;
// // // // //         const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;

// // // // //         // Scheduled exams anchor strictly to scheduledDate
// // // // //         if (assessment.isScheduled && assessment.scheduledDate && !submission?.overrideUnlock) {
// // // // //             return moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
// // // // //         }

// // // // //         // Non-scheduled / override exams anchor to learner start time
// // // // //         if (submission?.startedAt) {
// // // // //             return new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
// // // // //         }

// // // // //         return null;
// // // // //     }, [assessment, submission]);

// // // // //     // ─── FETCH TIME OFFSET (CACHE-BUSTED & SANITY-CHECKED) ─────────────────
// // // // //     useEffect(() => {
// // // // //         const fetchOffset = async () => {
// // // // //             try {
// // // // //                 const res = await fetch(`https://timeapi.io/api/Time/current/zone?timeZone=UTC&nocache=${Date.now()}`, {
// // // // //                     cache: 'no-store',
// // // // //                     headers: {
// // // // //                         'Cache-Control': 'no-cache, no-store, must-revalidate',
// // // // //                         'Pragma': 'no-cache'
// // // // //                     }
// // // // //                 });

// // // // //                 if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
// // // // //                 const data = await res.json();

// // // // //                 const secureUTCTime = new Date(data.dateTime + 'Z').getTime();
// // // // //                 const localTime = Date.now();
// // // // //                 const calculatedOffset = secureUTCTime - localTime;

// // // // //                 if (Math.abs(calculatedOffset) > 5 * 60 * 1000) {
// // // // //                     setTimeOffset(0);
// // // // //                 } else {
// // // // //                     setTimeOffset(calculatedOffset);
// // // // //                 }
// // // // //             } catch (err) {
// // // // //                 console.warn('[TIMER DEBUG] Time API unavailable or blocked. Using local device clock:', err);
// // // // //                 setTimeOffset(0);
// // // // //             }
// // // // //         };

// // // // //         fetchOffset();
// // // // //     }, []);

// // // // //     useEffect(() => {
// // // // //         if (employers.length === 0) fetchEmployers();
// // // // //         if (staff.length === 0) fetchStaff();

// // // // //         const load = async () => {
// // // // //             if (!user?.uid || !assessmentId) return;

// // // // //             if (user.role && user.role !== 'learner') {
// // // // //                 setIsAdminIntercept(true);
// // // // //                 setLoading(false);
// // // // //                 return;
// // // // //             }

// // // // //             try {
// // // // //                 const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
// // // // //                 if (!assSnap.exists()) {
// // // // //                     toast.error('Assessment template not found.');
// // // // //                     setLoading(false);
// // // // //                     return;
// // // // //                 }
// // // // //                 const assData = assSnap.data();
// // // // //                 setAssessment(assData);

// // // // //                 let userProfile: any = {};
// // // // //                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
// // // // //                 if (userDocSnap.exists()) {
// // // // //                     userProfile = { id: userDocSnap.id, ...userDocSnap.data() };
// // // // //                 }
// // // // //                 setLearnerProfile(userProfile);

// // // // //                 let targetLearnerId = user.uid;
// // // // //                 let learnerCohortId: string | null = null;
// // // // //                 let validEnrollmentId: string | null = null;

// // // // //                 if (user?.role === 'learner') {
// // // // //                     try {
// // // // //                         const enrolQ = query(collection(db, 'enrollments'), where('authUid', '==', user.uid), where('status', '==', 'active'));
// // // // //                         const enrolSnap = await getDocs(enrolQ);
// // // // //                         if (!enrolSnap.empty) {
// // // // //                             const enrolData = enrolSnap.docs[0].data();
// // // // //                             validEnrollmentId = enrolSnap.docs[0].id;
// // // // //                             targetLearnerId = enrolData.learnerId || enrolData.id || user.uid;
// // // // //                             learnerCohortId = enrolData.cohortId;
// // // // //                         }
// // // // //                     } catch (e) {
// // // // //                         console.warn("Enrollment lookup failed.", e);
// // // // //                     }
// // // // //                 }

// // // // //                 let activeSub: any = null;
// // // // //                 try {
// // // // //                     const subQuery1 = query(collection(db, 'learner_submissions'), where('assessmentId', '==', assessmentId), where('authUid', '==', user.uid));
// // // // //                     const subSnap1 = await getDocs(subQuery1);
// // // // //                     if (!subSnap1.empty) {
// // // // //                         activeSub = subSnap1.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
// // // // //                     }
// // // // //                 } catch (qErr) {
// // // // //                     console.warn("Primary submission query failed.", qErr);
// // // // //                 }

// // // // //                 if (!activeSub && user?.role === 'learner') {
// // // // //                     const fallbackCohortId = learnerCohortId || assData.cohortId || (assData.cohortIds && assData.cohortIds[0]) || 'unassigned';
// // // // //                     const isLive = ['active', 'scheduled', 'upcoming', 'published'].includes(assData.status);
// // // // //                     if (isLive) {
// // // // //                         const sid = `${fallbackCohortId}_${targetLearnerId}_${assessmentId}`;
// // // // //                         const newSub = {
// // // // //                             learnerId: targetLearnerId,
// // // // //                             enrollmentId: validEnrollmentId || "",
// // // // //                             authUid: user.uid,
// // // // //                             qualificationName: userProfile.qualification?.name || "",
// // // // //                             assessmentId: assessmentId,
// // // // //                             cohortId: fallbackCohortId,
// // // // //                             title: assData.title,
// // // // //                             type: assData.type || 'formative',
// // // // //                             moduleType: assData.moduleType || 'knowledge',
// // // // //                             status: assData.status === 'upcoming' ? 'upcoming' : 'not_started',
// // // // //                             assignedAt: new Date().toISOString(),
// // // // //                             marks: 0,
// // // // //                             totalMarks: assData.totalMarks || 0,
// // // // //                             moduleNumber: assData.moduleInfo?.moduleNumber || "",
// // // // //                             timeLimit: assData.moduleInfo?.timeLimit || 0,
// // // // //                             isScheduled: assData.isScheduled || assData.status === 'scheduled' || false,
// // // // //                             scheduledDate: assData.scheduledDate || null,
// // // // //                             createdAt: new Date().toISOString(),
// // // // //                             createdBy: "System_Player_AutoHydration"
// // // // //                         };
// // // // //                         await setDoc(doc(db, "learner_submissions", sid), newSub);
// // // // //                         activeSub = { id: sid, ...newSub };
// // // // //                     }
// // // // //                 }

// // // // //                 if (activeSub) {
// // // // //                     setSubmission(activeSub);
// // // // //                     setAnswers(activeSub.answers || {});
// // // // //                     if (activeSub.enrollmentId) {
// // // // //                         const e = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId));
// // // // //                         if (e.exists()) setLearnerEnrollment(e.data());
// // // // //                     }
// // // // //                     if (activeSub.grading?.gradedBy) {
// // // // //                         const s = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
// // // // //                         if (s.exists()) setAssessorProfile(s.data());
// // // // //                     }
// // // // //                     if (activeSub.moderation?.moderatedBy) {
// // // // //                         const s = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
// // // // //                         if (s.exists()) setModeratorProfile(s.data());
// // // // //                     }
// // // // //                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
// // // // //                     if (facId) {
// // // // //                         const s = await getDoc(doc(db, 'users', facId));
// // // // //                         if (s.exists()) setFacilitatorProfile(s.data());
// // // // //                     }
// // // // //                 } else {
// // // // //                     toast.error('Assessment unavailable. It may not be published yet.');
// // // // //                 }
// // // // //             } catch (err) {
// // // // //                 console.error("Fatal error loading assessment data:", err);
// // // // //                 toast.error('Failed to load assessment data.');
// // // // //             } finally {
// // // // //                 setLoading(false);
// // // // //             }
// // // // //         };

// // // // //         if (timeOffset !== null) load();
// // // // //     }, [assessmentId, user?.uid, timeOffset]);

// // // // //     useEffect(() => {
// // // // //         if (!submission || !user?.uid) return;
// // // // //         const _isSummative = submission.type?.toLowerCase().includes('summative');
// // // // //         if (_isSummative) {
// // // // //             const logsQ = query(
// // // // //                 collection(db, 'curriculum_logs'),
// // // // //                 where('cohortId', '==', submission.cohortId),
// // // // //                 where('moduleCode', '==', submission.moduleNumber)
// // // // //             );
// // // // //             const unsubLogs = onSnapshot(logsQ, (snap) => {
// // // // //                 setModuleLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // // // //             });
// // // // //             const formQ = query(
// // // // //                 collection(db, 'learner_submissions'),
// // // // //                 where('authUid', '==', user.uid),
// // // // //                 where('moduleNumber', '==', submission.moduleNumber),
// // // // //                 where('status', '==', 'moderated'),
// // // // //                 where('competency', '==', 'C')
// // // // //             );
// // // // //             const unsubForm = onSnapshot(formQ, (snap) => {
// // // // //                 setPassedFormative(!snap.empty);
// // // // //             });
// // // // //             return () => { unsubLogs(); unsubForm(); };
// // // // //         }
// // // // //     }, [submission?.id, user?.uid, submission?.type, submission?.cohortId, submission?.moduleNumber]);

// // // // //     useEffect(() => {
// // // // //         if (assessment?.scheduledDate && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed) {
// // // // //             const interval = setInterval(() => {
// // // // //                 const startTime = moment(assessment.scheduledDate).valueOf();
// // // // //                 const now = getSecureNow();
// // // // //                 const difference = startTime - now;
// // // // //                 if (difference <= 0) {
// // // // //                     setTimeToStart(0);
// // // // //                     clearInterval(interval);
// // // // //                 } else {
// // // // //                     setTimeToStart(difference);
// // // // //                 }
// // // // //             }, 1000);
// // // // //             return () => clearInterval(interval);
// // // // //         }
// // // // //     }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, getSecureNow]);

// // // // //     const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed;

// // // // //     useEffect(() => {
// // // // //         if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock) {
// // // // //             const interval = setInterval(() => {
// // // // //                 const endMs = getAssessmentEndMs();
// // // // //                 if (endMs && getSecureNow() >= endMs) {
// // // // //                     updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // //                         status: 'missed',
// // // // //                         systemNote: `Auto-swept by frontend player: Learner failed to start within the allotted timeframe.`
// // // // //                     }).catch(() => { });
// // // // //                     setSubmission((prev: any) => ({ ...prev, status: 'missed' }));
// // // // //                     clearInterval(interval);
// // // // //                 }
// // // // //             }, 10000);
// // // // //             return () => clearInterval(interval);
// // // // //         }
// // // // //     }, [isNotStarted, assessment, submission, getAssessmentEndMs, getSecureNow]);

// // // // //     // ─── UNIFIED LIVE COUNTDOWN TICKER ───────────────────────────────────────
// // // // //     useEffect(() => {
// // // // //         if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed) return;

// // // // //         const updateTimer = () => {
// // // // //             const now = getSecureNow();
// // // // //             const endMs = getAssessmentEndMs();
// // // // //             if (endMs) {
// // // // //                 setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
// // // // //             }
// // // // //         };

// // // // //         updateTimer();
// // // // //         const id = setInterval(updateTimer, 1000);
// // // // //         return () => clearInterval(id);
// // // // //     }, [isGloballyLocked, showGate, isPracticalModule, isMissed, assessment, submission, getAssessmentEndMs, getSecureNow]);

// // // // //     // ─── AUTO-SUBMIT TRIGGER ON TIMER EXPIRATION ────────────────────────────
// // // // //     useEffect(() => {
// // // // //         if (timeLeft !== null && timeLeft <= 0 && !isGloballyLocked && !showGate && !isMissed) {
// // // // //             toast.error("Time is up! Auto-submitting.");
// // // // //             setAnswers(latestAnswers => {
// // // // //                 if (submission?.id) {
// // // // //                     forceAutoSubmit(submission.id, latestAnswers);
// // // // //                 }
// // // // //                 return latestAnswers;
// // // // //             });
// // // // //         }
// // // // //     }, [timeLeft, isGloballyLocked, showGate, isMissed, submission?.id]);

// // // // //     useEffect(() => {
// // // // //         const fetchApprovedLogs = async () => {
// // // // //             if (!user?.uid || assessment?.moduleType !== 'workplace') {
// // // // //                 setLogsLoading(false);
// // // // //                 return;
// // // // //             }
// // // // //             try {
// // // // //                 setLogsLoading(true);
// // // // //                 const logsRef = collection(db, 'workplace_logs');
// // // // //                 const q = query(logsRef, where('learnerId', '==', user.uid), where('moduleId', '==', assessment.id), where('status', '==', 'Approved'));
// // // // //                 const snapshot = await getDocs(q);
// // // // //                 const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // // //                 setApprovedLogs(fetchedLogs);
// // // // //             } catch (error) {
// // // // //                 console.error('Error fetching approved logs:', error);
// // // // //                 toast.error('Failed to sync verified workplace logs.');
// // // // //             } finally {
// // // // //                 setLogsLoading(false);
// // // // //             }
// // // // //         };
// // // // //         fetchApprovedLogs();
// // // // //     }, [user?.uid, assessment?.id, assessment?.moduleType]);

// // // // //     const getBlockGrading = (blockId: string) => {
// // // // //         const g = submission?.grading || {};
// // // // //         const m = submission?.moderation || {};
// // // // //         const mLayer = m.breakdown?.[blockId] || {};
// // // // //         const aLayer = g.assessorBreakdown?.[blockId] || {};
// // // // //         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
// // // // //         const legacyLayer = g.breakdown?.[blockId] || {};

// // // // //         let activeLayer = fLayer || legacyLayer || {};
// // // // //         if (isAssDone || g.assessorBreakdown?.[blockId]) activeLayer = aLayer;
// // // // //         if (isModDone || m.breakdown?.[blockId]) activeLayer = mLayer;

// // // // //         return {
// // // // //             score: activeLayer?.score,
// // // // //             isCorrect: activeLayer?.isCorrect,
// // // // //             facIsCorrect: fLayer?.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer?.isCorrect,
// // // // //             assIsCorrect: aLayer?.isCorrect,
// // // // //             modIsCorrect: mLayer?.isCorrect,
// // // // //             feedback: activeLayer?.feedback || '',
// // // // //             facFeedback: fLayer?.feedback || legacyLayer?.feedback || '',
// // // // //             assFeedback: aLayer?.feedback || '',
// // // // //             modFeedback: mLayer?.feedback || '',
// // // // //             criteriaResults: activeLayer?.criteriaResults || fLayer?.criteriaResults || legacyLayer?.criteriaResults || [],
// // // // //         };
// // // // //     };

// // // // //     let grandTotalAwarded = 0;
// // // // //     let grandTotalMax = 0;
// // // // //     const sectionTotals: Record<string, { total: number; awarded: number }> = {};
// // // // //     let currentSectionId = '';
// // // // //     if (assessment?.blocks) {
// // // // //         assessment.blocks.forEach((block: any) => {
// // // // //             if (block.type === 'section') {
// // // // //                 currentSectionId = block.id;
// // // // //                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
// // // // //             } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
// // // // //                 const { score } = getBlockGrading(block.id);
// // // // //                 const maxMarks = Number(block.marks) || 0;
// // // // //                 const awarded = Number(score) || 0;
// // // // //                 grandTotalMax += maxMarks;
// // // // //                 if (score !== undefined && score !== null) {
// // // // //                     grandTotalAwarded += awarded;
// // // // //                 }
// // // // //                 if (currentSectionId) {
// // // // //                     sectionTotals[currentSectionId].total += maxMarks;
// // // // //                     if (score !== undefined && score !== null) {
// // // // //                         sectionTotals[currentSectionId].awarded += awarded;
// // // // //                     }
// // // // //                 }
// // // // //             }
// // // // //         });
// // // // //     }
// // // // //     const grandTotalPct = grandTotalMax > 0 ? Math.round((grandTotalAwarded / grandTotalMax) * 100) : 0;
// // // // //     const savedFacRole = submission?.grading?.facilitatorRole || null;

// // // // //     const getCompetencyStatus = () => {
// // // // //         if (!isAssDone) return null;
// // // // //         if (isRemediation && !isGloballyLocked) return null;
// // // // //         const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
// // // // //         let isCompetent = compStr === 'c' || compStr === 'competent';
// // // // //         if (!isWorkplaceModule && !isCompetent && grandTotalAwarded !== undefined && assessment?.totalMarks)
// // // // //             isCompetent = grandTotalAwarded >= assessment.totalMarks * 0.6;
// // // // //         return {
// // // // //             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
// // // // //             color: isModDone ? 'var(--mlab-green)' : 'var(--mlab-red)',
// // // // //             subtext: isModDone ? 'Final Results Verified & Endorsed.' : isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.',
// // // // //             score: isWorkplaceModule ? undefined : grandTotalAwarded,
// // // // //             percentage: grandTotalPct,
// // // // //             isCompetent,
// // // // //         };
// // // // //     };
// // // // //     const outcome = getCompetencyStatus();

// // // // //     const handleStartAssessment = async () => {
// // // // //         if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)) return;
// // // // //         setIsStarting(true);
// // // // //         setSaving(true);
// // // // //         try {
// // // // //             const functions = getFunctions();
// // // // //             const startFn = httpsCallable(functions, 'startAssessment');
// // // // //             const res = await startFn({ submissionId: submission.id });
// // // // //             const data = res.data as any;
// // // // //             const t = data.startedAt || new Date(getSecureNow()).toISOString();

// // // // //             let payload: any = {};
// // // // //             if (needsRemediationGate) {
// // // // //                 payload['latestCoachingLog.acknowledged'] = true;
// // // // //                 payload['latestCoachingLog.acknowledgedAt'] = t;
// // // // //                 payload['latestCoachingLog.learnerSignatureUrl'] = learnerProfile?.signatureUrl || null;
// // // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
// // // // //             }

// // // // //             setSubmission((p: any) => ({
// // // // //                 ...p,
// // // // //                 status: 'in_progress',
// // // // //                 startedAt: t,
// // // // //                 latestCoachingLog: p.latestCoachingLog && needsRemediationGate
// // // // //                     ? { ...p.latestCoachingLog, acknowledged: true, acknowledgedAt: t, learnerSignatureUrl: learnerProfile?.signatureUrl }
// // // // //                     : p.latestCoachingLog
// // // // //             }));

// // // // //             if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) {
// // // // //                 const endMs = getAssessmentEndMs();
// // // // //                 if (endMs) {
// // // // //                     setTimeLeft(Math.max(0, Math.floor((endMs - getSecureNow()) / 1000)));
// // // // //                 } else {
// // // // //                     const extraTime = submission?.extraTimeGranted || 0;
// // // // //                     setTimeLeft((assessment.moduleInfo.timeLimit + extraTime) * 60);
// // // // //                 }
// // // // //             }
// // // // //         } catch (err: any) {
// // // // //             toast.error(err.message || 'Failed to start assessment. Please check compliance.');
// // // // //         } finally {
// // // // //             setSaving(false);
// // // // //             setIsStarting(false);
// // // // //         }
// // // // //     };

// // // // //     const triggerAutoSave = (newAnswers: any) => {
// // // // //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// // // // //         setSaving(true);
// // // // //         saveTimeoutRef.current = setTimeout(async () => {
// // // // //             if (!submission?.id) return;
// // // // //             try {
// // // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
// // // // //             } catch {
// // // // //                 toast.error('Auto-save failed.');
// // // // //             } finally {
// // // // //                 setSaving(false);
// // // // //             }
// // // // //         }, 1200);
// // // // //     };

// // // // //     const SNAPSHOT_INLINE_LIMIT = 200_000;
// // // // //     const codeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// // // // //     const saveCodeSnapshot = useCallback(async (blockId: string, snapshot: any, dependencies?: Record<string, string>, immediate?: boolean) => {
// // // // //         setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));

// // // // //         const doWrite = async () => {
// // // // //             if (!submission?.id) return;
// // // // //             setSaving(true);
// // // // //             try {
// // // // //                 let fieldPayload: any;

// // // // //                 if (typeof snapshot === 'string' && snapshot.length > SNAPSHOT_INLINE_LIMIT) {
// // // // //                     const path = `code_snapshots/${submission.id}/${blockId}.json`;
// // // // //                     await uploadString(fbStorageRef(getStorage(), path), snapshot);
// // // // //                     fieldPayload = { storagePath: path, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
// // // // //                 } else {
// // // // //                     fieldPayload = { snapshot, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
// // // // //                 }

// // // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // //                     [`answers.${blockId}`]: fieldPayload,
// // // // //                     lastSavedAt: new Date().toISOString()
// // // // //                 });

// // // // //                 setAnswers(prev => ({ ...prev, [blockId]: fieldPayload }));
// // // // //             } catch (err) {
// // // // //                 toast.error('Failed to save your code changes.');
// // // // //                 throw err;
// // // // //             } finally {
// // // // //                 setSaving(false);
// // // // //             }
// // // // //         };

// // // // //         if (immediate) {
// // // // //             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
// // // // //             await doWrite();
// // // // //         } else {
// // // // //             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
// // // // //             codeSaveTimeoutRef.current = setTimeout(() => { doWrite(); }, 1200);
// // // // //         }
// // // // //     }, [submission?.id, toast]);

// // // // //     const handleAnswerChange = (blockId: string, value: any) => {
// // // // //         if (isGloballyLocked || isBlockVerified(blockId)) return;
// // // // //         setAnswers(p => { const n = { ...p, [blockId]: value }; triggerAutoSave(n); return n; });
// // // // //     };
// // // // //     const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
// // // // //         if (isGloballyLocked || isBlockVerified(blockId)) return;
// // // // //         setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; triggerAutoSave(n); return n; });
// // // // //     };
// // // // //     const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
// // // // //         if (isGloballyLocked || isBlockVerified(blockId)) return;
// // // // //         setAnswers(p => {
// // // // //             const blockAns = p[blockId] || {};
// // // // //             const raw = blockAns[nestedKey];
// // // // //             const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
// // // // //             const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
// // // // //             triggerAutoSave(n); return n;
// // // // //         });
// // // // //     };

// // // // //     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
// // // // //         if (!file || isGloballyLocked || isBlockVerified(blockId)) return;
// // // // //         const pKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
// // // // //         setUploadProgress(p => ({ ...p, [pKey]: 0 }));
// // // // //         setSaving(true);
// // // // //         toast.info(`Uploading ${file.name}…`);
// // // // //         try {
// // // // //             const storage = getStorage();
// // // // //             const ref = fbStorageRef(storage, `evidence/${submission.id}/${blockId}_${Date.now()}_${file.name}`);
// // // // //             const task = uploadBytesResumable(ref, file);
// // // // //             task.on('state_changed',
// // // // //                 snap => setUploadProgress(p => ({ ...p, [pKey]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
// // // // //                 err => {
// // // // //                     console.error("Firebase Storage Upload Error:", err);
// // // // //                     toast.error(`Upload failed: ${err.message}. Please try again.`);
// // // // //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', '');
// // // // //                     else handleTaskAnswerChange(blockId, 'uploadUrl', '');
// // // // //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // // // //                     setSaving(false);
// // // // //                 },
// // // // //                 async () => {
// // // // //                     const url = await getDownloadURL(task.snapshot.ref);
// // // // //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', url);
// // // // //                     else handleTaskAnswerChange(blockId, 'uploadUrl', url);
// // // // //                     toast.success(`Uploaded: ${file.name}`);
// // // // //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // // // //                     setSaving(false);
// // // // //                 }
// // // // //             );
// // // // //         } catch (err: any) {
// // // // //             toast.error(`Upload failed: ${err.message}`);
// // // // //             setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // // // //             setSaving(false);
// // // // //         }
// // // // //     };

// // // // //     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
// // // // //         setSaving(true);
// // // // //         const t = new Date(getSecureNow()).toISOString();
// // // // //         try {
// // // // //             await updateDoc(doc(db, 'learner_submissions', subId), {
// // // // //                 answers: currentAnswers, status: 'submitted', submittedAt: t, autoSubmitted: true,
// // // // //                 learnerDeclaration: {
// // // // //                     agreed: true,
// // // // //                     timestamp: t,
// // // // //                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// // // // //                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// // // // //                     signatureUrl: learnerProfile?.signatureUrl || null
// // // // //                 },
// // // // //             });
// // // // //             toast.success("Time's up! Auto-submitted.");
// // // // //             setSubmission((p: any) => ({ ...p, status: 'submitted', learnerDeclaration: { signatureUrl: learnerProfile?.signatureUrl || null, timestamp: t, learnerName: learnerProfile?.fullName || 'Unknown' } }));
// // // // //             setTimeout(() => safeNavigateBack(), 3000);
// // // // //         } catch (e) { console.error(e); } finally { setSaving(false); }
// // // // //     };

// // // // //     // ─── SAFE VALIDATION WITH DETAILED CONSOLE LOGS ───────────────────────────
// // // // //     const validateChecklistEvidence = () => {
// // // // //         try {
// // // // //             for (const block of assessment?.blocks || []) {
// // // // //                 if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
// // // // //                     for (let i = 0; i < (block.criteria?.length || 0); i++) {
// // // // //                         const raw = answers?.[block.id]?.[`evidence_${i}`];
// // // // //                         const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
// // // // //                         const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
// // // // //                         const has = !!(textClean || ev?.url?.trim() || ev?.code?.trim() || ev?.uploadUrl?.trim());

// // // // //                         if (!has) {
// // // // //                             return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title || 'Checklist'}".` };
// // // // //                         }
// // // // //                     }
// // // // //                 }
// // // // //                 if (block.type === 'qcto_workplace') {
// // // // //                     const bAns = answers?.[block.id] || {};
// // // // //                     for (const wa of block.workActivities || []) {
// // // // //                         if (!bAns[`wa_${wa.id}_declaration`]) {
// // // // //                             return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
// // // // //                         }
// // // // //                         for (const se of wa.evidenceItems || []) {
// // // // //                             const ev = bAns[`se_${se.id}`] || {};
// // // // //                             const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
// // // // //                             const has = !!(textClean || ev?.url?.trim() || ev?.uploadUrl?.trim());
// // // // //                             if (!has) {
// // // // //                                 return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
// // // // //                             }
// // // // //                         }
// // // // //                     }
// // // // //                 }
// // // // //             }
// // // // //             return { valid: true };
// // // // //         } catch (err) {
// // // // //             return { valid: true }; // Fail-open so learner is never trapped by code exceptions
// // // // //         }
// // // // //     };

// // // // //     const triggerSubmitConfirm = () => {
// // // // //         if (!declarationChecked) {
// // // // //             toast.warning('Please check the "Learner Final Declaration" box before submitting.');
// // // // //             return;
// // // // //         }

// // // // //         if (Object.keys(uploadProgress).length > 0) {
// // // // //             toast.warning("Files are currently uploading. Please wait until uploads complete.");
// // // // //             return;
// // // // //         }

// // // // //         if (assessment?.moduleType === 'workplace') {
// // // // //             const workplaceBlocks = assessment.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];
// // // // //             for (const block of workplaceBlocks) {
// // // // //                 for (const wa of block.workActivities || []) {
// // // // //                     const hasApprovedLog = (approvedLogs || []).some(log => log.workActivityId === wa.id);
// // // // //                     if (!hasApprovedLog) {
// // // // //                         toast.error(`Missing approved log for Work Activity: ${wa.code}. You cannot submit until your mentor approves this task.`);
// // // // //                         return;
// // // // //                     }
// // // // //                 }
// // // // //             }
// // // // //         }

// // // // //         if (isAwaitingSignoff || isPracticalModule) {
// // // // //             const chk = validateChecklistEvidence() as any;
// // // // //             if (!chk.valid) {
// // // // //                 toast.warning(chk.message);
// // // // //                 return;
// // // // //             }
// // // // //         }

// // // // //         setShowSubmitConfirm(true);
// // // // //     };

// // // // //     const executeSubmit = async () => {
// // // // //         setShowSubmitConfirm(false);
// // // // //         setSaving(true);

// // // // //         const activeVMs = (window as any).__ACTIVE_VMS || {};
// // // // //         for (const blockId of Object.keys(activeVMs)) {
// // // // //             try {
// // // // //                 const vm = activeVMs[blockId];
// // // // //                 const snapshot = await vm.getFsSnapshot();

// // // // //                 answers[blockId] = {
// // // // //                     snapshot,
// // // // //                     lastSavedAt: new Date().toISOString()
// // // // //                 };
// // // // //             } catch (err) {
// // // // //                 console.error(`Failed to capture snapshot for sandbox ${blockId}:`, err);
// // // // //             }
// // // // //         }

// // // // //         const t = new Date(getSecureNow()).toISOString();
// // // // //         const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

// // // // //         const payload = {
// // // // //             answers,
// // // // //             status: nextStatus,
// // // // //             submittedAt: t,
// // // // //             learnerDeclaration: {
// // // // //                 agreed: true,
// // // // //                 timestamp: t,
// // // // //                 learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// // // // //                 learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// // // // //                 signatureUrl: learnerProfile?.signatureUrl || null
// // // // //             }
// // // // //         };

// // // // //         try {
// // // // //             await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
// // // // //             toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
// // // // //             setSubmission((p: any) => ({ ...p, status: nextStatus, learnerDeclaration: payload.learnerDeclaration }));
// // // // //             setTimeout(() => window.scrollTo(0, 0), 1000);
// // // // //         } catch (error: any) {
// // // // //             console.error("❌ Submission Error:", error);
// // // // //             toast.error(`Failed to submit: ${error.message}`);
// // // // //         } finally {
// // // // //             setSaving(false);
// // // // //         }
// // // // //     };

// // // // //     const executeAppeal = async (reason: string) => {
// // // // //         setShowAppealModal(false);
// // // // //         setSaving(true);
// // // // //         try {
// // // // //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // //                 status: 'appealed',
// // // // //                 appeal: { reason, date: new Date().toISOString(), status: 'pending' },
// // // // //                 lastStaffEditAt: new Date().toISOString()
// // // // //             });
// // // // //             toast.success("Formal appeal lodged successfully.");
// // // // //             setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
// // // // //         } catch {
// // // // //             toast.error("Failed to lodge appeal.");
// // // // //         } finally { setSaving(false); }
// // // // //     };

// // // // //     const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride: boolean = false) => {
// // // // //         if (!isGloballyLocked && !isPracticalModule && !allowOverride) {
// // // // //             if (e.type === 'keydown') {
// // // // //                 const keyEvent = e as React.KeyboardEvent;
// // // // //                 if ((keyEvent.ctrlKey || keyEvent.metaKey) && ['c', 'v', 'x'].includes(keyEvent.key.toLowerCase())) {
// // // // //                     keyEvent.preventDefault();
// // // // //                     keyEvent.stopPropagation();
// // // // //                     if (keyEvent.nativeEvent?.stopImmediatePropagation) {
// // // // //                         keyEvent.nativeEvent.stopImmediatePropagation();
// // // // //                     }
// // // // //                     toast.warning("Keyboard shortcuts for Copy/Paste are disabled on Knowledge Modules.", 1500);
// // // // //                     document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to use Copy/Paste keyboard shortcuts." }));
// // // // //                 }
// // // // //             } else {
// // // // //                 e.preventDefault();
// // // // //                 e.stopPropagation();
// // // // //                 if (e.nativeEvent?.stopImmediatePropagation) {
// // // // //                     e.nativeEvent.stopImmediatePropagation();
// // // // //                 }
// // // // //                 toast.warning("Copying, pasting, and dropping content is disabled to ensure academic integrity.", 15000);
// // // // //                 document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to Paste or Drop external content into the assessment." }));
// // // // //             }
// // // // //         }
// // // // //     };

// // // // //     const generateCalendarLink = () => {
// // // // //         if (!assessment?.scheduledDate) return "#";
// // // // //         const formatToGCal = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");
// // // // //         const startTime = new Date(assessment.scheduledDate);
// // // // //         const durationMinutes = assessment.moduleInfo?.timeLimit || 60;
// // // // //         const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
// // // // //         const dtStart = formatToGCal(startTime);
// // // // //         const dtEnd = formatToGCal(endTime);
// // // // //         const eventTitle = encodeURIComponent(`mLab Assessment: ${assessment.title}`);
// // // // //         const eventDetails = encodeURIComponent(
// // // // //             `Your secure assessment module is scheduled.\n\nAccess Link: ${window.location.origin}/learner/assessment/${assessmentId}`
// // // // //         );
// // // // //         return `https://www.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${dtStart}/${dtEnd}&details=${eventDetails}&sf=true&output=xml`;
// // // // //     };

// // // // //     if (loading) return <LoadingScreen />;

// // // // //     if (isAdminIntercept) {
// // // // //         return (
// // // // //             <AssessmentLockedScreen
// // // // //                 type="admin"
// // // // //                 assessmentId={assessmentId}
// // // // //                 onBack={safeNavigateBack}
// // // // //                 navigate={navigate}
// // // // //             />
// // // // //         );
// // // // //     }

// // // // //     if (!assessment || !submission) {
// // // // //         return (
// // // // //             <AssessmentLockedScreen
// // // // //                 type="unavailable"
// // // // //                 onBack={safeNavigateBack}
// // // // //             />
// // // // //         );
// // // // //     }

// // // // //     if (assessment?.status === 'upcoming' && !isAdminIntercept && !submission?.overrideUnlock) {
// // // // //         return (
// // // // //             <AssessmentLockedScreen
// // // // //                 type="upcoming"
// // // // //                 onBack={safeNavigateBack}
// // // // //             />
// // // // //         );
// // // // //     }

// // // // //     if (isScheduledLocked) {
// // // // //         return (
// // // // //             <AssessmentLockedScreen
// // // // //                 type="scheduled"
// // // // //                 assessment={assessment}
// // // // //                 timeToStart={timeToStart}
// // // // //                 getSecureNow={getSecureNow}
// // // // //                 generateCalendarLink={generateCalendarLink}
// // // // //                 onBack={safeNavigateBack}
// // // // //             />
// // // // //         );
// // // // //     }

// // // // //     if (isMissed) {
// // // // //         return (
// // // // //             <AssessmentLockedScreen
// // // // //                 type="missed"
// // // // //                 onBack={safeNavigateBack}
// // // // //             />
// // // // //         );
// // // // //     }

// // // // //     if (showGate) {
// // // // //         return (
// // // // //             <AssessmentGate
// // // // //                 assessment={assessment}
// // // // //                 submission={submission}
// // // // //                 learnerProfile={learnerProfile}
// // // // //                 isRemediation={isRemediation}
// // // // //                 needsRemediationGate={needsRemediationGate}
// // // // //                 isAppealUpheld={isAppealUpheld}
// // // // //                 willBeProctored={willBeProctored}
// // // // //                 isSummative={isSummative}
// // // // //                 passedFormative={passedFormative}
// // // // //                 hasOverride={hasOverride}
// // // // //                 isFullyCompliant={isFullyCompliant}
// // // // //                 pendingTopics={pendingTopics}
// // // // //                 saving={saving}
// // // // //                 isStarting={isStarting}
// // // // //                 startDeclarationChecked={startDeclarationChecked}
// // // // //                 coachingAckChecked={coachingAckChecked}
// // // // //                 onStart={handleStartAssessment}
// // // // //                 onBack={safeNavigateBack}
// // // // //                 setStartDeclarationChecked={setStartDeclarationChecked}
// // // // //                 setCoachingAckChecked={setCoachingAckChecked}
// // // // //                 toast={toast}
// // // // //             />
// // // // //         );
// // // // //     }

// // // // //     return (
// // // // //         <AssessmentPlayerContent
// // // // //             user={user}
// // // // //             assessment={assessment}
// // // // //             submission={submission}
// // // // //             answers={answers}
// // // // //             learnerProfile={learnerProfile}
// // // // //             learnerEnrollment={learnerEnrollment}
// // // // //             assessorProfile={assessorProfile}
// // // // //             moderatorProfile={moderatorProfile}
// // // // //             facilitatorProfile={facilitatorProfile}
// // // // //             employers={employers}
// // // // //             staff={staff}
// // // // //             moduleLogs={moduleLogs}
// // // // //             approvedLogs={approvedLogs}
// // // // //             logsLoading={logsLoading}
// // // // //             saving={saving}
// // // // //             setSaving={setSaving}
// // // // //             uploadProgress={uploadProgress}
// // // // //             setUploadProgress={setUploadProgress}
// // // // //             activeTabs={activeTabs}
// // // // //             setActiveTabs={setActiveTabs}
// // // // //             timeLeft={timeLeft}
// // // // //             isGloballyLocked={isGloballyLocked}
// // // // //             isAwaitingSignoff={isAwaitingSignoff}
// // // // //             isPracticalModule={isPracticalModule}
// // // // //             isWorkplaceModule={isWorkplaceModule}
// // // // //             isRemediation={isRemediation}
// // // // //             isAppealUpheld={isAppealUpheld}
// // // // //             isFacDone={isFacDone}
// // // // //             isAssDone={isAssDone}
// // // // //             isModDone={isModDone}
// // // // //             isSubmitted={isSubmitted}
// // // // //             isMissed={isMissed}
// // // // //             showGate={showGate}
// // // // //             showLeaveWarning={showLeaveWarning}
// // // // //             setShowLeaveWarning={setShowLeaveWarning}
// // // // //             showSubmitConfirm={showSubmitConfirm}
// // // // //             setShowSubmitConfirm={setShowSubmitConfirm}
// // // // //             showAppealModal={showAppealModal}
// // // // //             setShowAppealModal={setShowAppealModal}
// // // // //             declarationChecked={declarationChecked}
// // // // //             setDeclarationChecked={setDeclarationChecked}
// // // // //             isMobileMenuOpen={isMobileMenuOpen}
// // // // //             setIsMobileMenuOpen={setIsMobileMenuOpen}
// // // // //             willBeProctored={willBeProctored}
// // // // //             savedFacRole={savedFacRole}
// // // // //             grandTotalAwarded={grandTotalAwarded}
// // // // //             grandTotalMax={grandTotalMax}
// // // // //             grandTotalPct={grandTotalPct}
// // // // //             sectionTotals={sectionTotals}
// // // // //             outcome={outcome}
// // // // //             safeNavigateBack={safeNavigateBack}
// // // // //             handleAnswerChange={handleAnswerChange}
// // // // //             handleTaskAnswerChange={handleTaskAnswerChange}
// // // // //             handleNestedAnswerChange={handleNestedAnswerChange}
// // // // //             handleFileUpload={handleFileUpload}
// // // // //             triggerSubmitConfirm={triggerSubmitConfirm}
// // // // //             executeSubmit={executeSubmit}
// // // // //             executeAppeal={executeAppeal}
// // // // //             preventCopyPasteAndDrop={preventCopyPasteAndDrop}
// // // // //             getBlockGrading={getBlockGrading}
// // // // //             isBlockVerified={isBlockVerified}
// // // // //             getSecureNow={getSecureNow}
// // // // //             toast={toast}
// // // // //             codeSnapshots={codeSnapshots}
// // // // //             saveCodeSnapshot={saveCodeSnapshot}
// // // // //         />
// // // // //     );
// // // // // };

// // // // // export default AssessmentPlayer;


// // // // // // // src/components/views/AssessmentPlayer/AssessmentPlayer.tsx

// // // // // // import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// // // // // // import { useParams, useNavigate, useLocation } from 'react-router-dom';
// // // // // // import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot } from 'firebase/firestore';
// // // // // // import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, uploadString } from 'firebase/storage';
// // // // // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // // // // import { db } from '../../../lib/firebase';
// // // // // // import { useStore } from '../../../store/useStore';
// // // // // // import { useToast } from '../../../components/common/Toast/Toast';
// // // // // // import './AssessmentPlayer.css';
// // // // // // import moment from 'moment';

// // // // // // import { AssessmentGate } from './AssessmentGate';
// // // // // // import { AssessmentLockedScreen } from './AssessmentLockedScreen';
// // // // // // import AssessmentPlayerContent from './AssessmentPlayerContent';

// // // // // // const LoadingScreen: React.FC = () => (
// // // // // //     <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
// // // // // //         <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
// // // // // //     </div>
// // // // // // );

// // // // // // const AssessmentPlayer: React.FC = () => {
// // // // // //     const { assessmentId } = useParams<{ assessmentId: string }>();
// // // // // //     const navigate = useNavigate();
// // // // // //     const location = useLocation();

// // // // // //     const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
// // // // // //     const toast = useToast();

// // // // // //     const safeNavigateBack = () => {
// // // // // //         if (location.key === 'default') {
// // // // // //             navigate(user?.role === 'learner' ? '/learner/dashboard' : '/');
// // // // // //         } else {
// // // // // //             navigate(-1);
// // // // // //         }
// // // // // //     };

// // // // // //     const [loading, setLoading] = useState(true);
// // // // // //     const [saving, setSaving] = useState(false);
// // // // // //     const [isStarting, setIsStarting] = useState(false);

// // // // // //     const [assessment, setAssessment] = useState<any>(null);
// // // // // //     const [submission, setSubmission] = useState<any>(null);
// // // // // //     const [answers, setAnswers] = useState<Record<string, any>>({});
// // // // // //     const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
// // // // // //     const [codeSnapshots, setCodeSnapshots] = useState<Record<string, any>>({});
// // // // // //     const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
// // // // // //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// // // // // //     const [learnerEnrollment, setLearnerEnrollment] = useState<any>(null);
// // // // // //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// // // // // //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);
// // // // // //     const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);
// // // // // //     const [declarationChecked, setDeclarationChecked] = useState(false);
// // // // // //     const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
// // // // // //     const [coachingAckChecked, setCoachingAckChecked] = useState(false);
// // // // // //     const [isAdminIntercept, setIsAdminIntercept] = useState(false);
// // // // // //     const [showLeaveWarning, setShowLeaveWarning] = useState(false);
// // // // // //     const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
// // // // // //     const [showAppealModal, setShowAppealModal] = useState(false);
// // // // // //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

// // // // // //     const [moduleLogs, setModuleLogs] = useState<any[]>([]);
// // // // // //     const [passedFormative, setPassedFormative] = useState(false);
// // // // // //     const [approvedLogs, setApprovedLogs] = useState<any[]>([]);
// // // // // //     const [logsLoading, setLogsLoading] = useState<boolean>(false);

// // // // // //     const [timeLeft, setTimeLeft] = useState<number | null>(null);
// // // // // //     const [timeOffset, setTimeOffset] = useState<number>(0);
// // // // // //     const [timeToStart, setTimeToStart] = useState<number | null>(null);

// // // // // //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// // // // // //     const answersRef = useRef(answers);
// // // // // //     useEffect(() => { answersRef.current = answers; }, [answers]);

// // // // // //     const currentStatus = String(submission?.status || '').toLowerCase();
// // // // // //     const isMissed = currentStatus === 'missed';
// // // // // //     const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
// // // // // //     const isAppealUpheld = submission?.appeal?.status === 'upheld';
// // // // // //     const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// // // // // //     const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// // // // // //     const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
// // // // // //     const isModDone = ['moderated', 'appealed'].includes(currentStatus);
// // // // // //     const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
// // // // // //     const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
// // // // // //     const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
// // // // // //     const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;
// // // // // //     const isRemediation = (submission?.attemptNumber || 1) > 1;
// // // // // //     const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged && !isAppealUpheld;
// // // // // //     const isNotStarted = currentStatus === 'not_started';
// // // // // //     const showGate = isNotStarted || needsRemediationGate;
// // // // // //     const isGloballyLocked = isSubmitted || isAwaitingSignoff || isMissed;
// // // // // //     const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

// // // // // //     const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
// // // // // //         ? assessment.requiresInvigilation
// // // // // //         : !isPracticalModule;
// // // // // //     const willBeProctored = isInvigilationEnabled && !isGloballyLocked;

// // // // // //     const isSummative = submission?.type?.toLowerCase().includes('summative') || false;
// // // // // //     const hasOverride = submission?.facilitatorOverride === true;

// // // // // //     const pendingTopics = useMemo(() => {
// // // // // //         if (!submission || !moduleLogs) return [];
// // // // // //         return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
// // // // // //     }, [moduleLogs, submission]);

// // // // // //     const isFullyCompliant = pendingTopics.length === 0;

// // // // // //     const isBlockVerified = (blockId: string) => {
// // // // // //         const facGrade = submission?.grading?.facilitatorBreakdown?.[blockId];
// // // // // //         return facGrade?.isCorrect === true || facGrade?.obsDeclaration === true;
// // // // // //     };

// // // // // //     const getSecureNow = useCallback(() => Date.now() + timeOffset, [timeOffset]);

// // // // // //     // ─── UNIFIED TIMER END-TIME CALCULATION ──────────────────────────────────
// // // // // //     const getAssessmentEndMs = useCallback(() => {
// // // // // //         if (!assessment) return null;
// // // // // //         const baseLimit = assessment.moduleInfo?.timeLimit || 0;
// // // // // //         if (baseLimit <= 0) return null;

// // // // // //         const extraTime = submission?.extraTimeGranted || 0;
// // // // // //         const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;

// // // // // //         // Scheduled exams anchor strictly to scheduledDate
// // // // // //         if (assessment.isScheduled && assessment.scheduledDate && !submission?.overrideUnlock) {
// // // // // //             return moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
// // // // // //         }

// // // // // //         // Non-scheduled / override exams anchor to learner start time
// // // // // //         if (submission?.startedAt) {
// // // // // //             return new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
// // // // // //         }

// // // // // //         return null;
// // // // // //     }, [assessment, submission]);

// // // // // //     // ─── FETCH TIME OFFSET (CACHE-BUSTED & SANITY-CHECKED) ─────────────────
// // // // // //     useEffect(() => {
// // // // // //         const fetchOffset = async () => {
// // // // // //             try {
// // // // // //                 const res = await fetch(`https://timeapi.io/api/Time/current/zone?timeZone=UTC&nocache=${Date.now()}`, {
// // // // // //                     cache: 'no-store',
// // // // // //                     headers: {
// // // // // //                         'Cache-Control': 'no-cache, no-store, must-revalidate',
// // // // // //                         'Pragma': 'no-cache'
// // // // // //                     }
// // // // // //                 });

// // // // // //                 if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
// // // // // //                 const data = await res.json();

// // // // // //                 const secureUTCTime = new Date(data.dateTime + 'Z').getTime();
// // // // // //                 const localTime = Date.now();
// // // // // //                 const calculatedOffset = secureUTCTime - localTime;

// // // // // //                 if (Math.abs(calculatedOffset) > 5 * 60 * 1000) {
// // // // // //                     setTimeOffset(0);
// // // // // //                 } else {
// // // // // //                     setTimeOffset(calculatedOffset);
// // // // // //                 }
// // // // // //             } catch (err) {
// // // // // //                 console.warn('[TIMER DEBUG] Time API unavailable or blocked. Using local device clock:', err);
// // // // // //                 setTimeOffset(0);
// // // // // //             }
// // // // // //         };

// // // // // //         fetchOffset();
// // // // // //     }, []);

// // // // // //     useEffect(() => {
// // // // // //         if (employers.length === 0) fetchEmployers();
// // // // // //         if (staff.length === 0) fetchStaff();

// // // // // //         const load = async () => {
// // // // // //             if (!user?.uid || !assessmentId) return;

// // // // // //             if (user.role && user.role !== 'learner') {
// // // // // //                 setIsAdminIntercept(true);
// // // // // //                 setLoading(false);
// // // // // //                 return;
// // // // // //             }

// // // // // //             try {
// // // // // //                 const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
// // // // // //                 if (!assSnap.exists()) {
// // // // // //                     toast.error('Assessment template not found.');
// // // // // //                     setLoading(false);
// // // // // //                     return;
// // // // // //                 }
// // // // // //                 const assData = assSnap.data();
// // // // // //                 setAssessment(assData);

// // // // // //                 let userProfile: any = {};
// // // // // //                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
// // // // // //                 if (userDocSnap.exists()) {
// // // // // //                     userProfile = { id: userDocSnap.id, ...userDocSnap.data() };
// // // // // //                 }
// // // // // //                 setLearnerProfile(userProfile);

// // // // // //                 let targetLearnerId = user.uid;
// // // // // //                 let learnerCohortId: string | null = null;
// // // // // //                 let validEnrollmentId: string | null = null;

// // // // // //                 if (user?.role === 'learner') {
// // // // // //                     try {
// // // // // //                         const enrolQ = query(collection(db, 'enrollments'), where('authUid', '==', user.uid), where('status', '==', 'active'));
// // // // // //                         const enrolSnap = await getDocs(enrolQ);
// // // // // //                         if (!enrolSnap.empty) {
// // // // // //                             const enrolData = enrolSnap.docs[0].data();
// // // // // //                             validEnrollmentId = enrolSnap.docs[0].id;
// // // // // //                             targetLearnerId = enrolData.learnerId || enrolData.id || user.uid;
// // // // // //                             learnerCohortId = enrolData.cohortId;
// // // // // //                         }
// // // // // //                     } catch (e) {
// // // // // //                         console.warn("Enrollment lookup failed.", e);
// // // // // //                     }
// // // // // //                 }

// // // // // //                 let activeSub: any = null;
// // // // // //                 try {
// // // // // //                     const subQuery1 = query(collection(db, 'learner_submissions'), where('assessmentId', '==', assessmentId), where('authUid', '==', user.uid));
// // // // // //                     const subSnap1 = await getDocs(subQuery1);
// // // // // //                     if (!subSnap1.empty) {
// // // // // //                         activeSub = subSnap1.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
// // // // // //                     }
// // // // // //                 } catch (qErr) {
// // // // // //                     console.warn("Primary submission query failed.", qErr);
// // // // // //                 }

// // // // // //                 if (!activeSub && user?.role === 'learner') {
// // // // // //                     const fallbackCohortId = learnerCohortId || assData.cohortId || (assData.cohortIds && assData.cohortIds[0]) || 'unassigned';
// // // // // //                     const isLive = ['active', 'scheduled', 'upcoming', 'published'].includes(assData.status);
// // // // // //                     if (isLive) {
// // // // // //                         const sid = `${fallbackCohortId}_${targetLearnerId}_${assessmentId}`;
// // // // // //                         const newSub = {
// // // // // //                             learnerId: targetLearnerId,
// // // // // //                             enrollmentId: validEnrollmentId || "",
// // // // // //                             authUid: user.uid,
// // // // // //                             qualificationName: userProfile.qualification?.name || "",
// // // // // //                             assessmentId: assessmentId,
// // // // // //                             cohortId: fallbackCohortId,
// // // // // //                             title: assData.title,
// // // // // //                             type: assData.type || 'formative',
// // // // // //                             moduleType: assData.moduleType || 'knowledge',
// // // // // //                             status: assData.status === 'upcoming' ? 'upcoming' : 'not_started',
// // // // // //                             assignedAt: new Date().toISOString(),
// // // // // //                             marks: 0,
// // // // // //                             totalMarks: assData.totalMarks || 0,
// // // // // //                             moduleNumber: assData.moduleInfo?.moduleNumber || "",
// // // // // //                             timeLimit: assData.moduleInfo?.timeLimit || 0,
// // // // // //                             isScheduled: assData.isScheduled || assData.status === 'scheduled' || false,
// // // // // //                             scheduledDate: assData.scheduledDate || null,
// // // // // //                             createdAt: new Date().toISOString(),
// // // // // //                             createdBy: "System_Player_AutoHydration"
// // // // // //                         };
// // // // // //                         await setDoc(doc(db, "learner_submissions", sid), newSub);
// // // // // //                         activeSub = { id: sid, ...newSub };
// // // // // //                     }
// // // // // //                 }

// // // // // //                 if (activeSub) {
// // // // // //                     setSubmission(activeSub);
// // // // // //                     setAnswers(activeSub.answers || {});
// // // // // //                     if (activeSub.enrollmentId) {
// // // // // //                         const e = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId));
// // // // // //                         if (e.exists()) setLearnerEnrollment(e.data());
// // // // // //                     }
// // // // // //                     if (activeSub.grading?.gradedBy) {
// // // // // //                         const s = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
// // // // // //                         if (s.exists()) setAssessorProfile(s.data());
// // // // // //                     }
// // // // // //                     if (activeSub.moderation?.moderatedBy) {
// // // // // //                         const s = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
// // // // // //                         if (s.exists()) setModeratorProfile(s.data());
// // // // // //                     }
// // // // // //                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
// // // // // //                     if (facId) {
// // // // // //                         const s = await getDoc(doc(db, 'users', facId));
// // // // // //                         if (s.exists()) setFacilitatorProfile(s.data());
// // // // // //                     }
// // // // // //                 } else {
// // // // // //                     toast.error('Assessment unavailable. It may not be published yet.');
// // // // // //                 }
// // // // // //             } catch (err) {
// // // // // //                 console.error("Fatal error loading assessment data:", err);
// // // // // //                 toast.error('Failed to load assessment data.');
// // // // // //             } finally {
// // // // // //                 setLoading(false);
// // // // // //             }
// // // // // //         };

// // // // // //         if (timeOffset !== null) load();
// // // // // //     }, [assessmentId, user?.uid, timeOffset]);

// // // // // //     useEffect(() => {
// // // // // //         if (!submission || !user?.uid) return;
// // // // // //         const _isSummative = submission.type?.toLowerCase().includes('summative');
// // // // // //         if (_isSummative) {
// // // // // //             const logsQ = query(
// // // // // //                 collection(db, 'curriculum_logs'),
// // // // // //                 where('cohortId', '==', submission.cohortId),
// // // // // //                 where('moduleCode', '==', submission.moduleNumber)
// // // // // //             );
// // // // // //             const unsubLogs = onSnapshot(logsQ, (snap) => {
// // // // // //                 setModuleLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // // // // //             });
// // // // // //             const formQ = query(
// // // // // //                 collection(db, 'learner_submissions'),
// // // // // //                 where('authUid', '==', user.uid),
// // // // // //                 where('moduleNumber', '==', submission.moduleNumber),
// // // // // //                 where('status', '==', 'moderated'),
// // // // // //                 where('competency', '==', 'C')
// // // // // //             );
// // // // // //             const unsubForm = onSnapshot(formQ, (snap) => {
// // // // // //                 setPassedFormative(!snap.empty);
// // // // // //             });
// // // // // //             return () => { unsubLogs(); unsubForm(); };
// // // // // //         }
// // // // // //     }, [submission?.id, user?.uid, submission?.type, submission?.cohortId, submission?.moduleNumber]);

// // // // // //     useEffect(() => {
// // // // // //         if (assessment?.scheduledDate && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed) {
// // // // // //             const interval = setInterval(() => {
// // // // // //                 const startTime = moment(assessment.scheduledDate).valueOf();
// // // // // //                 const now = getSecureNow();
// // // // // //                 const difference = startTime - now;
// // // // // //                 if (difference <= 0) {
// // // // // //                     setTimeToStart(0);
// // // // // //                     clearInterval(interval);
// // // // // //                 } else {
// // // // // //                     setTimeToStart(difference);
// // // // // //                 }
// // // // // //             }, 1000);
// // // // // //             return () => clearInterval(interval);
// // // // // //         }
// // // // // //     }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, getSecureNow]);

// // // // // //     const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed;

// // // // // //     useEffect(() => {
// // // // // //         if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock) {
// // // // // //             const interval = setInterval(() => {
// // // // // //                 const endMs = getAssessmentEndMs();
// // // // // //                 if (endMs && getSecureNow() >= endMs) {
// // // // // //                     updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // // //                         status: 'missed',
// // // // // //                         systemNote: `Auto-swept by frontend player: Learner failed to start within the allotted timeframe.`
// // // // // //                     }).catch(() => { });
// // // // // //                     setSubmission((prev: any) => ({ ...prev, status: 'missed' }));
// // // // // //                     clearInterval(interval);
// // // // // //                 }
// // // // // //             }, 10000);
// // // // // //             return () => clearInterval(interval);
// // // // // //         }
// // // // // //     }, [isNotStarted, assessment, submission, getAssessmentEndMs, getSecureNow]);

// // // // // //     // ─── UNIFIED LIVE COUNTDOWN TICKER ───────────────────────────────────────
// // // // // //     useEffect(() => {
// // // // // //         if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed) return;

// // // // // //         const updateTimer = () => {
// // // // // //             const now = getSecureNow();
// // // // // //             const endMs = getAssessmentEndMs();
// // // // // //             if (endMs) {
// // // // // //                 setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
// // // // // //             }
// // // // // //         };

// // // // // //         updateTimer();
// // // // // //         const id = setInterval(updateTimer, 1000);
// // // // // //         return () => clearInterval(id);
// // // // // //     }, [isGloballyLocked, showGate, isPracticalModule, isMissed, assessment, submission, getAssessmentEndMs, getSecureNow]);

// // // // // //     // ─── AUTO-SUBMIT TRIGGER ON TIMER EXPIRATION ────────────────────────────
// // // // // //     useEffect(() => {
// // // // // //         if (timeLeft !== null && timeLeft <= 0 && !isGloballyLocked && !showGate && !isMissed) {
// // // // // //             toast.error("Time is up! Auto-submitting.");
// // // // // //             setAnswers(latestAnswers => {
// // // // // //                 if (submission?.id) {
// // // // // //                     forceAutoSubmit(submission.id, latestAnswers);
// // // // // //                 }
// // // // // //                 return latestAnswers;
// // // // // //             });
// // // // // //         }
// // // // // //     }, [timeLeft, isGloballyLocked, showGate, isMissed, submission?.id]);

// // // // // //     useEffect(() => {
// // // // // //         const fetchApprovedLogs = async () => {
// // // // // //             if (!user?.uid || assessment?.moduleType !== 'workplace') {
// // // // // //                 setLogsLoading(false);
// // // // // //                 return;
// // // // // //             }
// // // // // //             try {
// // // // // //                 setLogsLoading(true);
// // // // // //                 const logsRef = collection(db, 'workplace_logs');
// // // // // //                 const q = query(logsRef, where('learnerId', '==', user.uid), where('moduleId', '==', assessment.id), where('status', '==', 'Approved'));
// // // // // //                 const snapshot = await getDocs(q);
// // // // // //                 const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // // // //                 setApprovedLogs(fetchedLogs);
// // // // // //             } catch (error) {
// // // // // //                 console.error('Error fetching approved logs:', error);
// // // // // //                 toast.error('Failed to sync verified workplace logs.');
// // // // // //             } finally {
// // // // // //                 setLogsLoading(false);
// // // // // //             }
// // // // // //         };
// // // // // //         fetchApprovedLogs();
// // // // // //     }, [user?.uid, assessment?.id, assessment?.moduleType]);

// // // // // //     const getBlockGrading = (blockId: string) => {
// // // // // //         const g = submission?.grading || {};
// // // // // //         const m = submission?.moderation || {};
// // // // // //         const mLayer = m.breakdown?.[blockId] || {};
// // // // // //         const aLayer = g.assessorBreakdown?.[blockId] || {};
// // // // // //         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
// // // // // //         const legacyLayer = g.breakdown?.[blockId] || {};

// // // // // //         let activeLayer = fLayer || legacyLayer || {};
// // // // // //         if (isAssDone || g.assessorBreakdown?.[blockId]) activeLayer = aLayer;
// // // // // //         if (isModDone || m.breakdown?.[blockId]) activeLayer = mLayer;

// // // // // //         return {
// // // // // //             score: activeLayer?.score,
// // // // // //             isCorrect: activeLayer?.isCorrect,
// // // // // //             facIsCorrect: fLayer?.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer?.isCorrect,
// // // // // //             assIsCorrect: aLayer?.isCorrect,
// // // // // //             modIsCorrect: mLayer?.isCorrect,
// // // // // //             feedback: activeLayer?.feedback || '',
// // // // // //             facFeedback: fLayer?.feedback || legacyLayer?.feedback || '',
// // // // // //             assFeedback: aLayer?.feedback || '',
// // // // // //             modFeedback: mLayer?.feedback || '',
// // // // // //             criteriaResults: activeLayer?.criteriaResults || fLayer?.criteriaResults || legacyLayer?.criteriaResults || [],
// // // // // //         };
// // // // // //     };

// // // // // //     let grandTotalAwarded = 0;
// // // // // //     let grandTotalMax = 0;
// // // // // //     const sectionTotals: Record<string, { total: number; awarded: number }> = {};
// // // // // //     let currentSectionId = '';
// // // // // //     if (assessment?.blocks) {
// // // // // //         assessment.blocks.forEach((block: any) => {
// // // // // //             if (block.type === 'section') {
// // // // // //                 currentSectionId = block.id;
// // // // // //                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
// // // // // //             } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
// // // // // //                 const { score } = getBlockGrading(block.id);
// // // // // //                 const maxMarks = Number(block.marks) || 0;
// // // // // //                 const awarded = Number(score) || 0;
// // // // // //                 grandTotalMax += maxMarks;
// // // // // //                 if (score !== undefined && score !== null) {
// // // // // //                     grandTotalAwarded += awarded;
// // // // // //                 }
// // // // // //                 if (currentSectionId) {
// // // // // //                     sectionTotals[currentSectionId].total += maxMarks;
// // // // // //                     if (score !== undefined && score !== null) {
// // // // // //                         sectionTotals[currentSectionId].awarded += awarded;
// // // // // //                     }
// // // // // //                 }
// // // // // //             }
// // // // // //         });
// // // // // //     }
// // // // // //     const grandTotalPct = grandTotalMax > 0 ? Math.round((grandTotalAwarded / grandTotalMax) * 100) : 0;
// // // // // //     const savedFacRole = submission?.grading?.facilitatorRole || null;

// // // // // //     const getCompetencyStatus = () => {
// // // // // //         if (!isAssDone) return null;
// // // // // //         if (isRemediation && !isGloballyLocked) return null;
// // // // // //         const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
// // // // // //         let isCompetent = compStr === 'c' || compStr === 'competent';
// // // // // //         if (!isWorkplaceModule && !isCompetent && grandTotalAwarded !== undefined && assessment?.totalMarks)
// // // // // //             isCompetent = grandTotalAwarded >= assessment.totalMarks * 0.6;
// // // // // //         return {
// // // // // //             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
// // // // // //             color: isModDone ? 'var(--mlab-green)' : 'var(--mlab-red)',
// // // // // //             subtext: isModDone ? 'Final Results Verified & Endorsed.' : isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.',
// // // // // //             score: isWorkplaceModule ? undefined : grandTotalAwarded,
// // // // // //             percentage: grandTotalPct,
// // // // // //             isCompetent,
// // // // // //         };
// // // // // //     };
// // // // // //     const outcome = getCompetencyStatus();

// // // // // //     const handleStartAssessment = async () => {
// // // // // //         if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)) return;
// // // // // //         setIsStarting(true);
// // // // // //         setSaving(true);
// // // // // //         try {
// // // // // //             const functions = getFunctions();
// // // // // //             const startFn = httpsCallable(functions, 'startAssessment');
// // // // // //             const res = await startFn({ submissionId: submission.id });
// // // // // //             const data = res.data as any;
// // // // // //             const t = data.startedAt || new Date(getSecureNow()).toISOString();

// // // // // //             let payload: any = {};
// // // // // //             if (needsRemediationGate) {
// // // // // //                 payload['latestCoachingLog.acknowledged'] = true;
// // // // // //                 payload['latestCoachingLog.acknowledgedAt'] = t;
// // // // // //                 payload['latestCoachingLog.learnerSignatureUrl'] = learnerProfile?.signatureUrl || null;
// // // // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
// // // // // //             }

// // // // // //             setSubmission((p: any) => ({
// // // // // //                 ...p,
// // // // // //                 status: 'in_progress',
// // // // // //                 startedAt: t,
// // // // // //                 latestCoachingLog: p.latestCoachingLog && needsRemediationGate
// // // // // //                     ? { ...p.latestCoachingLog, acknowledged: true, acknowledgedAt: t, learnerSignatureUrl: learnerProfile?.signatureUrl }
// // // // // //                     : p.latestCoachingLog
// // // // // //             }));

// // // // // //             if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) {
// // // // // //                 const endMs = getAssessmentEndMs();
// // // // // //                 if (endMs) {
// // // // // //                     setTimeLeft(Math.max(0, Math.floor((endMs - getSecureNow()) / 1000)));
// // // // // //                 } else {
// // // // // //                     const extraTime = submission?.extraTimeGranted || 0;
// // // // // //                     setTimeLeft((assessment.moduleInfo.timeLimit + extraTime) * 60);
// // // // // //                 }
// // // // // //             }
// // // // // //         } catch (err: any) {
// // // // // //             toast.error(err.message || 'Failed to start assessment. Please check compliance.');
// // // // // //         } finally {
// // // // // //             setSaving(false);
// // // // // //             setIsStarting(false);
// // // // // //         }
// // // // // //     };

// // // // // //     const triggerAutoSave = (newAnswers: any) => {
// // // // // //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// // // // // //         setSaving(true);
// // // // // //         saveTimeoutRef.current = setTimeout(async () => {
// // // // // //             if (!submission?.id) return;
// // // // // //             try {
// // // // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
// // // // // //             } catch {
// // // // // //                 toast.error('Auto-save failed.');
// // // // // //             } finally {
// // // // // //                 setSaving(false);
// // // // // //             }
// // // // // //         }, 1200);
// // // // // //     };

// // // // // //     const SNAPSHOT_INLINE_LIMIT = 200_000;
// // // // // //     const codeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// // // // // //     const saveCodeSnapshot = useCallback(async (blockId: string, snapshot: any, dependencies?: Record<string, string>, immediate?: boolean) => {
// // // // // //         setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));

// // // // // //         const doWrite = async () => {
// // // // // //             if (!submission?.id) return;
// // // // // //             setSaving(true);
// // // // // //             try {
// // // // // //                 let fieldPayload: any;

// // // // // //                 if (typeof snapshot === 'string' && snapshot.length > SNAPSHOT_INLINE_LIMIT) {
// // // // // //                     const path = `code_snapshots/${submission.id}/${blockId}.json`;
// // // // // //                     await uploadString(fbStorageRef(getStorage(), path), snapshot);
// // // // // //                     fieldPayload = { storagePath: path, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
// // // // // //                 } else {
// // // // // //                     fieldPayload = { snapshot, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
// // // // // //                 }

// // // // // //                 await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // // //                     [`answers.${blockId}`]: fieldPayload,
// // // // // //                     lastSavedAt: new Date().toISOString()
// // // // // //                 });

// // // // // //                 setAnswers(prev => ({ ...prev, [blockId]: fieldPayload }));
// // // // // //             } catch (err) {
// // // // // //                 toast.error('Failed to save your code changes.');
// // // // // //                 throw err;
// // // // // //             } finally {
// // // // // //                 setSaving(false);
// // // // // //             }
// // // // // //         };

// // // // // //         if (immediate) {
// // // // // //             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
// // // // // //             await doWrite();
// // // // // //         } else {
// // // // // //             if (codeSaveTimeoutRef.current) clearTimeout(codeSaveTimeoutRef.current);
// // // // // //             codeSaveTimeoutRef.current = setTimeout(() => { doWrite(); }, 1200);
// // // // // //         }
// // // // // //     }, [submission?.id, toast]);

// // // // // //     const handleAnswerChange = (blockId: string, value: any) => {
// // // // // //         if (isGloballyLocked || isBlockVerified(blockId)) return;
// // // // // //         setAnswers(p => { const n = { ...p, [blockId]: value }; triggerAutoSave(n); return n; });
// // // // // //     };
// // // // // //     const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
// // // // // //         if (isGloballyLocked || isBlockVerified(blockId)) return;
// // // // // //         setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; triggerAutoSave(n); return n; });
// // // // // //     };
// // // // // //     const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
// // // // // //         if (isGloballyLocked || isBlockVerified(blockId)) return;
// // // // // //         setAnswers(p => {
// // // // // //             const blockAns = p[blockId] || {};
// // // // // //             const raw = blockAns[nestedKey];
// // // // // //             const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
// // // // // //             const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
// // // // // //             triggerAutoSave(n); return n;
// // // // // //         });
// // // // // //     };

// // // // // //     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
// // // // // //         if (!file || isGloballyLocked || isBlockVerified(blockId)) return;
// // // // // //         const pKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
// // // // // //         setUploadProgress(p => ({ ...p, [pKey]: 0 }));
// // // // // //         setSaving(true);
// // // // // //         toast.info(`Uploading ${file.name}…`);
// // // // // //         try {
// // // // // //             const storage = getStorage();
// // // // // //             const ref = fbStorageRef(storage, `evidence/${submission.id}/${blockId}_${Date.now()}_${file.name}`);
// // // // // //             const task = uploadBytesResumable(ref, file);
// // // // // //             task.on('state_changed',
// // // // // //                 snap => setUploadProgress(p => ({ ...p, [pKey]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
// // // // // //                 err => {
// // // // // //                     console.error("Firebase Storage Upload Error:", err);
// // // // // //                     toast.error(`Upload failed: ${err.message}. Please try again.`);
// // // // // //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', '');
// // // // // //                     else handleTaskAnswerChange(blockId, 'uploadUrl', '');
// // // // // //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // // // // //                     setSaving(false);
// // // // // //                 },
// // // // // //                 async () => {
// // // // // //                     const url = await getDownloadURL(task.snapshot.ref);
// // // // // //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', url);
// // // // // //                     else handleTaskAnswerChange(blockId, 'uploadUrl', url);
// // // // // //                     toast.success(`Uploaded: ${file.name}`);
// // // // // //                     setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // // // // //                     setSaving(false);
// // // // // //                 }
// // // // // //             );
// // // // // //         } catch (err: any) {
// // // // // //             toast.error(`Upload failed: ${err.message}`);
// // // // // //             setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; });
// // // // // //             setSaving(false);
// // // // // //         }
// // // // // //     };

// // // // // //     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
// // // // // //         setSaving(true);
// // // // // //         const t = new Date(getSecureNow()).toISOString();
// // // // // //         try {
// // // // // //             await updateDoc(doc(db, 'learner_submissions', subId), {
// // // // // //                 answers: currentAnswers, status: 'submitted', submittedAt: t, autoSubmitted: true,
// // // // // //                 learnerDeclaration: {
// // // // // //                     agreed: true,
// // // // // //                     timestamp: t,
// // // // // //                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// // // // // //                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// // // // // //                     signatureUrl: learnerProfile?.signatureUrl || null
// // // // // //                 },
// // // // // //             });
// // // // // //             toast.success("Time's up! Auto-submitted.");
// // // // // //             setSubmission((p: any) => ({ ...p, status: 'submitted', learnerDeclaration: { signatureUrl: learnerProfile?.signatureUrl || null, timestamp: t, learnerName: learnerProfile?.fullName || 'Unknown' } }));
// // // // // //             setTimeout(() => safeNavigateBack(), 3000);
// // // // // //         } catch (e) { console.error(e); } finally { setSaving(false); }
// // // // // //     };

// // // // // //     // ─── SAFE VALIDATION WITH DETAILED CONSOLE LOGS ───────────────────────────
// // // // // //     const validateChecklistEvidence = () => {
// // // // // //         // console.log("[SUBMIT DEBUG] Running validateChecklistEvidence check...");
// // // // // //         try {
// // // // // //             for (const block of assessment?.blocks || []) {
// // // // // //                 if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
// // // // // //                     for (let i = 0; i < (block.criteria?.length || 0); i++) {
// // // // // //                         const raw = answers?.[block.id]?.[`evidence_${i}`];
// // // // // //                         const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
// // // // // //                         const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
// // // // // //                         const has = !!(textClean || ev?.url?.trim() || ev?.code?.trim() || ev?.uploadUrl?.trim());

// // // // // //                         if (!has) {
// // // // // //                             // console.warn(`[SUBMIT DEBUG] Missing evidence for checklist block "${block.title}", item ${i + 1}`);
// // // // // //                             return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title || 'Checklist'}".` };
// // // // // //                         }
// // // // // //                     }
// // // // // //                 }
// // // // // //                 if (block.type === 'qcto_workplace') {
// // // // // //                     const bAns = answers?.[block.id] || {};
// // // // // //                     for (const wa of block.workActivities || []) {
// // // // // //                         if (!bAns[`wa_${wa.id}_declaration`]) {
// // // // // //                             // console.warn(`[SUBMIT DEBUG] Missing declaration for Work Activity ${wa.code}`);
// // // // // //                             return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
// // // // // //                         }
// // // // // //                         for (const se of wa.evidenceItems || []) {
// // // // // //                             const ev = bAns[`se_${se.id}`] || {};
// // // // // //                             const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
// // // // // //                             const has = !!(textClean || ev?.url?.trim() || ev?.uploadUrl?.trim());
// // // // // //                             if (!has) {
// // // // // //                                 // console.warn(`[SUBMIT DEBUG] Missing evidence for ${se.code} in ${wa.code}`);
// // // // // //                                 return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
// // // // // //                             }
// // // // // //                         }
// // // // // //                     }
// // // // // //                 }
// // // // // //             }
// // // // // //             // console.log("[SUBMIT DEBUG] Checklist & Workplace evidence validation PASSED.");
// // // // // //             return { valid: true };
// // // // // //         } catch (err) {
// // // // // //             // console.error("[SUBMIT DEBUG ERROR] Exception during validateChecklistEvidence:", err);
// // // // // //             return { valid: true }; // Fail-open so learner is never trapped by code exceptions
// // // // // //         }
// // // // // //     };

// // // // // //     const triggerSubmitConfirm = () => {
// // // // // //         // console.warn("%c[SUBMIT DEBUG] triggerSubmitConfirm() invoked by learner", "color: #0284c7; font-weight: bold; font-size: 14px;");

// // // // // //         // 1. Check Final Declaration Checkbox
// // // // // //         // console.log("[SUBMIT DEBUG] declarationChecked:", declarationChecked);
// // // // // //         if (!declarationChecked) {
// // // // // //             // console.warn("[SUBMIT DEBUG] Blocked: Declaration checkbox not checked.");
// // // // // //             toast.warning('Please check the "Learner Final Declaration" box before submitting.');
// // // // // //             return;
// // // // // //         }

// // // // // //         // 2. Check Active Uploads
// // // // // //         // console.log("[SUBMIT DEBUG] uploadProgress count:", Object.keys(uploadProgress).length);
// // // // // //         if (Object.keys(uploadProgress).length > 0) {
// // // // // //             // console.warn("[SUBMIT DEBUG] Blocked: Files still uploading.");
// // // // // //             toast.warning("Files are currently uploading. Please wait until uploads complete.");
// // // // // //             return;
// // // // // //         }

// // // // // //         // 3. Check Workplace Logbook Mentor Approvals
// // // // // //         if (assessment?.moduleType === 'workplace') {
// // // // // //             // console.log("[SUBMIT DEBUG] Checking Workplace Module Mentor approvals...");
// // // // // //             const workplaceBlocks = assessment.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];
// // // // // //             for (const block of workplaceBlocks) {
// // // // // //                 for (const wa of block.workActivities || []) {
// // // // // //                     const hasApprovedLog = (approvedLogs || []).some(log => log.workActivityId === wa.id);
// // // // // //                     if (!hasApprovedLog) {
// // // // // //                         // console.warn(`[SUBMIT DEBUG] Blocked: Work Activity ${wa.code} missing mentor approval.`);
// // // // // //                         toast.error(`Missing approved log for Work Activity: ${wa.code}. You cannot submit until your mentor approves this task.`);
// // // // // //                         return;
// // // // // //                     }
// // // // // //                 }
// // // // // //             }
// // // // // //         }

// // // // // //         // 4. Practical / Checklist Evidence Check
// // // // // //         if (isAwaitingSignoff || isPracticalModule) {
// // // // // //             const chk = validateChecklistEvidence() as any;
// // // // // //             if (!chk.valid) {
// // // // // //                 // console.warn("[SUBMIT DEBUG] Blocked by checklist check:", chk.message);
// // // // // //                 toast.warning(chk.message);
// // // // // //                 return;
// // // // // //             }
// // // // // //         }

// // // // // //         // 5. Validation Passed - Show Confirmation Modal
// // // // // //         // console.warn("%c[SUBMIT DEBUG SUCCESS] All checks passed! Setting showSubmitConfirm = true", "color: #22c55e; font-weight: bold; font-size: 14px;");
// // // // // //         setShowSubmitConfirm(true);
// // // // // //     };

// // // // // //     const executeSubmit = async () => {
// // // // // //         // console.log("[SUBMIT DEBUG] executeSubmit() starting...");
// // // // // //         setShowSubmitConfirm(false);
// // // // // //         setSaving(true);

// // // // // //         const activeVMs = (window as any).__ACTIVE_VMS || {};
// // // // // //         for (const blockId of Object.keys(activeVMs)) {
// // // // // //             try {
// // // // // //                 const vm = activeVMs[blockId];
// // // // // //                 const snapshot = await vm.getFsSnapshot();

// // // // // //                 answers[blockId] = {
// // // // // //                     snapshot,
// // // // // //                     lastSavedAt: new Date().toISOString()
// // // // // //                 };
// // // // // //             } catch (err) {
// // // // // //                 console.error(`Failed to capture snapshot for sandbox ${blockId}:`, err);
// // // // // //             }
// // // // // //         }

// // // // // //         const t = new Date(getSecureNow()).toISOString();
// // // // // //         const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

// // // // // //         const payload = {
// // // // // //             answers,
// // // // // //             status: nextStatus,
// // // // // //             submittedAt: t,
// // // // // //             learnerDeclaration: {
// // // // // //                 agreed: true,
// // // // // //                 timestamp: t,
// // // // // //                 learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// // // // // //                 learnerIdNumber: learnerProfile?.idNumber || 'Unknown',
// // // // // //                 signatureUrl: learnerProfile?.signatureUrl || null
// // // // // //             }
// // // // // //         };

// // // // // //         try {
// // // // // //             await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
// // // // // //             toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
// // // // // //             setSubmission((p: any) => ({ ...p, status: nextStatus, learnerDeclaration: payload.learnerDeclaration }));
// // // // // //             setTimeout(() => window.scrollTo(0, 0), 1000);
// // // // // //             console.log("[SUBMIT DEBUG SUCCESS] Submission updated in Firestore.");
// // // // // //         } catch (error: any) {
// // // // // //             console.error("❌ Submission Error:", error);
// // // // // //             toast.error(`Failed to submit: ${error.message}`);
// // // // // //         } finally {
// // // // // //             setSaving(false);
// // // // // //         }
// // // // // //     };

// // // // // //     const executeAppeal = async (reason: string) => {
// // // // // //         setShowAppealModal(false);
// // // // // //         setSaving(true);
// // // // // //         try {
// // // // // //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // // // // //                 status: 'appealed',
// // // // // //                 appeal: { reason, date: new Date().toISOString(), status: 'pending' },
// // // // // //                 lastStaffEditAt: new Date().toISOString()
// // // // // //             });
// // // // // //             toast.success("Formal appeal lodged successfully.");
// // // // // //             setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
// // // // // //         } catch {
// // // // // //             toast.error("Failed to lodge appeal.");
// // // // // //         } finally { setSaving(false); }
// // // // // //     };

// // // // // //     const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride: boolean = false) => {
// // // // // //         if (!isGloballyLocked && !isPracticalModule && !allowOverride) {
// // // // // //             if (e.type === 'keydown') {
// // // // // //                 const keyEvent = e as React.KeyboardEvent;
// // // // // //                 if ((keyEvent.ctrlKey || keyEvent.metaKey) && ['c', 'v', 'x'].includes(keyEvent.key.toLowerCase())) {
// // // // // //                     keyEvent.preventDefault();
// // // // // //                     keyEvent.stopPropagation();
// // // // // //                     if (keyEvent.nativeEvent?.stopImmediatePropagation) {
// // // // // //                         keyEvent.nativeEvent.stopImmediatePropagation();
// // // // // //                     }
// // // // // //                     toast.warning("Keyboard shortcuts for Copy/Paste are disabled on Knowledge Modules.", 1500);
// // // // // //                     document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to use Copy/Paste keyboard shortcuts." }));
// // // // // //                 }
// // // // // //             } else {
// // // // // //                 e.preventDefault();
// // // // // //                 e.stopPropagation();
// // // // // //                 if (e.nativeEvent?.stopImmediatePropagation) {
// // // // // //                     e.nativeEvent.stopImmediatePropagation();
// // // // // //                 }
// // // // // //                 toast.warning("Copying, pasting, and dropping content is disabled to ensure academic integrity.", 15000);
// // // // // //                 document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to Paste or Drop external content into the assessment." }));
// // // // // //             }
// // // // // //         }
// // // // // //     };

// // // // // //     const generateCalendarLink = () => {
// // // // // //         if (!assessment?.scheduledDate) return "#";
// // // // // //         const formatToGCal = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");
// // // // // //         const startTime = new Date(assessment.scheduledDate);
// // // // // //         const durationMinutes = assessment.moduleInfo?.timeLimit || 60;
// // // // // //         const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
// // // // // //         const dtStart = formatToGCal(startTime);
// // // // // //         const dtEnd = formatToGCal(endTime);
// // // // // //         const eventTitle = encodeURIComponent(`mLab Assessment: ${assessment.title}`);
// // // // // //         const eventDetails = encodeURIComponent(
// // // // // //             `Your secure assessment module is scheduled.\n\nAccess Link: ${window.location.origin}/learner/assessment/${assessmentId}`
// // // // // //         );
// // // // // //         return `https://www.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${dtStart}/${dtEnd}&details=${eventDetails}&sf=true&output=xml`;
// // // // // //     };

// // // // // //     if (loading) return <LoadingScreen />;

// // // // // //     if (isAdminIntercept) {
// // // // // //         return (
// // // // // //             <AssessmentLockedScreen
// // // // // //                 type="admin"
// // // // // //                 assessmentId={assessmentId}
// // // // // //                 onBack={safeNavigateBack}
// // // // // //                 navigate={navigate}
// // // // // //             />
// // // // // //         );
// // // // // //     }

// // // // // //     if (!assessment || !submission) {
// // // // // //         return (
// // // // // //             <AssessmentLockedScreen
// // // // // //                 type="unavailable"
// // // // // //                 onBack={safeNavigateBack}
// // // // // //             />
// // // // // //         );
// // // // // //     }

// // // // // //     if (assessment?.status === 'upcoming' && !isAdminIntercept && !submission?.overrideUnlock) {
// // // // // //         return (
// // // // // //             <AssessmentLockedScreen
// // // // // //                 type="upcoming"
// // // // // //                 onBack={safeNavigateBack}
// // // // // //             />
// // // // // //         );
// // // // // //     }

// // // // // //     if (isScheduledLocked) {
// // // // // //         return (
// // // // // //             <AssessmentLockedScreen
// // // // // //                 type="scheduled"
// // // // // //                 assessment={assessment}
// // // // // //                 timeToStart={timeToStart}
// // // // // //                 getSecureNow={getSecureNow}
// // // // // //                 generateCalendarLink={generateCalendarLink}
// // // // // //                 onBack={safeNavigateBack}
// // // // // //             />
// // // // // //         );
// // // // // //     }

// // // // // //     if (isMissed) {
// // // // // //         return (
// // // // // //             <AssessmentLockedScreen
// // // // // //                 type="missed"
// // // // // //                 onBack={safeNavigateBack}
// // // // // //             />
// // // // // //         );
// // // // // //     }

// // // // // //     if (showGate) {
// // // // // //         return (
// // // // // //             <AssessmentGate
// // // // // //                 assessment={assessment}
// // // // // //                 submission={submission}
// // // // // //                 learnerProfile={learnerProfile}
// // // // // //                 isRemediation={isRemediation}
// // // // // //                 needsRemediationGate={needsRemediationGate}
// // // // // //                 isAppealUpheld={isAppealUpheld}
// // // // // //                 willBeProctored={willBeProctored}
// // // // // //                 isSummative={isSummative}
// // // // // //                 passedFormative={passedFormative}
// // // // // //                 hasOverride={hasOverride}
// // // // // //                 isFullyCompliant={isFullyCompliant}
// // // // // //                 pendingTopics={pendingTopics}
// // // // // //                 saving={saving}
// // // // // //                 isStarting={isStarting}
// // // // // //                 startDeclarationChecked={startDeclarationChecked}
// // // // // //                 coachingAckChecked={coachingAckChecked}
// // // // // //                 onStart={handleStartAssessment}
// // // // // //                 onBack={safeNavigateBack}
// // // // // //                 setStartDeclarationChecked={setStartDeclarationChecked}
// // // // // //                 setCoachingAckChecked={setCoachingAckChecked}
// // // // // //                 toast={toast}
// // // // // //             />
// // // // // //         );
// // // // // //     }

// // // // // //     return (
// // // // // //         <AssessmentPlayerContent
// // // // // //             user={user}
// // // // // //             assessment={assessment}
// // // // // //             submission={submission}
// // // // // //             answers={answers}
// // // // // //             learnerProfile={learnerProfile}
// // // // // //             learnerEnrollment={learnerEnrollment}
// // // // // //             assessorProfile={assessorProfile}
// // // // // //             moderatorProfile={moderatorProfile}
// // // // // //             facilitatorProfile={facilitatorProfile}
// // // // // //             employers={employers}
// // // // // //             staff={staff}
// // // // // //             moduleLogs={moduleLogs}
// // // // // //             approvedLogs={approvedLogs}
// // // // // //             logsLoading={logsLoading}
// // // // // //             saving={saving}
// // // // // //             setSaving={setSaving}
// // // // // //             uploadProgress={uploadProgress}
// // // // // //             setUploadProgress={setUploadProgress}
// // // // // //             activeTabs={activeTabs}
// // // // // //             setActiveTabs={setActiveTabs}
// // // // // //             timeLeft={timeLeft}
// // // // // //             isGloballyLocked={isGloballyLocked}
// // // // // //             isAwaitingSignoff={isAwaitingSignoff}
// // // // // //             isPracticalModule={isPracticalModule}
// // // // // //             isWorkplaceModule={isWorkplaceModule}
// // // // // //             isRemediation={isRemediation}
// // // // // //             isAppealUpheld={isAppealUpheld}
// // // // // //             isFacDone={isFacDone}
// // // // // //             isAssDone={isAssDone}
// // // // // //             isModDone={isModDone}
// // // // // //             isSubmitted={isSubmitted}
// // // // // //             isMissed={isMissed}
// // // // // //             showGate={showGate}
// // // // // //             showLeaveWarning={showLeaveWarning}
// // // // // //             setShowLeaveWarning={setShowLeaveWarning}
// // // // // //             showSubmitConfirm={showSubmitConfirm}
// // // // // //             setShowSubmitConfirm={setShowSubmitConfirm}
// // // // // //             showAppealModal={showAppealModal}
// // // // // //             setShowAppealModal={setShowAppealModal}
// // // // // //             declarationChecked={declarationChecked}
// // // // // //             setDeclarationChecked={setDeclarationChecked}
// // // // // //             isMobileMenuOpen={isMobileMenuOpen}
// // // // // //             setIsMobileMenuOpen={setIsMobileMenuOpen}
// // // // // //             willBeProctored={willBeProctored}
// // // // // //             savedFacRole={savedFacRole}
// // // // // //             grandTotalAwarded={grandTotalAwarded}
// // // // // //             grandTotalMax={grandTotalMax}
// // // // // //             grandTotalPct={grandTotalPct}
// // // // // //             sectionTotals={sectionTotals}
// // // // // //             outcome={outcome}
// // // // // //             safeNavigateBack={safeNavigateBack}
// // // // // //             handleAnswerChange={handleAnswerChange}
// // // // // //             handleTaskAnswerChange={handleTaskAnswerChange}
// // // // // //             handleNestedAnswerChange={handleNestedAnswerChange}
// // // // // //             handleFileUpload={handleFileUpload}
// // // // // //             triggerSubmitConfirm={triggerSubmitConfirm}
// // // // // //             executeSubmit={executeSubmit}
// // // // // //             executeAppeal={executeAppeal}
// // // // // //             preventCopyPasteAndDrop={preventCopyPasteAndDrop}
// // // // // //             getBlockGrading={getBlockGrading}
// // // // // //             isBlockVerified={isBlockVerified}
// // // // // //             getSecureNow={getSecureNow}
// // // // // //             toast={toast}
// // // // // //             codeSnapshots={codeSnapshots}
// // // // // //             saveCodeSnapshot={saveCodeSnapshot}
// // // // // //         />
// // // // // //     );
// // // // // // };

// // // // // // export default AssessmentPlayer;