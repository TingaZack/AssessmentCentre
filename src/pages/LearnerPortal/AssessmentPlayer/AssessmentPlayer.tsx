
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
    AlertCircle, Play, Clock, GraduationCap,
    BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
    ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
    RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
    Briefcase
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import moment from 'moment';
import './AssessmentPlayer.css';

// Import extracted components
import { TintedSignature } from '../../../components/common/TintedSignature';
import { UploadProgress } from '../../../components/common/UploadProgress';
import { FilePreview } from '../../../components/common/FilePreview';
import { UrlPreview } from '../../../components/common/UrlPreview';
import { ConfirmModal } from '../../../components/common/ConfirmModal';

const quillModules = {
    toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']],
};
const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
const AssessmentPlayer: React.FC = () => {
    const { assessmentId } = useParams<{ assessmentId: string }>();
    const navigate = useNavigate();
    const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [assessment, setAssessment] = useState<any>(null);
    const [submission, setSubmission] = useState<any>(null);
    const [answers, setAnswers] = useState<Record<string, any>>({});

    const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
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

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [timeOffset, setTimeOffset] = useState<number>(0);

    const currentStatus = String(submission?.status || '').toLowerCase();
    const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
    const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
    const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
    const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
    const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
    const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
    const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;
    const isAssDone = ['graded', 'moderated', 'returned'].includes(currentStatus);
    const isModDone = ['moderated'].includes(currentStatus);
    const isRemediation = (submission?.attemptNumber || 1) > 1;
    const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged;
    const isNotStarted = currentStatus === 'not_started';
    const showGate = isNotStarted || needsRemediationGate;
    const isLocked = isSubmitted || isAwaitingSignoff;
    const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

    /* workplace info ─────────────────────────────────────────────────────── */
    const workplaceInfo = useMemo(() => {
        if (!learnerEnrollment) return null;
        const employer = learnerEnrollment.employerId ? employers.find((e: any) => e.id === learnerEnrollment.employerId) : null;
        const mentor = learnerEnrollment.mentorId ? staff.find((s: any) => s.id === learnerEnrollment.mentorId) : null;
        return { employer, mentor };
    }, [learnerEnrollment, employers, staff]);

    /* grading helpers ───────────────────────────────────────────────────── */
    const getBlockGrading = (blockId: string) => {
        if (!isFacDone) return { score: undefined, feedback: '', facFeedback: '', assFeedback: '', modFeedback: '', facIsCorrect: null, assIsCorrect: null, modIsCorrect: null, isCorrect: null, criteriaResults: [] };
        const g = submission?.grading || {};
        const m = submission?.moderation || {};
        const mLayer = m.breakdown?.[blockId] || {};
        const aLayer = g.assessorBreakdown?.[blockId] || {};
        const fLayer = g.facilitatorBreakdown?.[blockId] || {};
        const legacyLayer = g.breakdown?.[blockId] || {};
        let activeLayer: any = legacyLayer;
        if (isFacDone) activeLayer = fLayer;
        if (isAssDone) activeLayer = aLayer;
        if (isModDone) activeLayer = mLayer;
        return {
            score: activeLayer.score,
            isCorrect: activeLayer.isCorrect,
            facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
            assIsCorrect: aLayer.isCorrect,
            modIsCorrect: mLayer.isCorrect,
            feedback: activeLayer.feedback || '',
            facFeedback: fLayer.feedback || legacyLayer.feedback || '',
            assFeedback: aLayer.feedback || '',
            modFeedback: mLayer.feedback || '',
            criteriaResults: activeLayer.criteriaResults || [],
        };
    };

    const sectionTotals: Record<string, { total: number; awarded: number }> = {};
    let currentSectionId = '';
    if (assessment?.blocks) {
        assessment.blocks.forEach((block: any) => {
            if (block.type === 'section') {
                currentSectionId = block.id;
                sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
            } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type) && currentSectionId) {
                const { score } = getBlockGrading(block.id);
                sectionTotals[currentSectionId].total += Number(block.marks) || 0;
                if (score !== undefined && score !== null) sectionTotals[currentSectionId].awarded += Number(score);
            }
        });
    }

    const savedFacRole = submission?.grading?.facilitatorRole || null; // 'mentor' | 'facilitator' | null

    const getCompetencyStatus = () => {
        if (!isAssDone) return null;
        if (isRemediation && !isLocked) return null;
        const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
        let isCompetent = compStr === 'c' || compStr === 'competent';
        const actualScore = submission?.marks !== undefined ? submission.marks : submission?.totalScore;
        // WE modules are competency-based — never fall back to score threshold
        if (!isWorkplaceModule && !isCompetent && actualScore !== undefined && assessment?.totalMarks)
            isCompetent = actualScore >= assessment.totalMarks * 0.6;
        const percentage = !isWorkplaceModule && actualScore !== undefined && assessment?.totalMarks
            ? Math.round((actualScore / assessment.totalMarks) * 100) : null;
        return {
            label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
            color: isModDone ? 'var(--mlab-green)' : 'var(--mlab-red)',
            subtext: isModDone ? 'Final Results Verified & Endorsed.' : isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.',
            score: isWorkplaceModule ? undefined : actualScore, percentage, isCompetent,
        };
    };
    const outcome = getCompetencyStatus();

    const getSafeDate = (ds: string) => {
        if (!ds) return 'recently';
        const d = new Date(ds);
        return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    /* time offset ───────────────────────────────────────────────────────── */
    useEffect(() => {
        const fetchOffset = async () => {
            try {
                const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const data = await res.json();
                setTimeOffset(new Date(data.utc_datetime).getTime() - Date.now());
            } catch { setTimeOffset(0); }
        };
        fetchOffset();
    }, []);
    const getSecureNow = () => Date.now() + timeOffset;

    /* data load ─────────────────────────────────────────────────────────── */
    useEffect(() => {
        if (employers.length === 0) fetchEmployers();
        if (staff.length === 0) fetchStaff();

        const load = async () => {
            if (!user?.uid || !assessmentId) return;
            if (user.role && user.role !== 'learner') { setIsAdminIntercept(true); setLoading(false); return; }
            try {
                const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
                if (!assSnap.exists()) { toast.error('Assessment template not found.'); setLoading(false); return; }
                const assData = assSnap.data();
                setAssessment(assData);

                const learnersRef = collection(db, 'learners');
                let actualLearnerDocId = '';
                let activeCohortId = '';
                const authSnap = await getDocs(query(learnersRef, where('authUid', '==', user.uid)));
                if (!authSnap.empty) {
                    actualLearnerDocId = authSnap.docs[0].id;
                    activeCohortId = authSnap.docs[0].data().cohortId;
                } else {
                    const emailSnap = await getDocs(query(learnersRef, where('email', '==', user.email)));
                    if (emailSnap.empty) { toast.error('Learner profile not found.'); setLoading(false); return; }
                    actualLearnerDocId = emailSnap.docs[0].id;
                    activeCohortId = emailSnap.docs[0].data().cohortId;
                }

                const userDocSnap = await getDoc(doc(db, 'users', user.uid));
                if (userDocSnap.exists()) setLearnerProfile(userDocSnap.data());

                const subQuery = query(collection(db, 'learner_submissions'), where('learnerId', '==', actualLearnerDocId), where('assessmentId', '==', assessmentId));
                const subSnap = await getDocs(subQuery);
                let activeSub: any = null;
                if (!subSnap.empty) {
                    const cohortMatch = subSnap.docs.find(d => d.data().cohortId === activeCohortId);
                    activeSub = cohortMatch
                        ? { id: cohortMatch.id, ...cohortMatch.data() }
                        : subSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
                }

                if (activeSub) {
                    setSubmission(activeSub);
                    setAnswers(activeSub.answers || {});

                    if (activeSub.enrollmentId) {
                        const enrolSnap = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId));
                        if (enrolSnap.exists()) setLearnerEnrollment(enrolSnap.data());
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

                    const _needsGate = (activeSub.attemptNumber || 1) > 1 && activeSub.latestCoachingLog && !activeSub.latestCoachingLog.acknowledged;
                    const isPrac = assData.moduleType === 'practical' || assData.moduleType === 'workplace';
                    if (!isPrac && activeSub.status === 'in_progress' && assData.moduleInfo?.timeLimit > 0 && !_needsGate) {
                        const start = new Date(activeSub.startedAt).getTime();
                        const end = start + assData.moduleInfo.timeLimit * 60 * 1000;
                        const rem = Math.max(0, Math.floor((end - getSecureNow()) / 1000));
                        setTimeLeft(rem);
                        if (rem === 0) forceAutoSubmit(activeSub.id, activeSub.answers || {});
                    }
                } else {
                    toast.error('You are not assigned to this assessment in your current class.');
                }
            } catch (err) {
                console.error(err);
                toast.error('Failed to load assessment data.');
            } finally { setLoading(false); }
        };

        if (timeOffset !== null) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assessmentId, user?.uid, timeOffset]);

    /* timer ─────────────────────────────────────────────────────────────── */
    useEffect(() => {
        if (isPracticalModule || timeLeft === null || isLocked || showGate) return;
        if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
        const id = setInterval(() => {
            const start = new Date(submission.startedAt).getTime();
            const end = start + assessment.moduleInfo.timeLimit * 60 * 1000;
            setTimeLeft(Math.max(0, Math.floor((end - getSecureNow()) / 1000)));
        }, 1000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLeft, isLocked, showGate, submission?.startedAt, isPracticalModule]);

    const formatTime = (s: number) => {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
    };

    /* handlers ──────────────────────────────────────────────────────────── */
    const handleStartAssessment = async () => {
        if (!startDeclarationChecked) return;
        if (needsRemediationGate && !coachingAckChecked) return;
        setSaving(true);
        try {
            const t = new Date(getSecureNow()).toISOString();
            const payload: any = { status: 'in_progress', startedAt: t };
            if (needsRemediationGate) { payload['latestCoachingLog.acknowledged'] = true; payload['latestCoachingLog.acknowledgedAt'] = t; }
            await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
            setSubmission((p: any) => ({ ...p, status: 'in_progress', startedAt: t, latestCoachingLog: p.latestCoachingLog ? { ...p.latestCoachingLog, acknowledged: true, acknowledgedAt: t } : p.latestCoachingLog }));
            if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) setTimeLeft(assessment.moduleInfo.timeLimit * 60);
        } catch { toast.error('Failed to start assessment.'); } finally { setSaving(false); }
    };

    const triggerAutoSave = (newAnswers: any) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setSaving(true);
        saveTimeoutRef.current = setTimeout(async () => {
            if (!submission?.id) return;
            try { await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() }); }
            catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
        }, 1200);
    };

    const handleAnswerChange = (blockId: string, value: any) => {
        if (isLocked && !isAwaitingSignoff) return;
        setAnswers(p => { const n = { ...p, [blockId]: value }; triggerAutoSave(n); return n; });
    };
    const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
        if (isLocked && !isAwaitingSignoff) return;
        setAnswers(p => { const n = { ...p, [blockId]: { ...(p[blockId] || {}), [field]: value } }; triggerAutoSave(n); return n; });
    };
    const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
        if (isLocked && !isAwaitingSignoff) return;
        setAnswers(p => {
            const blockAns = p[blockId] || {};
            const raw = blockAns[nestedKey];
            const itemAns = typeof raw === 'string' ? { text: raw } : (raw || {});
            const n = { ...p, [blockId]: { ...blockAns, [nestedKey]: { ...itemAns, [field]: value } } };
            triggerAutoSave(n);
            return n;
        });
    };

    const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
        if (!file) return;
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
                    console.error(err);
                    toast.warning('Cloud upload failed. Logging filename as fallback.');
                    if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', file.name);
                    else handleTaskAnswerChange(blockId, 'uploadUrl', file.name);
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
        } catch { toast.error("Upload failed to initialize."); setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; }); setSaving(false); }
    };

    const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
        setSaving(true);
        const t = new Date(getSecureNow()).toISOString();
        try {
            await updateDoc(doc(db, 'learner_submissions', subId), {
                answers: currentAnswers, status: 'submitted', submittedAt: t, autoSubmitted: true,
                learnerDeclaration: { agreed: true, timestamp: t, learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown', learnerIdNumber: learnerProfile?.idNumber || 'Unknown' },
            });
            toast.success("Time's up! Auto-submitted.");
            setSubmission((p: any) => ({ ...p, status: 'submitted' }));
            setTimeout(() => navigate(-1), 3000);
        } catch (e) { console.error(e); } finally { setSaving(false); }
    };

    const handleNavigationLeave = () => {
        if (Object.keys(uploadProgress).length > 0) { toast.warning("Files are uploading. Please wait."); return; }
        if (!isLocked && !isPracticalModule && assessment.moduleInfo?.timeLimit > 0 && !showGate) setShowLeaveWarning(true);
        else navigate(-1);
    };

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
                        if (!has) return { valid: false, message: `Please provide evidence for Supporting Requirement ${se.code} in Work Activity ${wa.code}.` };
                    }
                }
            }
        }
        return { valid: true };
    };

    const triggerSubmitConfirm = () => {
        if (Object.keys(uploadProgress).length > 0) { toast.warning("Files are uploading. Please wait."); return; }
        if (!declarationChecked) { toast.warning('You must agree to the declaration.'); return; }
        if (isAwaitingSignoff || isPracticalModule) {
            const chk = validateChecklistEvidence() as any;
            if (!chk.valid) { toast.warning(chk.message); return; }
        }
        setShowSubmitConfirm(true);
    };

    const executeSubmit = async () => {
        setShowSubmitConfirm(false);
        setSaving(true);
        const t = new Date(getSecureNow()).toISOString();
        const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';
        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                answers, status: nextStatus, submittedAt: t,
                learnerDeclaration: { agreed: true, timestamp: t, learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown', learnerIdNumber: learnerProfile?.idNumber || 'Unknown' },
            });
            toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
            setSubmission((p: any) => ({ ...p, status: nextStatus }));
            setTimeout(() => window.scrollTo(0, 0), 1000);
        } catch { toast.error('Failed to submit.'); } finally { setSaving(false); }
    };

    /* ══════════════════════════════════════════════════════════════════════
       FULL-SCREEN STATES
    ══════════════════════════════════════════════════════════════════════ */
    if (loading) return (
        <div className="ap-fullscreen">
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div className="ap-spinner" />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Loading Assessment…</span>
            </div>
        </div>
    );

    if (isAdminIntercept) return (
        <div className="ap-fullscreen">
            <div className="ap-state-card">
                <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                    <ShieldAlert size={32} color="var(--mlab-blue)" />
                </div>
                <h1 className="ap-state-card__title">Staff Access Detected</h1>
                <p className="ap-state-card__desc">This area is restricted to learners only.<br />Use Preview mode to view assessments without affecting learner data.</p>
                <div className="ap-state-card__actions">
                    <button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Go Back</button>
                    <button className="ap-btn ap-btn--primary" onClick={() => navigate(`/admin/assessment/preview/${assessmentId}`)}>Open Preview Mode</button>
                </div>
            </div>
        </div>
    );

    if (!assessment || !submission) return (
        <div className="ap-fullscreen">
            <div className="ap-state-card">
                <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', opacity: 0.5 }}>
                    <AlertCircle size={32} color="var(--mlab-grey)" />
                </div>
                <h2 className="ap-state-card__title">Assessment Unavailable</h2>
                <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Contact your facilitator if you believe this is an error.</p>
                <div className="ap-state-card__actions">
                    <button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button>
                </div>
            </div>
        </div>
    );

    /* ══════════════════════════════════════════════════════════════════════
       GATE SCREEN
    ══════════════════════════════════════════════════════════════════════ */
    if (showGate) return (
        <div className="ap-gate ap-animate">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
            <div className="ap-gate-topbar">
                <button className="ap-gate-topbar__back" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Back to Portfolio</button>
                <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
            </div>

            <div className="ap-gate-body">
                <div className="ap-gate-left">
                    <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
                    <h1 className="ap-gate-left__title">
                        {assessment.title}
                        {submission?.attemptNumber > 1 && (
                            <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>
                        )}
                    </h1>
                    <p className="ap-gate-left__sub">
                        {isRemediation
                            ? "This is a fresh attempt. Your previous answers have been retained. Use the Facilitator's Coaching Notes below to correct your answers and resubmit."
                            : "Read all instructions carefully before starting."}
                    </p>

                    {assessment?.moduleType === 'workplace' && (
                        <div className="ap-workplace-banner">
                            <strong className="ap-workplace-banner__title"><Briefcase size={16} /> Workplace Experience Logbook</strong>
                            <p className="ap-workplace-banner__text">
                                This module is a <strong>Learner Logbook</strong>. It tracks and verifies your real-world workplace experience. You will map tasks to specific Work Activities (WA), record your hours, and upload Supporting Evidence (SE) for review by your designated Workplace Mentor.
                            </p>
                        </div>
                    )}

                    {needsRemediationGate && (
                        <div className="ap-coaching-log">
                            <strong className="ap-coaching-log__title"><MessageSquare size={16} /> Remediation Coaching Log</strong>
                            <p className="ap-coaching-log__desc">
                                Before beginning Attempt #{submission.attemptNumber}, QCTO compliance requires you to acknowledge the feedback session conducted by your facilitator.
                            </p>
                            <div className="ap-coaching-log__quote">
                                <span className="ap-coaching-log__quote-label">Facilitator Notes ({getSafeDate(submission.latestCoachingLog.date)}):</span>
                                <p className="ap-coaching-log__quote-text">"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
                            </div>
                            <label className="ap-coaching-log__ack">
                                <input type="checkbox" checked={coachingAckChecked} onChange={e => setCoachingAckChecked(e.target.checked)} />
                                <span className="ap-coaching-log__ack-label">I acknowledge that I received the coaching/feedback detailed above.</span>
                            </label>
                        </div>
                    )}

                    <div className="ap-info-grid">
                        <div className="ap-info-card"><div className="ap-info-card__label"><BookOpen size={12} /> Module</div><div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div><div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div></div>
                        <div className="ap-info-card"><div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div><div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div><div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div></div>
                        <div className="ap-info-card"><div className="ap-info-card__label"><Clock size={12} /> Time Limit</div><div className="ap-info-card__value">{assessment.moduleInfo?.timeLimit ? `${assessment.moduleInfo.timeLimit} Min` : 'No Limit'}</div><div className="ap-info-card__sub">{assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}</div></div>
                        {!isWorkplaceModule && <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Total Marks</div><div className="ap-info-card__value">{assessment.totalMarks}</div><div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div></div>}
                        {isWorkplaceModule && <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Grading</div><div className="ap-info-card__value">C / NYC</div><div className="ap-info-card__sub">Competency-based. No numerical score.</div></div>}
                    </div>

                    <div className="ap-note-block">
                        <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
                        <p className="ap-note-block__text">{assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
                        {assessment.purpose && (<><div className="ap-note-block__heading"><Info size={12} /> Purpose</div><p className="ap-note-block__text">{assessment.purpose}</p></>)}
                    </div>
                </div>

                <div className="ap-gate-right">
                    <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
                    <ul className="ap-rules-list">
                        <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or unauthorized AI tools violate QCTO guidelines.</p></div></li>
                        <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly a group project, no collaboration is permitted.</p></div></li>
                        <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
                        {assessment.moduleInfo?.timeLimit > 0 && (
                            <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser. Plan your time carefully.</p></div></li>
                        )}
                    </ul>
                    <div className="ap-declaration">
                        <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
                            <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
                            <span className="ap-declaration-check__text"><strong>Declaration of Authenticity</strong> I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.</span>
                        </label>
                        <button
                            className={`ap-start-btn${(startDeclarationChecked && (!needsRemediationGate || coachingAckChecked)) ? ' ap-start-btn--ready' : ''}`}
                            onClick={handleStartAssessment}
                            disabled={saving || !startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)}
                        >
                            {saving ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> {needsRemediationGate ? `Acknowledge & Resume Attempt #${submission.attemptNumber}` : 'I Agree, Begin Assessment'}</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    /* ══════════════════════════════════════════════════════════════════════
       PLAYER SCREEN
    ══════════════════════════════════════════════════════════════════════ */
    const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
        if (block.type === 'section') acc.push({ type: 'section', label: block.title, id: block.id });
        else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type))
            acc.push({ type: 'q', label: block.question || block.title || 'Workplace Checkpoint', id: block.id });
        return acc;
    }, []) || [];

    let displayStatus = submission.status.replace('_', ' ');
    if (submission.status === 'returned') displayStatus = 'revision required';

    const canEditTask = !isLocked || isAwaitingSignoff;
    const canEditChecklist = isAwaitingSignoff;
    const canEditLogbook = !isLocked || isAwaitingSignoff;
    const canEditWorkplace = !isLocked || isAwaitingSignoff;

    let qNum = 0;

    return (
        <div className="ap-player ap-animate">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {showLeaveWarning && (
                <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)} />
            )}
            {showSubmitConfirm && (
                <ConfirmModal
                    title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"}
                    message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."}
                    confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"}
                    cancelText="Go Back"
                    onConfirm={executeSubmit}
                    onCancel={() => setShowSubmitConfirm(false)}
                />
            )}

            {/* ── TOP BAR ── */}
            <div className="ap-player-topbar no-print">
                <div className="ap-player-topbar__left">
                    <button className="ap-player-topbar__back" onClick={handleNavigationLeave}><ArrowLeft size={13} /> Portfolio</button>
                    <div className="ap-player-topbar__separator" />
                    <h1 className="ap-player-topbar__title">
                        {assessment.title}
                        {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
                    </h1>
                </div>
                <div className="ap-player-topbar__right">
                    {isLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={13} /> Print Audit</button>}
                    {!isLocked && !isPracticalModule && timeLeft !== null && (
                        <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>
                    )}
                    {!isLocked && isPracticalModule && (
                        <div className="ap-timer ap-timer--untimed">
                            <Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Experience Logbook' : 'Untimed Practical Task'}
                        </div>
                    )}
                    <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
                        {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}
                    </span>
                    <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
                </div>
            </div>

            {/* ── BODY ── */}
            <div className={`ap-player-body${isLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>

                {/* ── LEFT SIDEBAR ── */}
                <nav className="ap-sidebar no-print">
                    <div className="ap-sidebar__meta-block">
                        <div className="ap-sidebar__meta-title">{assessment.title}</div>
                        {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail" style={{ color: '#d97706', fontWeight: 'bold' }}><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
                        <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
                        {!isWorkplaceModule
                            ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div>
                            : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
                        {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
                    </div>

                    {/* Status tracking */}
                    {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
                        <>
                            <div className="ap-sidebar__label">Status Tracking</div>
                            <div className="ap-sidebar__status-box">
                                {isAssDone && outcome ? (
                                    <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
                                        <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
                                        {!isWorkplaceModule && outcome.score !== undefined && <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
                                        {isWorkplaceModule && <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>Competency-Based Assessment</div>}
                                        <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
                                    </div>
                                ) : (
                                    <div className="ap-sidebar__awaiting">
                                        <Clock size={20} color="rgba(255,255,255,0.25)" />
                                        <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
                                        <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
                                    </div>
                                )}

                                {isFacDone && submission.grading?.facilitatorOverallFeedback && (
                                    <div className="ap-sidebar__feedback ap-sidebar__feedback--fac">
                                        <strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong>
                                        <p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p>
                                    </div>
                                )}
                                {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
                                    <div className="ap-sidebar__feedback ap-sidebar__feedback--ass">
                                        <strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong>
                                        <p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p>
                                    </div>
                                )}
                                {isModDone && submission.moderation?.feedback && (
                                    <div className="ap-sidebar__feedback ap-sidebar__feedback--mod">
                                        <strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong>
                                        <p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p>
                                    </div>
                                )}

                                <div className="ap-sidebar__timeline-item">
                                    <div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div>
                                    <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? (savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator') : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div>
                                </div>
                                <div className="ap-sidebar__timeline-item">
                                    <div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div>
                                    <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div>
                                </div>
                                <div className="ap-sidebar__timeline-item">
                                    <div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div>
                                    <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div>
                                </div>
                            </div>
                        </>
                    )}

                    <div className="ap-sidebar__label">Workbook Contents</div>
                    <div className="ap-sidebar__nav">
                        {navItems.map((item: any) =>
                            item.type === 'section'
                                ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
                                : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item">{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
                        )}
                    </div>
                </nav>

                {/* ── CONTENT ── */}
                <div className="ap-player-content print-pane">
                    {/* Print cover pages */}
                    {isLocked && !isAwaitingSignoff && (
                        <div className="print-only-cover">
                            <div className="print-page">
                                <h1>{assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}</h1>
                                <h2>LEARNER {assessment?.moduleType === 'workplace' ? 'WORKPLACE LOGBOOK' : 'WORKBOOK'}{submission?.attemptNumber > 1 ? ` — ATTEMPT #${submission.attemptNumber}` : ''}</h2>
                                <table className="print-table" style={{ marginBottom: '30pt' }}>
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
                                <table className="print-table">
                                    <tbody>
                                        <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '________________________'}</td></tr>
                                        <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || user?.email || '________________________'}</td></tr>
                                        <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
                                        <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
                                        <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
                                    </tbody>
                                </table>
                                {assessment?.moduleType === 'workplace' && workplaceInfo?.employer && (
                                    <>
                                        <h3 style={{ marginTop: '24pt' }}>WORKPLACE PLACEMENT DETAILS:</h3>
                                        <table className="print-table">
                                            <tbody>
                                                <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Host Company Name</td><td>{workplaceInfo.employer.name}</td></tr>
                                                <tr><td style={{ fontWeight: 'bold' }}>Registration / SETA Number</td><td>{workplaceInfo.employer.registrationNumber || 'N/A'}</td></tr>
                                                <tr><td style={{ fontWeight: 'bold' }}>Physical Address</td><td>{workplaceInfo.employer.physicalAddress || '________________________'}</td></tr>
                                                <tr><td style={{ fontWeight: 'bold' }}>Host Company Contact Person</td><td>{workplaceInfo.employer.contactPerson}</td></tr>
                                                <tr><td style={{ fontWeight: 'bold' }}>Assigned Workplace Mentor</td><td>{workplaceInfo.mentor?.fullName || '________________________'}</td></tr>
                                                <tr><td style={{ fontWeight: 'bold' }}>Mentor Contact</td><td>{workplaceInfo.mentor?.email || workplaceInfo.employer.contactEmail}</td></tr>
                                            </tbody>
                                        </table>
                                    </>
                                )}
                            </div>

                            <div className="print-page">
                                <h3>Note to the learner</h3><p>{assessment?.instructions}</p>
                                <h3>Purpose</h3><p>{assessment?.purpose}</p>
                                <h3>Topic elements covered</h3>
                                <table className="print-table no-border">
                                    <tbody>
                                        {assessment?.moduleInfo?.topics?.length > 0
                                            ? assessment.moduleInfo.topics.map((t: any, i: number) => <tr key={i}><td>{t.code && <strong>{t.code}: </strong>}{t.title || t.name}</td><td>{t.weight || t.percentage}%</td></tr>)
                                            : assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, i: number) => {
                                                const tot = sectionTotals[sec.id]?.total || 0;
                                                return <tr key={i}><td><strong>Section {i + 1}: </strong>{sec.title}</td><td>{isWorkplaceModule ? 'Competency Based' : (tot > 0 && assessment.totalMarks ? `${Math.round((tot / assessment.totalMarks) * 100)}%` : '—')}</td></tr>;
                                            })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Remediation record page */}
                            {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
                                <div className="print-page">
                                    <h3>Record of Developmental Intervention (Remediation)</h3>
                                    <p>Official evidence of a developmental intervention conducted prior to Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>
                                    <table className="print-table" style={{ marginBottom: '24pt' }}>
                                        <tbody>
                                            <tr><td style={{ width: '30%', fontWeight: 'bold' }}>Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
                                            <tr><td style={{ fontWeight: 'bold' }}>Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString()}</td></tr>
                                            <tr><td style={{ fontWeight: 'bold' }}>Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
                                            <tr><td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>Coaching Notes</td><td style={{ wordBreak: 'break-word' }}>{submission.latestCoachingLog.notes}</td></tr>
                                        </tbody>
                                    </table>
                                    <div className="sr-signature-block">
                                        <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue', flex: '0 1 300px' }}>
                                            <span>Facilitator Declaration</span>
                                            {facilitatorProfile?.signatureUrl ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" /> : <div className="sr-sig-no-image">No Canvas Signature</div>}
                                            <strong>{submission.latestCoachingLog.facilitatorName}</strong>
                                            <em>Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</em>
                                            <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>Coaching Conducted</div>
                                        </div>
                                        <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
                                            <span>Learner Acknowledgement</span>
                                            {submission.latestCoachingLog.acknowledged
                                                ? <>{learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div className="sr-sig-no-image">No Canvas Signature</div>}<strong>{learnerProfile?.fullName || user?.fullName}</strong><em>Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString()}</em><div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Intervention Received</div></>
                                                : <div className="sr-sig-no-image">Pending Signature</div>
                                            }
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Print audit header */}
                    {isLocked && !isAwaitingSignoff && (
                        <div className="ap-print-header">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <div>
                                    <p style={{ margin: '0 0 4px' }}><strong>Learner:</strong> {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName}</p>
                                    <p style={{ margin: 0 }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber}</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ margin: '0 0 4px' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
                                    <p style={{ margin: '0 0 4px' }}><strong>Submitted:</strong> {getSafeDate(submission.submittedAt)}</p>
                                    {isAssDone && <p style={{ margin: 0 }}><strong>Outcome:</strong> {outcome?.label} ({outcome?.percentage}%)</p>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── BLOCKS ── */}
                    <div className="ap-blocks">
                        {assessment.blocks?.map((block: any) => {

                            /* Section header */
                            if (block.type === 'section') {
                                const totals = sectionTotals[block.id];
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
                                        <span>{block.title}</span>
                                        {isAssDone && totals && totals.total > 0 && (
                                            <span className="no-print" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em' }}>
                                                <BarChart size={13} /> {totals.awarded}/{totals.total}
                                            </span>
                                        )}
                                        {block.content && <div className="quill-read-only-content" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginTop: '8px', fontFamily: 'var(--font-body)' }} dangerouslySetInnerHTML={{ __html: block.content }} />}
                                    </div>
                                );
                            }

                            /* Info block */
                            if (block.type === 'info') return (
                                <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
                                    <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
                                    <p className="ap-block-info__text">{block.content}</p>
                                </div>
                            );

                            /* Question blocks */
                            if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
                                qNum++;
                                const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
                                const learnerAns = answers[block.id] || {};

                                /* Ink-colour for marks label */
                                let inkColor = '#64748b';
                                if (isModDone) inkColor = 'var(--mlab-green)';
                                else if (isAssDone) inkColor = 'var(--mlab-red)';
                                else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

                                const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
                                const markLabel = isWEBlock
                                    ? 'Competency Based'
                                    : (isFacDone && blockScore !== undefined && blockScore !== null
                                        ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

                                /* Block type chip */
                                const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk'
                                    : block.type === 'logbook' ? 'ap-block-type-chip--log'
                                        : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto'
                                            : block.type === 'task' ? 'ap-block-type-chip--task'
                                                : 'ap-block-type-chip--q';
                                const typeLabel = block.type === 'checklist' ? 'CHK'
                                    : block.type === 'logbook' ? 'LOG'
                                        : block.type === 'qcto_workplace' ? 'QCTO'
                                            : `Q${qNum}.`;

                                return (
                                    <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>

                                        {/* Header */}
                                        <div className="ap-block-question__header">
                                            <div className="ap-block-question__text-wrap">
                                                <span className="ap-block-question__text">
                                                    <span className={`ap-block-type-chip ${typeChipClass}`}>{typeLabel}</span>
                                                    {block.question || block.title || (block.type === 'qcto_workplace' ? 'Workplace Checkpoint' : '')}
                                                </span>
                                                {/* Grade indicators */}
                                                <div className="ap-grade-indicators">
                                                    {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && (
                                                        <div className="ap-grade-indicator ap-grade-indicator--fac" title="Facilitator Pre-Mark">
                                                            {facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}
                                                        </div>
                                                    )}
                                                    {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && (
                                                        <div className="ap-grade-indicator ap-grade-indicator--ass" title="Assessor Grade">
                                                            {assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}
                                                        </div>
                                                    )}
                                                    {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && (
                                                        <div className="ap-grade-indicator ap-grade-indicator--mod" title="Moderator QA">
                                                            {modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="ap-block-question__marks" style={{ color: inkColor, fontWeight: 700 }}>{markLabel}</span>
                                        </div>

                                        {/* Body */}
                                        <div className="ap-block-question__body">

                                            {/* MCQ */}
                                            {block.type === 'mcq' && (
                                                <div className="ap-mcq-options">
                                                    {block.options?.map((opt: string, i: number) => {
                                                        const selected = learnerAns === i;
                                                        return (
                                                            <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
                                                                <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={!canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
                                                                <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
                                                                <span className="ap-mcq-label__text">{opt}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* TEXT */}
                                            {block.type === 'text' && (
                                                <div className={`ap-quill-wrapper${!canEditTask ? ' locked' : ''}`}>
                                                    <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder={!canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
                                                </div>
                                            )}

                                            {/* TASK (multi-modal) */}
                                            {block.type === 'task' && (() => {
                                                const taskTabs = [
                                                    { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text },
                                                    { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl },
                                                    { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url },
                                                    { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl },
                                                    { id: 'code', icon: <Code size={13} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code },
                                                ].filter(t => t.allowed);
                                                const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
                                                const progress = uploadProgress[block.id];

                                                return (
                                                    <div className="ap-evidence-container">
                                                        {isPracticalModule && !isAwaitingSignoff && !isSubmitted && (
                                                            <div className="ap-evidence-lock-banner"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>
                                                        )}
                                                        <div className="ap-tab-bar no-print">
                                                            {taskTabs.map(t => (
                                                                <button key={t.id} className={`ap-tab${activeTabId === t.id ? ' ap-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}>
                                                                    {t.icon} {t.label} {!!t.val && <CheckCircle size={11} className="ap-tab__done" />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="ap-tab-panel">
                                                            {activeTabId === 'text' && <div className={`ap-quill-wrapper${!canEditTask ? ' locked' : ''}`}><ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" /></div>}
                                                            {activeTabId === 'audio' && (learnerAns?.audioUrl ? <audio controls src={learnerAns.audioUrl} style={{ width: '100%' }} /> : <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed var(--mlab-border)', color: 'var(--mlab-grey)', fontSize: '0.85rem' }}>{!canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
                                                            {activeTabId === 'url' && (
                                                                <div>
                                                                    {canEditTask && <div className="ap-url-note"><strong>Note:</strong> If pasting a Google Drive link, ensure it is set to <em>"Anyone with the link can view"</em>.</div>}
                                                                    {learnerAns?.url && !canEditTask ? <UrlPreview url={learnerAns.url} /> : <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={!canEditTask} placeholder="https://…" />}
                                                                </div>
                                                            )}
                                                            {activeTabId === 'upload' && (
                                                                progress !== undefined ? <UploadProgress progress={progress} />
                                                                    : learnerAns?.uploadUrl ? <FilePreview url={learnerAns.uploadUrl} onRemove={canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={!canEditTask} />
                                                                        : <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed var(--mlab-border)' }}>
                                                                            {!canEditTask ? <span style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem' }}>No file uploaded.</span> : (<><p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Select a file (Allowed: {block.allowedFileTypes})</p><input type="file" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id)} style={{ fontSize: '0.82rem' }} /></>)}
                                                                        </div>
                                                            )}
                                                            {activeTabId === 'code' && <textarea className="ap-code-textarea" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={!canEditTask} placeholder="Paste your code here…" />}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* CHECKLIST */}
                                            {block.type === 'checklist' && (
                                                <div className="ap-checklist">
                                                    <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item. Upload evidence for each if required below.</p>
                                                    {!isAwaitingSignoff && !isSubmitted && (
                                                        <div className="ap-checklist__lock-notice"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>
                                                    )}
                                                    {block.criteria?.map((crit: string, i: number) => {
                                                        const res = criteriaResults?.[i] || {};
                                                        const critKey = `evidence_${i}`;
                                                        const raw = learnerAns?.[critKey];
                                                        const critEv = typeof raw === 'string' ? { text: raw } : (raw || {});
                                                        const cTabKey = `${block.id}_${i}`;
                                                        const allTabs = [
                                                            { id: 'upload', icon: <UploadCloud size={12} />, label: 'File', val: critEv?.uploadUrl },
                                                            { id: 'url', icon: <LinkIcon size={12} />, label: 'Link', val: critEv?.url },
                                                            { id: 'code', icon: <Code size={12} />, label: 'Code', val: critEv?.code },
                                                            { id: 'text', icon: <FileText size={12} />, label: 'Notes', val: critEv?.text },
                                                        ];
                                                        const tabs = !canEditChecklist ? allTabs.filter(t => t.val) : allTabs;
                                                        const activeCtab = activeTabs[cTabKey] || tabs[0]?.id || 'upload';
                                                        const progress = uploadProgress[`${block.id}_${critKey}`];

                                                        return (
                                                            <div key={i} className="ap-checklist__item">
                                                                <p className="ap-checklist__item-title">{i + 1}. {crit}</p>
                                                                <div className="ap-checklist__assessor-row">
                                                                    {isFacDone ? (
                                                                        <>
                                                                            <span className={`ap-checklist__status-chip${res.status === 'C' ? ' ap-checklist__status-chip--c' : res.status === 'NYC' ? ' ap-checklist__status-chip--nyc' : ' ap-checklist__status-chip--pending'}`}>
                                                                                {res.status
                                                                                    ? (savedFacRole === 'mentor'
                                                                                        ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗')
                                                                                        : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)'))
                                                                                    : 'Not Graded'}
                                                                            </span>
                                                                            {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
                                                                        </>
                                                                    ) : (
                                                                        <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>
                                                                    )}
                                                                </div>
                                                                {block.requireEvidencePerCriterion !== false && (
                                                                    <div className="ap-checklist__evidence-tabs">
                                                                        <div className="ap-checklist__tab-bar">
                                                                            {tabs.length > 0 ? tabs.map(t => (
                                                                                <button key={t.id} className={`ap-checklist__tab${activeCtab === t.id ? ' ap-checklist__tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [cTabKey]: t.id })}>
                                                                                    {t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}
                                                                                </button>
                                                                            )) : (
                                                                                <div className="ap-checklist__no-evidence">No evidence provided.</div>
                                                                            )}
                                                                        </div>
                                                                        {tabs.length > 0 && (
                                                                            <div className="ap-checklist__tab-panel">
                                                                                {activeCtab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : critEv.uploadUrl ? <FilePreview url={critEv.uploadUrl} onRemove={canEditChecklist ? () => handleNestedAnswerChange(block.id, critKey, 'uploadUrl', '') : undefined} disabled={!canEditChecklist} /> : <input type="file" disabled={!canEditChecklist} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, critKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
                                                                                {activeCtab === 'url' && (<div>{canEditChecklist && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{critEv.url && !canEditChecklist ? <UrlPreview url={critEv.url} /> : <input type="url" className="ab-input" value={critEv.url || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'url', e.target.value)} disabled={!canEditChecklist} placeholder="https://…" />}</div>)}
                                                                                {activeCtab === 'code' && <textarea className="ap-code-textarea" rows={3} value={critEv.code || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'code', e.target.value)} disabled={!canEditChecklist} placeholder="Paste code snippet…" />}
                                                                                {activeCtab === 'text' && <div className={`ap-quill-wrapper${!canEditChecklist ? ' locked' : ''}`}><ReactQuill theme="snow" value={critEv.text || ''} onChange={c => handleNestedAnswerChange(block.id, critKey, 'text', c)} readOnly={!canEditChecklist} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" /></div>}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* LOGBOOK */}
                                            {block.type === 'logbook' && (
                                                <div className="ap-logbook">
                                                    <p className="ap-logbook__desc">{block.content}</p>
                                                    <table className="ap-logbook__table">
                                                        <thead className="ap-logbook__thead">
                                                            <tr>
                                                                <th>Date</th>
                                                                <th>Assignment Task</th>
                                                                <th>Start</th>
                                                                <th>Finish</th>
                                                                <th style={{ width: '80px' }}>Hours</th>
                                                                {canEditLogbook && <th style={{ width: '40px' }}></th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
                                                                <tr key={i} className="ap-logbook__tbody">
                                                                    <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                    <td className="ap-logbook__td"><input type="text" className="ap-logbook__input" value={entry.task} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].task = e.target.value; handleAnswerChange(block.id, n); }} placeholder="Task description" /></td>
                                                                    <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                    <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                    <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
                                                                    {canEditLogbook && <td className="ap-logbook__td"><button className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
                                                                </tr>
                                                            ))}
                                                            {canEditLogbook && (
                                                                <tr><td colSpan={6} className="ap-logbook__add-row"><button className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>
                                                            )}
                                                            <tr className="ap-logbook__totals-row">
                                                                <td colSpan={4} className="ap-logbook__totals-label">Total Logged Hours:</td>
                                                                <td className="ap-logbook__totals-val" style={(() => { const logged = (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0); return block.requiredHours && logged < block.requiredHours ? { color: '#dc2626', fontWeight: 'bold' } : {}; })()}>
                                                                    {(Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0)}
                                                                    {block.requiredHours && (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0) < block.requiredHours && (
                                                                        <span style={{ display: 'block', fontSize: '0.72rem', color: '#dc2626', fontWeight: 'normal', marginTop: '2px' }}>
                                                                            ⚠ Required: {block.requiredHours} hrs
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                {canEditLogbook && <td></td>}
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {/* QCTO WORKPLACE */}
                                            {block.type === 'qcto_workplace' && (
                                                <div className="ap-workplace">
                                                    {block.weCode && (
                                                        <>
                                                            <span className="ap-workplace__we-label">Work Experience Module (WE Code):</span>
                                                            <span className="ap-workplace__we-code">{block.weCode} — {block.weTitle}</span>
                                                        </>
                                                    )}
                                                    {block.workActivities?.map((wa: any) => {
                                                        const waTask = learnerAns?.[`wa_${wa.id}_task`] || '';
                                                        const waDate = learnerAns?.[`wa_${wa.id}_date`] || new Date().toISOString().split('T')[0];
                                                        const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;

                                                        return (
                                                            <div key={wa.id} className="ap-workplace__activity">
                                                                <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>
                                                                <div className="ap-workplace__fields">
                                                                    <div className="ap-workplace__field">
                                                                        <label className="ap-workplace__field-label">Task Performed</label>
                                                                        <input type="text" className="ap-workplace__input" value={waTask} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_task`, e.target.value)} disabled={!canEditWorkplace} placeholder="What did you do?" />
                                                                    </div>
                                                                    <div className="ap-workplace__field ap-workplace__field--date">
                                                                        <label className="ap-workplace__field-label">Date</label>
                                                                        <input type="date" className="ap-workplace__input" value={waDate} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_date`, e.target.value)} disabled={!canEditWorkplace} />
                                                                    </div>
                                                                </div>

                                                                {(wa.evidenceItems || []).length > 0 && (
                                                                    <div className="ap-workplace__se-block">
                                                                        <span className="ap-workplace__se-title">Supporting Evidence Required:</span>
                                                                        {wa.evidenceItems.map((se: any) => {
                                                                            const seKey = `se_${se.id}`;
                                                                            const seData = learnerAns?.[seKey] || {};
                                                                            const seTabs = [
                                                                                { id: 'upload', icon: <UploadCloud size={13} />, label: 'Document', val: seData.uploadUrl },
                                                                                { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', val: seData.url },
                                                                                { id: 'text', icon: <FileText size={13} />, label: 'Reflection', val: seData.text },
                                                                            ];
                                                                            const activeSeTab = activeTabs[`${block.id}_${se.id}`] || seTabs[0].id;
                                                                            const progress = uploadProgress[`${block.id}_${seKey}`];

                                                                            return (
                                                                                <div key={se.id} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px dashed var(--mlab-border)' }}>
                                                                                    <strong style={{ display: 'block', fontSize: '0.82rem', color: 'var(--mlab-blue)', marginBottom: '8px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{se.code}: {se.description}</strong>
                                                                                    <div className="ap-workplace__se-tabs">
                                                                                        <div className="ap-workplace__se-tab-bar no-print">
                                                                                            {seTabs.map(t => (
                                                                                                <button key={t.id} className={`ap-workplace__se-tab${activeSeTab === t.id ? ' ap-workplace__se-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [`${block.id}_${se.id}`]: t.id })}>
                                                                                                    {t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}
                                                                                                </button>
                                                                                            ))}
                                                                                        </div>
                                                                                        <div className="ap-workplace__se-tab-panel">
                                                                                            {activeSeTab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : seData.uploadUrl ? <FilePreview url={seData.uploadUrl} onRemove={canEditWorkplace ? () => handleNestedAnswerChange(block.id, seKey, 'uploadUrl', '') : undefined} disabled={!canEditWorkplace} /> : <input type="file" disabled={!canEditWorkplace} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, seKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
                                                                                            {activeSeTab === 'url' && (<div>{canEditWorkplace && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{seData.url && !canEditWorkplace ? <UrlPreview url={seData.url} /> : <input type="url" className="ab-input" value={seData.url || ''} onChange={e => handleNestedAnswerChange(block.id, seKey, 'url', e.target.value)} disabled={!canEditWorkplace} placeholder="https://…" />}</div>)}
                                                                                            {activeSeTab === 'text' && <div className={`ap-quill-wrapper${!canEditWorkplace ? ' locked' : ''}`}><ReactQuill theme="snow" value={seData.text || ''} onChange={c => handleNestedAnswerChange(block.id, seKey, 'text', c)} readOnly={!canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" /></div>}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}

                                                                <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
                                                                    <input type="checkbox" disabled={!canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
                                                                    <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
                                                                </label>
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Global toggles */}
                                                    <div className="ap-workplace__toggles">
                                                        {block.requireSelfAssessment !== false && (
                                                            <label className={`ap-workplace__toggle${learnerAns?.selfAssessmentDone ? ' ap-workplace__toggle--checked' : ''}`}>
                                                                <input type="checkbox" disabled={!canEditWorkplace} checked={learnerAns?.selfAssessmentDone || false} onChange={e => handleTaskAnswerChange(block.id, 'selfAssessmentDone', e.target.checked)} />
                                                                <span className="ap-workplace__toggle-label">I have completed the self-assessment for these tasks.</span>
                                                            </label>
                                                        )}
                                                        {block.requireGoalPlanning !== false && (
                                                            <label className={`ap-workplace__toggle${learnerAns?.goalPlanningDone ? ' ap-workplace__toggle--checked' : ''}`}>
                                                                <input type="checkbox" disabled={!canEditWorkplace} checked={learnerAns?.goalPlanningDone || false} onChange={e => handleTaskAnswerChange(block.id, 'goalPlanningDone', e.target.checked)} />
                                                                <span className="ap-workplace__toggle-label">I have updated my goal planning document.</span>
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Per-question feedback panels */}
                                        {isFacDone && facFeedback && (
                                            <div className="ap-qfeedback ap-qfeedback--fac">
                                                <span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span>
                                                <p className="ap-qfeedback__text">{facFeedback}</p>
                                            </div>
                                        )}
                                        {isAssDone && assFeedback && (
                                            <div className="ap-qfeedback ap-qfeedback--ass">
                                                <span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span>
                                                <p className="ap-qfeedback__text">{assFeedback}</p>
                                            </div>
                                        )}
                                        {isModDone && modFeedback && (
                                            <div className="ap-qfeedback ap-qfeedback--mod">
                                                <span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span>
                                                <p className="ap-qfeedback__text">{modFeedback}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                            return null;
                        })}
                    </div>

                    {/* ── FOOTER ── */}
                    {isAwaitingSignoff ? (
                        <div className="ap-footer ap-footer--signoff">
                            <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
                            <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
                            <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
                                <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
                                <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
                            </label>
                            <div className="ap-footer-actions">
                                <span className="ap-autosave-label">
                                    {saving && <><div className="ap-spinner ap-spinner--sm" /> Saving…</>}
                                    {Object.keys(uploadProgress).length > 0 && <span style={{ color: '#d97706', fontWeight: 700 }}>Uploads in progress…</span>}
                                </span>
                                <button className="ap-btn ap-footer--signoff .ap-btn--signoff" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0} style={{ background: '#d97706', color: 'white', border: '2px solid #b45309' }}>
                                    <Save size={14} /> Acknowledge & Submit for Grading
                                </button>
                            </div>
                        </div>
                    ) : !isLocked ? (
                        <div className="ap-footer">
                            <h3 className="ap-footer__title">Final Submission</h3>
                            <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
                            <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
                                <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
                                <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
                            </label>
                            <div className="ap-footer-actions">
                                <span className="ap-autosave-label">
                                    {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}
                                    {Object.keys(uploadProgress).length > 0 && <span style={{ color: 'var(--mlab-blue)', fontWeight: 700, marginLeft: '10px' }}>Uploads in progress…</span>}
                                </span>
                                <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}>
                                    <Save size={14} /> Submit for Grading
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="ap-footer ap-footer--locked no-print">
                            <div className="ap-footer--locked__icon-wrap">
                                {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
                            </div>
                            {isModDone && outcome?.isCompetent === false ? (
                                <>
                                    <h3 className="ap-footer--locked__title" style={{ color: '#d97706' }}>Assessment Outcome: Not Yet Competent (NYC)</h3>
                                    <div className="ap-remediation-box">
                                        <p>Your assessment has been fully verified. At this stage, you have not yet met all the requirements for competency.</p>
                                        {(submission.attemptNumber || 1) >= 3 ? (
                                            <div className="ap-remediation-box__lockout">
                                                <h4 className="ap-remediation-box__lockout-title"><ShieldAlert size={15} /> Maximum Attempts Reached</h4>
                                                <p>You have exhausted all 3 permitted attempts. Under QCTO regulations, this workbook is permanently locked. You must re-enrol in the module or lodge a formal appeal.</p>
                                            </div>
                                        ) : (
                                            <>
                                                <h4 className="ap-remediation-box__steps-title">What happens next?</h4>
                                                <ol className="ap-remediation-box__steps">
                                                    <li><strong>Review Feedback:</strong> Scroll up and review the Assessor's feedback on your incorrect answers.</li>
                                                    <li><strong>Coaching:</strong> Your facilitator will schedule a brief intervention to discuss the feedback.</li>
                                                    <li><strong>Remediation:</strong> Your facilitator will unlock this workbook for Attempt {submission.attemptNumber ? submission.attemptNumber + 1 : 2} of 3.</li>
                                                </ol>
                                                <p className="ap-remediation-box__appeal">Academic Rights: If you disagree with this outcome, you have the right to lodge a formal appeal with your training provider.</p>
                                            </>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
                                    <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. {isAssDone ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}</p>
                                </>
                            )}
                            <button className="ap-btn ap-btn--primary" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button>
                        </div>
                    )}

                    {/* ── RIGHT AUDIT SIDEBAR ── */}
                    {isLocked && !isAwaitingSignoff && (
                        <aside className="ap-right-sidebar no-print">
                            <h3 className="ap-right-sidebar__title"><ShieldCheck size={15} color="var(--mlab-blue)" /> Official Audit Trail</h3>

                            <div className="ap-audit-card">
                                <span className="ap-audit-card__label">Learner Declaration</span>
                                <div className="ap-audit-card__sig-wrap">
                                    {learnerProfile?.signatureUrl ? <img src={learnerProfile.signatureUrl} alt="Learner signature" /> : <span className="ap-audit-card__sig-placeholder">No signature on file</span>}
                                </div>
                                <span className="ap-audit-card__name">{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}</span>
                                <span className="ap-audit-card__sub"><Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}</span>
                            </div>

                            {outcome ? (
                                <div className="ap-audit-outcome" style={{ borderLeftColor: outcome.color }}>
                                    <div className="ap-audit-outcome__label" style={{ color: outcome.color }}>{outcome.label}</div>
                                    {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Score: {outcome.score} / {assessment.totalMarks} ({outcome.percentage}%)</div>}
                                    {isWorkplaceModule && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Grading: Competency-Based (No Numerical Score)</div>}
                                    <div className="ap-audit-outcome__note">{outcome.subtext}</div>
                                </div>
                            ) : (
                                <div className="ap-audit-card" style={{ textAlign: 'center', padding: '1.5rem', background: '#f8fafc', border: '1px dashed var(--mlab-border)' }}>
                                    <Clock size={24} color="#94a3b8" style={{ margin: '0 auto 0.5rem' }} />
                                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', fontWeight: 700 }}>Pending Outcome</span>
                                    <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Your workbook is currently being evaluated.</span>
                                </div>
                            )}

                            {isFacDone && (
                                <div className="ap-audit-card" style={{ borderTopColor: '#3b82f6' }}>
                                    <span className="ap-audit-card__label" style={{ color: '#3b82f6' }}>{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</span>
                                    <span className="ap-audit-card__name" style={{ color: '#3b82f6' }}>{submission.grading?.facilitatorName || 'Facilitator'}</span>
                                    <span className="ap-audit-card__sub" style={{ color: '#3b82f6' }}><Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}
                            {isAssDone && (
                                <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-red)' }}>
                                    <span className="ap-audit-card__label" style={{ color: 'var(--mlab-red)' }}>{isWorkplaceModule ? 'Assessor Evaluation' : 'Assessor Verification'}</span>
                                    <div className="ap-audit-card__sig-wrap">{assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-red)' }}>No signature on file</span>}</div>
                                    <span className="ap-audit-card__name" style={{ color: 'var(--mlab-red)' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</span>
                                    <span className="ap-audit-card__reg" style={{ color: 'var(--mlab-red)' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</span>
                                    <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-red)' }}><Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}
                            {isModDone && (
                                <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-green)' }}>
                                    <span className="ap-audit-card__label" style={{ color: 'var(--mlab-green)' }}>Internal Moderation QA</span>
                                    <div className="ap-audit-card__sig-wrap">{moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" /> : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-green)' }}>No canvas signature on file</span>}</div>
                                    <span className="ap-audit-card__name" style={{ color: 'var(--mlab-green)' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</span>
                                    <span className="ap-audit-card__reg" style={{ color: submission.moderation?.outcome === 'Returned' ? 'var(--mlab-red)' : 'var(--mlab-green)' }}>Outcome: {submission.moderation?.outcome === 'Endorsed' ? 'Endorsed ✓' : submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor ✗' : submission.moderation?.outcome}</span>
                                    <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-green)' }}><Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}
                        </aside>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AssessmentPlayer;

// import React, { useState, useEffect, useRef, useMemo } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
// import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import {
//     ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
//     AlertCircle, Play, Clock, GraduationCap,
//     BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
//     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
//     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
//     Briefcase
// } from 'lucide-react';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';

// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';

// import { createPortal } from 'react-dom';
// import './AssessmentPlayer.css';
// import moment from 'moment';

// /* ── Helpers ────────────────────────────────────────────────────────────── */
// export const TintedSignature = ({ imageUrl, color }: { imageUrl: string; color: string }) => {
//     const filterMap: Record<string, string> = {
//         black: 'brightness(0)',
//         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
//         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
//         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)',
//     };
//     return (
//         <img
//             src={imageUrl}
//             alt="Signature"
//             style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain', filter: filterMap[color] || 'none' }}
//         />
//     );
// };

// const quillModules = {
//     toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']],
// };
// const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// /* ── Upload progress bar ─────────────────────────────────────────────────── */
// const UploadProgress = ({ progress }: { progress: number }) => (
//     <div className="ap-upload-progress">
//         <div className="ap-upload-progress__header">
//             <span>Uploading…</span>
//             <span>{progress}%</span>
//         </div>
//         <div className="ap-upload-progress__track">
//             <div className="ap-upload-progress__fill" style={{ width: `${progress}%` }} />
//         </div>
//     </div>
// );

// /* ── File Preview ────────────────────────────────────────────────────────── */
// const FilePreview = ({
//     url,
//     onRemove,
//     disabled,
// }: {
//     url: string;
//     onRemove?: () => void;
//     disabled?: boolean;
// }) => {
//     const isLinkValid = (u?: string) =>
//         u && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:'));

//     if (!isLinkValid(url)) {
//         return (
//             <div className="ap-file-preview__fallback">
//                 <span className="ap-file-preview__fallback-name">Local fallback: {url}</span>
//                 {!disabled && onRemove && (
//                     <button type="button" className="ap-file-preview__remove-btn" onClick={onRemove}>
//                         <Trash2 size={14} />
//                     </button>
//                 )}
//             </div>
//         );
//     }

//     const getExt = (u: string) => {
//         try { return u.split('?')[0].split('.').pop()!.toLowerCase(); } catch { return ''; }
//     };

//     const ext = getExt(url);
//     const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
//     const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
//     const isPdf = ext === 'pdf';
//     const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);
//     const googleDocsUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

//     return (
//         <div className="ap-file-preview">
//             <div className="ap-file-preview__bar">
//                 <span className="ap-file-preview__bar-label">
//                     <FileText size={13} /> Evidence Preview
//                 </span>
//                 <div className="ap-file-preview__bar-actions">
//                     <a href={url} target="_blank" rel="noreferrer" className="ap-file-preview__open-link no-print">
//                         {isOffice ? 'Download / View Native' : 'Open Fullscreen'}
//                     </a>
//                     {!disabled && onRemove && (
//                         <button type="button" className="ap-file-preview__remove-btn" onClick={onRemove} title="Remove Evidence">
//                             <Trash2 size={14} />
//                         </button>
//                     )}
//                 </div>
//             </div>

//             <div className={`ap-file-preview__body${isImage || isVideo ? ' ap-file-preview__body--padded' : ''} no-print`}>
//                 {isImage && <img src={url} alt="Preview" className="ap-file-preview__img" />}
//                 {isVideo && <video src={url} controls className="ap-file-preview__video" />}
//                 {isPdf && <iframe src={url} className="ap-file-preview__iframe" title="PDF Preview" />}
//                 {isOffice && (
//                     <>
//                         <div className="ap-file-preview__office-note">
//                             <strong>Note:</strong> If the document appears blank, use <strong>Download / View Native</strong> above.
//                         </div>
//                         <iframe src={googleDocsUrl} className="ap-file-preview__iframe" title="Office Document Preview" />
//                     </>
//                 )}
//                 {!isImage && !isVideo && !isPdf && !isOffice && (
//                     <div className="ap-file-preview__no-preview">
//                         <FileText size={32} />
//                         <p>Rich preview not available.<br />Use the link above to download.</p>
//                     </div>
//                 )}
//             </div>

//             <div className="print-only" style={{ padding: '8pt', fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>
//                 [Digital Evidence Attached: {url.split('?')[0].split('/').pop()}]
//             </div>
//         </div>
//     );
// };

// /* ── URL Preview ─────────────────────────────────────────────────────────── */
// const UrlPreview = ({ url }: { url: string }) => {
//     if (!url) return null;

//     let embedUrl = url;
//     let isEmbeddable = true;

//     if (url.includes('youtube.com/watch?v=')) embedUrl = url.replace('watch?v=', 'embed/');
//     else if (url.includes('youtu.be/')) embedUrl = url.replace('youtu.be/', 'youtube.com/embed/');
//     else if (url.includes('docs.google.com') || url.includes('drive.google.com'))
//         embedUrl = url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
//     else if (url.includes('github.com')) isEmbeddable = false;

//     return (
//         <div className="ap-url-preview">
//             <div className="ap-file-preview__bar">
//                 <span className="ap-file-preview__bar-label">
//                     <LinkIcon size={13} /> Link Evidence Provided
//                 </span>
//                 <a href={url} target="_blank" rel="noreferrer" className="ap-file-preview__open-link no-print">
//                     Open in New Tab
//                 </a>
//             </div>
//             <div className="print-only" style={{ padding: '8pt', fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>
//                 [External Link: {url}]
//             </div>
//             <div className="ap-url-preview__body no-print">
//                 {isEmbeddable ? (
//                     <iframe src={embedUrl} className="ap-file-preview__iframe" title="URL Preview" />
//                 ) : (
//                     <div className="ap-url-preview__no-embed">
//                         <Code size={32} />
//                         <p>This link blocks inline previewing.<br />Use the link above to view it in a new tab.</p>
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };

// /* ═══════════════════════════════════════════════════════════════════════════
//    MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════ */
// const AssessmentPlayer: React.FC = () => {
//     const { assessmentId } = useParams<{ assessmentId: string }>();
//     const navigate = useNavigate();
//     const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
//     const toast = useToast();

//     const [loading, setLoading] = useState(true);
//     const [saving, setSaving] = useState(false);
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

//     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
//     const [timeLeft, setTimeLeft] = useState<number | null>(null);
//     const [timeOffset, setTimeOffset] = useState<number>(0);

//     const currentStatus = String(submission?.status || '').toLowerCase();
//     const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
//     const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
//     const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
//     const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
//     const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
//     const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
//     const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;
//     const isAssDone = ['graded', 'moderated', 'returned'].includes(currentStatus);
//     const isModDone = ['moderated'].includes(currentStatus);
//     const isRemediation = (submission?.attemptNumber || 1) > 1;
//     const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged;
//     const isNotStarted = currentStatus === 'not_started';
//     const showGate = isNotStarted || needsRemediationGate;
//     const isLocked = isSubmitted || isAwaitingSignoff;
//     const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

//     /* workplace info ─────────────────────────────────────────────────────── */
//     const workplaceInfo = useMemo(() => {
//         if (!learnerEnrollment) return null;
//         const employer = learnerEnrollment.employerId ? employers.find((e: any) => e.id === learnerEnrollment.employerId) : null;
//         const mentor = learnerEnrollment.mentorId ? staff.find((s: any) => s.id === learnerEnrollment.mentorId) : null;
//         return { employer, mentor };
//     }, [learnerEnrollment, employers, staff]);

//     /* grading helpers ───────────────────────────────────────────────────── */
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
//             score: activeLayer.score,
//             isCorrect: activeLayer.isCorrect,
//             facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
//             assIsCorrect: aLayer.isCorrect,
//             modIsCorrect: mLayer.isCorrect,
//             feedback: activeLayer.feedback || '',
//             facFeedback: fLayer.feedback || legacyLayer.feedback || '',
//             assFeedback: aLayer.feedback || '',
//             modFeedback: mLayer.feedback || '',
//             criteriaResults: activeLayer.criteriaResults || [],
//         };
//     };

//     const sectionTotals: Record<string, { total: number; awarded: number }> = {};
//     let currentSectionId = '';
//     if (assessment?.blocks) {
//         assessment.blocks.forEach((block: any) => {
//             if (block.type === 'section') {
//                 currentSectionId = block.id;
//                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
//             } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type) && currentSectionId) {
//                 const { score } = getBlockGrading(block.id);
//                 sectionTotals[currentSectionId].total += Number(block.marks) || 0;
//                 if (score !== undefined && score !== null) sectionTotals[currentSectionId].awarded += Number(score);
//             }
//         });
//     }

//     const savedFacRole = submission?.grading?.facilitatorRole || null; // 'mentor' | 'facilitator' | null

//     const getCompetencyStatus = () => {
//         if (!isAssDone) return null;
//         if (isRemediation && !isLocked) return null;
//         const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
//         let isCompetent = compStr === 'c' || compStr === 'competent';
//         const actualScore = submission?.marks !== undefined ? submission.marks : submission?.totalScore;
//         // WE modules are competency-based — never fall back to score threshold
//         if (!isWorkplaceModule && !isCompetent && actualScore !== undefined && assessment?.totalMarks)
//             isCompetent = actualScore >= assessment.totalMarks * 0.6;
//         const percentage = !isWorkplaceModule && actualScore !== undefined && assessment?.totalMarks
//             ? Math.round((actualScore / assessment.totalMarks) * 100) : null;
//         return {
//             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
//             color: isModDone ? 'var(--mlab-green)' : 'var(--mlab-red)',
//             subtext: isModDone ? 'Final Results Verified & Endorsed.' : isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.',
//             score: isWorkplaceModule ? undefined : actualScore, percentage, isCompetent,
//         };
//     };
//     const outcome = getCompetencyStatus();

//     const getSafeDate = (ds: string) => {
//         if (!ds) return 'recently';
//         const d = new Date(ds);
//         return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
//     };

//     /* time offset ───────────────────────────────────────────────────────── */
//     useEffect(() => {
//         const fetchOffset = async () => {
//             try {
//                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
//                 const data = await res.json();
//                 setTimeOffset(new Date(data.utc_datetime).getTime() - Date.now());
//             } catch { setTimeOffset(0); }
//         };
//         fetchOffset();
//     }, []);
//     const getSecureNow = () => Date.now() + timeOffset;

//     /* data load ─────────────────────────────────────────────────────────── */
//     useEffect(() => {
//         if (employers.length === 0) fetchEmployers();
//         if (staff.length === 0) fetchStaff();

//         const load = async () => {
//             if (!user?.uid || !assessmentId) return;
//             if (user.role && user.role !== 'learner') { setIsAdminIntercept(true); setLoading(false); return; }
//             try {
//                 const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
//                 if (!assSnap.exists()) { toast.error('Assessment template not found.'); setLoading(false); return; }
//                 const assData = assSnap.data();
//                 setAssessment(assData);

//                 const learnersRef = collection(db, 'learners');
//                 let actualLearnerDocId = '';
//                 let activeCohortId = '';
//                 const authSnap = await getDocs(query(learnersRef, where('authUid', '==', user.uid)));
//                 if (!authSnap.empty) {
//                     actualLearnerDocId = authSnap.docs[0].id;
//                     activeCohortId = authSnap.docs[0].data().cohortId;
//                 } else {
//                     const emailSnap = await getDocs(query(learnersRef, where('email', '==', user.email)));
//                     if (emailSnap.empty) { toast.error('Learner profile not found.'); setLoading(false); return; }
//                     actualLearnerDocId = emailSnap.docs[0].id;
//                     activeCohortId = emailSnap.docs[0].data().cohortId;
//                 }

//                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
//                 if (userDocSnap.exists()) setLearnerProfile(userDocSnap.data());

//                 const subQuery = query(collection(db, 'learner_submissions'), where('learnerId', '==', actualLearnerDocId), where('assessmentId', '==', assessmentId));
//                 const subSnap = await getDocs(subQuery);
//                 let activeSub: any = null;
//                 if (!subSnap.empty) {
//                     const cohortMatch = subSnap.docs.find(d => d.data().cohortId === activeCohortId);
//                     activeSub = cohortMatch
//                         ? { id: cohortMatch.id, ...cohortMatch.data() }
//                         : subSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
//                 }

//                 if (activeSub) {
//                     setSubmission(activeSub);
//                     setAnswers(activeSub.answers || {});

//                     if (activeSub.enrollmentId) {
//                         const enrolSnap = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId));
//                         if (enrolSnap.exists()) setLearnerEnrollment(enrolSnap.data());
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

//                     const _needsGate = (activeSub.attemptNumber || 1) > 1 && activeSub.latestCoachingLog && !activeSub.latestCoachingLog.acknowledged;
//                     const isPrac = assData.moduleType === 'practical' || assData.moduleType === 'workplace';
//                     if (!isPrac && activeSub.status === 'in_progress' && assData.moduleInfo?.timeLimit > 0 && !_needsGate) {
//                         const start = new Date(activeSub.startedAt).getTime();
//                         const end = start + assData.moduleInfo.timeLimit * 60 * 1000;
//                         const rem = Math.max(0, Math.floor((end - getSecureNow()) / 1000));
//                         setTimeLeft(rem);
//                         if (rem === 0) forceAutoSubmit(activeSub.id, activeSub.answers || {});
//                     }
//                 } else {
//                     toast.error('You are not assigned to this assessment in your current class.');
//                 }
//             } catch (err) {
//                 console.error(err);
//                 toast.error('Failed to load assessment data.');
//             } finally { setLoading(false); }
//         };

//         if (timeOffset !== null) load();
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [assessmentId, user?.uid, timeOffset]);

//     /* timer ─────────────────────────────────────────────────────────────── */
//     useEffect(() => {
//         if (isPracticalModule || timeLeft === null || isLocked || showGate) return;
//         if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
//         const id = setInterval(() => {
//             const start = new Date(submission.startedAt).getTime();
//             const end = start + assessment.moduleInfo.timeLimit * 60 * 1000;
//             setTimeLeft(Math.max(0, Math.floor((end - getSecureNow()) / 1000)));
//         }, 1000);
//         return () => clearInterval(id);
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [timeLeft, isLocked, showGate, submission?.startedAt, isPracticalModule]);

//     const formatTime = (s: number) => {
//         const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
//         return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
//     };

//     /* handlers ──────────────────────────────────────────────────────────── */
//     const handleStartAssessment = async () => {
//         if (!startDeclarationChecked) return;
//         if (needsRemediationGate && !coachingAckChecked) return;
//         setSaving(true);
//         try {
//             const t = new Date(getSecureNow()).toISOString();
//             const payload: any = { status: 'in_progress', startedAt: t };
//             if (needsRemediationGate) { payload['latestCoachingLog.acknowledged'] = true; payload['latestCoachingLog.acknowledgedAt'] = t; }
//             await updateDoc(doc(db, 'learner_submissions', submission.id), payload);
//             setSubmission((p: any) => ({ ...p, status: 'in_progress', startedAt: t, latestCoachingLog: p.latestCoachingLog ? { ...p.latestCoachingLog, acknowledged: true, acknowledgedAt: t } : p.latestCoachingLog }));
//             if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) setTimeLeft(assessment.moduleInfo.timeLimit * 60);
//         } catch { toast.error('Failed to start assessment.'); } finally { setSaving(false); }
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
//             triggerAutoSave(n);
//             return n;
//         });
//     };

//     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
//         if (!file) return;
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
//                     console.error(err);
//                     toast.warning('Cloud upload failed. Logging filename as fallback.');
//                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', file.name);
//                     else handleTaskAnswerChange(blockId, 'uploadUrl', file.name);
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
//         } catch { toast.error("Upload failed to initialize."); setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; }); setSaving(false); }
//     };

//     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
//         setSaving(true);
//         const t = new Date(getSecureNow()).toISOString();
//         try {
//             await updateDoc(doc(db, 'learner_submissions', subId), {
//                 answers: currentAnswers, status: 'submitted', submittedAt: t, autoSubmitted: true,
//                 learnerDeclaration: { agreed: true, timestamp: t, learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown', learnerIdNumber: learnerProfile?.idNumber || 'Unknown' },
//             });
//             toast.success("Time's up! Auto-submitted.");
//             setSubmission((p: any) => ({ ...p, status: 'submitted' }));
//             setTimeout(() => navigate(-1), 3000);
//         } catch (e) { console.error(e); } finally { setSaving(false); }
//     };

//     const handleNavigationLeave = () => {
//         if (Object.keys(uploadProgress).length > 0) { toast.warning("Files are uploading. Please wait."); return; }
//         if (!isLocked && !isPracticalModule && assessment.moduleInfo?.timeLimit > 0 && !showGate) setShowLeaveWarning(true);
//         else navigate(-1);
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
//                         if (!has) return { valid: false, message: `Please provide evidence for Supporting Requirement ${se.code} in Work Activity ${wa.code}.` };
//                     }
//                 }
//             }
//         }
//         return { valid: true };
//     };

//     const triggerSubmitConfirm = () => {
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
//         try {
//             await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                 answers, status: nextStatus, submittedAt: t,
//                 learnerDeclaration: { agreed: true, timestamp: t, learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown', learnerIdNumber: learnerProfile?.idNumber || 'Unknown' },
//             });
//             toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
//             setSubmission((p: any) => ({ ...p, status: nextStatus }));
//             setTimeout(() => window.scrollTo(0, 0), 1000);
//         } catch { toast.error('Failed to submit.'); } finally { setSaving(false); }
//     };

//     /* ══════════════════════════════════════════════════════════════════════
//        FULL-SCREEN STATES
//     ══════════════════════════════════════════════════════════════════════ */
//     if (loading) return (
//         <div className="ap-fullscreen">
//             <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
//                 <div className="ap-spinner" />
//                 <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Loading Assessment…</span>
//             </div>
//         </div>
//     );

//     if (isAdminIntercept) return (
//         <div className="ap-fullscreen">
//             <div className="ap-state-card">
//                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
//                     <ShieldAlert size={32} color="var(--mlab-blue)" />
//                 </div>
//                 <h1 className="ap-state-card__title">Staff Access Detected</h1>
//                 <p className="ap-state-card__desc">This area is restricted to learners only.<br />Use Preview mode to view assessments without affecting learner data.</p>
//                 <div className="ap-state-card__actions">
//                     <button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Go Back</button>
//                     <button className="ap-btn ap-btn--primary" onClick={() => navigate(`/admin/assessment/preview/${assessmentId}`)}>Open Preview Mode</button>
//                 </div>
//             </div>
//         </div>
//     );

//     if (!assessment || !submission) return (
//         <div className="ap-fullscreen">
//             <div className="ap-state-card">
//                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', opacity: 0.5 }}>
//                     <AlertCircle size={32} color="var(--mlab-grey)" />
//                 </div>
//                 <h2 className="ap-state-card__title">Assessment Unavailable</h2>
//                 <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Contact your facilitator if you believe this is an error.</p>
//                 <div className="ap-state-card__actions">
//                     <button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button>
//                 </div>
//             </div>
//         </div>
//     );

//     /* ══════════════════════════════════════════════════════════════════════
//        GATE SCREEN
//     ══════════════════════════════════════════════════════════════════════ */
//     if (showGate) return (
//         <div className="ap-gate ap-animate">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
//             <div className="ap-gate-topbar">
//                 <button className="ap-gate-topbar__back" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Back to Portfolio</button>
//                 <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
//             </div>

//             <div className="ap-gate-body">
//                 <div className="ap-gate-left">
//                     <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
//                     <h1 className="ap-gate-left__title">
//                         {assessment.title}
//                         {submission?.attemptNumber > 1 && (
//                             <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>
//                         )}
//                     </h1>
//                     <p className="ap-gate-left__sub">
//                         {isRemediation
//                             ? "This is a fresh attempt. Your previous answers have been retained. Use the Facilitator's Coaching Notes below to correct your answers and resubmit."
//                             : "Read all instructions carefully before starting."}
//                     </p>

//                     {assessment?.moduleType === 'workplace' && (
//                         <div className="ap-workplace-banner">
//                             <strong className="ap-workplace-banner__title"><Briefcase size={16} /> Workplace Experience Logbook</strong>
//                             <p className="ap-workplace-banner__text">
//                                 This module is a <strong>Learner Logbook</strong>. It tracks and verifies your real-world workplace experience. You will map tasks to specific Work Activities (WA), record your hours, and upload Supporting Evidence (SE) for review by your designated Workplace Mentor.
//                             </p>
//                         </div>
//                     )}

//                     {needsRemediationGate && (
//                         <div className="ap-coaching-log">
//                             <strong className="ap-coaching-log__title"><MessageSquare size={16} /> Remediation Coaching Log</strong>
//                             <p className="ap-coaching-log__desc">
//                                 Before beginning Attempt #{submission.attemptNumber}, QCTO compliance requires you to acknowledge the feedback session conducted by your facilitator.
//                             </p>
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
//                         <div className="ap-info-card"><div className="ap-info-card__label"><Clock size={12} /> Time Limit</div><div className="ap-info-card__value">{assessment.moduleInfo?.timeLimit ? `${assessment.moduleInfo.timeLimit} Min` : 'No Limit'}</div><div className="ap-info-card__sub">{assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}</div></div>
//                         {!isWorkplaceModule && <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Total Marks</div><div className="ap-info-card__value">{assessment.totalMarks}</div><div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div></div>}
//                         {isWorkplaceModule && <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Grading</div><div className="ap-info-card__value">C / NYC</div><div className="ap-info-card__sub">Competency-based. No numerical score.</div></div>}
//                     </div>

//                     <div className="ap-note-block">
//                         <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
//                         <p className="ap-note-block__text">{assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
//                         {assessment.purpose && (<><div className="ap-note-block__heading"><Info size={12} /> Purpose</div><p className="ap-note-block__text">{assessment.purpose}</p></>)}
//                     </div>
//                 </div>

//                 <div className="ap-gate-right">
//                     <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
//                     <ul className="ap-rules-list">
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or unauthorized AI tools violate QCTO guidelines.</p></div></li>
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly a group project, no collaboration is permitted.</p></div></li>
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
//                         {assessment.moduleInfo?.timeLimit > 0 && (
//                             <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser. Plan your time carefully.</p></div></li>
//                         )}
//                     </ul>
//                     <div className="ap-declaration">
//                         <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
//                             <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
//                             <span className="ap-declaration-check__text"><strong>Declaration of Authenticity</strong> I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.</span>
//                         </label>
//                         <button
//                             className={`ap-start-btn${(startDeclarationChecked && (!needsRemediationGate || coachingAckChecked)) ? ' ap-start-btn--ready' : ''}`}
//                             onClick={handleStartAssessment}
//                             disabled={saving || !startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)}
//                         >
//                             {saving ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> {needsRemediationGate ? `Acknowledge & Resume Attempt #${submission.attemptNumber}` : 'I Agree, Begin Assessment'}</>}
//                         </button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );

//     /* ══════════════════════════════════════════════════════════════════════
//        PLAYER SCREEN
//     ══════════════════════════════════════════════════════════════════════ */
//     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
//         if (block.type === 'section') acc.push({ type: 'section', label: block.title, id: block.id });
//         else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type))
//             acc.push({ type: 'q', label: block.question || block.title || 'Workplace Checkpoint', id: block.id });
//         return acc;
//     }, []) || [];

//     let displayStatus = submission.status.replace('_', ' ');
//     if (submission.status === 'returned') displayStatus = 'revision required';

//     const canEditTask = !isLocked || isAwaitingSignoff;
//     const canEditChecklist = isAwaitingSignoff;
//     const canEditLogbook = !isLocked || isAwaitingSignoff;
//     const canEditWorkplace = !isLocked || isAwaitingSignoff;

//     let qNum = 0;

//     return (
//         <div className="ap-player ap-animate">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {showLeaveWarning && (
//                 <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)} />
//             )}
//             {showSubmitConfirm && (
//                 <ConfirmModal
//                     title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"}
//                     message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."}
//                     confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"}
//                     cancelText="Go Back"
//                     onConfirm={executeSubmit}
//                     onCancel={() => setShowSubmitConfirm(false)}
//                 />
//             )}

//             {/* ── TOP BAR ── */}
//             <div className="ap-player-topbar no-print">
//                 <div className="ap-player-topbar__left">
//                     <button className="ap-player-topbar__back" onClick={handleNavigationLeave}><ArrowLeft size={13} /> Portfolio</button>
//                     <div className="ap-player-topbar__separator" />
//                     <h1 className="ap-player-topbar__title">
//                         {assessment.title}
//                         {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
//                     </h1>
//                 </div>
//                 <div className="ap-player-topbar__right">
//                     {isLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={13} /> Print Audit</button>}
//                     {!isLocked && !isPracticalModule && timeLeft !== null && (
//                         <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>
//                     )}
//                     {!isLocked && isPracticalModule && (
//                         <div className="ap-timer ap-timer--untimed">
//                             <Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Experience Logbook' : 'Untimed Practical Task'}
//                         </div>
//                     )}
//                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
//                         {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}
//                     </span>
//                     <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
//                 </div>
//             </div>

//             {/* ── BODY ── */}
//             <div className={`ap-player-body${isLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>

//                 {/* ── LEFT SIDEBAR ── */}
//                 <nav className="ap-sidebar no-print">
//                     <div className="ap-sidebar__meta-block">
//                         <div className="ap-sidebar__meta-title">{assessment.title}</div>
//                         {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail" style={{ color: '#d97706', fontWeight: 'bold' }}><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
//                         <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
//                         {!isWorkplaceModule
//                             ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div>
//                             : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
//                         {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
//                     </div>

//                     {/* Status tracking */}
//                     {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
//                         <>
//                             <div className="ap-sidebar__label">Status Tracking</div>
//                             <div className="ap-sidebar__status-box">
//                                 {isAssDone && outcome ? (
//                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
//                                         <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
//                                         {!isWorkplaceModule && outcome.score !== undefined && <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
//                                         {isWorkplaceModule && <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>Competency-Based Assessment</div>}
//                                         <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
//                                     </div>
//                                 ) : (
//                                     <div className="ap-sidebar__awaiting">
//                                         <Clock size={20} color="rgba(255,255,255,0.25)" />
//                                         <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
//                                         <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
//                                     </div>
//                                 )}

//                                 {isFacDone && submission.grading?.facilitatorOverallFeedback && (
//                                     <div className="ap-sidebar__feedback ap-sidebar__feedback--fac">
//                                         <strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong>
//                                         <p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p>
//                                     </div>
//                                 )}
//                                 {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
//                                     <div className="ap-sidebar__feedback ap-sidebar__feedback--ass">
//                                         <strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong>
//                                         <p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p>
//                                     </div>
//                                 )}
//                                 {isModDone && submission.moderation?.feedback && (
//                                     <div className="ap-sidebar__feedback ap-sidebar__feedback--mod">
//                                         <strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong>
//                                         <p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p>
//                                     </div>
//                                 )}

//                                 <div className="ap-sidebar__timeline-item">
//                                     <div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div>
//                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? (savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator') : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div>
//                                 </div>
//                                 <div className="ap-sidebar__timeline-item">
//                                     <div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div>
//                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div>
//                                 </div>
//                                 <div className="ap-sidebar__timeline-item">
//                                     <div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div>
//                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div>
//                                 </div>
//                             </div>
//                         </>
//                     )}

//                     <div className="ap-sidebar__label">Workbook Contents</div>
//                     <div className="ap-sidebar__nav">
//                         {navItems.map((item: any) =>
//                             item.type === 'section'
//                                 ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
//                                 : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item">{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
//                         )}
//                     </div>
//                 </nav>

//                 {/* ── CONTENT ── */}
//                 <div className="ap-player-content print-pane">
//                     {/* Print cover pages */}
//                     {isLocked && !isAwaitingSignoff && (
//                         <div className="print-only-cover">
//                             <div className="print-page">
//                                 <h1>{assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}</h1>
//                                 <h2>LEARNER {assessment?.moduleType === 'workplace' ? 'WORKPLACE LOGBOOK' : 'WORKBOOK'}{submission?.attemptNumber > 1 ? ` — ATTEMPT #${submission.attemptNumber}` : ''}</h2>
//                                 <table className="print-table" style={{ marginBottom: '30pt' }}>
//                                     <tbody>
//                                         <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Module #</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Notional hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Credit(s)</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
//                                     </tbody>
//                                 </table>
//                                 <h3>CONTACT INFORMATION:</h3>
//                                 <table className="print-table">
//                                     <tbody>
//                                         <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '________________________'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || user?.email || '________________________'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
//                                     </tbody>
//                                 </table>
//                                 {assessment?.moduleType === 'workplace' && workplaceInfo?.employer && (
//                                     <>
//                                         <h3 style={{ marginTop: '24pt' }}>WORKPLACE PLACEMENT DETAILS:</h3>
//                                         <table className="print-table">
//                                             <tbody>
//                                                 <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Host Company Name</td><td>{workplaceInfo.employer.name}</td></tr>
//                                                 <tr><td style={{ fontWeight: 'bold' }}>Registration / SETA Number</td><td>{workplaceInfo.employer.registrationNumber || 'N/A'}</td></tr>
//                                                 <tr><td style={{ fontWeight: 'bold' }}>Physical Address</td><td>{workplaceInfo.employer.physicalAddress || '________________________'}</td></tr>
//                                                 <tr><td style={{ fontWeight: 'bold' }}>Host Company Contact Person</td><td>{workplaceInfo.employer.contactPerson}</td></tr>
//                                                 <tr><td style={{ fontWeight: 'bold' }}>Assigned Workplace Mentor</td><td>{workplaceInfo.mentor?.fullName || '________________________'}</td></tr>
//                                                 <tr><td style={{ fontWeight: 'bold' }}>Mentor Contact</td><td>{workplaceInfo.mentor?.email || workplaceInfo.employer.contactEmail}</td></tr>
//                                             </tbody>
//                                         </table>
//                                     </>
//                                 )}
//                             </div>

//                             <div className="print-page">
//                                 <h3>Note to the learner</h3><p>{assessment?.instructions}</p>
//                                 <h3>Purpose</h3><p>{assessment?.purpose}</p>
//                                 <h3>Topic elements covered</h3>
//                                 <table className="print-table no-border">
//                                     <tbody>
//                                         {assessment?.moduleInfo?.topics?.length > 0
//                                             ? assessment.moduleInfo.topics.map((t: any, i: number) => <tr key={i}><td>{t.code && <strong>{t.code}: </strong>}{t.title || t.name}</td><td>{t.weight || t.percentage}%</td></tr>)
//                                             : assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, i: number) => {
//                                                 const tot = sectionTotals[sec.id]?.total || 0;
//                                                 return <tr key={i}><td><strong>Section {i + 1}: </strong>{sec.title}</td><td>{isWorkplaceModule ? 'Competency Based' : (tot > 0 && assessment.totalMarks ? `${Math.round((tot / assessment.totalMarks) * 100)}%` : '—')}</td></tr>;
//                                             })}
//                                     </tbody>
//                                 </table>
//                             </div>

//                             {/* Remediation record page */}
//                             {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
//                                 <div className="print-page">
//                                     <h3>Record of Developmental Intervention (Remediation)</h3>
//                                     <p>Official evidence of a developmental intervention conducted prior to Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>
//                                     <table className="print-table" style={{ marginBottom: '24pt' }}>
//                                         <tbody>
//                                             <tr><td style={{ width: '30%', fontWeight: 'bold' }}>Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
//                                             <tr><td style={{ fontWeight: 'bold' }}>Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString()}</td></tr>
//                                             <tr><td style={{ fontWeight: 'bold' }}>Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
//                                             <tr><td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>Coaching Notes</td><td style={{ wordBreak: 'break-word' }}>{submission.latestCoachingLog.notes}</td></tr>
//                                         </tbody>
//                                     </table>
//                                     <div className="sr-signature-block">
//                                         <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue', flex: '0 1 300px' }}>
//                                             <span>Facilitator Declaration</span>
//                                             {facilitatorProfile?.signatureUrl ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" /> : <div className="sr-sig-no-image">No Canvas Signature</div>}
//                                             <strong>{submission.latestCoachingLog.facilitatorName}</strong>
//                                             <em>Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</em>
//                                             <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>Coaching Conducted</div>
//                                         </div>
//                                         <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
//                                             <span>Learner Acknowledgement</span>
//                                             {submission.latestCoachingLog.acknowledged
//                                                 ? <>{learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div className="sr-sig-no-image">No Canvas Signature</div>}<strong>{learnerProfile?.fullName || user?.fullName}</strong><em>Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString()}</em><div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Intervention Received</div></>
//                                                 : <div className="sr-sig-no-image">Pending Signature</div>
//                                             }
//                                         </div>
//                                     </div>
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {/* Print audit header */}
//                     {isLocked && !isAwaitingSignoff && (
//                         <div className="ap-print-header">
//                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
//                                 <div>
//                                     <p style={{ margin: '0 0 4px' }}><strong>Learner:</strong> {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName}</p>
//                                     <p style={{ margin: 0 }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber}</p>
//                                 </div>
//                                 <div style={{ textAlign: 'right' }}>
//                                     <p style={{ margin: '0 0 4px' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
//                                     <p style={{ margin: '0 0 4px' }}><strong>Submitted:</strong> {getSafeDate(submission.submittedAt)}</p>
//                                     {isAssDone && <p style={{ margin: 0 }}><strong>Outcome:</strong> {outcome?.label} ({outcome?.percentage}%)</p>}
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* ── BLOCKS ── */}
//                     <div className="ap-blocks">
//                         {assessment.blocks?.map((block: any) => {

//                             /* Section header */
//                             if (block.type === 'section') {
//                                 const totals = sectionTotals[block.id];
//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
//                                         <span>{block.title}</span>
//                                         {isAssDone && totals && totals.total > 0 && (
//                                             <span className="no-print" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em' }}>
//                                                 <BarChart size={13} /> {totals.awarded}/{totals.total}
//                                             </span>
//                                         )}
//                                         {block.content && <div className="quill-read-only-content" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginTop: '8px', fontFamily: 'var(--font-body)' }} dangerouslySetInnerHTML={{ __html: block.content }} />}
//                                     </div>
//                                 );
//                             }

//                             /* Info block */
//                             if (block.type === 'info') return (
//                                 <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
//                                     <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
//                                     <p className="ap-block-info__text">{block.content}</p>
//                                 </div>
//                             );

//                             /* Question blocks */
//                             if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
//                                 qNum++;
//                                 const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
//                                 const learnerAns = answers[block.id] || {};

//                                 /* Ink-colour for marks label */
//                                 let inkColor = '#64748b';
//                                 if (isModDone) inkColor = 'var(--mlab-green)';
//                                 else if (isAssDone) inkColor = 'var(--mlab-red)';
//                                 else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

//                                 const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
//                                 const markLabel = isWEBlock
//                                     ? 'Competency Based'
//                                     : (isFacDone && blockScore !== undefined && blockScore !== null
//                                         ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

//                                 /* Block type chip */
//                                 const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk'
//                                     : block.type === 'logbook' ? 'ap-block-type-chip--log'
//                                         : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto'
//                                             : block.type === 'task' ? 'ap-block-type-chip--task'
//                                                 : 'ap-block-type-chip--q';
//                                 const typeLabel = block.type === 'checklist' ? 'CHK'
//                                     : block.type === 'logbook' ? 'LOG'
//                                         : block.type === 'qcto_workplace' ? 'QCTO'
//                                             : `Q${qNum}.`;

//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>

//                                         {/* Header */}
//                                         <div className="ap-block-question__header">
//                                             <div className="ap-block-question__text-wrap">
//                                                 <span className="ap-block-question__text">
//                                                     <span className={`ap-block-type-chip ${typeChipClass}`}>{typeLabel}</span>
//                                                     {block.question || block.title || (block.type === 'qcto_workplace' ? 'Workplace Checkpoint' : '')}
//                                                 </span>
//                                                 {/* Grade indicators */}
//                                                 <div className="ap-grade-indicators">
//                                                     {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && (
//                                                         <div className="ap-grade-indicator ap-grade-indicator--fac" title="Facilitator Pre-Mark">
//                                                             {facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}
//                                                         </div>
//                                                     )}
//                                                     {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && (
//                                                         <div className="ap-grade-indicator ap-grade-indicator--ass" title="Assessor Grade">
//                                                             {assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}
//                                                         </div>
//                                                     )}
//                                                     {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && (
//                                                         <div className="ap-grade-indicator ap-grade-indicator--mod" title="Moderator QA">
//                                                             {modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             </div>
//                                             <span className="ap-block-question__marks" style={{ color: inkColor, fontWeight: 700 }}>{markLabel}</span>
//                                         </div>

//                                         {/* Body */}
//                                         <div className="ap-block-question__body">

//                                             {/* MCQ */}
//                                             {block.type === 'mcq' && (
//                                                 <div className="ap-mcq-options">
//                                                     {block.options?.map((opt: string, i: number) => {
//                                                         const selected = learnerAns === i;
//                                                         return (
//                                                             <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
//                                                                 <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={!canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
//                                                                 <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
//                                                                 <span className="ap-mcq-label__text">{opt}</span>
//                                                             </label>
//                                                         );
//                                                     })}
//                                                 </div>
//                                             )}

//                                             {/* TEXT */}
//                                             {block.type === 'text' && (
//                                                 <div className={`ap-quill-wrapper${!canEditTask ? ' locked' : ''}`}>
//                                                     <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder={!canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
//                                                 </div>
//                                             )}

//                                             {/* TASK (multi-modal) */}
//                                             {block.type === 'task' && (() => {
//                                                 const taskTabs = [
//                                                     { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text },
//                                                     { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl },
//                                                     { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url },
//                                                     { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl },
//                                                     { id: 'code', icon: <Code size={13} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code },
//                                                 ].filter(t => t.allowed);
//                                                 const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
//                                                 const progress = uploadProgress[block.id];

//                                                 return (
//                                                     <div className="ap-evidence-container">
//                                                         {isPracticalModule && !isAwaitingSignoff && !isSubmitted && (
//                                                             <div className="ap-evidence-lock-banner"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>
//                                                         )}
//                                                         <div className="ap-tab-bar no-print">
//                                                             {taskTabs.map(t => (
//                                                                 <button key={t.id} className={`ap-tab${activeTabId === t.id ? ' ap-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}>
//                                                                     {t.icon} {t.label} {!!t.val && <CheckCircle size={11} className="ap-tab__done" />}
//                                                                 </button>
//                                                             ))}
//                                                         </div>
//                                                         <div className="ap-tab-panel">
//                                                             {activeTabId === 'text' && <div className={`ap-quill-wrapper${!canEditTask ? ' locked' : ''}`}><ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" /></div>}
//                                                             {activeTabId === 'audio' && (learnerAns?.audioUrl ? <audio controls src={learnerAns.audioUrl} style={{ width: '100%' }} /> : <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed var(--mlab-border)', color: 'var(--mlab-grey)', fontSize: '0.85rem' }}>{!canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
//                                                             {activeTabId === 'url' && (
//                                                                 <div>
//                                                                     {canEditTask && <div className="ap-url-note"><strong>Note:</strong> If pasting a Google Drive link, ensure it is set to <em>"Anyone with the link can view"</em>.</div>}
//                                                                     {learnerAns?.url && !canEditTask ? <UrlPreview url={learnerAns.url} /> : <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={!canEditTask} placeholder="https://…" />}
//                                                                 </div>
//                                                             )}
//                                                             {activeTabId === 'upload' && (
//                                                                 progress !== undefined ? <UploadProgress progress={progress} />
//                                                                     : learnerAns?.uploadUrl ? <FilePreview url={learnerAns.uploadUrl} onRemove={canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={!canEditTask} />
//                                                                         : <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed var(--mlab-border)' }}>
//                                                                             {!canEditTask ? <span style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem' }}>No file uploaded.</span> : (<><p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Select a file (Allowed: {block.allowedFileTypes})</p><input type="file" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id)} style={{ fontSize: '0.82rem' }} /></>)}
//                                                                         </div>
//                                                             )}
//                                                             {activeTabId === 'code' && <textarea className="ap-code-textarea" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={!canEditTask} placeholder="Paste your code here…" />}
//                                                         </div>
//                                                     </div>
//                                                 );
//                                             })()}

//                                             {/* CHECKLIST */}
//                                             {block.type === 'checklist' && (
//                                                 <div className="ap-checklist">
//                                                     <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item. Upload evidence for each if required below.</p>
//                                                     {!isAwaitingSignoff && !isSubmitted && (
//                                                         <div className="ap-checklist__lock-notice"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>
//                                                     )}
//                                                     {block.criteria?.map((crit: string, i: number) => {
//                                                         const res = criteriaResults?.[i] || {};
//                                                         const critKey = `evidence_${i}`;
//                                                         const raw = learnerAns?.[critKey];
//                                                         const critEv = typeof raw === 'string' ? { text: raw } : (raw || {});
//                                                         const cTabKey = `${block.id}_${i}`;
//                                                         const allTabs = [
//                                                             { id: 'upload', icon: <UploadCloud size={12} />, label: 'File', val: critEv?.uploadUrl },
//                                                             { id: 'url', icon: <LinkIcon size={12} />, label: 'Link', val: critEv?.url },
//                                                             { id: 'code', icon: <Code size={12} />, label: 'Code', val: critEv?.code },
//                                                             { id: 'text', icon: <FileText size={12} />, label: 'Notes', val: critEv?.text },
//                                                         ];
//                                                         const tabs = !canEditChecklist ? allTabs.filter(t => t.val) : allTabs;
//                                                         const activeCtab = activeTabs[cTabKey] || tabs[0]?.id || 'upload';
//                                                         const progress = uploadProgress[`${block.id}_${critKey}`];

//                                                         return (
//                                                             <div key={i} className="ap-checklist__item">
//                                                                 <p className="ap-checklist__item-title">{i + 1}. {crit}</p>
//                                                                 <div className="ap-checklist__assessor-row">
//                                                                     {isFacDone ? (
//                                                                         <>
//                                                                             <span className={`ap-checklist__status-chip${res.status === 'C' ? ' ap-checklist__status-chip--c' : res.status === 'NYC' ? ' ap-checklist__status-chip--nyc' : ' ap-checklist__status-chip--pending'}`}>
//                                                                                 {res.status
//                                                                                     ? (savedFacRole === 'mentor'
//                                                                                         ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗')
//                                                                                         : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)'))
//                                                                                     : 'Not Graded'}
//                                                                             </span>
//                                                                             {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
//                                                                         </>
//                                                                     ) : (
//                                                                         <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>
//                                                                     )}
//                                                                 </div>
//                                                                 {block.requireEvidencePerCriterion !== false && (
//                                                                     <div className="ap-checklist__evidence-tabs">
//                                                                         <div className="ap-checklist__tab-bar">
//                                                                             {tabs.length > 0 ? tabs.map(t => (
//                                                                                 <button key={t.id} className={`ap-checklist__tab${activeCtab === t.id ? ' ap-checklist__tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [cTabKey]: t.id })}>
//                                                                                     {t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}
//                                                                                 </button>
//                                                                             )) : (
//                                                                                 <div className="ap-checklist__no-evidence">No evidence provided.</div>
//                                                                             )}
//                                                                         </div>
//                                                                         {tabs.length > 0 && (
//                                                                             <div className="ap-checklist__tab-panel">
//                                                                                 {activeCtab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : critEv.uploadUrl ? <FilePreview url={critEv.uploadUrl} onRemove={canEditChecklist ? () => handleNestedAnswerChange(block.id, critKey, 'uploadUrl', '') : undefined} disabled={!canEditChecklist} /> : <input type="file" disabled={!canEditChecklist} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, critKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
//                                                                                 {activeCtab === 'url' && (<div>{canEditChecklist && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{critEv.url && !canEditChecklist ? <UrlPreview url={critEv.url} /> : <input type="url" className="ab-input" value={critEv.url || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'url', e.target.value)} disabled={!canEditChecklist} placeholder="https://…" />}</div>)}
//                                                                                 {activeCtab === 'code' && <textarea className="ap-code-textarea" rows={3} value={critEv.code || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'code', e.target.value)} disabled={!canEditChecklist} placeholder="Paste code snippet…" />}
//                                                                                 {activeCtab === 'text' && <div className={`ap-quill-wrapper${!canEditChecklist ? ' locked' : ''}`}><ReactQuill theme="snow" value={critEv.text || ''} onChange={c => handleNestedAnswerChange(block.id, critKey, 'text', c)} readOnly={!canEditChecklist} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" /></div>}
//                                                                             </div>
//                                                                         )}
//                                                                     </div>
//                                                                 )}
//                                                             </div>
//                                                         );
//                                                     })}
//                                                 </div>
//                                             )}

//                                             {/* LOGBOOK */}
//                                             {block.type === 'logbook' && (
//                                                 <div className="ap-logbook">
//                                                     <p className="ap-logbook__desc">{block.content}</p>
//                                                     <table className="ap-logbook__table">
//                                                         <thead className="ap-logbook__thead">
//                                                             <tr>
//                                                                 <th>Date</th>
//                                                                 <th>Assignment Task</th>
//                                                                 <th>Start</th>
//                                                                 <th>Finish</th>
//                                                                 <th style={{ width: '80px' }}>Hours</th>
//                                                                 {canEditLogbook && <th style={{ width: '40px' }}></th>}
//                                                             </tr>
//                                                         </thead>
//                                                         <tbody>
//                                                             {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
//                                                                 <tr key={i} className="ap-logbook__tbody">
//                                                                     <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                     <td className="ap-logbook__td"><input type="text" className="ap-logbook__input" value={entry.task} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].task = e.target.value; handleAnswerChange(block.id, n); }} placeholder="Task description" /></td>
//                                                                     <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                     <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                     <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
//                                                                     {canEditLogbook && <td className="ap-logbook__td"><button className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
//                                                                 </tr>
//                                                             ))}
//                                                             {canEditLogbook && (
//                                                                 <tr><td colSpan={6} className="ap-logbook__add-row"><button className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>
//                                                             )}
//                                                             <tr className="ap-logbook__totals-row">
//                                                                 <td colSpan={4} className="ap-logbook__totals-label">Total Logged Hours:</td>
//                                                                 <td className="ap-logbook__totals-val" style={(() => { const logged = (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0); return block.requiredHours && logged < block.requiredHours ? { color: '#dc2626', fontWeight: 'bold' } : {}; })()}>
//                                                                     {(Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0)}
//                                                                     {block.requiredHours && (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0) < block.requiredHours && (
//                                                                         <span style={{ display: 'block', fontSize: '0.72rem', color: '#dc2626', fontWeight: 'normal', marginTop: '2px' }}>
//                                                                             ⚠ Required: {block.requiredHours} hrs
//                                                                         </span>
//                                                                     )}
//                                                                 </td>
//                                                                 {canEditLogbook && <td></td>}
//                                                             </tr>
//                                                         </tbody>
//                                                     </table>
//                                                 </div>
//                                             )}

//                                             {/* QCTO WORKPLACE */}
//                                             {block.type === 'qcto_workplace' && (
//                                                 <div className="ap-workplace">
//                                                     {block.weCode && (
//                                                         <>
//                                                             <span className="ap-workplace__we-label">Work Experience Module (WE Code):</span>
//                                                             <span className="ap-workplace__we-code">{block.weCode} — {block.weTitle}</span>
//                                                         </>
//                                                     )}
//                                                     {block.workActivities?.map((wa: any) => {
//                                                         const waTask = learnerAns?.[`wa_${wa.id}_task`] || '';
//                                                         const waDate = learnerAns?.[`wa_${wa.id}_date`] || new Date().toISOString().split('T')[0];
//                                                         const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;

//                                                         return (
//                                                             <div key={wa.id} className="ap-workplace__activity">
//                                                                 <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>
//                                                                 <div className="ap-workplace__fields">
//                                                                     <div className="ap-workplace__field">
//                                                                         <label className="ap-workplace__field-label">Task Performed</label>
//                                                                         <input type="text" className="ap-workplace__input" value={waTask} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_task`, e.target.value)} disabled={!canEditWorkplace} placeholder="What did you do?" />
//                                                                     </div>
//                                                                     <div className="ap-workplace__field ap-workplace__field--date">
//                                                                         <label className="ap-workplace__field-label">Date</label>
//                                                                         <input type="date" className="ap-workplace__input" value={waDate} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_date`, e.target.value)} disabled={!canEditWorkplace} />
//                                                                     </div>
//                                                                 </div>

//                                                                 {(wa.evidenceItems || []).length > 0 && (
//                                                                     <div className="ap-workplace__se-block">
//                                                                         <span className="ap-workplace__se-title">Supporting Evidence Required:</span>
//                                                                         {wa.evidenceItems.map((se: any) => {
//                                                                             const seKey = `se_${se.id}`;
//                                                                             const seData = learnerAns?.[seKey] || {};
//                                                                             const seTabs = [
//                                                                                 { id: 'upload', icon: <UploadCloud size={13} />, label: 'Document', val: seData.uploadUrl },
//                                                                                 { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', val: seData.url },
//                                                                                 { id: 'text', icon: <FileText size={13} />, label: 'Reflection', val: seData.text },
//                                                                             ];
//                                                                             const activeSeTab = activeTabs[`${block.id}_${se.id}`] || seTabs[0].id;
//                                                                             const progress = uploadProgress[`${block.id}_${seKey}`];

//                                                                             return (
//                                                                                 <div key={se.id} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px dashed var(--mlab-border)' }}>
//                                                                                     <strong style={{ display: 'block', fontSize: '0.82rem', color: 'var(--mlab-blue)', marginBottom: '8px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{se.code}: {se.description}</strong>
//                                                                                     <div className="ap-workplace__se-tabs">
//                                                                                         <div className="ap-workplace__se-tab-bar no-print">
//                                                                                             {seTabs.map(t => (
//                                                                                                 <button key={t.id} className={`ap-workplace__se-tab${activeSeTab === t.id ? ' ap-workplace__se-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [`${block.id}_${se.id}`]: t.id })}>
//                                                                                                     {t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}
//                                                                                                 </button>
//                                                                                             ))}
//                                                                                         </div>
//                                                                                         <div className="ap-workplace__se-tab-panel">
//                                                                                             {activeSeTab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : seData.uploadUrl ? <FilePreview url={seData.uploadUrl} onRemove={canEditWorkplace ? () => handleNestedAnswerChange(block.id, seKey, 'uploadUrl', '') : undefined} disabled={!canEditWorkplace} /> : <input type="file" disabled={!canEditWorkplace} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, seKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
//                                                                                             {activeSeTab === 'url' && (<div>{canEditWorkplace && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{seData.url && !canEditWorkplace ? <UrlPreview url={seData.url} /> : <input type="url" className="ab-input" value={seData.url || ''} onChange={e => handleNestedAnswerChange(block.id, seKey, 'url', e.target.value)} disabled={!canEditWorkplace} placeholder="https://…" />}</div>)}
//                                                                                             {activeSeTab === 'text' && <div className={`ap-quill-wrapper${!canEditWorkplace ? ' locked' : ''}`}><ReactQuill theme="snow" value={seData.text || ''} onChange={c => handleNestedAnswerChange(block.id, seKey, 'text', c)} readOnly={!canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" /></div>}
//                                                                                         </div>
//                                                                                     </div>
//                                                                                 </div>
//                                                                             );
//                                                                         })}
//                                                                     </div>
//                                                                 )}

//                                                                 <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
//                                                                     <input type="checkbox" disabled={!canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
//                                                                     <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
//                                                                 </label>
//                                                             </div>
//                                                         );
//                                                     })}

//                                                     {/* Global toggles */}
//                                                     <div className="ap-workplace__toggles">
//                                                         {block.requireSelfAssessment !== false && (
//                                                             <label className={`ap-workplace__toggle${learnerAns?.selfAssessmentDone ? ' ap-workplace__toggle--checked' : ''}`}>
//                                                                 <input type="checkbox" disabled={!canEditWorkplace} checked={learnerAns?.selfAssessmentDone || false} onChange={e => handleTaskAnswerChange(block.id, 'selfAssessmentDone', e.target.checked)} />
//                                                                 <span className="ap-workplace__toggle-label">I have completed the self-assessment for these tasks.</span>
//                                                             </label>
//                                                         )}
//                                                         {block.requireGoalPlanning !== false && (
//                                                             <label className={`ap-workplace__toggle${learnerAns?.goalPlanningDone ? ' ap-workplace__toggle--checked' : ''}`}>
//                                                                 <input type="checkbox" disabled={!canEditWorkplace} checked={learnerAns?.goalPlanningDone || false} onChange={e => handleTaskAnswerChange(block.id, 'goalPlanningDone', e.target.checked)} />
//                                                                 <span className="ap-workplace__toggle-label">I have updated my goal planning document.</span>
//                                                             </label>
//                                                         )}
//                                                     </div>
//                                                 </div>
//                                             )}
//                                         </div>

//                                         {/* Per-question feedback panels */}
//                                         {isFacDone && facFeedback && (
//                                             <div className="ap-qfeedback ap-qfeedback--fac">
//                                                 <span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span>
//                                                 <p className="ap-qfeedback__text">{facFeedback}</p>
//                                             </div>
//                                         )}
//                                         {isAssDone && assFeedback && (
//                                             <div className="ap-qfeedback ap-qfeedback--ass">
//                                                 <span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span>
//                                                 <p className="ap-qfeedback__text">{assFeedback}</p>
//                                             </div>
//                                         )}
//                                         {isModDone && modFeedback && (
//                                             <div className="ap-qfeedback ap-qfeedback--mod">
//                                                 <span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span>
//                                                 <p className="ap-qfeedback__text">{modFeedback}</p>
//                                             </div>
//                                         )}
//                                     </div>
//                                 );
//                             }
//                             return null;
//                         })}
//                     </div>

//                     {/* ── FOOTER ── */}
//                     {isAwaitingSignoff ? (
//                         <div className="ap-footer ap-footer--signoff">
//                             <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
//                             <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
//                             <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
//                                 <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
//                                 <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
//                             </label>
//                             <div className="ap-footer-actions">
//                                 <span className="ap-autosave-label">
//                                     {saving && <><div className="ap-spinner ap-spinner--sm" /> Saving…</>}
//                                     {Object.keys(uploadProgress).length > 0 && <span style={{ color: '#d97706', fontWeight: 700 }}>Uploads in progress…</span>}
//                                 </span>
//                                 <button className="ap-btn ap-footer--signoff .ap-btn--signoff" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0} style={{ background: '#d97706', color: 'white', border: '2px solid #b45309' }}>
//                                     <Save size={14} /> Acknowledge & Submit for Grading
//                                 </button>
//                             </div>
//                         </div>
//                     ) : !isLocked ? (
//                         <div className="ap-footer">
//                             <h3 className="ap-footer__title">Final Submission</h3>
//                             <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
//                             <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
//                                 <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
//                                 <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
//                             </label>
//                             <div className="ap-footer-actions">
//                                 <span className="ap-autosave-label">
//                                     {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}
//                                     {Object.keys(uploadProgress).length > 0 && <span style={{ color: 'var(--mlab-blue)', fontWeight: 700, marginLeft: '10px' }}>Uploads in progress…</span>}
//                                 </span>
//                                 <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}>
//                                     <Save size={14} /> Submit for Grading
//                                 </button>
//                             </div>
//                         </div>
//                     ) : (
//                         <div className="ap-footer ap-footer--locked no-print">
//                             <div className="ap-footer--locked__icon-wrap">
//                                 {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
//                             </div>
//                             {isModDone && outcome?.isCompetent === false ? (
//                                 <>
//                                     <h3 className="ap-footer--locked__title" style={{ color: '#d97706' }}>Assessment Outcome: Not Yet Competent (NYC)</h3>
//                                     <div className="ap-remediation-box">
//                                         <p>Your assessment has been fully verified. At this stage, you have not yet met all the requirements for competency.</p>
//                                         {(submission.attemptNumber || 1) >= 3 ? (
//                                             <div className="ap-remediation-box__lockout">
//                                                 <h4 className="ap-remediation-box__lockout-title"><ShieldAlert size={15} /> Maximum Attempts Reached</h4>
//                                                 <p>You have exhausted all 3 permitted attempts. Under QCTO regulations, this workbook is permanently locked. You must re-enrol in the module or lodge a formal appeal.</p>
//                                             </div>
//                                         ) : (
//                                             <>
//                                                 <h4 className="ap-remediation-box__steps-title">What happens next?</h4>
//                                                 <ol className="ap-remediation-box__steps">
//                                                     <li><strong>Review Feedback:</strong> Scroll up and review the Assessor's feedback on your incorrect answers.</li>
//                                                     <li><strong>Coaching:</strong> Your facilitator will schedule a brief intervention to discuss the feedback.</li>
//                                                     <li><strong>Remediation:</strong> Your facilitator will unlock this workbook for Attempt {submission.attemptNumber ? submission.attemptNumber + 1 : 2} of 3.</li>
//                                                 </ol>
//                                                 <p className="ap-remediation-box__appeal">Academic Rights: If you disagree with this outcome, you have the right to lodge a formal appeal with your training provider.</p>
//                                             </>
//                                         )}
//                                     </div>
//                                 </>
//                             ) : (
//                                 <>
//                                     <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
//                                     <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. {isAssDone ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}</p>
//                                 </>
//                             )}
//                             <button className="ap-btn ap-btn--primary" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button>
//                         </div>
//                     )}

//                     {/* ── RIGHT AUDIT SIDEBAR ── */}
//                     {isLocked && !isAwaitingSignoff && (
//                         <aside className="ap-right-sidebar no-print">
//                             <h3 className="ap-right-sidebar__title"><ShieldCheck size={15} color="var(--mlab-blue)" /> Official Audit Trail</h3>

//                             <div className="ap-audit-card">
//                                 <span className="ap-audit-card__label">Learner Declaration</span>
//                                 <div className="ap-audit-card__sig-wrap">
//                                     {learnerProfile?.signatureUrl ? <img src={learnerProfile.signatureUrl} alt="Learner signature" /> : <span className="ap-audit-card__sig-placeholder">No signature on file</span>}
//                                 </div>
//                                 <span className="ap-audit-card__name">{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}</span>
//                                 <span className="ap-audit-card__sub"><Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}</span>
//                             </div>

//                             {outcome ? (
//                                 <div className="ap-audit-outcome" style={{ borderLeftColor: outcome.color }}>
//                                     <div className="ap-audit-outcome__label" style={{ color: outcome.color }}>{outcome.label}</div>
//                                     {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Score: {outcome.score} / {assessment.totalMarks} ({outcome.percentage}%)</div>}
//                                     {isWorkplaceModule && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Grading: Competency-Based (No Numerical Score)</div>}
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
//                                     <span className="ap-audit-card__sub" style={{ color: '#3b82f6' }}><Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
//                                 </div>
//                             )}
//                             {isAssDone && (
//                                 <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-red)' }}>
//                                     <span className="ap-audit-card__label" style={{ color: 'var(--mlab-red)' }}>{isWorkplaceModule ? 'Assessor Evaluation' : 'Assessor Verification'}</span>
//                                     <div className="ap-audit-card__sig-wrap">{assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-red)' }}>No signature on file</span>}</div>
//                                     <span className="ap-audit-card__name" style={{ color: 'var(--mlab-red)' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</span>
//                                     <span className="ap-audit-card__reg" style={{ color: 'var(--mlab-red)' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</span>
//                                     <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-red)' }}><Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
//                                 </div>
//                             )}
//                             {isModDone && (
//                                 <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-green)' }}>
//                                     <span className="ap-audit-card__label" style={{ color: 'var(--mlab-green)' }}>Internal Moderation QA</span>
//                                     <div className="ap-audit-card__sig-wrap">{moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" /> : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-green)' }}>No canvas signature on file</span>}</div>
//                                     <span className="ap-audit-card__name" style={{ color: 'var(--mlab-green)' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</span>
//                                     <span className="ap-audit-card__reg" style={{ color: submission.moderation?.outcome === 'Returned' ? 'var(--mlab-red)' : 'var(--mlab-green)' }}>Outcome: {submission.moderation?.outcome === 'Endorsed' ? 'Endorsed ✓' : submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor ✗' : submission.moderation?.outcome}</span>
//                                     <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-green)' }}><Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
//                                 </div>
//                             )}
//                         </aside>
//                     )}
//                 </div>
//             </div>
//         </div>
//     );
// };

// /* ══════════════════════════════════════════════════════════════════════════
//    CONFIRM MODAL (portal)
// ══════════════════════════════════════════════════════════════════════════ */
// const ConfirmModal: React.FC<{
//     title: string; message: string; confirmText: string; cancelText: string;
//     onConfirm: () => void; onCancel: () => void;
// }> = ({ title, message, confirmText, cancelText, onConfirm, onCancel }) => {
//     useEffect(() => {
//         const s = document.createElement('style');
//         s.innerHTML = `body, html { overflow: hidden !important; }`;
//         document.head.appendChild(s);
//         return () => { document.head.removeChild(s); };
//     }, []);

//     return createPortal(
//         <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.72)', backdropFilter: 'blur(3px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
//             <div className="ap-animate" style={{ background: 'var(--mlab-white)', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 24px 48px -8px rgba(5,46,58,0.35)', border: '1px solid var(--mlab-border)', borderTop: '5px solid var(--mlab-blue)', overflow: 'hidden' }}>
//                 <div style={{ padding: '2rem 2rem 1.5rem', borderBottom: '1px solid var(--mlab-border)' }}>
//                     <div style={{ width: 56, height: 56, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}><AlertTriangle size={28} color="#d97706" /></div>
//                     <h2 style={{ margin: '0 0 0.5rem', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>{title}</h2>
//                     <p style={{ margin: 0, color: 'var(--mlab-grey)', fontSize: '0.9rem', lineHeight: 1.65 }}>{message}</p>
//                 </div>
//                 <div style={{ display: 'flex' }}>
//                     <button onClick={onCancel} style={{ flex: 1, padding: '1rem', border: 'none', borderRight: '1px solid var(--mlab-border)', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{cancelText}</button>
//                     <button onClick={onConfirm} style={{ flex: 1, padding: '1rem', border: 'none', background: 'var(--mlab-blue)', color: 'white', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{confirmText}</button>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };

// export default AssessmentPlayer;



// // import React, { useState, useEffect, useRef, useMemo } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
// // import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import {
// //     ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
// //     AlertCircle, Play, Clock, GraduationCap,
// //     BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
// //     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
// //     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
// //     Briefcase
// // } from 'lucide-react';
// // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';

// // import ReactQuill from 'react-quill-new';
// // import 'react-quill-new/dist/quill.snow.css';

// // import { createPortal } from 'react-dom';
// // import './AssessmentPlayer.css';
// // import moment from 'moment';

// // export const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
// //     const filterMap: any = {
// //         black: 'brightness(0)',
// //         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
// //         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
// //         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
// //     };
// //     return <img src={imageUrl} alt="Signature" style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain', filter: filterMap[color] || 'none' }} />;
// // };

// // const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['clean']] };
// // const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// // interface CriterionResult { status: 'C' | 'NYC' | null; comment: string; startTime: string; endTime: string; }

// // export type StatusType = 'info' | 'success' | 'error' | 'warning';

// // // ─── 🚀 ROBUST FILE PREVIEW COMPONENT 🚀 ───
// // const FilePreview = ({ url, onRemove, disabled }: { url: string, onRemove?: () => void, disabled?: boolean }) => {
// //     const isLinkValid = (urlStr?: string) => urlStr && (urlStr.startsWith('http://') || urlStr.startsWith('https://') || urlStr.startsWith('data:'));

// //     if (!isLinkValid(url)) {
// //         return (
// //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
// //                 <span style={{ color: '#475569', fontSize: '0.8rem', fontWeight: 'bold' }}>Local fallback attachment: {url}</span>
// //                 {!disabled && onRemove && <button type="button" className="ab-btn-icon-danger" onClick={onRemove}><Trash2 size={14} /></button>}
// //             </div>
// //         );
// //     }

// //     const getExtension = (urlStr: string) => {
// //         try {
// //             const urlWithoutQuery = urlStr.split('?')[0];
// //             const parts = urlWithoutQuery.split('.');
// //             return parts[parts.length - 1].toLowerCase();
// //         } catch { return ''; }
// //     };

// //     const ext = getExtension(url);
// //     const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
// //     const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
// //     const isPdf = ext === 'pdf';
// //     const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);

// //     const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

// //     return (
// //         <div className="ap-file-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
// //             <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
// //                 <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                     <FileText size={14} /> Evidence Preview
// //                 </span>
// //                 <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
// //                     <a href={url} target="_blank" rel="noreferrer" className="no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textDecoration: 'underline' }}>
// //                         {isOffice ? 'Download / View Native' : 'Open Fullscreen'}
// //                     </a>
// //                     {!disabled && onRemove && (
// //                         <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, display: 'flex' }} title="Remove Evidence"><Trash2 size={15} /></button>
// //                     )}
// //                 </div>
// //             </div>
// //             <div className="no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: isImage || isVideo ? '10px' : '0', minHeight: '100px' }}>
// //                 {isImage && <img src={url} alt="Preview" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '4px' }} />}
// //                 {isVideo && <video src={url} controls style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px' }} />}
// //                 {isPdf && <iframe src={url} style={{ width: '100%', height: '400px', border: 'none' }} title="PDF Preview" />}

// //                 {isOffice && (
// //                     <div style={{ width: '100%' }}>
// //                         <div style={{ padding: '8px', background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#b45309', fontSize: '0.75rem', textAlign: 'center' }}>
// //                             <strong>Note:</strong> If the document appears blank below, please use the <strong>Open Fullscreen / Download</strong> link above.
// //                         </div>
// //                         <iframe src={googleDocsViewerUrl} style={{ width: '100%', height: '450px', border: 'none' }} title="Office Document Preview" />
// //                     </div>
// //                 )}

// //                 {!isImage && !isVideo && !isPdf && !isOffice && (
// //                     <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
// //                         <FileText size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
// //                         <p style={{ margin: 0, fontSize: '0.8rem' }}>Rich preview not available for this file type.<br />Please use the link above to download it.</p>
// //                     </div>
// //                 )}
// //             </div>
// //             <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
// //                 [Digital Evidence Attached: {url.split('?')[0].split('/').pop()}]
// //             </div>
// //         </div>
// //     );
// // };

// // // ─── 🚀 ROBUST URL/LINK PREVIEW COMPONENT 🚀 ───
// // const UrlPreview = ({ url }: { url: string }) => {
// //     if (!url) return null;

// //     let embedUrl = url;
// //     let isEmbeddable = true;

// //     if (url.includes('youtube.com/watch?v=')) {
// //         embedUrl = url.replace('watch?v=', 'embed/');
// //     } else if (url.includes('youtu.be/')) {
// //         embedUrl = url.replace('youtu.be/', 'youtube.com/embed/');
// //     } else if (url.includes('docs.google.com') || url.includes('drive.google.com')) {
// //         embedUrl = url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
// //     } else if (url.includes('github.com')) {
// //         isEmbeddable = false;
// //     }

// //     return (
// //         <div className="sr-url-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
// //             <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
// //                 <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                     <LinkIcon size={14} /> Link Evidence Provided
// //                 </span>
// //                 <a href={url} target="_blank" rel="noreferrer" className="no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textDecoration: 'underline' }}>Open Link in New Tab</a>
// //             </div>

// //             <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
// //                 [External Link Evidence: {url}]
// //             </div>

// //             <div className="no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80px' }}>
// //                 {isEmbeddable ? (
// //                     <iframe src={embedUrl} style={{ width: '100%', height: '400px', border: 'none' }} title="URL Preview" />
// //                 ) : (
// //                     <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
// //                         <Code size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
// //                         <p style={{ margin: 0, fontSize: '0.8rem' }}>This link (e.g. GitHub) blocks inline previewing.<br />Please use the link above to view it securely in a new tab.</p>
// //                     </div>
// //                 )}
// //             </div>
// //         </div>
// //     );
// // };

// // const RemediationModal: React.FC<{
// //     submissionTitle: string;
// //     attemptNumber: number;
// //     onClose: () => void;
// //     onSubmit: (date: string, notes: string) => void;
// // }> = ({ submissionTitle, attemptNumber, onClose, onSubmit }) => {
// //     const [date, setDate] = useState('');
// //     const [notes, setNotes] = useState('');
// //     const [confirmed, setConfirmed] = useState(false);

// //     useEffect(() => {
// //         const style = document.createElement('style');
// //         style.innerHTML = `body, html { overflow: hidden !important; }`;
// //         document.head.appendChild(style);
// //         return () => { document.head.removeChild(style); };
// //     }, []);

// //     const handleSubmit = (e: React.FormEvent) => {
// //         e.preventDefault();
// //         if (!date || !notes.trim() || !confirmed) return;
// //         onSubmit(date, notes);
// //     };

// //     const isFinalAttempt = attemptNumber === 2;

// //     const modalContent = (
// //         <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
// //             <div className="animate-fade-in" style={{ background: 'white', maxWidth: '500px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: isFinalAttempt ? '6px solid #ef4444' : '6px solid #f59e0b' }}>
// //                 <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: isFinalAttempt ? '#fef2f2' : '#fffbeb' }}>
// //                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                         <div style={{ background: isFinalAttempt ? '#ef4444' : '#f59e0b', padding: '10px', borderRadius: '50%', color: 'white' }}>
// //                             <RotateCcw size={24} />
// //                         </div>
// //                         <div>
// //                             <h2 style={{ margin: 0, fontSize: '1.25rem', color: isFinalAttempt ? '#b91c1c' : '#b45309', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                 Initiate Remediation {isFinalAttempt && "(FINAL ATTEMPT)"}
// //                             </h2>
// //                             <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: isFinalAttempt ? '#991b1b' : '#92400e' }}>{submissionTitle}</p>
// //                         </div>
// //                     </div>
// //                 </div>

// //                 <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
// //                     <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>
// //                         {isFinalAttempt
// //                             ? "WARNING: This will unlock the learner's 3rd and final attempt. A rigorous intervention is required."
// //                             : "QCTO regulations require evidence of a developmental intervention before a learner can attempt an assessment again. Please log the coaching session details below."}
// //                     </p>

// //                     <div style={{ marginBottom: '1rem' }}>
// //                         <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>Date of Coaching / Feedback Session *</label>
// //                         <input type="date" required value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none' }} />
// //                     </div>

// //                     <div style={{ marginBottom: '1.5rem' }}>
// //                         <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
// //                             <MessageSquare size={14} color="#64748b" /> Coaching Notes / Areas Addressed *
// //                         </label>
// //                         <textarea required rows={3} placeholder={isFinalAttempt ? "Describe the rigorous intervention applied..." : "Briefly describe what was discussed..."} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
// //                     </div>

// //                     <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', marginBottom: '1.5rem' }}>
// //                         <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: isFinalAttempt ? '#ef4444' : '#f59e0b' }} />
// //                         <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
// //                             <strong>I legally declare</strong> that an academic intervention has taken place and this learner is ready for their next attempt.
// //                         </span>
// //                     </label>

// //                     <div style={{ display: 'flex', gap: '1rem' }}>
// //                         <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
// //                         <button type="submit" disabled={!date || !notes.trim() || !confirmed} style={{ flex: 2, padding: '0.75rem', background: isFinalAttempt ? '#ef4444' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: (!date || !notes.trim() || !confirmed) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (!date || !notes.trim() || !confirmed) ? 0.5 : 1 }}>
// //                             Log Coaching & Unlock
// //                         </button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>
// //     );
// //     return createPortal(modalContent, document.body);
// // };

// // const AssessmentPlayer: React.FC = () => {
// //     const { assessmentId } = useParams<{ assessmentId: string }>();
// //     const navigate = useNavigate();

// //     const { user, employers, staff, fetchEmployers, fetchStaff } = useStore();
// //     const toast = useToast();

// //     const [loading, setLoading] = useState(true);
// //     const [saving, setSaving] = useState(false);
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

// //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// //     const [timeLeft, setTimeLeft] = useState<number | null>(null);
// //     const [timeOffset, setTimeOffset] = useState<number>(0);

// //     const currentStatus = String(submission?.status || '').toLowerCase();

// //     // DUAL-PATHWAY STATUS FLAGS
// //     const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
// //     const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
// //     const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
// //     const isAssDone = ['graded', 'moderated', 'returned'].includes(currentStatus);
// //     const isModDone = ['moderated'].includes(currentStatus);

// //     const isRemediation = (submission?.attemptNumber || 1) > 1;
// //     const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged;
// //     const isNotStarted = currentStatus === 'not_started';
// //     const showGate = isNotStarted || needsRemediationGate;
// //     const isLocked = isSubmitted || isAwaitingSignoff;

// //     const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

// //     // 🚀 DYNAMIC WORKPLACE INFO 🚀
// //     const workplaceInfo = useMemo(() => {
// //         if (!learnerEnrollment) return null;

// //         let employer = null;
// //         let mentor = null;

// //         if (learnerEnrollment.employerId) {
// //             employer = employers.find((e: any) => e.id === learnerEnrollment.employerId);
// //         }
// //         if (learnerEnrollment.mentorId) {
// //             mentor = staff.find((s: any) => s.id === learnerEnrollment.mentorId);
// //         }

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

// //         let activeLayer = legacyLayer || { score: 0, isCorrect: null };
// //         if (isFacDone) activeLayer = fLayer;
// //         if (isAssDone) activeLayer = aLayer;
// //         if (isModDone) activeLayer = mLayer;

// //         return {
// //             score: activeLayer.score,
// //             isCorrect: activeLayer.isCorrect,
// //             facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
// //             assIsCorrect: aLayer.isCorrect,
// //             modIsCorrect: mLayer.isCorrect,
// //             feedback: activeLayer.feedback || '',
// //             facFeedback: fLayer.feedback || legacyLayer.feedback || '',
// //             assFeedback: aLayer.feedback || '',
// //             modFeedback: mLayer.feedback || '',
// //             criteriaResults: activeLayer.criteriaResults || []
// //         };
// //     };

// //     const sectionTotals: Record<string, { total: number, awarded: number }> = {};
// //     let currentSectionId = '';
// //     if (assessment?.blocks) {
// //         assessment.blocks.forEach((block: any) => {
// //             if (block.type === 'section') {
// //                 currentSectionId = block.id;
// //                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
// //             } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type) && currentSectionId) {
// //                 const { score } = getBlockGrading(block.id);
// //                 sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
// //                 if (score !== undefined && score !== null) sectionTotals[currentSectionId].awarded += Number(score);
// //             }
// //         });
// //     }

// //     const getCompetencyStatus = () => {
// //         if (!isAssDone) return null;
// //         if (isRemediation && !isLocked) return null;

// //         const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
// //         let isCompetent = compStr === 'c' || compStr === 'competent';
// //         const actualScore = submission?.marks !== undefined ? submission.marks : submission?.totalScore;
// //         if (!isCompetent && actualScore !== undefined && assessment?.totalMarks) {
// //             isCompetent = actualScore >= (assessment.totalMarks * 0.6);
// //         }
// //         const percentage = actualScore !== undefined && assessment?.totalMarks
// //             ? Math.round((actualScore / assessment.totalMarks) * 100) : null;

// //         return {
// //             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
// //             color: isModDone ? 'green' : 'red',
// //             subtext: isModDone
// //                 ? 'Final Results Verified & Endorsed.'
// //                 : (isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.'),
// //             score: actualScore, percentage, isCompetent
// //         };
// //     };

// //     const outcome = getCompetencyStatus();

// //     const getSafeDate = (dateString: string) => {
// //         if (!dateString) return 'recently';
// //         const date = new Date(dateString);
// //         if (isNaN(date.getTime())) return 'recently';
// //         return date.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// //     };

// //     useEffect(() => {
// //         const fetchSecureTimeOffset = async () => {
// //             try {
// //                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
// //                 const data = await res.json();
// //                 setTimeOffset(new Date(data.utc_datetime).getTime() - new Date().getTime());
// //             } catch { setTimeOffset(0); }
// //         };
// //         fetchSecureTimeOffset();
// //     }, []);

// //     const getSecureNow = () => new Date().getTime() + timeOffset;

// //     useEffect(() => {
// //         if (employers.length === 0) fetchEmployers();
// //         if (staff.length === 0) fetchStaff();

// //         const loadAssessment = async () => {
// //             if (!user?.uid || !assessmentId) return;
// //             if (user.role && user.role !== 'learner') { setIsAdminIntercept(true); setLoading(false); return; }

// //             try {
// //                 const assessmentSnap = await getDoc(doc(db, 'assessments', assessmentId));
// //                 if (!assessmentSnap.exists()) { toast.error('Assessment template not found.'); setLoading(false); return; }
// //                 const assData = assessmentSnap.data();
// //                 setAssessment(assData);

// //                 const learnersRef = collection(db, 'learners');
// //                 let actualLearnerDocId = '';
// //                 let activeCohortId = '';

// //                 const authSnap = await getDocs(query(learnersRef, where('authUid', '==', user.uid)));
// //                 if (!authSnap.empty) {
// //                     actualLearnerDocId = authSnap.docs[0].id;
// //                     activeCohortId = authSnap.docs[0].data().cohortId;
// //                 } else {
// //                     const emailSnap = await getDocs(query(learnersRef, where('email', '==', user.email)));
// //                     if (emailSnap.empty) { toast.error('Learner profile not found.'); setLoading(false); return; }
// //                     actualLearnerDocId = emailSnap.docs[0].id;
// //                     activeCohortId = emailSnap.docs[0].data().cohortId;
// //                 }

// //                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
// //                 if (userDocSnap.exists()) setLearnerProfile(userDocSnap.data());

// //                 const subQuery = query(
// //                     collection(db, 'learner_submissions'),
// //                     where('learnerId', '==', actualLearnerDocId),
// //                     where('assessmentId', '==', assessmentId)
// //                 );
// //                 const subQuerySnap = await getDocs(subQuery);

// //                 let activeSub = null;
// //                 if (!subQuerySnap.empty) {
// //                     const cohortMatch = subQuerySnap.docs.find(d => d.data().cohortId === activeCohortId);
// //                     if (cohortMatch) {
// //                         activeSub = { id: cohortMatch.id, ...cohortMatch.data() };
// //                     } else {
// //                         const sorted = subQuerySnap.docs.map(d => ({ id: d.id, ...d.data() }) as any).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
// //                         activeSub = sorted[0];
// //                     }
// //                 }

// //                 if (activeSub) {
// //                     setSubmission(activeSub);
// //                     setAnswers(activeSub.answers || {});

// //                     if (activeSub.enrollmentId) {
// //                         const enrolSnap = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId));
// //                         if (enrolSnap.exists()) {
// //                             setLearnerEnrollment(enrolSnap.data());
// //                         }
// //                     }

// //                     if (activeSub.grading?.gradedBy) {
// //                         const assSnap = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
// //                         if (assSnap.exists()) setAssessorProfile(assSnap.data());
// //                     }
// //                     if (activeSub.moderation?.moderatedBy) {
// //                         const modSnap = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
// //                         if (modSnap.exists()) setModeratorProfile(modSnap.data());
// //                     }

// //                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
// //                     if (facId) {
// //                         const facSnap = await getDoc(doc(db, 'users', facId));
// //                         if (facSnap.exists()) setFacilitatorProfile(facSnap.data());
// //                     }

// //                     const _needsRemediationGate = (activeSub.attemptNumber || 1) > 1 && activeSub.latestCoachingLog && !activeSub.latestCoachingLog.acknowledged;
// //                     const _showGate = activeSub.status === 'not_started' || _needsRemediationGate;

// //                     const isPractical = assData.moduleType === 'practical' || assData.moduleType === 'workplace';

// //                     if (!isPractical && activeSub.status === 'in_progress' && assData.moduleInfo?.timeLimit > 0 && !_showGate) {
// //                         const startTime = new Date(activeSub.startedAt).getTime();
// //                         const endTime = startTime + (assData.moduleInfo.timeLimit * 60 * 1000);
// //                         const remainingSeconds = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
// //                         setTimeLeft(remainingSeconds);
// //                         if (remainingSeconds === 0) forceAutoSubmit(activeSub.id, activeSub.answers || {});
// //                     }
// //                 } else {
// //                     toast.error('You are not assigned to this assessment in your current class.');
// //                 }
// //             } catch (error) {
// //                 console.error('Error loading assessment:', error);
// //                 toast.error('Failed to load assessment data.');
// //             } finally {
// //                 setLoading(false);
// //             }
// //         };

// //         if (timeOffset !== null) loadAssessment();
// //         // eslint-disable-next-line react-hooks/exhaustive-deps
// //     }, [assessmentId, user?.uid, timeOffset]);

// //     useEffect(() => {
// //         if (isPracticalModule || timeLeft === null || isLocked || showGate) return;
// //         if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
// //         const timerId = setInterval(() => {
// //             const startTime = new Date(submission.startedAt).getTime();
// //             const endTime = startTime + (assessment.moduleInfo.timeLimit * 60 * 1000);
// //             setTimeLeft(Math.max(0, Math.floor((endTime - getSecureNow()) / 1000)));
// //         }, 1000);
// //         return () => clearInterval(timerId);
// //     }, [timeLeft, isLocked, showGate, submission?.startedAt, isPracticalModule]);

// //     const formatTime = (seconds: number) => {
// //         const h = Math.floor(seconds / 3600);
// //         const m = Math.floor((seconds % 3600) / 60);
// //         const s = seconds % 60;
// //         if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
// //         return `${m}m ${s.toString().padStart(2, '0')}s`;
// //     };

// //     const handleStartAssessment = async () => {
// //         if (!startDeclarationChecked) return;
// //         if (needsRemediationGate && !coachingAckChecked) return;

// //         setSaving(true);
// //         try {
// //             const secureStartTime = new Date(getSecureNow()).toISOString();
// //             const updatePayload: any = { status: 'in_progress', startedAt: secureStartTime };

// //             if (needsRemediationGate) {
// //                 updatePayload['latestCoachingLog.acknowledged'] = true;
// //                 updatePayload['latestCoachingLog.acknowledgedAt'] = secureStartTime;
// //             }

// //             await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);

// //             setSubmission((prev: any) => ({
// //                 ...prev, status: 'in_progress', startedAt: secureStartTime,
// //                 latestCoachingLog: prev.latestCoachingLog ? { ...prev.latestCoachingLog, acknowledged: true, acknowledgedAt: secureStartTime } : prev.latestCoachingLog
// //             }));

// //             if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) setTimeLeft(assessment.moduleInfo.timeLimit * 60);
// //         } catch { toast.error('Failed to start assessment.'); } finally { setSaving(false); }
// //     };

// //     const triggerAutoSave = (newAnswers: any) => {
// //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// //         setSaving(true);
// //         saveTimeoutRef.current = setTimeout(async () => {
// //             if (!submission?.id) return;
// //             try {
// //                 await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
// //             } catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
// //         }, 1200);
// //     };

// //     const handleAnswerChange = (blockId: string, value: any) => {
// //         if (isLocked && !isAwaitingSignoff) return;
// //         setAnswers(prev => {
// //             const newAnswers = { ...prev, [blockId]: value };
// //             triggerAutoSave(newAnswers);
// //             return newAnswers;
// //         });
// //     };

// //     const handleTaskAnswerChange = (blockId: string, field: string, value: any) => {
// //         if (isLocked && !isAwaitingSignoff) return;
// //         setAnswers(prev => {
// //             const blockAns = prev[blockId] || {};
// //             const newAnswers = { ...prev, [blockId]: { ...blockAns, [field]: value } };
// //             triggerAutoSave(newAnswers);
// //             return newAnswers;
// //         });
// //     }

// //     const handleNestedAnswerChange = (blockId: string, nestedKey: string, field: string, value: any) => {
// //         if (isLocked && !isAwaitingSignoff) return;
// //         setAnswers(prev => {
// //             const blockAns = prev[blockId] || {};
// //             const itemAns = blockAns[nestedKey] || {};
// //             const cleanItemAns = typeof itemAns === 'string' ? { text: itemAns } : itemAns;

// //             const newAnswers = {
// //                 ...prev,
// //                 [blockId]: {
// //                     ...blockAns,
// //                     [nestedKey]: { ...cleanItemAns, [field]: value }
// //                 }
// //             };
// //             triggerAutoSave(newAnswers);
// //             return newAnswers;
// //         });
// //     };

// //     const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
// //         if (!file) return;

// //         const progressKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
// //         setUploadProgress(prev => ({ ...prev, [progressKey]: 0 }));
// //         setSaving(true);
// //         toast.info(`Uploading ${file.name}...`);

// //         try {
// //             const storage = getStorage();
// //             const path = `evidence/${submission.id}/${blockId}_${Date.now()}_${file.name}`;
// //             const storageReference = fbStorageRef(storage, path);
// //             const uploadTask = uploadBytesResumable(storageReference, file);

// //             uploadTask.on(
// //                 'state_changed',
// //                 (snapshot) => {
// //                     const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
// //                     setUploadProgress(prev => ({ ...prev, [progressKey]: progress }));
// //                 },
// //                 (error) => {
// //                     console.error("Upload error:", error);
// //                     toast.warning(`Cloud upload failed. Logging filename as fallback.`);
// //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', file.name);
// //                     else handleTaskAnswerChange(blockId, 'uploadUrl', file.name);
// //                     setUploadProgress(prev => { const n = { ...prev }; delete n[progressKey]; return n; });
// //                     setSaving(false);
// //                 },
// //                 async () => {
// //                     const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
// //                     if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', downloadUrl);
// //                     else handleTaskAnswerChange(blockId, 'uploadUrl', downloadUrl);
// //                     toast.success(`Successfully uploaded: ${file.name}`);
// //                     setUploadProgress(prev => { const n = { ...prev }; delete n[progressKey]; return n; });
// //                     setSaving(false);
// //                 }
// //             );
// //         } catch (err: any) {
// //             toast.error("Upload failed to initialize.");
// //             setUploadProgress(prev => { const n = { ...prev }; delete n[progressKey]; return n; });
// //             setSaving(false);
// //         }
// //     };

// //     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
// //         setSaving(true);
// //         const submitTime = new Date(getSecureNow()).toISOString();
// //         try {
// //             await updateDoc(doc(db, 'learner_submissions', subId), {
// //                 answers: currentAnswers, status: 'submitted', submittedAt: submitTime, autoSubmitted: true,
// //                 learnerDeclaration: { agreed: true, timestamp: submitTime, learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown', learnerIdNumber: learnerProfile?.idNumber || 'Unknown' }
// //             });
// //             toast.success("Time's up! Assessment auto-submitted.");
// //             setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
// //             setTimeout(() => navigate(-1), 3000);
// //         } catch (error) { console.error("Auto-submit failed", error); } finally { setSaving(false); }
// //     };

// //     const handleNavigationLeave = () => {
// //         if (Object.keys(uploadProgress).length > 0) {
// //             toast.warning("Files are currently uploading. Please wait.");
// //             return;
// //         }
// //         if (!isLocked && !isPracticalModule && assessment.moduleInfo?.timeLimit > 0 && !showGate) setShowLeaveWarning(true);
// //         else navigate(-1);
// //     };

// //     const validateChecklistEvidence = () => {
// //         for (const block of assessment.blocks || []) {
// //             if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
// //                 for (let i = 0; i < (block.criteria?.length || 0); i++) {
// //                     const rawEv = answers[block.id]?.[`evidence_${i}`];
// //                     const ev = typeof rawEv === 'string' ? { text: rawEv } : (rawEv || {});

// //                     const hasEv = ev && (
// //                         (ev.text && ev.text.replace(/<[^>]*>?/gm, '').trim().length > 0) ||
// //                         (ev.url && ev.url.trim().length > 0) ||
// //                         (ev.code && ev.code.trim().length > 0) ||
// //                         (ev.uploadUrl && ev.uploadUrl.trim().length > 0)
// //                     );

// //                     if (!hasEv) {
// //                         return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title}" before submitting.` };
// //                     }
// //                 }
// //             }

// //             // 🚀 VALIDATE WORKPLACE EVIDENCE
// //             if (block.type === 'qcto_workplace') {
// //                 const bAns = answers[block.id] || {};
// //                 for (const wa of block.workActivities || []) {
// //                     if (!bAns[`wa_${wa.id}_declaration`]) {
// //                         return { valid: false, message: `Please sign the declaration for Work Activity ${wa.code}.` };
// //                     }
// //                     for (const se of wa.evidenceItems || []) {
// //                         const ev = bAns[`se_${se.id}`] || {};
// //                         const hasEv = ev && (
// //                             (ev.text && ev.text.replace(/<[^>]*>?/gm, '').trim().length > 0) ||
// //                             (ev.url && ev.url.trim().length > 0) ||
// //                             (ev.uploadUrl && ev.uploadUrl.trim().length > 0)
// //                         );
// //                         if (!hasEv) {
// //                             return { valid: false, message: `Please provide evidence for Supporting Requirement ${se.code} in Work Activity ${wa.code}.` };
// //                         }
// //                     }
// //                 }
// //             }
// //         }
// //         return { valid: true };
// //     };

// //     const triggerSubmitConfirm = () => {
// //         if (Object.keys(uploadProgress).length > 0) {
// //             return toast.warning("Files are currently uploading. Please wait until they finish.");
// //         }
// //         if (!declarationChecked) return toast.warning('You must agree to the declaration.');

// //         if (isAwaitingSignoff || isPracticalModule) {
// //             const evCheck: any = validateChecklistEvidence();
// //             if (!evCheck.valid) {
// //                 return toast.warning(evCheck.message);
// //             }
// //         }

// //         setShowSubmitConfirm(true);
// //     };

// //     const executeSubmit = async () => {
// //         setShowSubmitConfirm(false);
// //         setSaving(true);
// //         const submitTime = new Date(getSecureNow()).toISOString();
// //         const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

// //         try {
// //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                 answers,
// //                 status: nextStatus,
// //                 submittedAt: submitTime,
// //                 learnerDeclaration: {
// //                     agreed: true,
// //                     timestamp: submitTime,
// //                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// //                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown'
// //                 }
// //             });
// //             toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
// //             setSubmission((prev: any) => ({ ...prev, status: nextStatus }));
// //             setTimeout(() => window.scrollTo(0, 0), 1000);
// //         } catch { toast.error('Failed to submit.'); } finally { setSaving(false); }
// //     };

// //     if (loading) return (
// //         <div className="ap-fullscreen">
// //             <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
// //                 <div className="ap-spinner" />
// //                 <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Loading Assessment…</span>
// //             </div>
// //         </div>
// //     );

// //     if (isAdminIntercept) return (
// //         <div className="ap-fullscreen">
// //             <div className="ap-state-card">
// //                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><ShieldAlert size={32} color="var(--mlab-blue)" /></div>
// //                 <h1 className="ap-state-card__title">Staff Access Detected</h1>
// //                 <p className="ap-state-card__desc">This area is restricted to learners only.<br />Please use Preview mode to view assessments without affecting learner data.</p>
// //                 <div className="ap-state-card__actions">
// //                     <button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Go Back</button>
// //                     <button className="ap-btn ap-btn--primary" onClick={() => navigate(`/admin/assessment/preview/${assessmentId}`)}>Open Preview Mode</button>
// //                 </div>
// //             </div>
// //         </div>
// //     );

// //     if (!assessment || !submission) return (
// //         <div className="ap-fullscreen">
// //             <div className="ap-state-card">
// //                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', opacity: 0.5 }}><AlertCircle size={32} color="var(--mlab-grey)" /></div>
// //                 <h2 className="ap-state-card__title">Assessment Unavailable</h2>
// //                 <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Please contact your facilitator if you believe this is an error.</p>
// //                 <div className="ap-state-card__actions"><button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button></div>
// //             </div>
// //         </div>
// //     );

// //     if (showGate) return (
// //         <div className="ap-gate ap-animate">
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// //             <div className="ap-gate-topbar">
// //                 <button className="ap-gate-topbar__back" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Back to Portfolio</button>
// //                 <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
// //             </div>

// //             <div className="ap-gate-body">
// //                 <div className="ap-gate-left">
// //                     <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
// //                     <h1 className="ap-gate-left__title">
// //                         {assessment.title}
// //                         {submission?.attemptNumber > 1 && (
// //                             <span style={{ marginLeft: '12px', fontSize: '0.8rem', background: '#f59e0b', color: 'white', padding: '4px 10px', borderRadius: '12px', verticalAlign: 'middle', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                 Attempt #{submission.attemptNumber}
// //                             </span>
// //                         )}
// //                     </h1>

// //                     <p className="ap-gate-left__sub">
// //                         {isRemediation ? "This is a fresh attempt. Your previous answers have been retained. Please use the Facilitator's Coaching Notes below to correct your answers and resubmit." : "Read all instructions carefully before starting."}
// //                     </p>

// //                     {assessment?.moduleType === 'workplace' && (
// //                         <div style={{ background: '#e0f2fe', border: '1px solid #bae6fd', borderLeft: '4px solid #0ea5e9', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
// //                             <strong style={{ color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', marginBottom: '8px' }}>
// //                                 <Briefcase size={18} /> Workplace Experience Logbook
// //                             </strong>
// //                             <p style={{ margin: 0, color: '#0c4a6e', fontSize: '0.85rem', lineHeight: '1.5' }}>
// //                                 This module is a <strong>Learner Logbook</strong>. It is designed to track and verify your real-world workplace experience. You will use this logbook to map the tasks you perform to specific Work Activities (WA), record your hours, and upload Supporting Evidence (SE) which will be reviewed and signed off by your designated Workplace Mentor.
// //                             </p>
// //                         </div>
// //                     )}

// //                     {needsRemediationGate && (
// //                         <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
// //                             <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', marginBottom: '8px' }}>
// //                                 <MessageSquare size={18} /> Remediation Coaching Log
// //                             </strong>
// //                             <p style={{ margin: '0 0 10px 0', color: '#92400e', fontSize: '0.85rem' }}>
// //                                 Before beginning Attempt #{submission.attemptNumber}, QCTO compliance requires you to acknowledge the feedback session conducted by your facilitator.
// //                             </p>
// //                             <div style={{ background: 'white', padding: '10px', borderRadius: '4px', border: '1px solid #fde68a', marginBottom: '10px' }}>
// //                                 <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 'bold', textTransform: 'uppercase' }}>Facilitator Notes ({getSafeDate(submission.latestCoachingLog.date)}):</span>
// //                                 <p style={{ margin: '4px 0 0 0', color: '#78350f', fontStyle: 'italic', fontSize: '0.9rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
// //                                     "{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}
// //                                 </p>
// //                             </div>
// //                             <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
// //                                 <input
// //                                     type="checkbox"
// //                                     checked={coachingAckChecked}
// //                                     onChange={e => setCoachingAckChecked(e.target.checked)}
// //                                     style={{ marginTop: '2px', accentColor: '#f59e0b', width: '16px', height: '16px' }}
// //                                 />
// //                                 <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 'bold' }}>
// //                                     I acknowledge that I received the coaching/feedback detailed above.
// //                                 </span>
// //                             </label>
// //                         </div>
// //                     )}

// //                     <div className="ap-info-grid">
// //                         <div className="ap-info-card"><div className="ap-info-card__label"><BookOpen size={12} /> Module</div><div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div><div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div></div>
// //                         <div className="ap-info-card"><div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div><div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div><div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div></div>
// //                         <div className="ap-info-card"><div className="ap-info-card__label"><Clock size={12} /> Time Limit</div><div className="ap-info-card__value">{assessment.moduleInfo?.timeLimit ? `${assessment.moduleInfo.timeLimit} Min` : 'No Limit'}</div><div className="ap-info-card__sub">{assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}</div></div>
// //                         <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Total Marks</div><div className="ap-info-card__value">{assessment.totalMarks}</div><div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div></div>
// //                     </div>

// //                     <div className="ap-note-block">
// //                         <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
// //                         <p className="ap-note-block__text">{assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
// //                         {assessment.purpose && <><div className="ap-note-block__heading"><Info size={12} /> Purpose</div><p className="ap-note-block__text">{assessment.purpose}</p></>}
// //                     </div>
// //                 </div>

// //                 <div className="ap-gate-right">
// //                     <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
// //                     <ul className="ap-rules-list">
// //                         <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or use of unauthorized AI tools violates QCTO guidelines.</p></div></li>
// //                         <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly stated as a group project, no collaboration is permitted.</p></div></li>
// //                         <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
// //                         {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser tab. Plan your time carefully.</p></div></li>}
// //                     </ul>

// //                     <div className="ap-declaration">
// //                         <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
// //                             <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
// //                             <span className="ap-declaration-check__text"><strong>Declaration of Authenticity</strong> I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.</span>
// //                         </label>
// //                         <button className={`ap-start-btn${(startDeclarationChecked && (!needsRemediationGate || coachingAckChecked)) ? ' ap-start-btn--ready' : ''}`} onClick={handleStartAssessment} disabled={saving || !startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)}>
// //                             {saving ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> {needsRemediationGate ? `Acknowledge & Resume Attempt #${submission.attemptNumber}` : 'I Agree, Begin Assessment'}</>}
// //                         </button>
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>
// //     );

// //     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
// //         if (block.type === 'section') acc.push({ type: 'section', label: block.title, id: block.id });
// //         else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) acc.push({ type: 'q', label: block.question || block.title || 'Workplace Checkpoint', id: block.id });
// //         return acc;
// //     }, []) || [];

// //     let displayStatus = submission.status.replace('_', ' ');
// //     if (submission.status === 'returned') displayStatus = 'revision required';

// //     let qNum = 0;

// //     // DYNAMIC EDIT PERMISSIONS
// //     const canEditTask = !isLocked || isAwaitingSignoff;
// //     const canEditChecklist = isAwaitingSignoff;
// //     const canEditLogbook = !isLocked || isAwaitingSignoff;
// //     const canEditWorkplace = !isLocked || isAwaitingSignoff; // 🚀 FIX: Let learners edit workplace before signoff

// //     return (
// //         <div className="ap-player ap-animate">
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)} />}

// //             {/* 🚀 DYNAMIC SUBMIT CONFIRM MODAL 🚀 */}
// //             {showSubmitConfirm && (
// //                 <ConfirmModal
// //                     title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"}
// //                     message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting this workbook directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."}
// //                     confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"}
// //                     cancelText="Go Back"
// //                     onConfirm={executeSubmit}
// //                     onCancel={() => setShowSubmitConfirm(false)}
// //                 />
// //             )}

// //             <div className="ap-player-topbar no-print">
// //                 <div className="ap-player-topbar__left">
// //                     <button className="ap-player-topbar__back" onClick={handleNavigationLeave}><ArrowLeft size={13} /> Portfolio</button>
// //                     <div className="ap-player-topbar__separator" />
// //                     <h1 className="ap-player-topbar__title">
// //                         {assessment.title}
// //                         {submission?.attemptNumber > 1 && (
// //                             <span style={{ marginLeft: '10px', fontSize: '0.7rem', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                 Attempt #{submission.attemptNumber}
// //                             </span>
// //                         )}
// //                     </h1>
// //                 </div>

// //                 <div className="ap-player-topbar__right">
// //                     {isLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={13} /> Print Audit</button>}
// //                     {!isLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}

// //                     {/* 🚀 FIX: Changed Untimed Practical Task to Workplace Logbook dynamically */}
// //                     {!isLocked && isPracticalModule && (
// //                         <div className="ap-timer" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
// //                             <Info size={14} /> {assessment?.moduleType === 'workplace' ? 'Workplace Experience Logbook' : 'Untimed Practical Task'}
// //                         </div>
// //                     )}

// //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
// //                     <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
// //                 </div>
// //             </div>

// //             <div className={`ap-player-body${isLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
// //                 <nav className="ap-sidebar no-print">
// //                     <div className="ap-sidebar__meta-block">
// //                         <div className="ap-sidebar__meta-title">{assessment.title}</div>
// //                         {submission?.attemptNumber > 1 && (
// //                             <div className="ap-sidebar__detail" style={{ color: '#d97706', fontWeight: 'bold' }}>
// //                                 <RotateCcw size={11} /> Attempt #{submission.attemptNumber}
// //                             </div>
// //                         )}
// //                         <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
// //                         <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div>
// //                         <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>
// //                     </div>

// //                     {(submission.status !== 'not_started' && submission.status !== 'in_progress' && !isAwaitingSignoff) && (
// //                         <>
// //                             <div className="ap-sidebar__label">Status Tracking</div>
// //                             <div className="ap-sidebar__status-box">

// //                                 {isAssDone && outcome ? (
// //                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
// //                                         <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
// //                                         {outcome.score !== undefined && <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
// //                                         <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
// //                                     </div>
// //                                 ) : (
// //                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}><div className="ap-sidebar__outcome-val" style={{ color: '#cbd5e1' }}>Awaiting Grade</div><div className="ap-sidebar__outcome-note">The Assessor has not yet finalized your official results.</div></div>
// //                                 )}

// //                                 {isFacDone && submission.grading?.facilitatorOverallFeedback && (
// //                                     <div style={{ background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid rgba(56, 189, 248, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
// //                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><Info size={11} /> Facilitator Summary</strong>
// //                                         <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.grading.facilitatorOverallFeedback}</p>
// //                                     </div>
// //                                 )}

// //                                 {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
// //                                     <div style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid rgba(245,158,11,0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
// //                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'red', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><MessageSquare size={11} /> Assessor Remarks</strong>
// //                                         <p style={{ margin: 0, color: 'red', fontSize: '0.78rem', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p>
// //                                     </div>
// //                                 )}

// //                                 {isModDone && submission.moderation?.feedback && (
// //                                     <div style={{ background: 'rgba(34, 197, 94, 0.08)', borderLeft: '3px solid rgba(34, 197, 94, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
// //                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#4ade80', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><ShieldCheck size={11} /> QA Endorsement Notes</strong>
// //                                         <p style={{ margin: 0, color: '#4ade80', fontSize: '0.78rem', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.moderation.feedback}</p>
// //                                     </div>
// //                                 )}

// //                                 <div className="ap-sidebar__timeline-item">
// //                                     <div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div>
// //                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Facilitator Review</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? 'Waiting for Facilitator' : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div>
// //                                 </div>
// //                                 <div className="ap-sidebar__timeline-item">
// //                                     <div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div>
// //                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div>
// //                                 </div>
// //                                 <div className="ap-sidebar__timeline-item">
// //                                     <div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div>
// //                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `Endorsed ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div>
// //                                 </div>
// //                             </div>
// //                         </>
// //                     )}

// //                     <div className="ap-sidebar__label">Workbook Contents</div>
// //                     <div className="ap-sidebar__nav">
// //                         {navItems.map((item: any) =>
// //                             item.type === 'section' ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span> : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item">{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
// //                         )}
// //                     </div>
// //                 </nav>

// //                 <div className="ap-player-content print-pane">
// //                     {isLocked && !isAwaitingSignoff && (
// //                         <div className="print-only-cover">
// //                             <div className="print-page">
// //                                 <h1 style={{ textAlign: 'center', textTransform: 'uppercase', fontSize: '18pt', marginBottom: '10px' }}>{assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}</h1>

// //                                 {/* 🚀 FIX: Update Print Title for Workplace Modules */}
// //                                 <h2 style={{ textAlign: 'center', fontSize: '16pt', marginBottom: '30px', textDecoration: 'underline' }}>
// //                                     LEARNER {assessment?.moduleType === 'workplace' ? 'WORKPLACE LOGBOOK' : 'WORKBOOK'} {submission?.attemptNumber > 1 ? `- ATTEMPT #${submission.attemptNumber}` : ''}
// //                                 </h2>

// //                                 <table className="print-table" style={{ width: '100%', marginBottom: '40px' }}>
// //                                     <tbody>
// //                                         <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Module #</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>Notional hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>Credit(s)</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
// //                                     </tbody>
// //                                 </table>

// //                                 <h3 style={{ fontSize: '14pt', marginBottom: '10px' }}>CONTACT INFORMATION:</h3>
// //                                 <table className="print-table" style={{ width: '100%' }}>
// //                                     <tbody>
// //                                         <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '________________________'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || user?.email || '________________________'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>Telephone (W)</td><td>{learnerProfile?.telephoneWork || '________________________'}</td></tr>
// //                                         <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
// //                                     </tbody>
// //                                 </table>

// //                                 {/* 🚀 DYNAMIC WORKPLACE DETAILS FOR WORKPLACE MODULES */}
// //                                 {assessment?.moduleType === 'workplace' && workplaceInfo?.employer && (
// //                                     <>
// //                                         <h3 style={{ fontSize: '14pt', marginTop: '30px', marginBottom: '10px', color: '#0f172a' }}>WORKPLACE PLACEMENT DETAILS:</h3>
// //                                         <table className="print-table" style={{ width: '100%' }}>
// //                                             <tbody>
// //                                                 <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Host Company Name</td><td>{workplaceInfo.employer.name}</td></tr>
// //                                                 <tr><td style={{ fontWeight: 'bold' }}>Registration / SETA Number</td><td>{workplaceInfo.employer.registrationNumber || 'N/A'}</td></tr>
// //                                                 <tr><td style={{ fontWeight: 'bold' }}>Physical Address</td><td>{workplaceInfo.employer.physicalAddress || '________________________'}</td></tr>
// //                                                 <tr><td style={{ fontWeight: 'bold' }}>Host Company Contact Person</td><td>{workplaceInfo.employer.contactPerson}</td></tr>
// //                                                 <tr><td style={{ fontWeight: 'bold' }}>Assigned Workplace Mentor</td><td>{workplaceInfo.mentor?.fullName || '________________________'}</td></tr>
// //                                                 <tr><td style={{ fontWeight: 'bold' }}>Mentor Contact</td><td>{workplaceInfo.mentor?.email || workplaceInfo.employer.contactEmail}</td></tr>
// //                                             </tbody>
// //                                         </table>
// //                                     </>
// //                                 )}
// //                             </div>

// //                             <div className="print-page">
// //                                 <h3>Note to the learner</h3><p>{assessment?.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
// //                                 <h3>Purpose</h3><p>{assessment?.purpose || 'The main focus of the learning in this knowledge module is to build an understanding of the concepts related to this subject matter.'}</p>
// //                                 <h3>Topic elements to be covered include</h3>
// //                                 <table className="print-table no-border" style={{ width: '100%', fontSize: '10pt' }}>
// //                                     <tbody>
// //                                         {assessment?.moduleInfo?.topics && assessment.moduleInfo.topics.length > 0 ? (
// //                                             assessment.moduleInfo.topics.map((topic: any, idx: number) => (
// //                                                 <tr key={idx}><td>{topic.code ? <strong>{topic.code}: </strong> : ''}{topic.title || topic.name}</td><td>{topic.weight || topic.percentage}%</td></tr>
// //                                             ))
// //                                         ) : (assessment?.blocks?.filter((b: any) => b.type === 'section').length > 0) ? (
// //                                             assessment.blocks.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
// //                                                 const secTotal = sectionTotals[sec.id]?.total || 0;
// //                                                 const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
// //                                                 return (<tr key={idx}><td><strong>Section {idx + 1}: </strong> {sec.title}</td><td>{secTotal > 0 ? `${pct}%` : '—'}</td></tr>)
// //                                             })
// //                                         ) : (<tr><td colSpan={2} style={{ fontStyle: 'italic', color: '#64748b' }}>(No specific sections mapped)</td></tr>)}
// //                                     </tbody>
// //                                 </table>
// //                             </div>

// //                             <div className="print-page">
// //                                 <h3>Entry Requirements</h3><p>{assessment?.moduleInfo?.entryRequirements || `NQF Level ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}</p>
// //                                 <h3>Provider Accreditation Requirements for the Knowledge Module</h3><p><strong>Physical Requirements:</strong><br />{assessment?.moduleInfo?.physicalRequirements || 'The provider must have structured learning material or provide learners with access to structured learning material that addresses all the topics in all the knowledge modules.'}</p>
// //                                 <h3>QCTO / SETA requirements</h3>
// //                                 <p><strong>Human Resource Requirements:</strong></p>
// //                                 <ul style={{ marginBottom: '15px' }}>
// //                                     <li>Lecturer/learner ratio of {assessment?.moduleInfo?.lecturerRatio || '1:20'} (Maximum)</li>
// //                                     <li>Qualification of lecturer (SME): {assessment?.moduleInfo?.lecturerQualification || `Industry recognised qualifications with experience in the related industry`}</li>
// //                                     {assessment?.moduleInfo?.vendorCertification && <li>{assessment.moduleInfo.vendorCertification}</li>}
// //                                     <li>Assessors and moderators: accredited by the relevant SETA</li>
// //                                 </ul>
// //                                 <p><strong>Legal Requirements:</strong></p>
// //                                 <ul style={{ marginBottom: '15px' }}>
// //                                     <li>Legal (product) licences to use the software for learning and training (where applicable)</li>
// //                                     <li>OHS compliance certificate</li>
// //                                     <li>Ethical clearance (where necessary)</li>
// //                                 </ul>
// //                                 <h3>Exemptions</h3><p>{assessment?.moduleInfo?.exemptions || 'No exemptions, but the module can be achieved in full through a normal RPL process.'}</p>

// //                                 {/* 🚀 DYNAMIC VENUE FOR WORKPLACE MODULES */}
// //                                 <h3>Venue, Date and Time:</h3>
// //                                 <p>
// //                                     <strong>Venue:</strong> {assessment?.moduleType === 'workplace' && workplaceInfo?.employer ? workplaceInfo.employer.name : (assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform')}
// //                                 </p>
// //                                 <p>
// //                                     <strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}
// //                                 </p>
// //                             </div>

// //                             {/* 🚀 OFFICIAL REMEDIATION RECORD (PRINT ONLY) 🚀 */}
// //                             {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
// //                                 <div className="print-page">
// //                                     <h3>Record of Developmental Intervention (Remediation)</h3>
// //                                     <p style={{ marginBottom: '15px' }}>This section serves as official evidence that a developmental intervention was conducted prior to the learner's Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>

// //                                     <table className="print-table" style={{ width: '100%', marginBottom: '30px' }}>
// //                                         <tbody>
// //                                             <tr><td style={{ width: '30%', fontWeight: 'bold' }}>Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
// //                                             <tr><td style={{ fontWeight: 'bold' }}>Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString()}</td></tr>
// //                                             <tr><td style={{ fontWeight: 'bold' }}>Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
// //                                             <tr><td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>Coaching Notes</td><td style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.latestCoachingLog.notes}</td></tr>
// //                                         </tbody>
// //                                     </table>

// //                                     <div className="sr-signature-block" style={{ marginTop: '40px', justifyContent: 'flex-start', gap: '2rem' }}>
// //                                         <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue', flex: '0 1 300px' }}>
// //                                             <span style={{ color: 'blue' }}>Facilitator Declaration</span>
// //                                             {facilitatorProfile?.signatureUrl
// //                                                 ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" />
// //                                                 : <div className="sr-sig-no-image" style={{ color: 'blue' }}>No Canvas Signature</div>
// //                                             }
// //                                             <strong style={{ color: 'blue' }}>{submission.latestCoachingLog.facilitatorName}</strong>
// //                                             <em style={{ color: 'blue' }}>Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</em>
// //                                             <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>Coaching Conducted</div>
// //                                         </div>

// //                                         <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
// //                                             <span style={{ color: 'black' }}>Learner Acknowledgement</span>
// //                                             {submission.latestCoachingLog.acknowledged ? (
// //                                                 <>
// //                                                     {learnerProfile?.signatureUrl
// //                                                         ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// //                                                         : <div className="sr-sig-no-image" style={{ color: 'black' }}>No Canvas Signature</div>
// //                                                     }
// //                                                     <strong style={{ color: 'black' }}>{learnerProfile?.fullName || user?.fullName}</strong>
// //                                                     <em style={{ color: 'black' }}>Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString()}</em>
// //                                                     <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Intervention Received</div>
// //                                                 </>
// //                                             ) : (
// //                                                 <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
// //                                                     <div className="sr-sig-no-image" style={{ color: 'black', border: 'none' }}>Pending Signature</div>
// //                                                     <div className="sr-sig-line" style={{ borderTopColor: 'black', width: '80%', marginTop: '10px' }}>Awaiting Learner</div>
// //                                                 </div>
// //                                             )}
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}

// //                     {/* PRINT AUDIT HEADER */}
// //                     {isLocked && !isAwaitingSignoff && (
// //                         <div className="ap-print-header">
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
// //                                 <div>
// //                                     <p style={{ margin: '0 0 4px' }}><strong>Learner:</strong> {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName}</p>
// //                                     <p style={{ margin: 0 }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber}</p>
// //                                 </div>
// //                                 <div style={{ textAlign: 'right' }}>
// //                                     <p style={{ margin: '0 0 4px' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
// //                                     <p style={{ margin: '0 0 4px' }}><strong>Submitted:</strong> {getSafeDate(submission.submittedAt)}</p>
// //                                     {isAssDone && <p style={{ margin: 0 }}><strong>Outcome:</strong> {outcome?.label} ({outcome?.percentage}%)</p>}
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     <div className="ap-blocks">
// //                         {assessment.blocks?.map((block: any, idx: number) => {

// //                             if (block.type === 'section') {
// //                                 const totals = sectionTotals[block.id];
// //                                 return (
// //                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                             <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>{block.title}</span>
// //                                             {isAssDone && totals && totals.total > 0 && (
// //                                                 <span className="no-print" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px' }}>
// //                                                     <BarChart size={13} /> {totals.awarded}/{totals.total}
// //                                                 </span>
// //                                             )}
// //                                         </div>
// //                                         {block.content && (
// //                                             <div className="quill-read-only-content" style={{ color: 'white', fontSize: '0.95rem' }} dangerouslySetInnerHTML={{ __html: block.content }} />
// //                                         )}
// //                                     </div>
// //                                 );
// //                             }

// //                             if (block.type === 'info') return (
// //                                 <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
// //                                     <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
// //                                     <p className="ap-block-info__text" style={{ whiteSpace: 'pre-wrap' }}>{block.content}</p>
// //                                 </div>
// //                             );

// //                             if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
// //                                 qNum++;
// //                                 const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
// //                                 const learnerAns = answers[block.id] || {};

// //                                 let activeInkColor = 'transparent';
// //                                 if (isModDone) activeInkColor = 'green';
// //                                 else if (isAssDone) activeInkColor = 'red';
// //                                 else if (isFacDone && !isAwaitingSignoff) activeInkColor = 'blue';

// //                                 const markLabel = isFacDone && blockScore !== undefined && blockScore !== null
// //                                     ? `${blockScore} / ${block.marks || 0}`
// //                                     : `${block.marks || 0} Marks`;

// //                                 const TopRightIndicator = () => {
// //                                     return (
// //                                         <div style={{ display: 'flex', gap: '8px', marginLeft: '12px', alignItems: 'center' }}>
// //                                             {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && (
// //                                                 <div title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
// //                                                     {facIsCorrect ? <Check size={18} color="#0284c7" strokeWidth={3} /> : <X size={18} color="#0284c7" strokeWidth={3} />}
// //                                                 </div>
// //                                             )}
// //                                             {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && (
// //                                                 <div title="Official Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px' }}>
// //                                                     {assIsCorrect ? <Check size={18} color="#ef4444" strokeWidth={3} /> : <X size={18} color="#ef4444" strokeWidth={3} />}
// //                                                 </div>
// //                                             )}
// //                                             {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && (
// //                                                 <div title="Internal Moderation QA" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 6px', borderRadius: '4px' }}>
// //                                                     {modIsCorrect ? <Check size={18} color="#22c55e" strokeWidth={3} /> : <X size={18} color="#22c55e" strokeWidth={3} />}
// //                                                 </div>
// //                                             )}
// //                                         </div>
// //                                     );
// //                                 };

// //                                 return (
// //                                     <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>

// //                                         {/* ── HEADER ── */}
// //                                         <div className="ap-block-question__header">
// //                                             <div className="ap-block-question__text-wrap" style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
// //                                                 <span className="ap-block-question__text">
// //                                                     <strong style={{
// //                                                         color: block.type === 'checklist' ? '#0d9488' : block.type === 'logbook' ? '#ea580c' : block.type === 'qcto_workplace' ? '#e11d48' : '#94a3b8',
// //                                                         background: block.type === 'checklist' ? '#ccfbf1' : block.type === 'logbook' ? '#ffedd5' : block.type === 'qcto_workplace' ? '#ffe4e6' : 'transparent',
// //                                                         padding: block.type === 'checklist' || block.type === 'logbook' || block.type === 'task' || block.type === 'qcto_workplace' ? '2px 8px' : '0',
// //                                                         borderRadius: '4px',
// //                                                         marginRight: '8px'
// //                                                     }}>
// //                                                         {block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : `Q${qNum}.`}
// //                                                     </strong>
// //                                                     {block.question || block.title || (block.type === 'qcto_workplace' ? 'Workplace Checkpoint' : '')}
// //                                                 </span>
// //                                                 <TopRightIndicator />
// //                                             </div>
// //                                             <span className="ap-block-question__marks" style={{ color: activeInkColor !== 'transparent' ? activeInkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
// //                                         </div>

// //                                         {/* ── BODY ── */}
// //                                         <div className="ap-block-question__body">

// //                                             {/* MCQ */}
// //                                             {block.type === 'mcq' && (
// //                                                 <div className="ap-mcq-options">
// //                                                     {block.options?.map((opt: string, i: number) => {
// //                                                         const selected = learnerAns === i;
// //                                                         return (
// //                                                             <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', (!canEditTask) ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
// //                                                                 <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={!canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
// //                                                                 <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
// //                                                                 <span className="ap-mcq-label__text">{opt}</span>
// //                                                             </label>
// //                                                         );
// //                                                     })}
// //                                                 </div>
// //                                             )}

// //                                             {/* TEXT */}
// //                                             {block.type === 'text' && (
// //                                                 <div className={`ap-quill-wrapper ${!canEditTask ? 'locked' : ''}`}>
// //                                                     <ReactQuill theme="snow" value={learnerAns || ''} onChange={(content) => handleAnswerChange(block.id, content)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder={!canEditTask ? 'No answer provided.' : 'Type your detailed response here...'} />
// //                                                 </div>
// //                                             )}

// //                                             {/* 🚀 MULTI-MODAL TASK 🚀 */}
// //                                             {block.type === 'task' && (() => {
// //                                                 const taskTabs = [
// //                                                     { id: 'text', icon: <FileText size={14} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text },
// //                                                     { id: 'audio', icon: <Mic size={14} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl },
// //                                                     { id: 'url', icon: <LinkIcon size={14} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url },
// //                                                     { id: 'upload', icon: <UploadCloud size={14} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl },
// //                                                     { id: 'code', icon: <Code size={14} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code }
// //                                                 ].filter(t => t.allowed);

// //                                                 const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
// //                                                 const currentProgress = uploadProgress[block.id];

// //                                                 return (
// //                                                     <div className="ap-evidence-container" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>

// //                                                         {isPracticalModule && !isAwaitingSignoff && !isSubmitted && (
// //                                                             <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '10px 15px', color: '#b45309', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                                 <Lock size={16} /> <span>Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</span>
// //                                                             </div>
// //                                                         )}

// //                                                         <div className="no-print" style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
// //                                                             {taskTabs.map(t => (
// //                                                                 <button
// //                                                                     key={t.id}
// //                                                                     onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
// //                                                                     style={{
// //                                                                         padding: '10px 15px', border: 'none', borderBottom: activeTabId === t.id ? '2px solid var(--mlab-blue)' : '2px solid transparent',
// //                                                                         background: activeTabId === t.id ? 'white' : 'transparent',
// //                                                                         color: activeTabId === t.id ? 'var(--mlab-blue)' : '#64748b',
// //                                                                         fontWeight: activeTabId === t.id ? 'bold' : 'normal',
// //                                                                         fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap'
// //                                                                     }}
// //                                                                 >
// //                                                                     {t.icon} {t.label}
// //                                                                     {!!t.val && <CheckCircle size={12} color="#10b981" />}
// //                                                                 </button>
// //                                                             ))}
// //                                                         </div>
// //                                                         <div style={{ padding: '15px' }}>
// //                                                             {activeTabId === 'text' && (
// //                                                                 <div className={`ap-quill-wrapper ${!canEditTask ? 'locked' : ''}`} style={{ border: 'none', padding: 0 }}>
// //                                                                     <ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={(content) => handleTaskAnswerChange(block.id, 'text', content)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder={!canEditTask ? 'No text answer provided.' : 'Type your answer here...'} />
// //                                                                 </div>
// //                                                             )}
// //                                                             {activeTabId === 'audio' && (
// //                                                                 learnerAns?.audioUrl ? (
// //                                                                     <audio controls src={learnerAns.audioUrl} style={{ width: '100%', height: '40px' }} />
// //                                                                 ) : (
// //                                                                     <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '6px', color: '#94a3b8' }}>
// //                                                                         {!canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}
// //                                                                     </div>
// //                                                                 )
// //                                                             )}
// //                                                             {activeTabId === 'url' && (
// //                                                                 <div>
// //                                                                     {canEditTask && (
// //                                                                         <div style={{ background: '#e0f2fe', borderLeft: '3px solid #0ea5e9', padding: '8px', marginBottom: '10px', fontSize: '0.75rem', color: '#0369a1', borderRadius: '4px' }}>
// //                                                                             <strong>Note:</strong> If pasting a Google Drive/Docs link, ensure it is set to <em>"Anyone with the link can view"</em>.
// //                                                                         </div>
// //                                                                     )}
// //                                                                     {learnerAns?.url && !canEditTask ? (
// //                                                                         <UrlPreview url={learnerAns.url} />
// //                                                                     ) : (
// //                                                                         <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={!canEditTask} placeholder="https://..." style={{ borderColor: '#cbd5e1', width: '100%' }} />
// //                                                                     )}
// //                                                                 </div>
// //                                                             )}
// //                                                             {activeTabId === 'upload' && (
// //                                                                 currentProgress !== undefined ? (
// //                                                                     <div style={{ padding: '20px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc' }}>
// //                                                                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>
// //                                                                             <span>Uploading...</span>
// //                                                                             <span>{currentProgress}%</span>
// //                                                                         </div>
// //                                                                         <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
// //                                                                             <div style={{ width: `${currentProgress}%`, height: '100%', background: 'var(--mlab-blue)', transition: 'width 0.2s' }} />
// //                                                                         </div>
// //                                                                     </div>
// //                                                                 ) : learnerAns?.uploadUrl ? (
// //                                                                     <FilePreview url={learnerAns.uploadUrl} onRemove={canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={!canEditTask} />
// //                                                                 ) : (
// //                                                                     <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '6px', color: '#94a3b8' }}>
// //                                                                         {!canEditTask ? 'No file uploaded.' : (
// //                                                                             <div>
// //                                                                                 <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#475569' }}>Select a file to upload (Allowed: {block.allowedFileTypes})</p>
// //                                                                                 <input type="file" onChange={(e) => {
// //                                                                                     if (e.target.files && e.target.files.length > 0) {
// //                                                                                         handleFileUpload(e.target.files[0], block.id);
// //                                                                                     }
// //                                                                                 }} style={{ fontSize: '0.8rem' }} />
// //                                                                             </div>
// //                                                                         )}
// //                                                                     </div>
// //                                                                 )
// //                                                             )}
// //                                                             {activeTabId === 'code' && (
// //                                                                 <textarea className="ab-input" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={!canEditTask} placeholder="Paste your code here..." style={{ fontFamily: 'monospace', background: '#1e293b', color: '#f8fafc', border: 'none' }} />
// //                                                             )}
// //                                                         </div>
// //                                                     </div>
// //                                                 );
// //                                             })()}

// //                                             {/* 🚀 PRACTICAL CHECKLIST (LEARNER VIEW WITH TABBED EVIDENCE UPLOADS) 🚀 */}
// //                                             {block.type === 'checklist' && (
// //                                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '6px' }}>
// //                                                     <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#166534', fontWeight: 'bold' }}><Info size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Your Mentor/Assessor completes the evaluation, but you must upload evidence for each item if required below.</p>

// //                                                     {!isAwaitingSignoff && !isSubmitted && (
// //                                                         <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '10px', borderRadius: '6px', marginBottom: '15px', color: '#b45309', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                             <Lock size={16} /> <span>Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</span>
// //                                                         </div>
// //                                                     )}

// //                                                     {block.criteria?.map((crit: string, i: number) => {
// //                                                         const res = criteriaResults?.[i] || {};
// //                                                         const critKey = `evidence_${i}`;
// //                                                         const rawEv = learnerAns?.[critKey];
// //                                                         const critEvidence = typeof rawEv === 'string' ? { text: rawEv } : (rawEv || {});

// //                                                         const cTabKey = `${block.id}_${i}`;
// //                                                         const checklistTabs = [
// //                                                             { id: 'upload', icon: <UploadCloud size={12} />, label: 'File', val: critEvidence?.uploadUrl },
// //                                                             { id: 'url', icon: <LinkIcon size={12} />, label: 'Link', val: critEvidence?.url },
// //                                                             { id: 'code', icon: <Code size={12} />, label: 'Code', val: critEvidence?.code },
// //                                                             { id: 'text', icon: <FileText size={12} />, label: 'Notes', val: critEvidence?.text }
// //                                                         ];

// //                                                         const availableTabs = !canEditChecklist ? checklistTabs.filter(t => t.val) : checklistTabs;
// //                                                         const activeCTab = activeTabs[cTabKey] || (availableTabs[0]?.id || 'upload');
// //                                                         const currentProgress = uploadProgress[`${block.id}_${critKey}`];

// //                                                         return (
// //                                                             <div key={i} style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '10px' }}>
// //                                                                 <p style={{ margin: '0 0 10px 0', color: '#334155', fontSize: '0.95rem', fontWeight: 'bold' }}>{i + 1}. {crit}</p>

// //                                                                 {/* Assessor Marks (Read-Only to Learner) */}
// //                                                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px', background: '#f8fafc', padding: '10px', borderRadius: '4px', borderLeft: '3px solid #cbd5e1' }}>
// //                                                                     {isFacDone ? (
// //                                                                         <>
// //                                                                             <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: res.status === 'C' ? '#dcfce7' : res.status === 'NYC' ? '#fee2e2' : '#f1f5f9', color: res.status === 'C' ? '#166534' : res.status === 'NYC' ? '#991b1b' : '#64748b', fontWeight: 'bold' }}>
// //                                                                                 {res.status ? `Assessor marked: ${res.status}` : 'Not Graded'}
// //                                                                             </span>
// //                                                                             {res.comment && <span style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>"{res.comment}"</span>}
// //                                                                         </>
// //                                                                     ) : (
// //                                                                         <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>Pending Observation</span>
// //                                                                     )}
// //                                                                 </div>

// //                                                                 {/* 🚀 Tabbed Learner Evidence Input per Criterion 🚀 */}
// //                                                                 {block.requireEvidencePerCriterion !== false && (
// //                                                                     <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
// //                                                                         <div className="no-print" style={{ display: 'flex', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
// //                                                                             {availableTabs.length > 0 ? availableTabs.map(t => (
// //                                                                                 <button
// //                                                                                     key={t.id}
// //                                                                                     onClick={() => setActiveTabs({ ...activeTabs, [cTabKey]: t.id })}
// //                                                                                     style={{
// //                                                                                         flex: 1, padding: '8px', border: 'none', borderBottom: activeCTab === t.id ? '2px solid #8b5cf6' : '2px solid transparent',
// //                                                                                         background: activeCTab === t.id ? 'white' : 'transparent',
// //                                                                                         color: activeCTab === t.id ? '#7c3aed' : '#64748b',
// //                                                                                         fontSize: '0.75rem', fontWeight: activeCTab === t.id ? 'bold' : 'normal',
// //                                                                                         display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer'
// //                                                                                     }}
// //                                                                                 >
// //                                                                                     {t.icon} {t.label}
// //                                                                                     {!!t.val && <CheckCircle size={10} color="#10b981" />}
// //                                                                                 </button>
// //                                                                             )) : (
// //                                                                                 <div style={{ padding: '10px', fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>No evidence provided by learner.</div>
// //                                                                             )}
// //                                                                         </div>

// //                                                                         {availableTabs.length > 0 && (
// //                                                                             <div style={{ padding: '15px', background: 'white' }}>
// //                                                                                 {activeCTab === 'upload' && (
// //                                                                                     currentProgress !== undefined ? (
// //                                                                                         <div style={{ padding: '15px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc' }}>
// //                                                                                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>
// //                                                                                                 <span>Uploading...</span>
// //                                                                                                 <span>{currentProgress}%</span>
// //                                                                                             </div>
// //                                                                                             <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
// //                                                                                                 <div style={{ width: `${currentProgress}%`, height: '100%', background: 'var(--mlab-blue)', transition: 'width 0.2s' }} />
// //                                                                                             </div>
// //                                                                                         </div>
// //                                                                                     ) : critEvidence.uploadUrl ? (
// //                                                                                         <FilePreview url={critEvidence.uploadUrl} onRemove={canEditChecklist ? () => handleNestedAnswerChange(block.id, critKey, 'uploadUrl', '') : undefined} disabled={!canEditChecklist} />
// //                                                                                     ) : (
// //                                                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                                                                             <input type="file" disabled={!canEditChecklist} onChange={(e) => {
// //                                                                                                 if (e.target.files && e.target.files.length > 0) {
// //                                                                                                     handleFileUpload(e.target.files[0], block.id, critKey);
// //                                                                                                 }
// //                                                                                             }} style={{ fontSize: '0.8rem', width: '100%' }} />
// //                                                                                         </div>
// //                                                                                     )
// //                                                                                 )}
// //                                                                                 {activeCTab === 'url' && (
// //                                                                                     <div>
// //                                                                                         {canEditChecklist && (
// //                                                                                             <div style={{ background: '#e0f2fe', borderLeft: '3px solid #0ea5e9', padding: '8px', marginBottom: '8px', fontSize: '0.75rem', color: '#0369a1', borderRadius: '4px' }}>
// //                                                                                                 <strong>Note:</strong> If pasting a Google Drive/Docs link, ensure it is set to <em>"Anyone with the link can view"</em> so assessors can access it.
// //                                                                                             </div>
// //                                                                                         )}
// //                                                                                         {critEvidence.url && !canEditChecklist ? (
// //                                                                                             <UrlPreview url={critEvidence.url} />
// //                                                                                         ) : (
// //                                                                                             <input type="url" className="ab-input" value={critEvidence.url || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'url', e.target.value)} disabled={!canEditChecklist} placeholder="https:// (Google Drive, Github, Docs...)" style={{ fontSize: '0.8rem' }} />
// //                                                                                         )}
// //                                                                                     </div>
// //                                                                                 )}
// //                                                                                 {activeCTab === 'code' && (
// //                                                                                     <textarea className="ab-input" rows={3} value={critEvidence.code || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'code', e.target.value)} disabled={!canEditChecklist} placeholder="Paste code snippet here..." style={{ fontSize: '0.8rem', fontFamily: 'monospace', background: '#1e293b', color: '#f8fafc', border: 'none' }} />
// //                                                                                 )}
// //                                                                                 {activeCTab === 'text' && (
// //                                                                                     <div className={`ap-quill-wrapper ${!canEditChecklist ? 'locked' : ''}`} style={{ border: 'none', padding: 0 }}>
// //                                                                                         <ReactQuill theme="snow" value={critEvidence.text || ''} onChange={(content) => handleNestedAnswerChange(block.id, critKey, 'text', content)} readOnly={!canEditChecklist} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes here..." />
// //                                                                                     </div>
// //                                                                                 )}
// //                                                                             </div>
// //                                                                         )}
// //                                                                     </div>
// //                                                                 )}
// //                                                             </div>
// //                                                         );
// //                                                     })}
// //                                                 </div>
// //                                             )}

// //                                             {/* 🚀 BASIC LOGBOOK BLOCK (LEARNER INTERACTIVE) 🚀 */}
// //                                             {block.type === 'logbook' && (
// //                                                 <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
// //                                                     <div style={{ background: '#f8fafc', padding: '10px', borderBottom: '1px solid #e2e8f0' }}>
// //                                                         <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>{block.content}</p>
// //                                                     </div>
// //                                                     <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left', background: 'white' }}>
// //                                                         <thead>
// //                                                             <tr style={{ background: '#f1f5f9', color: '#334155' }}>
// //                                                                 <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Date</th>
// //                                                                 <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Assignment Task</th>
// //                                                                 <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Start</th>
// //                                                                 <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Finish</th>
// //                                                                 <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1', width: '80px' }}>Hours</th>
// //                                                                 {canEditLogbook && <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1', width: '40px' }}></th>}
// //                                                             </tr>
// //                                                         </thead>
// //                                                         <tbody>
// //                                                             {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
// //                                                                 <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
// //                                                                     <td style={{ padding: '5px' }}><input type="date" value={entry.date} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px' }} /></td>
// //                                                                     <td style={{ padding: '5px' }}><input type="text" value={entry.task} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].task = e.target.value; handleAnswerChange(block.id, n); }} style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px' }} placeholder="Task description" /></td>
// //                                                                     <td style={{ padding: '5px' }}><input type="time" value={entry.startTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px' }} /></td>
// //                                                                     <td style={{ padding: '5px' }}><input type="time" value={entry.endTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px' }} /></td>
// //                                                                     <td style={{ padding: '5px' }}><input type="number" value={entry.hours} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px' }} /></td>
// //                                                                     {canEditLogbook && <td style={{ padding: '5px', textAlign: 'center' }}><button onClick={() => { const n = learnerAns.filter((_: any, idx: number) => idx !== i); handleAnswerChange(block.id, n); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={14} /></button></td>}
// //                                                                 </tr>
// //                                                             ))}
// //                                                             {canEditLogbook && (
// //                                                                 <tr>
// //                                                                     <td colSpan={6} style={{ padding: '10px', textAlign: 'center' }}>
// //                                                                         <button onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])} style={{ background: '#f1f5f9', color: '#475569', border: '1px dashed #cbd5e1', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}><Plus size={14} /> Add Logbook Entry</button>
// //                                                                     </td>
// //                                                                 </tr>
// //                                                             )}
// //                                                             <tr style={{ background: '#f8fafc' }}>
// //                                                                 <td colSpan={4} style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#334155' }}>Total Logged Hours:</td>
// //                                                                 <td style={{ padding: '10px', fontWeight: 'bold', color: '#ea580c' }}>{(Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, curr: any) => acc + (Number(curr.hours) || 0), 0)}</td>
// //                                                                 {canEditLogbook && <td></td>}
// //                                                             </tr>
// //                                                         </tbody>
// //                                                     </table>
// //                                                 </div>
// //                                             )}

// //                                             {/* 🚀 QCTO WORKPLACE CHECKPOINT VIEWER 🚀 */}
// //                                             {block.type === 'qcto_workplace' && (
// //                                                 <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '1.5rem', borderRadius: '6px' }}>

// //                                                     {block.weCode && (
// //                                                         <div style={{ marginBottom: '1rem' }}>
// //                                                             <strong style={{ color: '#9f1239', display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>Work Experience Module (WE Code):</strong>
// //                                                             <span style={{ color: '#be123c', fontSize: '0.9rem' }}>{block.weCode} - {block.weTitle}</span>
// //                                                         </div>
// //                                                     )}

// //                                                     {block.workActivities?.map((wa: any) => {
// //                                                         const waTaskKey = `wa_${wa.id}_task`;
// //                                                         const waDateKey = `wa_${wa.id}_date`;
// //                                                         const waDeclKey = `wa_${wa.id}_declaration`;

// //                                                         const waTask = learnerAns?.[waTaskKey] || '';
// //                                                         const waDate = learnerAns?.[waDateKey] || new Date().toISOString().split('T')[0];
// //                                                         const waDecl = learnerAns?.[waDeclKey] || false;

// //                                                         return (
// //                                                             <div key={wa.id} style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid #fda4af', marginBottom: '1.5rem' }}>
// //                                                                 <h4 style={{ color: '#be123c', margin: '0 0 10px 0', fontSize: '0.95rem' }}>{wa.code}: {wa.description}</h4>

// //                                                                 {/* Learner fills in their task/date */}
// //                                                                 <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
// //                                                                     <div style={{ flex: 1 }}>
// //                                                                         <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#4c0519', marginBottom: '4px' }}>Task Performed</label>
// //                                                                         <div className={`ap-quill-wrapper ${!canEditWorkplace ? 'locked' : ''}`} style={{ padding: 0 }}>
// //                                                                             <ReactQuill theme="snow" value={waTask} onChange={(content) => handleTaskAnswerChange(block.id, waTaskKey, content)} readOnly={!canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder={!canEditWorkplace ? '' : 'Describe the task performed...'} />
// //                                                                         </div>
// //                                                                     </div>
// //                                                                     <div style={{ width: '150px' }}>
// //                                                                         <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#4c0519', marginBottom: '4px' }}>Date</label>
// //                                                                         <input type="date" className="ab-input" value={waDate} onChange={e => handleTaskAnswerChange(block.id, waDateKey, e.target.value)} disabled={!canEditWorkplace} />
// //                                                                     </div>
// //                                                                 </div>

// //                                                                 {/* Supporting Evidence Mapping */}
// //                                                                 {(wa.evidenceItems || []).length > 0 && (
// //                                                                     <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
// //                                                                         <h5 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#334155' }}>Supporting Evidence Required:</h5>
// //                                                                         {wa.evidenceItems.map((se: any) => {
// //                                                                             const seKey = `se_${se.id}`;
// //                                                                             const seData = learnerAns?.[seKey] || {};

// //                                                                             const wpTabs = [
// //                                                                                 { id: 'upload', icon: <UploadCloud size={14} />, label: 'Document', val: seData.uploadUrl },
// //                                                                                 { id: 'url', icon: <LinkIcon size={14} />, label: 'Link', val: seData.url },
// //                                                                                 { id: 'text', icon: <FileText size={14} />, label: 'Reflection', val: seData.text }
// //                                                                             ];

// //                                                                             const activeTabId = activeTabs[`${block.id}_${se.id}`] || wpTabs[0].id;
// //                                                                             const currentProgress = uploadProgress[`${block.id}_${seKey}`];

// //                                                                             return (
// //                                                                                 <div key={se.id} style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px dashed #cbd5e1' }}>
// //                                                                                     <strong style={{ display: 'block', fontSize: '0.8rem', color: '#0f172a', marginBottom: '8px' }}>{se.code}: {se.description}</strong>

// //                                                                                     <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
// //                                                                                         <div className="no-print" style={{ display: 'flex', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
// //                                                                                             {wpTabs.map(t => (
// //                                                                                                 <button
// //                                                                                                     key={t.id}
// //                                                                                                     onClick={() => setActiveTabs({ ...activeTabs, [`${block.id}_${se.id}`]: t.id })}
// //                                                                                                     style={{
// //                                                                                                         flex: 1, padding: '8px', border: 'none', borderBottom: activeTabId === t.id ? '2px solid #e11d48' : '2px solid transparent',
// //                                                                                                         background: activeTabId === t.id ? 'white' : 'transparent',
// //                                                                                                         color: activeTabId === t.id ? '#e11d48' : '#64748b',
// //                                                                                                         fontWeight: activeTabId === t.id ? 'bold' : 'normal',
// //                                                                                                         fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer'
// //                                                                                                     }}
// //                                                                                                 >
// //                                                                                                     {t.icon} {t.label}
// //                                                                                                     {!!t.val && <CheckCircle size={10} color="#10b981" />}
// //                                                                                                 </button>
// //                                                                                             ))}
// //                                                                                         </div>
// //                                                                                         <div style={{ padding: '15px', background: 'white' }}>
// //                                                                                             {activeTabId === 'upload' && (
// //                                                                                                 currentProgress !== undefined ? (
// //                                                                                                     <div style={{ padding: '15px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc' }}>
// //                                                                                                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>
// //                                                                                                             <span>Uploading...</span>
// //                                                                                                             <span>{currentProgress}%</span>
// //                                                                                                         </div>
// //                                                                                                         <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
// //                                                                                                             <div style={{ width: `${currentProgress}%`, height: '100%', background: 'var(--mlab-blue)', transition: 'width 0.2s' }} />
// //                                                                                                         </div>
// //                                                                                                     </div>
// //                                                                                                 ) : seData.uploadUrl ? (
// //                                                                                                     <FilePreview url={seData.uploadUrl} onRemove={canEditWorkplace ? () => handleNestedAnswerChange(block.id, seKey, 'uploadUrl', '') : undefined} disabled={!canEditWorkplace} />
// //                                                                                                 ) : (
// //                                                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                                                                                         <input type="file" disabled={!canEditWorkplace} onChange={(e) => {
// //                                                                                                             if (e.target.files && e.target.files.length > 0) {
// //                                                                                                                 handleFileUpload(e.target.files[0], block.id, seKey);
// //                                                                                                             }
// //                                                                                                         }} style={{ fontSize: '0.8rem', width: '100%' }} />
// //                                                                                                     </div>
// //                                                                                                 )
// //                                                                                             )}
// //                                                                                             {activeTabId === 'url' && (
// //                                                                                                 <div>
// //                                                                                                     {canEditWorkplace && (
// //                                                                                                         <div style={{ background: '#e0f2fe', borderLeft: '3px solid #0ea5e9', padding: '8px', marginBottom: '8px', fontSize: '0.75rem', color: '#0369a1', borderRadius: '4px' }}>
// //                                                                                                             <strong>Note:</strong> If pasting a Google Drive/Docs link, ensure it is set to <em>"Anyone with the link can view"</em>.
// //                                                                                                         </div>
// //                                                                                                     )}
// //                                                                                                     {seData.url && !canEditWorkplace ? (
// //                                                                                                         <UrlPreview url={seData.url} />
// //                                                                                                     ) : (
// //                                                                                                         <input type="url" className="ab-input" value={seData.url || ''} onChange={e => handleNestedAnswerChange(block.id, seKey, 'url', e.target.value)} disabled={!canEditWorkplace} placeholder="https:// (Google Drive, Github, Docs...)" style={{ fontSize: '0.8rem' }} />
// //                                                                                                     )}
// //                                                                                                 </div>
// //                                                                                             )}
// //                                                                                             {activeTabId === 'text' && (
// //                                                                                                 <div className={`ap-quill-wrapper ${!canEditWorkplace ? 'locked' : ''}`} style={{ border: 'none', padding: 0 }}>
// //                                                                                                     <ReactQuill theme="snow" value={seData.text || ''} onChange={(content) => handleNestedAnswerChange(block.id, seKey, 'text', content)} readOnly={!canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes here..." />
// //                                                                                                 </div>
// //                                                                                             )}
// //                                                                                         </div>
// //                                                                                     </div>
// //                                                                                 </div>
// //                                                                             );
// //                                                                         })}
// //                                                                     </div>
// //                                                                 )}

// //                                                                 {/* Declaration for this WA */}
// //                                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: canEditWorkplace ? 'pointer' : 'not-allowed', background: waDecl ? '#ffe4e6' : '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #fda4af' }}>
// //                                                                     <input type="checkbox" disabled={!canEditWorkplace} checked={waDecl} onChange={(e: any) => handleTaskAnswerChange(block.id, waDeclKey, e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} />
// //                                                                     <span style={{ fontSize: '0.8rem', color: '#9f1239', fontWeight: 'bold' }}>I declare that this is correct evidence and the task was performed by me.</span>
// //                                                                 </label>

// //                                                             </div>
// //                                                         );
// //                                                     })}

// //                                                     {/* Additional Toggles (Global to the WE) */}
// //                                                     <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '15px' }}>
// //                                                         {block.requireSelfAssessment !== false && (
// //                                                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: canEditWorkplace ? 'pointer' : 'not-allowed', background: learnerAns?.selfAssessmentDone ? '#ffe4e6' : 'white', padding: '10px', borderRadius: '6px', border: '1px solid #fda4af' }}>
// //                                                                 <input type="checkbox" disabled={!canEditWorkplace} checked={learnerAns?.selfAssessmentDone || false} onChange={(e: any) => handleTaskAnswerChange(block.id, 'selfAssessmentDone', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} />
// //                                                                 <span style={{ fontSize: '0.85rem', color: '#9f1239', fontWeight: 'bold' }}>I have completed the self-assessment for these tasks.</span>
// //                                                             </label>
// //                                                         )}
// //                                                         {block.requireGoalPlanning !== false && (
// //                                                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: canEditWorkplace ? 'pointer' : 'not-allowed', background: learnerAns?.goalPlanningDone ? '#ffe4e6' : 'white', padding: '10px', borderRadius: '6px', border: '1px solid #fda4af' }}>
// //                                                                 <input type="checkbox" disabled={!canEditWorkplace} checked={learnerAns?.goalPlanningDone || false} onChange={(e: any) => handleTaskAnswerChange(block.id, 'goalPlanningDone', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} />
// //                                                                 <span style={{ fontSize: '0.85rem', color: '#9f1239', fontWeight: 'bold' }}>I have updated my goal planning document.</span>
// //                                                             </label>
// //                                                         )}
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

// //                     {/* 🚀 POST-OBSERVATION SIGN-OFF BANNER OR STANDARD FOOTER 🚀 */}
// //                     {isAwaitingSignoff ? (
// //                         <div className="ap-footer" style={{ borderTop: '4px solid #f59e0b', background: '#fffbeb' }}>
// //                             <h3 className="ap-footer__title" style={{ color: '#d97706' }}>
// //                                 {assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}
// //                             </h3>
// //                             <p className="ap-footer__desc" style={{ color: '#92400e' }}>
// //                                 {assessment?.moduleType === 'workplace'
// //                                     ? 'Your Workplace Mentor has verified your tasks. Please ensure you have uploaded all required evidence links above, review their feedback, and sign off below.'
// //                                     : 'Your Mentor/Facilitator has evaluated your practical tasks. Please ensure you have uploaded your evidence links above, then review their feedback and sign off.'}
// //                             </p>
// //                             <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`} style={{ borderColor: '#fcd34d' }}>
// //                                 <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} style={{ accentColor: '#d97706' }} />
// //                                 <span className="ap-footer-declaration__text" style={{ color: '#92400e' }}>
// //                                     <strong>Learner Observation Acknowledgement</strong>
// //                                     I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.
// //                                 </span>
// //                             </label>
// //                             <div className="ap-footer-actions">
// //                                 <span className="ap-autosave-label">
// //                                     {saving && <><div className="ap-spinner ap-spinner--sm" /> Saving…</>}
// //                                     {Object.keys(uploadProgress).length > 0 && <span style={{ color: '#d97706', fontWeight: 'bold', marginLeft: '10px' }}>Uploads in progress...</span>}
// //                                 </span>
// //                                 <button className="ap-btn" style={{ background: '#d97706', color: 'white' }} onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}>
// //                                     <Save size={14} /> Acknowledge & Submit for Grading
// //                                 </button>
// //                             </div>
// //                         </div>
// //                     ) : !isLocked ? (
// //                         <div className="ap-footer">
// //                             <h3 className="ap-footer__title">Final Submission</h3>
// //                             <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
// //                             <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// //                                 <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// //                                 <span className="ap-footer-declaration__text">
// //                                     <strong>Learner Final Declaration</strong>
// //                                     I confirm that this is my own work, completed without unauthorized assistance.
// //                                 </span>
// //                             </label>
// //                             <div className="ap-footer-actions">
// //                                 <span className="ap-autosave-label">
// //                                     {saving
// //                                         ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</>
// //                                         : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>
// //                                     }
// //                                     {Object.keys(uploadProgress).length > 0 && <span style={{ color: 'var(--mlab-blue)', fontWeight: 'bold', marginLeft: '10px' }}>Uploads in progress...</span>}
// //                                 </span>
// //                                 <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}>
// //                                     <Save size={14} /> Submit for Grading
// //                                 </button>
// //                             </div>
// //                         </div>
// //                     ) : (
// //                         <div className="ap-footer ap-footer--locked no-print">
// //                             <div className="ap-footer--locked__icon-wrap">
// //                                 {isModDone && outcome?.isCompetent === false ? (
// //                                     <AlertTriangle size={36} color="#d97706" />
// //                                 ) : (
// //                                     <CheckCircle size={36} color="var(--mlab-green)" />
// //                                 )}
// //                             </div>

// //                             {/* 🚀 MAX ATTEMPTS LOCKOUT VS STANDARD REMEDIATION */}
// //                             {isModDone && outcome?.isCompetent === false ? (
// //                                 <>
// //                                     <h3 className="ap-footer--locked__title" style={{ color: '#d97706' }}>
// //                                         Assessment Outcome: Not Yet Competent (NYC)
// //                                     </h3>
// //                                     <div style={{ textAlign: 'left', maxWidth: '600px', margin: '1rem auto', background: '#fffbeb', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
// //                                         <p style={{ margin: '0 0 1rem 0', color: '#92400e', fontSize: '0.9rem', lineHeight: '1.5' }}>
// //                                             Your assessment has been fully verified. At this stage, you have not yet met all the requirements for competency.
// //                                         </p>

// //                                         {(submission.attemptNumber || 1) >= 3 ? (
// //                                             <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '1rem', borderRadius: '6px' }}>
// //                                                 <h4 style={{ color: '#b91c1c', margin: '0 0 0.5rem 0', fontSize: '0.9rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                                     <ShieldAlert size={16} /> Maximum Attempts Reached
// //                                                 </h4>
// //                                                 <p style={{ margin: 0, color: '#991b1b', fontSize: '0.85rem', lineHeight: '1.5' }}>
// //                                                     You have exhausted all 3 permitted attempts for this assessment. Under QCTO regulations, this workbook is now permanently locked. You must re-enroll in the module to try again, or you may lodge a formal appeal if you disagree with the assessment outcome.
// //                                                 </p>
// //                                             </div>
// //                                         ) : (
// //                                             <>
// //                                                 <h4 style={{ color: '#b45309', margin: '0 0 0.5rem 0', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>What happens next?</h4>
// //                                                 <ol style={{ color: '#92400e', fontSize: '0.85rem', lineHeight: '1.6', paddingLeft: '1.25rem', margin: '0 0 1rem 0' }}>
// //                                                     <li><strong>Review Feedback:</strong> Please scroll up and review the Assessor's Red Pen feedback on your incorrect answers.</li>
// //                                                     <li><strong>Coaching:</strong> Your facilitator will schedule a brief intervention with you to discuss the feedback and guide you.</li>
// //                                                     <li><strong>Remediation:</strong> Following the coaching session, your facilitator will unlock this workbook so you can correct your answers and resubmit (Attempt {submission.attemptNumber ? submission.attemptNumber + 1 : 2} of 3).</li>
// //                                                 </ol>
// //                                                 <p style={{ margin: 0, color: '#b45309', fontSize: '0.75rem', fontStyle: 'italic' }}>
// //                                                     Academic Rights: If you strongly disagree with this outcome after reviewing the feedback, you have the right to lodge a formal appeal with your training provider.
// //                                                 </p>
// //                                             </>
// //                                         )}
// //                                     </div>
// //                                 </>
// //                             ) : (
// //                                 <>
// //                                     <h3 className="ap-footer--locked__title">
// //                                         {submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}
// //                                     </h3>
// //                                     <p className="ap-footer--locked__desc">
// //                                         This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>.{' '}
// //                                         {isAssDone ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}
// //                                     </p>
// //                                 </>
// //                             )}

// //                             <button className="ap-btn ap-btn--primary" onClick={() => navigate(-1)}>
// //                                 <ArrowLeft size={14} /> Return to Portfolio
// //                             </button>
// //                         </div>
// //                     )}

// //                     {/* 🚀 PRINT-ONLY SIGNATURE BLOCKS 🚀 */}
// //                     {isLocked && !isAwaitingSignoff && (
// //                         <div className="print-only ap-signature-blocks">
// //                             <div className="ap-sig-box">
// //                                 <span className="ap-sig-box__label">Learner Declaration</span>
// //                                 <div className="ap-sig-box__img-wrap">
// //                                     {learnerProfile?.signatureUrl
// //                                         ? <img src={learnerProfile.signatureUrl} alt="Learner signature" />
// //                                         : <span className="ap-sig-box__no-sig">No signature on file</span>
// //                                     }
// //                                 </div>
// //                                 <span className="ap-sig-box__name">{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}</span>
// //                                 <span className="ap-sig-box__date"><Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}</span>
// //                             </div>

// //                             {isFacDone && (
// //                                 <div className="ap-sig-box" style={{ borderTopColor: '#3b82f6' }}>
// //                                     <span className="ap-sig-box__label" style={{ color: '#3b82f6' }}>{assessment?.moduleType === 'workplace' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</span>
// //                                     <div className="ap-sig-box__img-wrap">
// //                                         {facilitatorProfile?.signatureUrl
// //                                             ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" />
// //                                             : <span className="ap-sig-box__no-sig" style={{ color: '#3b82f6' }}>No signature on file</span>
// //                                         }
// //                                     </div>
// //                                     <span className="ap-sig-box__name" style={{ color: '#3b82f6' }}>{submission.grading?.facilitatorName || 'Facilitator'}</span>
// //                                     <span className="ap-sig-box__date" style={{ color: '#3b82f6' }}><Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
// //                                     {submission.grading?.facilitatorOverallFeedback && (
// //                                         <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', fontSize: '0.8rem', color: '#475569', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
// //                                             <strong style={{ color: '#0284c7' }}>Overall Comments:</strong><br />
// //                                             {submission.grading.facilitatorOverallFeedback}
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             )}

// //                             {isAssDone && (
// //                                 <div className="ap-sig-box" style={{ borderTopColor: 'var(--mlab-red)' }}>
// //                                     <span className="ap-sig-box__label" style={{ color: 'var(--mlab-red)' }}>Assessor Verification</span>
// //                                     <div className="ap-sig-box__img-wrap">
// //                                         {assessorProfile?.signatureUrl
// //                                             ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
// //                                             : <span className="ap-sig-box__no-sig" style={{ color: 'var(--mlab-red)' }}>No signature on file</span>
// //                                         }
// //                                     </div>
// //                                     <span className="ap-sig-box__name" style={{ color: 'var(--mlab-red)' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</span>
// //                                     <span className="ap-sig-box__reg" style={{ color: 'var(--mlab-red)' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</span>
// //                                     <span className="ap-sig-box__date" style={{ color: 'var(--mlab-red)' }}><Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
// //                                     {(submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
// //                                         <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', fontSize: '0.8rem', color: '#475569', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
// //                                             <strong style={{ color: 'var(--mlab-red)' }}>Overall Comments:</strong><br />
// //                                             {submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             )}

// //                             {isModDone && (
// //                                 <div className="ap-sig-box" style={{ borderTopColor: 'var(--mlab-green)' }}>
// //                                     <span className="ap-sig-box__label" style={{ color: 'var(--mlab-green)' }}>Internal Moderation QA</span>
// //                                     <div className="ap-sig-box__img-wrap">
// //                                         {moderatorProfile?.signatureUrl
// //                                             ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
// //                                             : <span className="ap-sig-box__no-sig" style={{ color: 'var(--mlab-green)' }}>No signature on file</span>
// //                                         }
// //                                     </div>
// //                                     <span className="ap-sig-box__name" style={{ color: 'var(--mlab-green)' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</span>
// //                                     <span className="ap-sig-box__reg" style={{ color: 'var(--mlab-green)' }}>Outcome: {submission.moderation?.outcome}</span>
// //                                     <span className="ap-sig-box__date" style={{ color: 'var(--mlab-green)' }}><Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:MM') : 'Completed'}</span>
// //                                     {submission.moderation?.feedback && (
// //                                         <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', fontSize: '0.8rem', color: '#475569', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
// //                                             <strong style={{ color: 'var(--mlab-green)' }}>Overall Comments:</strong><br />
// //                                             {submission.moderation.feedback}
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}
// //                 </div> {/* Close ap-player-content */}

// //                 {/* ── RIGHT AUDIT SIDEBAR ── */}
// //                 {isLocked && !isAwaitingSignoff && (
// //                     <aside className="ap-right-sidebar no-print">
// //                         <h3 className="ap-right-sidebar__title">
// //                             <ShieldCheck size={16} color="#073f4e" /> Official Audit Trail
// //                         </h3>

// //                         <div className="ap-audit-card">
// //                             <span className="ap-audit-card__label">Learner Declaration</span>
// //                             <div className="ap-audit-card__sig-wrap">
// //                                 {learnerProfile?.signatureUrl
// //                                     ? <img src={learnerProfile.signatureUrl} alt="Learner signature" />
// //                                     : <span className="ap-audit-card__sig-placeholder">No signature on file</span>
// //                                 }
// //                             </div>
// //                             <span className="ap-audit-card__name">
// //                                 {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}
// //                             </span>
// //                             <span className="ap-audit-card__sub">
// //                                 <Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}
// //                             </span>
// //                         </div>

// //                         {outcome ? (
// //                             <div className="ap-audit-outcome" style={{ borderLeftColor: outcome.color }}>
// //                                 <div className="ap-audit-outcome__label" style={{ color: outcome.color }}>{outcome.label}</div>
// //                                 {outcome.score !== undefined && (
// //                                     <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>
// //                                         Score: {outcome.score} / {assessment.totalMarks} ({outcome.percentage}%)
// //                                     </div>
// //                                 )}
// //                                 <div className="ap-audit-outcome__note">{outcome.subtext}</div>
// //                             </div>
// //                         ) : (
// //                             <div className="ap-audit-card" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', textAlign: 'center', padding: '1.5rem' }}>
// //                                 <Clock size={24} color="#94a3b8" style={{ margin: '0 auto 0.5rem' }} />
// //                                 <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold' }}>Pending Outcome</span>
// //                                 <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Your workbook is currently being evaluated.</span>
// //                             </div>
// //                         )}

// //                         {isFacDone && (
// //                             <div className="ap-audit-card" style={{ borderTopColor: '#3b82f6' }}>
// //                                 <span className="ap-audit-card__label" style={{ color: '#3b82f6' }}>{assessment?.moduleType === 'workplace' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</span>
// //                                 <div className="ap-audit-card__sig-wrap">
// //                                     {facilitatorProfile?.signatureUrl
// //                                         ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color={'blue'} />
// //                                         : <span className="ap-audit-card__sig-placeholder" style={{ color: '#3b82f6' }}>No signature on file</span>
// //                                     }
// //                                 </div>
// //                                 <span className="ap-audit-card__name" style={{ color: '#3b82f6' }}>
// //                                     {submission.grading?.facilitatorName || 'Facilitator'}
// //                                 </span>
// //                                 <span className="ap-audit-card__sub" style={{ color: '#3b82f6' }}>
// //                                     <Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
// //                                 </span>
// //                             </div>
// //                         )}

// //                         {isAssDone && (
// //                             <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-red)' }}>
// //                                 <span className="ap-audit-card__label" style={{ color: 'var(--mlab-red)' }}>Assessor Verification</span>
// //                                 <div className="ap-audit-card__sig-wrap">
// //                                     {assessorProfile?.signatureUrl
// //                                         ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// //                                         : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-red)' }}>No signature on file</span>
// //                                     }
// //                                 </div>
// //                                 <span className="ap-audit-card__name" style={{ color: 'var(--mlab-red)' }}>
// //                                     {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
// //                                 </span>
// //                                 <span className="ap-audit-card__reg" style={{ color: 'var(--mlab-red)' }}>
// //                                     Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
// //                                 </span>
// //                                 <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-red)' }}>
// //                                     <Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
// //                                 </span>
// //                             </div>
// //                         )}

// //                         {isModDone && (
// //                             <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-green)' }}>
// //                                 <span className="ap-audit-card__label" style={{ color: 'var(--mlab-green)' }}>Internal Moderation QA</span>
// //                                 <div className="ap-audit-card__sig-wrap">
// //                                     {moderatorProfile?.signatureUrl
// //                                         ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
// //                                         : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-green)' }}>No canvas signature on file</span>
// //                                     }
// //                                 </div>
// //                                 <span className="ap-audit-card__name" style={{ color: 'var(--mlab-green)' }}>
// //                                     {moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}
// //                                 </span>
// //                                 <span className="ap-audit-card__reg" style={{ color: 'var(--mlab-green)' }}>
// //                                     Outcome: {submission.moderation?.outcome}
// //                                 </span>
// //                                 <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-green)' }}>
// //                                     <Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:MM') : 'Completed'}
// //                                 </span>
// //                             </div>
// //                         )}
// //                     </aside>
// //                 )}
// //             </div> {/* Close ap-player-body */}
// //         </div>
// //     );
// // };

// // /* ── Confirm Modal ────────────────────────────────────────────────────────── */
// // const ConfirmModal: React.FC<{
// //     title: string; message: string; confirmText: string; cancelText: string;
// //     onConfirm: () => void; onCancel: () => void;
// // }> = ({ title, message, confirmText, cancelText, onConfirm, onCancel }) => {
// //     useEffect(() => {
// //         const style = document.createElement('style');
// //         style.innerHTML = `body, html { overflow: hidden !important; } .ap-player, .ap-player-body { overflow: hidden !important; }`;
// //         document.head.appendChild(style);
// //         return () => { document.head.removeChild(style); };
// //     }, []);

// //     const modalContent = (
// //         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(5,46,58,0.7)', backdropFilter: 'blur(3px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', margin: 0 }}>
// //             <div className="ap-animate" style={{ background: 'white', maxWidth: '420px', width: '100%', textAlign: 'center', padding: 0, boxShadow: '0 24px 48px -8px rgba(5,46,58,0.35)', border: '1px solid var(--mlab-border)', borderTop: '5px solid var(--mlab-blue)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
// //                 <div style={{ padding: '2rem 2rem 1.25rem', borderBottom: '1px solid var(--mlab-border)' }}>
// //                     <div style={{ width: 56, height: 56, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}><AlertTriangle size={28} color="#d97706" /></div>
// //                     <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>{title}</h2>
// //                     <p style={{ color: 'var(--mlab-grey)', lineHeight: '1.65', margin: 0, fontSize: '0.9rem' }}>{message}</p>
// //                 </div>
// //                 <div style={{ display: 'flex' }}>
// //                     <button onClick={onCancel} style={{ flex: 1, padding: '1rem', border: 'none', borderRight: '1px solid var(--mlab-border)', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{cancelText}</button>
// //                     <button onClick={onConfirm} style={{ flex: 1, padding: '1rem', border: 'none', background: 'var(--mlab-blue)', color: 'white', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{confirmText}</button>
// //                 </div>
// //             </div>
// //         </div>
// //     );
// //     return createPortal(modalContent, document.body);
// // };

// // export default AssessmentPlayer;

