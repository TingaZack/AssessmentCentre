import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot } from 'firebase/firestore';
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
    const isViolation = currentStatus === 'violation'; // 🚀 ADDED VIOLATION STATUS
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

    // 🚀 ADDED isViolation HERE SO PROCTORING GATE IS BYPASSED
    const isGloballyLocked = isSubmitted || isAwaitingSignoff || isMissed || isViolation;
    const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

    const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
        ? assessment.requiresInvigilation
        : !isPracticalModule;

    // 🚀 EXPLICITLY PREVENT PROCTORING IF VIOLATED
    const willBeProctored = isInvigilationEnabled && !isGloballyLocked && !isViolation;

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

    // ─── UNIFIED TIMER END-TIME CALCULATION ──────────────────────────────────
    const getAssessmentEndMs = useCallback(() => {
        if (!assessment) return null;
        const baseLimit = assessment.moduleInfo?.timeLimit || 0;
        if (baseLimit <= 0) return null;

        const extraTime = submission?.extraTimeGranted || 0;
        const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;

        // Scheduled exams anchor strictly to scheduledDate
        if (assessment.isScheduled && assessment.scheduledDate && !submission?.overrideUnlock) {
            return moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
        }

        // Non-scheduled / override exams anchor to learner start time
        if (submission?.startedAt) {
            return new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
        }

        return null;
    }, [assessment, submission]);

    // ─── FETCH TIME OFFSET (CACHE-BUSTED & SANITY-CHECKED) ─────────────────
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
                console.warn('[TIMER DEBUG] Time API unavailable or blocked. Using local device clock:', err);
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
    }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, getSecureNow]);

    const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed;

    useEffect(() => {
        if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock) {
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
    }, [isNotStarted, assessment, submission, getAssessmentEndMs, getSecureNow]);

    // ─── UNIFIED LIVE COUNTDOWN TICKER ───────────────────────────────────────
    useEffect(() => {
        if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed) return;

        const updateTimer = () => {
            const now = getSecureNow();
            const endMs = getAssessmentEndMs();
            if (endMs) {
                setTimeLeft(Math.max(0, Math.floor((endMs - now) / 1000)));
            }
        };

        updateTimer();
        const id = setInterval(updateTimer, 1000);
        return () => clearInterval(id);
    }, [isGloballyLocked, showGate, isPracticalModule, isMissed, assessment, submission, getAssessmentEndMs, getSecureNow]);

    // ─── AUTO-SUBMIT TRIGGER ON TIMER EXPIRATION ────────────────────────────
    useEffect(() => {
        if (timeLeft !== null && timeLeft <= 0 && !isGloballyLocked && !showGate && !isMissed) {
            toast.error("Time is up! Auto-submitting.");
            setAnswers(latestAnswers => {
                if (submission?.id) {
                    forceAutoSubmit(submission.id, latestAnswers);
                }
                return latestAnswers;
            });
        }
    }, [timeLeft, isGloballyLocked, showGate, isMissed, submission?.id]);

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
        setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));

        const doWrite = async () => {
            if (!submission?.id) return;
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

                await updateDoc(doc(db, 'learner_submissions', submission.id), {
                    [`answers.${blockId}`]: fieldPayload,
                    lastSavedAt: new Date().toISOString()
                });

                setAnswers(prev => ({ ...prev, [blockId]: fieldPayload }));
            } catch (err) {
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
    }, [submission?.id, toast]);

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

    // ─── SAFE VALIDATION WITH DETAILED CONSOLE LOGS ───────────────────────────
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
            return { valid: true }; // Fail-open so learner is never trapped by code exceptions
        }
    };

    const triggerSubmitConfirm = () => {
        if (!declarationChecked) {
            toast.warning('Please check the "Learner Final Declaration" box before submitting.');
            return;
        }

        if (Object.keys(uploadProgress).length > 0) {
            toast.warning("Files are currently uploading. Please wait until uploads complete.");
            return;
        }

        if (assessment?.moduleType === 'workplace') {
            const workplaceBlocks = assessment.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];
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

        const payload = {
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


// // src/components/views/AssessmentPlayer/AssessmentPlayer.tsx

// import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// import { useParams, useNavigate, useLocation } from 'react-router-dom';
// import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, onSnapshot } from 'firebase/firestore';
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
//     const isGloballyLocked = isSubmitted || isAwaitingSignoff || isMissed;
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

//     // ─── UNIFIED TIMER END-TIME CALCULATION ──────────────────────────────────
//     const getAssessmentEndMs = useCallback(() => {
//         if (!assessment) return null;
//         const baseLimit = assessment.moduleInfo?.timeLimit || 0;
//         if (baseLimit <= 0) return null;

//         const extraTime = submission?.extraTimeGranted || 0;
//         const totalAllowedTimeMs = (baseLimit + extraTime) * 60 * 1000;

//         // Scheduled exams anchor strictly to scheduledDate
//         if (assessment.isScheduled && assessment.scheduledDate && !submission?.overrideUnlock) {
//             return moment(assessment.scheduledDate).valueOf() + totalAllowedTimeMs;
//         }

//         // Non-scheduled / override exams anchor to learner start time
//         if (submission?.startedAt) {
//             return new Date(submission.startedAt).getTime() + totalAllowedTimeMs;
//         }

//         return null;
//     }, [assessment, submission]);

//     // ─── FETCH TIME OFFSET (CACHE-BUSTED & SANITY-CHECKED) ─────────────────
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
//                 console.warn('[TIMER DEBUG] Time API unavailable or blocked. Using local device clock:', err);
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
//     }, [assessment?.scheduledDate, isSubmitted, isAdminIntercept, submission?.overrideUnlock, isMissed, getSecureNow]);

//     const isScheduledLocked = assessment?.scheduledDate && moment(assessment.scheduledDate).valueOf() > getSecureNow() && !isSubmitted && !isAdminIntercept && !submission?.overrideUnlock && !isMissed;

//     useEffect(() => {
//         if (isNotStarted && assessment?.isScheduled && assessment?.scheduledDate && !submission?.overrideUnlock) {
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
//     }, [isNotStarted, assessment, submission, getAssessmentEndMs, getSecureNow]);

//     // ─── UNIFIED LIVE COUNTDOWN TICKER ───────────────────────────────────────
//     useEffect(() => {
//         if (!assessment || !submission || isPracticalModule || isGloballyLocked || showGate || isMissed) return;

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
//     }, [isGloballyLocked, showGate, isPracticalModule, isMissed, assessment, submission, getAssessmentEndMs, getSecureNow]);

//     // ─── AUTO-SUBMIT TRIGGER ON TIMER EXPIRATION ────────────────────────────
//     useEffect(() => {
//         if (timeLeft !== null && timeLeft <= 0 && !isGloballyLocked && !showGate && !isMissed) {
//             toast.error("Time is up! Auto-submitting.");
//             setAnswers(latestAnswers => {
//                 if (submission?.id) {
//                     forceAutoSubmit(submission.id, latestAnswers);
//                 }
//                 return latestAnswers;
//             });
//         }
//     }, [timeLeft, isGloballyLocked, showGate, isMissed, submission?.id]);

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

//     const saveCodeSnapshot = useCallback(async (blockId: string, snapshot: any, dependencies?: Record<string, string>, immediate?: boolean) => {
//         setCodeSnapshots(prev => ({ ...prev, [blockId]: snapshot }));

//         const doWrite = async () => {
//             if (!submission?.id) return;
//             setSaving(true);
//             try {
//                 let fieldPayload: any;

//                 if (typeof snapshot === 'string' && snapshot.length > SNAPSHOT_INLINE_LIMIT) {
//                     const path = `code_snapshots/${submission.id}/${blockId}.json`;
//                     await uploadString(fbStorageRef(getStorage(), path), snapshot);
//                     fieldPayload = { storagePath: path, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
//                 } else {
//                     fieldPayload = { snapshot, dependencies: dependencies || {}, lastSavedAt: new Date().toISOString() };
//                 }

//                 await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                     [`answers.${blockId}`]: fieldPayload,
//                     lastSavedAt: new Date().toISOString()
//                 });

//                 setAnswers(prev => ({ ...prev, [blockId]: fieldPayload }));
//             } catch (err) {
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
//     }, [submission?.id, toast]);

//     const handleAnswerChange = (blockId: string, value: any) => {
//         if (isGloballyLocked || isBlockVerified(blockId)) return;
//         setAnswers(p => { const n = { ...p, [blockId]: value }; triggerAutoSave(n); return n; });
//     };
//     const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
//         if (isGloballyLocked || isBlockVerified(blockId)) return;
//         setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; triggerAutoSave(n); return n; });
//     };
//     const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
//         if (isGloballyLocked || isBlockVerified(blockId)) return;
//         setAnswers(p => {
//             const blockAns = p[blockId] || {};
//             const raw = blockAns[nestedKey];
//             const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
//             const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
//             triggerAutoSave(n); return n;
//         });
//     };

//     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
//         if (!file || isGloballyLocked || isBlockVerified(blockId)) return;
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

//     // ─── SAFE VALIDATION WITH DETAILED CONSOLE LOGS ───────────────────────────
//     const validateChecklistEvidence = () => {
//         // console.log("[SUBMIT DEBUG] Running validateChecklistEvidence check...");
//         try {
//             for (const block of assessment?.blocks || []) {
//                 if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
//                     for (let i = 0; i < (block.criteria?.length || 0); i++) {
//                         const raw = answers?.[block.id]?.[`evidence_${i}`];
//                         const ev = typeof raw === 'string' ? { text: raw } : (raw || {});
//                         const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
//                         const has = !!(textClean || ev?.url?.trim() || ev?.code?.trim() || ev?.uploadUrl?.trim());

//                         if (!has) {
//                             // console.warn(`[SUBMIT DEBUG] Missing evidence for checklist block "${block.title}", item ${i + 1}`);
//                             return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title || 'Checklist'}".` };
//                         }
//                     }
//                 }
//                 if (block.type === 'qcto_workplace') {
//                     const bAns = answers?.[block.id] || {};
//                     for (const wa of block.workActivities || []) {
//                         if (!bAns[`wa_${wa.id}_declaration`]) {
//                             // console.warn(`[SUBMIT DEBUG] Missing declaration for Work Activity ${wa.code}`);
//                             return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
//                         }
//                         for (const se of wa.evidenceItems || []) {
//                             const ev = bAns[`se_${se.id}`] || {};
//                             const textClean = typeof ev?.text === 'string' ? ev.text.replace(/<[^>]*>?/gm, '').trim() : '';
//                             const has = !!(textClean || ev?.url?.trim() || ev?.uploadUrl?.trim());
//                             if (!has) {
//                                 // console.warn(`[SUBMIT DEBUG] Missing evidence for ${se.code} in ${wa.code}`);
//                                 return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
//                             }
//                         }
//                     }
//                 }
//             }
//             // console.log("[SUBMIT DEBUG] Checklist & Workplace evidence validation PASSED.");
//             return { valid: true };
//         } catch (err) {
//             // console.error("[SUBMIT DEBUG ERROR] Exception during validateChecklistEvidence:", err);
//             return { valid: true }; // Fail-open so learner is never trapped by code exceptions
//         }
//     };

//     const triggerSubmitConfirm = () => {
//         // console.warn("%c[SUBMIT DEBUG] triggerSubmitConfirm() invoked by learner", "color: #0284c7; font-weight: bold; font-size: 14px;");

//         // 1. Check Final Declaration Checkbox
//         // console.log("[SUBMIT DEBUG] declarationChecked:", declarationChecked);
//         if (!declarationChecked) {
//             // console.warn("[SUBMIT DEBUG] Blocked: Declaration checkbox not checked.");
//             toast.warning('Please check the "Learner Final Declaration" box before submitting.');
//             return;
//         }

//         // 2. Check Active Uploads
//         // console.log("[SUBMIT DEBUG] uploadProgress count:", Object.keys(uploadProgress).length);
//         if (Object.keys(uploadProgress).length > 0) {
//             // console.warn("[SUBMIT DEBUG] Blocked: Files still uploading.");
//             toast.warning("Files are currently uploading. Please wait until uploads complete.");
//             return;
//         }

//         // 3. Check Workplace Logbook Mentor Approvals
//         if (assessment?.moduleType === 'workplace') {
//             // console.log("[SUBMIT DEBUG] Checking Workplace Module Mentor approvals...");
//             const workplaceBlocks = assessment.blocks?.filter((b: any) => b.type === 'qcto_workplace') || [];
//             for (const block of workplaceBlocks) {
//                 for (const wa of block.workActivities || []) {
//                     const hasApprovedLog = (approvedLogs || []).some(log => log.workActivityId === wa.id);
//                     if (!hasApprovedLog) {
//                         // console.warn(`[SUBMIT DEBUG] Blocked: Work Activity ${wa.code} missing mentor approval.`);
//                         toast.error(`Missing approved log for Work Activity: ${wa.code}. You cannot submit until your mentor approves this task.`);
//                         return;
//                     }
//                 }
//             }
//         }

//         // 4. Practical / Checklist Evidence Check
//         if (isAwaitingSignoff || isPracticalModule) {
//             const chk = validateChecklistEvidence() as any;
//             if (!chk.valid) {
//                 // console.warn("[SUBMIT DEBUG] Blocked by checklist check:", chk.message);
//                 toast.warning(chk.message);
//                 return;
//             }
//         }

//         // 5. Validation Passed - Show Confirmation Modal
//         // console.warn("%c[SUBMIT DEBUG SUCCESS] All checks passed! Setting showSubmitConfirm = true", "color: #22c55e; font-weight: bold; font-size: 14px;");
//         setShowSubmitConfirm(true);
//     };

//     const executeSubmit = async () => {
//         // console.log("[SUBMIT DEBUG] executeSubmit() starting...");
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
//             console.log("[SUBMIT DEBUG SUCCESS] Submission updated in Firestore.");
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