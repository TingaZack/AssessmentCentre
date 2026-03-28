// src/components/views/AssessmentPlayer/AssessmentPlayer.tsx

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
    Briefcase, Menu, FileArchive, Video
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import moment from 'moment';
import './AssessmentPlayer.css';
import { createPortal } from 'react-dom';

import { TintedSignature } from '../../../components/common/TintedSignature';
import { UploadProgress } from '../../../components/common/UploadProgress';
import { FilePreview } from '../../../components/common/FilePreview';
import { UrlPreview } from '../../../components/common/UrlPreview';
import { ConfirmModal } from '../../../components/common/ConfirmModal';

import mLabLogo from '../../../assets/logo/mlab_logo.png';
import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';

const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] };
const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

/* ─── APPEAL MODAL ─────────────────────────────────────────────────────────── */
const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    useEffect(() => {
        const s = document.createElement('style');
        s.innerHTML = 'body,html{overflow:hidden!important}';
        document.head.appendChild(s);
        return () => { document.head.removeChild(s); };
    }, []);
    return createPortal(
        <div className="ap-modal">
            <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
                <div className="ap-modal-header ap-modal-header--danger">
                    <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
                    <div>
                        <h2 className="ap-modal-title">Lodge Formal Appeal</h2>
                        <p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p>
                    </div>
                </div>
                <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
                    <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
                    <div className="ap-form-group">
                        <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
                        <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
                    </div>
                    <div className="ap-modal-footer">
                        <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
                        <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

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
    const [showAppealModal, setShowAppealModal] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [timeOffset, setTimeOffset] = useState<number>(0);

    const currentStatus = String(submission?.status || '').toLowerCase();
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
    const isLocked = isSubmitted || isAwaitingSignoff;
    const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';


    // Fallback for older assessments + explicitly check the toggle
    const isInvigilationEnabled = assessment?.requiresInvigilation !== undefined
        ? assessment.requiresInvigilation
        : !isPracticalModule;

    // Check if this session qualifies for strict live proctoring
    const willBeProctored = isInvigilationEnabled && !isLocked;

    // Rock-Solid Academic Integrity Handler (Captures Clipboard & Keyboard events)
    const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent) => {
        // ONLY applies to active Knowledge Modules. Lets Practical/Workplace operate freely.
        if (!isLocked && !isPracticalModule) {
            if (e.type === 'keydown') {
                const keyEvent = e as React.KeyboardEvent;
                if ((keyEvent.ctrlKey || keyEvent.metaKey) && ['c', 'v', 'x'].includes(keyEvent.key.toLowerCase())) {
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    if (keyEvent.nativeEvent?.stopImmediatePropagation) {
                        keyEvent.nativeEvent.stopImmediatePropagation();
                    }
                    // Uses your exact Toast hook syntax for a 15-second duration
                    toast.warning("Keyboard shortcuts for Copy/Paste are disabled on Knowledge Modules.", 1500);

                    // Tell the Proctoring Wrapper to snap a photo and lock the screen
                    document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to use Copy/Paste keyboard shortcuts." }));
                }
            } else {
                e.preventDefault();
                e.stopPropagation();
                if (e.nativeEvent?.stopImmediatePropagation) {
                    e.nativeEvent.stopImmediatePropagation();
                }
                toast.warning("Copying, pasting, and dropping content is disabled to ensure academic integrity.", 15000);

                // Tell the Proctoring Wrapper to snap a photo and lock the screen
                document.dispatchEvent(new CustomEvent('proctorViolation', { detail: "Academic Integrity Warning: Learner attempted to Paste or Drop external content into the assessment." }));
            }
        }
    };
    // // 🚀 FIXED: Rock-Solid Academic Integrity Handler (Captures Clipboard & Keyboard events)
    // const preventCopyPasteAndDrop = (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent) => {
    //     // ONLY applies to active Knowledge Modules. Lets Practical/Workplace operate freely.
    //     if (!isLocked && !isPracticalModule) {
    //         if (e.type === 'keydown') {
    //             const keyEvent = e as React.KeyboardEvent;
    //             if ((keyEvent.ctrlKey || keyEvent.metaKey) && ['c', 'v', 'x'].includes(keyEvent.key.toLowerCase())) {
    //                 keyEvent.preventDefault();
    //                 keyEvent.stopPropagation();
    //                 if (keyEvent.nativeEvent?.stopImmediatePropagation) {
    //                     keyEvent.nativeEvent.stopImmediatePropagation(); // Kills Quill's internal listeners
    //                 }
    //                 toast.warning("Keyboard shortcuts for Copy/Paste are disabled on Knowledge Modules.", );
    //             }
    //         } else {
    //             e.preventDefault();
    //             e.stopPropagation();
    //             if (e.nativeEvent?.stopImmediatePropagation) {
    //                 e.nativeEvent.stopImmediatePropagation();
    //             }
    //             toast.warning("Copying, pasting, and dropping content is disabled to ensure academic integrity.");
    //         }
    //     }
    // };

    const workplaceInfo = useMemo(() => {
        if (!learnerEnrollment) return null;
        const employer = learnerEnrollment.employerId ? employers.find((e: any) => e.id === learnerEnrollment.employerId) : null;
        const mentor = learnerEnrollment.mentorId ? staff.find((s: any) => s.id === learnerEnrollment.mentorId) : null;
        return { employer, mentor };
    }, [learnerEnrollment, employers, staff]);

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
            score: activeLayer.score, isCorrect: activeLayer.isCorrect,
            facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
            assIsCorrect: aLayer.isCorrect, modIsCorrect: mLayer.isCorrect,
            feedback: activeLayer.feedback || '', facFeedback: fLayer.feedback || legacyLayer.feedback || '',
            assFeedback: aLayer.feedback || '', modFeedback: mLayer.feedback || '',
            criteriaResults: activeLayer.criteriaResults || [],
        };
    };

    const sectionTotals: Record<string, { total: number; awarded: number }> = {};
    let currentSectionId = '';
    if (assessment?.blocks) {
        assessment.blocks.forEach((block: any) => {
            if (block.type === 'section') { currentSectionId = block.id; sectionTotals[currentSectionId] = { total: 0, awarded: 0 }; }
            else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type) && currentSectionId) {
                const { score } = getBlockGrading(block.id);
                sectionTotals[currentSectionId].total += Number(block.marks) || 0;
                if (score !== undefined && score !== null) sectionTotals[currentSectionId].awarded += Number(score);
            }
        });
    }

    const savedFacRole = submission?.grading?.facilitatorRole || null;

    const getCompetencyStatus = () => {
        if (!isAssDone) return null;
        if (isRemediation && !isLocked) return null;
        const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
        let isCompetent = compStr === 'c' || compStr === 'competent';
        const actualScore = submission?.marks !== undefined ? submission.marks : submission?.totalScore;
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

    useEffect(() => {
        const fetchOffset = async () => {
            try { const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC'); const data = await res.json(); setTimeOffset(new Date(data.utc_datetime).getTime() - Date.now()); } catch { setTimeOffset(0); }
        };
        fetchOffset();
    }, []);
    const getSecureNow = () => Date.now() + timeOffset;

    useEffect(() => {
        if (employers.length === 0) fetchEmployers();
        if (staff.length === 0) fetchStaff();
        const load = async () => {
            if (!user?.uid || !assessmentId) return;
            if (user.role && user.role !== 'learner') { setIsAdminIntercept(true); setLoading(false); return; }
            try {
                const assSnap = await getDoc(doc(db, 'assessments', assessmentId));
                if (!assSnap.exists()) { toast.error('Assessment template not found.'); setLoading(false); return; }
                const assData = assSnap.data(); setAssessment(assData);
                const learnersRef = collection(db, 'learners');
                let actualLearnerDocId = '', activeCohortId = '';
                const authSnap = await getDocs(query(learnersRef, where('authUid', '==', user.uid)));
                if (!authSnap.empty) { actualLearnerDocId = authSnap.docs[0].id; activeCohortId = authSnap.docs[0].data().cohortId; }
                else {
                    const emailSnap = await getDocs(query(learnersRef, where('email', '==', user.email)));
                    if (emailSnap.empty) { toast.error('Learner profile not found.'); setLoading(false); return; }
                    actualLearnerDocId = emailSnap.docs[0].id; activeCohortId = emailSnap.docs[0].data().cohortId;
                }
                const userDocSnap = await getDoc(doc(db, 'users', user.uid));
                if (userDocSnap.exists()) setLearnerProfile(userDocSnap.data());
                const subQuery = query(collection(db, 'learner_submissions'), where('learnerId', '==', actualLearnerDocId), where('assessmentId', '==', assessmentId));
                const subSnap = await getDocs(subQuery);
                let activeSub: any = null;
                if (!subSnap.empty) {
                    const cohortMatch = subSnap.docs.find(d => d.data().cohortId === activeCohortId);
                    activeSub = cohortMatch ? { id: cohortMatch.id, ...cohortMatch.data() } : subSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
                }
                if (activeSub) {
                    setSubmission(activeSub); setAnswers(activeSub.answers || {});
                    if (activeSub.enrollmentId) { const e = await getDoc(doc(db, 'enrollments', activeSub.enrollmentId)); if (e.exists()) setLearnerEnrollment(e.data()); }
                    if (activeSub.grading?.gradedBy) { const s = await getDoc(doc(db, 'users', activeSub.grading.gradedBy)); if (s.exists()) setAssessorProfile(s.data()); }
                    if (activeSub.moderation?.moderatedBy) { const s = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy)); if (s.exists()) setModeratorProfile(s.data()); }
                    const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
                    if (facId) { const s = await getDoc(doc(db, 'users', facId)); if (s.exists()) setFacilitatorProfile(s.data()); }
                    const _isAppealUpheld = activeSub.appeal?.status === 'upheld';
                    const _needsGate = (activeSub.attemptNumber || 1) > 1 && activeSub.latestCoachingLog && !activeSub.latestCoachingLog.acknowledged && !_isAppealUpheld;
                    const isPrac = assData.moduleType === 'practical' || assData.moduleType === 'workplace';
                    if (!isPrac && activeSub.status === 'in_progress' && assData.moduleInfo?.timeLimit > 0 && !_needsGate) {
                        const start = new Date(activeSub.startedAt).getTime();
                        const end = start + assData.moduleInfo.timeLimit * 60 * 1000;
                        const rem = Math.max(0, Math.floor((end - getSecureNow()) / 1000));
                        setTimeLeft(rem);
                        if (rem === 0) forceAutoSubmit(activeSub.id, activeSub.answers || {});
                    }
                } else { toast.error('You are not assigned to this assessment in your current class.'); }
            } catch (err) { console.error(err); toast.error('Failed to load assessment data.'); }
            finally { setLoading(false); }
        };
        if (timeOffset !== null) load();
    }, [assessmentId, user?.uid, timeOffset]);

    useEffect(() => {
        if (isPracticalModule || timeLeft === null || isLocked || showGate) return;
        if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
        const id = setInterval(() => {
            const start = new Date(submission.startedAt).getTime();
            const end = start + assessment.moduleInfo.timeLimit * 60 * 1000;
            setTimeLeft(Math.max(0, Math.floor((end - getSecureNow()) / 1000)));
        }, 1000);
        return () => clearInterval(id);
    }, [timeLeft, isLocked, showGate, submission?.startedAt, isPracticalModule]);

    const formatTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`; };

    const handleStartAssessment = async () => {
        if (!startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)) return;
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
            triggerAutoSave(n); return n;
        });
    };

    const handleFileUpload = (file: File, blockId: string, nestedKey?: string) => {
        if (!file) return;
        const pKey = nestedKey ? `${blockId}_${nestedKey}` : blockId;
        setUploadProgress(p => ({ ...p, [pKey]: 0 })); setSaving(true); toast.info(`Uploading ${file.name}…`);
        try {
            const storage = getStorage();
            const ref = fbStorageRef(storage, `evidence/${submission.id}/${blockId}_${Date.now()}_${file.name}`);
            const task = uploadBytesResumable(ref, file);
            task.on('state_changed',
                snap => setUploadProgress(p => ({ ...p, [pKey]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
                err => {
                    console.error(err); toast.warning('Upload failed. Logging filename as fallback.');
                    if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', file.name);
                    else handleTaskAnswerChange(blockId, 'uploadUrl', file.name);
                    setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; }); setSaving(false);
                },
                async () => {
                    const url = await getDownloadURL(task.snapshot.ref);
                    if (nestedKey) handleNestedAnswerChange(blockId, nestedKey, 'uploadUrl', url);
                    else handleTaskAnswerChange(blockId, 'uploadUrl', url);
                    toast.success(`Uploaded: ${file.name}`);
                    setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; }); setSaving(false);
                }
            );
        } catch { toast.error("Upload failed."); setUploadProgress(p => { const n = { ...p }; delete n[pKey]; return n; }); setSaving(false); }
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
                        if (!has) return { valid: false, message: `Please provide evidence for ${se.code} in ${wa.code}.` };
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
        setShowSubmitConfirm(false); setSaving(true);
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

    const executeAppeal = async (reason: string) => {
        setShowAppealModal(false); setSaving(true);
        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), { status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' }, lastStaffEditAt: new Date().toISOString() });
            toast.success("Formal appeal lodged successfully.");
            setSubmission((p: any) => ({ ...p, status: 'appealed', appeal: { reason, date: new Date().toISOString(), status: 'pending' } }));
        } catch { toast.error("Failed to lodge appeal."); } finally { setSaving(false); }
    };

    /* ── Full-screen loading states ── */
    if (loading) return (
        <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
            <div className="ap-loading-inner"><div className="ap-spinner" /><span className="ap-loading-inner__label">Loading Assessment…</span></div>
        </div>
    );
    if (isAdminIntercept) return (
        <div className="ap-fullscreen">
            <div className="ap-state-card">
                <div className="ap-state-card__icon-wrap"><ShieldAlert size={32} color="var(--mlab-blue)" /></div>
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
                <div className="ap-state-card__icon-wrap ap-state-card__icon-wrap--dim"><AlertCircle size={32} color="var(--mlab-grey)" /></div>
                <h2 className="ap-state-card__title">Assessment Unavailable</h2>
                <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Contact your facilitator if you believe this is an error.</p>
                <div className="ap-state-card__actions"><button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button></div>
            </div>
        </div>
    );

    /* ═══════════════════════════════════════════════════════════════════════════
       GATE SCREEN
    ═══════════════════════════════════════════════════════════════════════════ */
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
                        {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
                        {isAppealUpheld && <span className="ap-gate-appeal-badge">Appeal Granted</span>}
                    </h1>
                    <p className="ap-gate-left__sub">
                        {isAppealUpheld ? "A new attempt has been granted by the Academic Board following your successful appeal."
                            : isRemediation ? "This is a fresh attempt. Use the Facilitator's Coaching Notes below to correct your answers."
                                : "Read all instructions carefully before starting."}
                    </p>

                    {/* PROCTORING WARNING BANNER (Only on Knowledge Exams) */}
                    {willBeProctored && (
                        <div className="ap-workplace-banner " style={{ background: '#fff1f2', padding: 16, marginBottom: 16, borderColor: '#fecdd3', borderLeftColor: '#e11d48' }}>
                            <strong className="ap-workplace-banner__title ap-info-card__label" style={{ color: '#be123c', fontSize: 14 }}>
                                <ShieldAlert size={16} /> Secure Proctored Environment
                            </strong>
                            <p className="ap-workplace-banner__text" style={{ color: '#881337' }}>
                                This is a strictly invigilated assessment. You will be required to grant <strong>Camera and Microphone</strong> permissions and complete the test in <strong>Fullscreen Mode</strong>. Exiting fullscreen or switching browser tabs will immediately log a security violation to your Assessor.
                            </p>
                        </div>
                    )}

                    {assessment?.isOpenBook && assessment?.referenceManualUrl && (
                        <div className="ap-openbook-banner" style={{ marginBottom: 16 }}>
                            <strong className="ap-openbook-banner__title ap-info-card__label" style={{ textTransform: 'uppercase', color: 'whitesmoke', fontSize: 14 }}><FileArchive size={16} /> Open Book Assessment</strong>
                            <p className="ap-openbook-banner__text">This is an open-book assessment. An official Reference Manual has been provided by your facilitator. You can access it inside the player at any time.</p>
                        </div>
                    )}

                    {assessment?.moduleType === 'workplace' && (
                        <div className="ap-workplace-banner">
                            <strong className="ap-workplace-banner__title"><Briefcase size={16} /> Workplace Experience Logbook</strong>
                            <p className="ap-workplace-banner__text">This module is a <strong>Learner Logbook</strong>. It tracks and verifies your real-world workplace experience. You will map tasks to specific Work Activities (WA), record your hours, and upload Supporting Evidence (SE) for review by your designated Workplace Mentor.</p>
                        </div>
                    )}

                    {needsRemediationGate && (
                        <div className="ap-coaching-log">
                            <strong className="ap-coaching-log__title"><MessageSquare size={16} /> Remediation Coaching Log</strong>
                            <p className="ap-coaching-log__desc">Before beginning Attempt #{submission.attemptNumber}, QCTO compliance requires you to acknowledge the feedback session conducted by your facilitator.</p>
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
                        {!isWorkplaceModule
                            ? <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Total Marks</div><div className="ap-info-card__value">{assessment.totalMarks}</div><div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div></div>
                            : <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Grading</div><div className="ap-info-card__value">C / NYC</div><div className="ap-info-card__sub">Competency-based. No numerical score.</div></div>}
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

                        {/* 🚀 PROCTORING RULE IN THE CHECKLIST */}
                        {willBeProctored && (
                            <li className="ap-rule-item">
                                <div className="ap-rule-icon" style={{ background: '#fff1f2', color: '#e11d48' }}><Video size={18} /></div>
                                <div>
                                    <span className="ap-rule-title" style={{ color: '#be123c' }}>Live Invigilation</span>
                                    <p className="ap-rule-desc">Your webcam and screen activity are actively monitored. Tab-switching is disabled.</p>
                                </div>
                            </li>
                        )}

                        <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or unauthorized AI tools violate QCTO guidelines.</p></div></li>
                        <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly a group project, no collaboration is permitted.</p></div></li>
                        <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
                        {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser. Plan your time carefully.</p></div></li>}
                    </ul>
                    <div className="ap-declaration">
                        <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
                            <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
                            <span className="ap-declaration-check__text"><strong>Declaration of Authenticity</strong> I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.</span>
                        </label>
                        <button className={`ap-start-btn${(startDeclarationChecked && (!needsRemediationGate || coachingAckChecked)) ? ' ap-start-btn--ready' : ''}`} onClick={handleStartAssessment} disabled={saving || !startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)}>
                            {saving ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> {needsRemediationGate ? `Acknowledge & Resume Attempt #${submission.attemptNumber}` : 'I Agree, Begin Assessment'}</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    /* ═══════════════════════════════════════════════════════════════════════
       PLAYER SCREEN
    ═══════════════════════════════════════════════════════════════════════ */
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
        <ProctoringWrapper
            assessmentId={assessmentId || ''}
            learnerId={user?.uid || ''}
            isProctored={willBeProctored}
        >

            <div className="ap-player ap-animate">
                <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

                {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

                {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)} />}
                {showSubmitConfirm && <ConfirmModal title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"} message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."} confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"} cancelText="Go Back" onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}
                {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

                {/* ── TOP BAR ── */}
                <div className="ap-player-topbar no-print">
                    <div className="ap-player-topbar__left">
                        <button className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
                        <button className="ap-player-topbar__back" onClick={handleNavigationLeave}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
                        <div className="ap-player-topbar__separator ap-hide-mobile" />
                        <h1 className="ap-player-topbar__title">
                            {assessment.title}
                            {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
                        </h1>
                    </div>
                    <div className="ap-player-topbar__right">
                        {assessment?.isOpenBook && assessment?.referenceManualUrl && (
                            <button className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}>
                                <FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span>
                            </button>
                        )}
                        {isLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
                        {!isLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
                        {!isLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
                        <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>
                            {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}
                        </span>
                        <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
                    </div>
                </div>

                {/* ── BODY ── */}
                <div className={`ap-player-body${isLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>

                    {/* ── LEFT SIDEBAR ── */}
                    <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
                        <button className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
                        <div className="ap-sidebar__meta-block">
                            <div className="ap-sidebar__meta-title">{assessment.title}</div>
                            {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
                            <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
                            {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
                            {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
                        </div>

                        {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
                            <>
                                <div className="ap-sidebar__label">Status Tracking</div>
                                <div className="ap-sidebar__status-box">
                                    {isAssDone && outcome ? (
                                        <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
                                            <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
                                            {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
                                            {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
                                            <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
                                        </div>
                                    ) : (
                                        <div className="ap-sidebar__awaiting">
                                            <Clock size={20} color="rgba(255,255,255,0.25)" />
                                            <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
                                            <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
                                        </div>
                                    )}
                                    {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
                                    {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
                                    {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

                                    {/* APPEAL RESOLUTION FEEDBACK IN LEFT SIDEBAR */}
                                    {submission?.appeal?.status && submission.appeal.status !== 'pending' && (
                                        <div className="ap-sidebar__feedback" style={{ background: submission.appeal.status === 'upheld' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)', borderLeftColor: submission.appeal.status === 'upheld' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)' }}>
                                            <strong className="ap-sidebar__feedback__heading" style={{ color: submission.appeal.status === 'upheld' ? '#4ade80' : '#ef4444' }}>
                                                <Scale size={11} /> Board Appeal {submission.appeal.status === 'upheld' ? 'Granted' : 'Rejected'}
                                            </strong>
                                            <p className="ap-sidebar__feedback__text" style={{ color: submission.appeal.status === 'upheld' ? '#4ade80' : '#ef4444' }}>
                                                "{submission.appeal.resolutionNotes}"
                                            </p>
                                        </div>
                                    )}

                                    <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">{savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? (savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator') : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div></div>
                                    <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
                                    <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>
                                </div>
                            </>
                        )}

                        <div className="ap-sidebar__label">Workbook Contents</div>
                        <div className="ap-sidebar__nav">
                            {navItems.map((item: any) =>
                                item.type === 'section'
                                    ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
                                    : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
                            )}
                        </div>
                    </nav>

                    {/* ── CONTENT ── */}
                    <div className="ap-player-content print-pane">

                        {/* Print cover */}
                        {isLocked && !isAwaitingSignoff && (
                            <div className="print-only-cover">
                                <div className="print-page print-page--cover">
                                    <div className="print-cover__logo-bar">
                                        <img height={50} src={mLabLogo} alt="Institution Logo" />
                                        <span className="print-cover__doc-type">Official Assessment Workbook</span>
                                    </div>
                                    <div className="print-cover__title-block">
                                        <h1 className="print-cover__module-title">
                                            {assessment?.moduleInfo?.moduleName || assessment?.title}
                                        </h1>
                                        <div className="print-cover__meta-chips">
                                            <span className="print-cover__chip">NQF Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</span>
                                            <span className="print-cover__chip">Credits: {assessment?.moduleInfo?.credits || 'N/A'}</span>
                                            <span className="print-cover__chip">Hours: {assessment?.moduleInfo?.notionalHours || 'N/A'}</span>
                                            {submission?.attemptNumber > 1 && <span className="print-cover__chip print-cover__chip--attempt">Attempt #{submission.attemptNumber}</span>}
                                        </div>
                                        <h2 className="print-cover__doc-subtitle">
                                            LEARNER {assessment?.moduleType === 'workplace' ? 'WORKPLACE LOGBOOK' : 'WORKBOOK'}
                                        </h2>
                                    </div>
                                    <div className="print-cover__tables">
                                        <div className="print-cover__table-group">
                                            <div className="print-cover__table-heading">MODULE INFORMATION</div>
                                            <table className="print-table">
                                                <tbody>
                                                    <tr><td className="print-table__label">Module Number</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Notional Hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Credits</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="print-cover__table-group">
                                            <div className="print-cover__table-heading">LEARNER CONTACT INFORMATION</div>
                                            <table className="print-table">
                                                <tbody>
                                                    <tr><td className="print-table__label">Full Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">ID Number</td><td>{submission?.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Email Address</td><td>{learnerProfile?.email || user?.email || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    {assessment?.moduleType === 'workplace' && workplaceInfo?.employer && (
                                        <div className="print-cover__table-group">
                                            <div className="print-cover__table-heading">WORKPLACE PLACEMENT DETAILS</div>
                                            <table className="print-table">
                                                <tbody>
                                                    <tr><td className="print-table__label">Host Company Name</td><td>{workplaceInfo.employer.name}</td></tr>
                                                    <tr><td className="print-table__label">Registration / SETA Number</td><td>{workplaceInfo.employer.registrationNumber || 'N/A'}</td></tr>
                                                    <tr><td className="print-table__label">Physical Address</td><td>{workplaceInfo.employer.physicalAddress || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Contact Person</td><td>{workplaceInfo.employer.contactPerson}</td></tr>
                                                    <tr><td className="print-table__label">Assigned Workplace Mentor</td><td>{workplaceInfo.mentor?.fullName || '________________________'}</td></tr>
                                                    <tr><td className="print-table__label">Mentor Contact</td><td>{workplaceInfo.mentor?.email || workplaceInfo.employer.contactEmail}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    <div className="print-cover__footer-bar">
                                        <span>Printed: {new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                        <span>Submission ID: {submission?.id?.slice(0, 12) || 'N/A'}</span>
                                    </div>
                                </div>

                                <div className="print-page print-page--instructions">
                                    <h2 className="print-section-heading">Note to the Learner</h2>
                                    <p className="print-body-text">{assessment?.instructions}</p>
                                    <h2 className="print-section-heading">Purpose of this Module</h2>
                                    <p className="print-body-text">{assessment?.purpose}</p>
                                    <h2 className="print-section-heading">Topic Elements Covered</h2>
                                    <table className="print-table print-table--topics">
                                        <thead>
                                            <tr>
                                                <th className="print-table__th">Section</th>
                                                <th className="print-table__th print-table__th--narrow">Weighting</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, i: number) => {
                                                const tot = sectionTotals[sec.id]?.total || 0;
                                                return (
                                                    <tr key={i}>
                                                        <td><strong>Section {i + 1}: </strong>{sec.title}</td>
                                                        <td className="print-table__td--center">
                                                            {isWorkplaceModule ? 'Competency Based' : (tot > 0 && assessment.totalMarks ? `${Math.round((tot / assessment.totalMarks) * 100)}%` : '—')}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Remediation record page */}
                                {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
                                    <div className="print-page print-page--remediation">
                                        <h2 className="print-section-heading">Record of Developmental Intervention (Remediation)</h2>
                                        <p className="print-body-text">Official evidence of a developmental intervention conducted prior to Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>
                                        <table className="print-table">
                                            <tbody>
                                                <tr><td className="print-table__label">Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
                                                <tr><td className="print-table__label">Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString('en-ZA')}</td></tr>
                                                <tr><td className="print-table__label">Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
                                                <tr><td className="print-table__label print-table__label--vtop">Coaching Notes</td><td className="print-table__td--prewrap">{submission.latestCoachingLog.notes}</td></tr>
                                            </tbody>
                                        </table>
                                        <div className="sr-signature-block print-sig-row">
                                            <div className="sr-sig-box sr-sig-box--fac">
                                                <span className="sr-sig-box__label sr-sig-box__label--fac">Facilitator Declaration</span>
                                                {facilitatorProfile?.signatureUrl
                                                    ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" />
                                                    : <div className="sr-sig-no-image">No Canvas Signature</div>}
                                                <strong className="sr-sig-box__name sr-sig-box__name--fac">{submission.latestCoachingLog.facilitatorName}</strong>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--fac">Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString('en-ZA')}</em>
                                                <div className="sr-sig-line sr-sig-line--fac">Coaching Conducted</div>
                                            </div>
                                            <div className="sr-sig-box sr-sig-box--learner">
                                                <span className="sr-sig-box__label sr-sig-box__label--learner">Learner Acknowledgement</span>
                                                {submission.latestCoachingLog.acknowledged ? (
                                                    <>
                                                        {learnerProfile?.signatureUrl
                                                            ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
                                                            : <div className="sr-sig-no-image">No Canvas Signature</div>}
                                                        <strong className="sr-sig-box__name sr-sig-box__name--learner">{learnerProfile?.fullName || user?.fullName}</strong>
                                                        <em className="sr-sig-box__meta sr-sig-box__meta--learner">Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString('en-ZA')}</em>
                                                        <div className="sr-sig-line sr-sig-line--learner">Intervention Received</div>
                                                    </>
                                                ) : (
                                                    <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span></div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {isLocked && !isAwaitingSignoff && (
                            <div className="ap-print-header">
                                <div className="ap-print-header__logo-row">
                                    <img height={50} src={mLabLogo} alt="Institution Logo" />
                                    <span className="ap-print-header__doc-label">Assessment Workbook — Official Record</span>
                                </div>
                                <div className="ap-print-header__row">
                                    <div className="ap-print-header__col">
                                        <p><strong>Learner:</strong> {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName}</p>
                                        <p><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber}</p>
                                        <p><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
                                    </div>
                                    <div className="ap-print-header__col ap-print-header__col--right">
                                        <p><strong>Submitted:</strong> {getSafeDate(submission.submittedAt)}</p>
                                        <p><strong>Status:</strong> {displayStatus}</p>
                                        {isAssDone && outcome && <p><strong>Outcome:</strong> {outcome.label}{!isWorkplaceModule && outcome.percentage ? ` (${outcome.percentage}%)` : ''}</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── BLOCKS ── */}
                        <div className="ap-blocks">
                            {assessment.blocks?.map((block: any) => {

                                /* Section */
                                if (block.type === 'section') {
                                    const totals = sectionTotals[block.id];
                                    return (
                                        <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
                                            <span>{block.title}</span>
                                            {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
                                            {block.content && <div className="quill-read-only-content ap-block-section__content" dangerouslySetInnerHTML={{ __html: block.content }} />}
                                        </div>
                                    );
                                }

                                /* Info */
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
                                    let inkColor = '#64748b';
                                    if (isModDone) inkColor = 'var(--mlab-green)';
                                    else if (isAssDone) inkColor = 'var(--mlab-red)';
                                    else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';
                                    const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
                                    const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);
                                    const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
                                    const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : `Q${qNum}.`;

                                    return (
                                        <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
                                            <div className="ap-block-question__header">
                                                <div className="ap-block-question__text-wrap">
                                                    <span className="ap-block-question__text">
                                                        <span className={`ap-block-type-chip ${typeChipClass}`}>{typeLabel}</span>
                                                        {block.question || block.title || (block.type === 'qcto_workplace' ? 'Workplace Checkpoint' : '')}
                                                    </span>
                                                    <div className="ap-grade-indicators">
                                                        {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac" title="Facilitator Pre-Mark">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
                                                        {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass" title="Assessor Grade">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
                                                        {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod" title="Moderator QA">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
                                                    </div>
                                                </div>
                                                <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
                                            </div>

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
                                                    <div
                                                        className={`ap-quill-wrapper${!canEditTask ? ' locked' : ''}`}
                                                        onCopyCapture={preventCopyPasteAndDrop}
                                                        onCutCapture={preventCopyPasteAndDrop}
                                                        onPasteCapture={preventCopyPasteAndDrop}
                                                        onDropCapture={preventCopyPasteAndDrop}
                                                        onKeyDownCapture={preventCopyPasteAndDrop}
                                                    >
                                                        <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder={!canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
                                                    </div>
                                                )}

                                                {/* TASK */}
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
                                                            {isPracticalModule && !isAwaitingSignoff && !isSubmitted && <div className="ap-evidence-lock-banner"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>}
                                                            <div className="ap-tab-bar no-print">
                                                                {taskTabs.map(t => <button key={t.id} className={`ap-tab${activeTabId === t.id ? ' ap-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={11} className="ap-tab__done" />}</button>)}
                                                            </div>
                                                            <div className="ap-tab-panel">
                                                                {activeTabId === 'text' && (
                                                                    <div
                                                                        className={`ap-quill-wrapper${!canEditTask ? ' locked' : ''}`}
                                                                        onCopyCapture={preventCopyPasteAndDrop}
                                                                        onCutCapture={preventCopyPasteAndDrop}
                                                                        onPasteCapture={preventCopyPasteAndDrop}
                                                                        onDropCapture={preventCopyPasteAndDrop}
                                                                        onKeyDownCapture={preventCopyPasteAndDrop}
                                                                    >
                                                                        <ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" />
                                                                    </div>
                                                                )}
                                                                {activeTabId === 'audio' && (learnerAns?.audioUrl ? <audio controls src={learnerAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{!canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
                                                                {activeTabId === 'url' && <div>{canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{learnerAns?.url && !canEditTask ? <UrlPreview url={learnerAns.url} /> : <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={!canEditTask} placeholder="https://…" />}</div>}
                                                                {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : learnerAns?.uploadUrl ? <FilePreview url={learnerAns.uploadUrl} onRemove={canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={!canEditTask} /> : <div className="ap-upload-empty">{!canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes})</p><input type="file" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id)} style={{ fontSize: '0.82rem' }} /></>}</div>)}
                                                                {activeTabId === 'code' && <textarea className="ap-code-textarea" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={!canEditTask} placeholder="Paste your code here…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* CHECKLIST */}
                                                {block.type === 'checklist' && (
                                                    <div className="ap-checklist">
                                                        <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item. Upload evidence for each if required below.</p>
                                                        {!isAwaitingSignoff && !isSubmitted && <div className="ap-checklist__lock-notice"><Lock size={14} /> Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</div>}
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
                                                                            <><span className={`ap-checklist__status-chip${res.status === 'C' ? ' ap-checklist__status-chip--c' : res.status === 'NYC' ? ' ap-checklist__status-chip--nyc' : ' ap-checklist__status-chip--pending'}`}>{res.status ? (savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')) : 'Not Graded'}</span>{res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}</>
                                                                        ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
                                                                    </div>
                                                                    {block.requireEvidencePerCriterion !== false && (
                                                                        <div className="ap-checklist__evidence-tabs">
                                                                            <div className="ap-checklist__tab-bar">
                                                                                {tabs.length > 0 ? tabs.map(t => <button key={t.id} className={`ap-checklist__tab${activeCtab === t.id ? ' ap-checklist__tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [cTabKey]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}</button>) : <div className="ap-checklist__no-evidence">No evidence provided.</div>}
                                                                            </div>
                                                                            {tabs.length > 0 && (
                                                                                <div className="ap-checklist__tab-panel">
                                                                                    {activeCtab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : critEv.uploadUrl ? <FilePreview url={critEv.uploadUrl} onRemove={canEditChecklist ? () => handleNestedAnswerChange(block.id, critKey, 'uploadUrl', '') : undefined} disabled={!canEditChecklist} /> : <input type="file" disabled={!canEditChecklist} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, critKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
                                                                                    {activeCtab === 'url' && (<div>{canEditChecklist && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{critEv.url && !canEditChecklist ? <UrlPreview url={critEv.url} /> : <input type="url" className="ab-input" value={critEv.url || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'url', e.target.value)} disabled={!canEditChecklist} placeholder="https://…" />}</div>)}
                                                                                    {activeCtab === 'code' && <textarea className="ap-code-textarea" rows={3} value={critEv.code || ''} onChange={e => handleNestedAnswerChange(block.id, critKey, 'code', e.target.value)} disabled={!canEditChecklist} placeholder="Paste code snippet…" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} />}
                                                                                    {activeCtab === 'text' && <div className={`ap-quill-wrapper${!canEditChecklist ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}><ReactQuill theme="snow" value={critEv.text || ''} onChange={c => handleNestedAnswerChange(block.id, critKey, 'text', c)} readOnly={!canEditChecklist} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" /></div>}
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
                                                                <tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{canEditLogbook && <th style={{ width: '40px' }}></th>}</tr>
                                                            </thead>
                                                            <tbody>
                                                                {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
                                                                    <tr key={i} className="ap-logbook__tbody">
                                                                        <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td ap-logbook__task-cell">
                                                                            <div className={`ap-quill-wrapper ap-quill-wrapper--logbook${!canEditLogbook ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
                                                                                <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={!canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />
                                                                            </div>
                                                                            {entry.uploadUrl && <FilePreview url={entry.uploadUrl} disabled />}
                                                                            {entry.url && <UrlPreview url={entry.url} />}
                                                                        </td>
                                                                        <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
                                                                        {canEditLogbook && <td className="ap-logbook__td"><button className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
                                                                    </tr>
                                                                ))}
                                                                {canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
                                                                <tr className="ap-logbook__totals-row">
                                                                    <td colSpan={4} className="ap-logbook__totals-label">Total Logged Hours:</td>
                                                                    <td className="ap-logbook__totals-val" style={(() => { const logged = (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0); return block.requiredHours && logged < block.requiredHours ? { color: '#dc2626', fontWeight: 'bold' } : {}; })()}>
                                                                        {(Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0)}
                                                                        {block.requiredHours && (Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, c: any) => acc + (Number(c.hours) || 0), 0) < block.requiredHours && <span className="ap-logbook__hours-warning">⚠ Required: {block.requiredHours} hrs</span>}
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
                                                        {block.weCode && <><span className="ap-workplace__we-label">Work Experience Module (WE Code):</span><span className="ap-workplace__we-code">{block.weCode} — {block.weTitle}</span></>}
                                                        {block.workActivities?.map((wa: any) => {
                                                            const waTask = learnerAns?.[`wa_${wa.id}_task`] || '';
                                                            const waDate = learnerAns?.[`wa_${wa.id}_date`] || new Date().toISOString().split('T')[0];
                                                            const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
                                                            return (
                                                                <div key={wa.id} className="ap-workplace__activity">
                                                                    <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>
                                                                    <div className="ap-workplace__fields">
                                                                        <div className="ap-workplace__field"><label className="ap-workplace__field-label">Task Performed</label><input type="text" className="ap-workplace__input" value={waTask} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_task`, e.target.value)} disabled={!canEditWorkplace} placeholder="What did you do?" onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop} /></div>
                                                                        <div className="ap-workplace__field ap-workplace__field--date"><label className="ap-workplace__field-label">Date</label><input type="date" className="ap-workplace__input" value={waDate} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_date`, e.target.value)} disabled={!canEditWorkplace} /></div>
                                                                    </div>
                                                                    {(wa.evidenceItems || []).length > 0 && (
                                                                        <div className="ap-workplace__se-block">
                                                                            <span className="ap-workplace__se-title">Supporting Evidence Required:</span>
                                                                            {wa.evidenceItems.map((se: any) => {
                                                                                const seKey = `se_${se.id}`;
                                                                                const seData = learnerAns?.[seKey] || {};
                                                                                const seTabs = [{ id: 'upload', icon: <UploadCloud size={13} />, label: 'Document', val: seData.uploadUrl }, { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', val: seData.url }, { id: 'text', icon: <FileText size={13} />, label: 'Reflection', val: seData.text }];
                                                                                const activeSeTab = activeTabs[`${block.id}_${se.id}`] || seTabs[0].id;
                                                                                const progress = uploadProgress[`${block.id}_${seKey}`];
                                                                                return (
                                                                                    <div key={se.id} className="ap-workplace__se-item">
                                                                                        <strong className="ap-workplace__se-item__code">{se.code}: {se.description}</strong>
                                                                                        <div className="ap-workplace__se-tabs">
                                                                                            <div className="ap-workplace__se-tab-bar no-print">{seTabs.map(t => <button key={t.id} className={`ap-workplace__se-tab${activeSeTab === t.id ? ' ap-workplace__se-tab--active' : ''}`} onClick={() => setActiveTabs({ ...activeTabs, [`${block.id}_${se.id}`]: t.id })}>{t.icon} {t.label} {!!t.val && <CheckCircle size={10} color="#10b981" />}</button>)}</div>
                                                                                            <div className="ap-workplace__se-tab-panel">
                                                                                                {activeSeTab === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : seData.uploadUrl ? <FilePreview url={seData.uploadUrl} onRemove={canEditWorkplace ? () => handleNestedAnswerChange(block.id, seKey, 'uploadUrl', '') : undefined} disabled={!canEditWorkplace} /> : <input type="file" disabled={!canEditWorkplace} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], block.id, seKey)} style={{ fontSize: '0.82rem', width: '100%' }} />)}
                                                                                                {activeSeTab === 'url' && <div>{canEditWorkplace && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{seData.url && !canEditWorkplace ? <UrlPreview url={seData.url} /> : <input type="url" className="ab-input" value={seData.url || ''} onChange={e => handleNestedAnswerChange(block.id, seKey, 'url', e.target.value)} disabled={!canEditWorkplace} placeholder="https://…" />}</div>}
                                                                                                {activeSeTab === 'text' && <div className={`ap-quill-wrapper${!canEditWorkplace ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}><ReactQuill theme="snow" value={seData.text || ''} onChange={c => handleNestedAnswerChange(block.id, seKey, 'text', c)} readOnly={!canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes…" /></div>}
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
                                                        <div className="ap-workplace__toggles">
                                                            {block.requireSelfAssessment !== false && <label className={`ap-workplace__toggle${learnerAns?.selfAssessmentDone ? ' ap-workplace__toggle--checked' : ''}`}><input type="checkbox" disabled={!canEditWorkplace} checked={learnerAns?.selfAssessmentDone || false} onChange={e => handleTaskAnswerChange(block.id, 'selfAssessmentDone', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} /><span className="ap-workplace__toggle-label">I have completed the self-assessment for these tasks.</span></label>}
                                                            {block.requireGoalPlanning !== false && <label className={`ap-workplace__toggle${learnerAns?.goalPlanningDone ? ' ap-workplace__toggle--checked' : ''}`}><input type="checkbox" disabled={!canEditWorkplace} checked={learnerAns?.goalPlanningDone || false} onChange={e => handleTaskAnswerChange(block.id, 'goalPlanningDone', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} /><span className="ap-workplace__toggle-label">I have updated my goal planning document.</span></label>}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Per-question feedback */}
                                            {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
                                            {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
                                            {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
                                        </div>
                                    );
                                }
                            })}
                        </div>

                        {/* ═══════════════════════════════════════════════════
                            PRINT-ONLY: OVERALL FEEDBACK + APPEAL RECORD
                            (hidden on screen, shown in print after all blocks)
                        ═══════════════════════════════════════════════════ */}
                        {isLocked && !isAwaitingSignoff && (
                            <div className="print-page print-page--feedback print-only">
                                <h2 className="print-section-heading">Overall Assessment Feedback</h2>

                                {submission.grading?.facilitatorOverallFeedback && (
                                    <div className="print-fb print-fb--fac">
                                        <h4 className="print-fb__title print-fb__title--fac">
                                            {submission.grading?.facilitatorRole === 'mentor' ? 'Mentor / Supervisor Comments' : 'Facilitator Remarks'}
                                        </h4>
                                        <p className="print-fb__body print-fb__body--fac">{submission.grading.facilitatorOverallFeedback}</p>
                                    </div>
                                )}

                                {(submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
                                    <div className="print-fb print-fb--ass">
                                        <h4 className="print-fb__title print-fb__title--ass">Assessor Grading Remarks</h4>
                                        <p className="print-fb__body print-fb__body--ass">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p>
                                    </div>
                                )}

                                {submission.moderation?.feedback && (
                                    <div className="print-fb print-fb--mod">
                                        <h4 className="print-fb__title print-fb__title--mod">Moderator QA Notes</h4>
                                        <p className="print-fb__body print-fb__body--mod">{submission.moderation.feedback}</p>
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
                        )}

                        {/* ═══════════════════════════════════════════════════
                            PRINT-ONLY + SCREEN: SIGNATURE BLOCK
                            (shown on screen only when locked/submitted)
                        ═══════════════════════════════════════════════════ */}
                        {isLocked && !isAwaitingSignoff && (
                            <div className="print-page print-page--signatures print-only">
                                <h2 className="print-section-heading">Official Signatures &amp; Declarations</h2>
                                <div className="sr-signature-block print-sig-row">

                                    {/* Learner */}
                                    <div className="sr-sig-box sr-sig-box--learner">
                                        <span className="sr-sig-box__label sr-sig-box__label--learner">Learner Declaration</span>
                                        {isSubmitted && submission.learnerDeclaration ? (
                                            <>
                                                {learnerProfile?.signatureUrl
                                                    ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
                                                    : <div className="sr-sig-no-image">Digitally Authenticated<br />(ECTA Compliant)</div>}
                                                <strong className="sr-sig-box__name sr-sig-box__name--learner">{learnerProfile?.fullName || user?.fullName || '—'}</strong>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--learner">Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString('en-ZA')}</em>
                                                <div className="sr-sig-line sr-sig-line--learner">Digital Timestamp Authenticated</div>
                                            </>
                                        ) : (
                                            <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--learner">Awaiting Submission</div></div>
                                        )}
                                    </div>

                                    {/* Facilitator / Mentor */}
                                    <div className="sr-sig-box sr-sig-box--fac">
                                        <span className="sr-sig-box__label sr-sig-box__label--fac">
                                            {submission.grading?.facilitatorRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Marking'}
                                        </span>
                                        {isFacDone && submission.grading?.facilitatorReviewedAt ? (
                                            <>
                                                {facilitatorProfile?.signatureUrl
                                                    ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" />
                                                    : <div className="sr-sig-no-image">System Authenticated</div>}
                                                <strong className="sr-sig-box__name sr-sig-box__name--fac">{submission.grading?.facilitatorName || 'Facilitator'}</strong>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--fac">Signed: {new Date(submission.grading.facilitatorReviewedAt).toLocaleDateString('en-ZA')}</em>
                                                <div className="sr-sig-line sr-sig-line--fac">
                                                    {submission.grading?.facilitatorRole === 'mentor' ? 'Workplace Verification Confirmed' : 'Pre-Marking Completed'}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="sr-sig-pending"><span className="sr-sig-pending__text">Digitally Authenticated</span><div className="sr-sig-line sr-sig-line--fac">Verification</div></div>
                                        )}
                                    </div>

                                    {/* Assessor */}
                                    <div className="sr-sig-box sr-sig-box--ass">
                                        <span className="sr-sig-box__label sr-sig-box__label--ass">Assessor Sign-off</span>
                                        {isAssDone && submission.grading?.gradedAt ? (
                                            <>
                                                {assessorProfile?.signatureUrl
                                                    ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" />
                                                    : <div className="sr-sig-no-image">No Canvas Signature</div>}
                                                <strong className="sr-sig-box__name sr-sig-box__name--ass">{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</strong>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--ass">Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--ass">Signed: {new Date(submission.grading.gradedAt).toLocaleDateString('en-ZA')}</em>
                                                <div className="sr-sig-line sr-sig-line--ass">Digital Signature Confirmed</div>
                                            </>
                                        ) : (
                                            <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--ass">Awaiting Assessment</div></div>
                                        )}
                                    </div>

                                    {/* Moderator */}
                                    <div className="sr-sig-box sr-sig-box--mod">
                                        <span className="sr-sig-box__label sr-sig-box__label--mod">Internal Moderation</span>
                                        {isModDone && submission.moderation?.moderatedAt ? (
                                            <>
                                                {moderatorProfile?.signatureUrl
                                                    ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" />
                                                    : <div className="sr-sig-no-image">No Canvas Signature</div>}
                                                <strong className="sr-sig-box__name sr-sig-box__name--mod">{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</strong>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--mod">Outcome: {submission.moderation?.outcome}</em>
                                                <em className="sr-sig-box__meta sr-sig-box__meta--mod">Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString('en-ZA')}</em>
                                                <div className="sr-sig-line sr-sig-line--mod">QA Sign-off Confirmed</div>
                                            </>
                                        ) : (
                                            <div className="sr-sig-pending"><span className="sr-sig-pending__text">Pending Signature</span><div className="sr-sig-line sr-sig-line--mod">Awaiting Moderation</div></div>
                                        )}
                                    </div>

                                    {/* Appeal resolution sig box — only when resolved */}
                                    {submission?.appeal?.status && submission.appeal.status !== 'pending' && (
                                        <div className={`sr-sig-box sr-sig-box--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                            <span className={`sr-sig-box__label sr-sig-box__label--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                                Appeal Resolution
                                            </span>
                                            <div className="sr-sig-no-image">Resolved Digitally</div>
                                            <strong className={`sr-sig-box__name sr-sig-box__name--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                                {submission.appeal?.resolvedByName || 'Academic Board'}
                                            </strong>
                                            <em className={`sr-sig-box__meta sr-sig-box__meta--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                                Resolved: {submission.appeal?.resolvedAt ? new Date(submission.appeal.resolvedAt).toLocaleDateString('en-ZA') : 'N/A'}
                                            </em>
                                            <div className={`sr-sig-line sr-sig-line--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                                Board Decision Finalised
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}


                        {/* ── FOOTER ── */}
                        {isAwaitingSignoff ? (
                            <div className="ap-footer ap-footer--signoff no-print">
                                <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
                                <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
                                <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
                                    <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
                                    <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
                                </label>
                                <div className="ap-footer-actions">
                                    <span className="ap-autosave-label">{saving && <><div className="ap-spinner ap-spinner--sm" /> Saving…</>}{Object.keys(uploadProgress).length > 0 && <span className="ap-uploads-label ap-uploads-label--amber">Uploads in progress…</span>}</span>
                                    <button className="ap-btn ap-btn--amber" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}><Save size={14} /> Acknowledge & Submit for Grading</button>
                                </div>
                            </div>
                        ) : !isLocked ? (
                            <div className="ap-footer no-print">
                                <h3 className="ap-footer__title">Final Submission</h3>
                                <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
                                <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
                                    <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
                                    <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
                                </label>
                                <div className="ap-footer-actions">
                                    <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}{Object.keys(uploadProgress).length > 0 && <span className="ap-uploads-label">Uploads in progress…</span>}</span>
                                    <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}><Save size={14} /> Submit for Grading</button>
                                </div>
                            </div>
                        ) : (
                            <div className="ap-footer ap-footer--locked no-print">
                                <div className="ap-footer--locked__icon-wrap">
                                    {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
                                </div>
                                {isModDone && outcome?.isCompetent === false ? (
                                    <>
                                        <h3 className="ap-footer--locked__title ap-footer--locked__title--amber">Assessment Outcome: Not Yet Competent (NYC)</h3>
                                        <div className="ap-remediation-box">
                                            <p>Your assessment has been fully verified. At this stage, you have not yet met all the requirements for competency.</p>
                                            {(submission.attemptNumber || 1) >= 3 ? (
                                                <div className="ap-remediation-box__lockout">
                                                    <h4 className="ap-remediation-box__lockout-title"><ShieldAlert size={15} /> Maximum Attempts Reached</h4>
                                                    <p>You have exhausted all 3 permitted attempts. Under QCTO regulations, this workbook is permanently locked. You must re-enrol in the module or lodge a formal appeal.</p>
                                                </div>
                                            ) : (
                                                <><h4 className="ap-remediation-box__steps-title">What happens next?</h4><ol className="ap-remediation-box__steps"><li><strong>Review Feedback:</strong> Scroll up and review the Assessor's feedback on your incorrect answers.</li><li><strong>Coaching:</strong> Your facilitator will schedule a brief intervention to discuss the feedback.</li><li><strong>Remediation:</strong> Your facilitator will unlock this workbook for Attempt {submission.attemptNumber ? submission.attemptNumber + 1 : 2} of 3.</li></ol></>
                                            )}
                                            <div className="ap-remediation-box__appeal-section">
                                                <p className="ap-remediation-box__appeal">
                                                    <strong>Academic Rights:</strong> If you disagree with this outcome, you have the right to lodge a formal appeal.
                                                </p>
                                                {submission.appeal?.status === 'pending' ? (
                                                    <div className="ap-appeal-status ap-appeal-status--pending"><Clock size={15} /> <span><strong>Appeal Pending:</strong> Your formal appeal is currently under investigation by the Academic Board.</span></div>
                                                ) : submission.appeal?.status === 'rejected' ? (
                                                    <div className="ap-appeal-status ap-appeal-status--rejected"><X size={15} /> <span><strong>Appeal Concluded:</strong> Your appeal was reviewed and the original outcome was upheld.</span></div>
                                                ) : (
                                                    <button className="ap-btn ap-btn--outline ap-btn--outline-danger" onClick={() => setShowAppealModal(true)}><AlertTriangle size={14} /> Lodge Formal Appeal</button>
                                                )}
                                            </div>
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
                    </div>

                    {/* ── RIGHT AUDIT SIDEBAR ── */}
                    {isLocked && !isAwaitingSignoff && (
                        <aside className="ap-right-sidebar no-print">
                            <h3 className="ap-right-sidebar__title"><ShieldCheck size={15} color="var(--mlab-blue)" /> Official Audit Trail</h3>

                            <div className="ap-audit-card">
                                <span className="ap-audit-card__label">Learner Declaration</span>
                                <div className="ap-audit-card__sig-wrap">{learnerProfile?.signatureUrl ? <img src={learnerProfile.signatureUrl} alt="Learner signature" /> : <span className="ap-audit-card__sig-placeholder">Digitally Authenticated<br />(ECTA Compliant)</span>}</div>
                                <span className="ap-audit-card__name">{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}</span>
                                <span className="ap-audit-card__sub"><Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}</span>
                            </div>

                            {submission?.appeal?.status && submission?.appeal?.status !== 'pending' && (
                                <div className="ap-audit-card" style={{ borderTopColor: submission.appeal.status === 'upheld' ? '#22c55e' : '#ef4444' }}>
                                    <span className="ap-audit-card__label" style={{ color: submission.appeal.status === 'upheld' ? '#166534' : '#991b1b', display: 'flex', alignItems: 'center', gap: '4px' }}><Scale size={12} /> Appeal Resolution</span>
                                    <span className="ap-audit-card__name" style={{ color: submission.appeal.status === 'upheld' ? '#22c55e' : '#ef4444' }}>{submission.appeal.status === 'upheld' ? 'Appeal Granted' : 'Appeal Rejected'}</span>
                                    <span className="ap-audit-card__reg" style={{ color: '#64748b' }}>{submission.appeal?.resolvedByName || 'Academic Board'}</span>
                                    <span className="ap-audit-card__sub" style={{ color: '#64748b' }}><Clock size={11} /> {submission.appeal?.resolvedAt ? moment(submission.appeal.resolvedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}

                            {outcome ? (
                                <div className="ap-audit-outcome" style={{ borderLeftColor: outcome.color }}>
                                    <div className="ap-audit-outcome__label" style={{ color: outcome.color }}>{outcome.label}</div>
                                    {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Score: {outcome.score} / {assessment.totalMarks} ({outcome.percentage}%)</div>}
                                    {isWorkplaceModule && <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>Grading: Competency-Based</div>}
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
                                    <div className="ap-audit-card__sig-wrap">{facilitatorProfile?.signatureUrl ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" /> : <span className="ap-audit-card__sig-placeholder" style={{ color: '#3b82f6' }}>System Authenticated</span>}</div>
                                    <span className="ap-audit-card__sub" style={{ color: '#3b82f6' }}><Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}
                            {isAssDone && (
                                <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-red)' }}>
                                    <span className="ap-audit-card__label" style={{ color: 'var(--mlab-red)' }}>{isWorkplaceModule ? 'Assessor Evaluation' : 'Assessor Verification'}</span>
                                    <div className="ap-audit-card__sig-wrap">{assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-red)' }}>Awaiting Signature</span>}</div>
                                    <span className="ap-audit-card__name" style={{ color: 'var(--mlab-red)' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</span>
                                    <span className="ap-audit-card__reg" style={{ color: 'var(--mlab-red)' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</span>
                                    <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-red)' }}><Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}
                            {isModDone && (
                                <div className="ap-audit-card" style={{ borderTopColor: 'var(--mlab-green)' }}>
                                    <span className="ap-audit-card__label" style={{ color: 'var(--mlab-green)' }}>Internal Moderation QA</span>
                                    <div className="ap-audit-card__sig-wrap">{moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color="green" /> : <span className="ap-audit-card__sig-placeholder" style={{ color: 'var(--mlab-green)' }}>Awaiting Signature</span>}</div>
                                    <span className="ap-audit-card__name" style={{ color: 'var(--mlab-green)' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</span>
                                    <span className="ap-audit-card__reg" style={{ color: submission.moderation?.outcome === 'Returned' ? 'var(--mlab-red)' : 'var(--mlab-green)' }}>Outcome: {submission.moderation?.outcome === 'Endorsed' ? 'Endorsed ✓' : submission.moderation?.outcome === 'Returned' ? 'Returned ✗' : submission.moderation?.outcome}</span>
                                    <span className="ap-audit-card__sub" style={{ color: 'var(--mlab-green)' }}><Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}</span>
                                </div>
                            )}
                        </aside>
                    )}
                </div>
            </div>
        </ProctoringWrapper>
    );
};

export default AssessmentPlayer;