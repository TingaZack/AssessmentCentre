import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
    AlertCircle, Play, Clock, GraduationCap,
    BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
    ShieldCheck, Hash, Activity, Award, BarChart, MessageSquare, Printer, Check, X,
    RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Layers, CalendarRange, Plus, Trash2, Lock
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';

import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

import { createPortal } from 'react-dom';
import './AssessmentPlayer.css';
import moment from 'moment';

export const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
    const filterMap: any = {
        black: 'brightness(0)',
        blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
        red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
        green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
    };
    return <img src={imageUrl} alt="Signature" style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain', filter: filterMap[color] || 'none' }} />;
};

const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['clean']] };
const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

interface GradeData { score: number; feedback: string; isCorrect?: boolean | null; criteriaResults?: any[]; }

export type StatusType = 'info' | 'success' | 'error' | 'warning';

// ─── 🚀 ROBUST FILE PREVIEW COMPONENT 🚀 ───
const FilePreview = ({ url, onRemove, disabled }: { url: string, onRemove?: () => void, disabled?: boolean }) => {
    const isLinkValid = (urlStr?: string) => urlStr && (urlStr.startsWith('http://') || urlStr.startsWith('https://') || urlStr.startsWith('data:'));

    if (!isLinkValid(url)) {
        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                <span style={{ color: '#475569', fontSize: '0.8rem', fontWeight: 'bold' }}>Local fallback attachment: {url}</span>
                {!disabled && onRemove && <button type="button" className="ab-btn-icon-danger" onClick={onRemove}><Trash2 size={14} /></button>}
            </div>
        );
    }

    const getExtension = (urlStr: string) => {
        try {
            const urlWithoutQuery = urlStr.split('?')[0];
            const parts = urlWithoutQuery.split('.');
            return parts[parts.length - 1].toLowerCase();
        } catch { return ''; }
    };

    const ext = getExtension(url);
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
    const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
    const isPdf = ext === 'pdf';
    const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);

    const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

    return (
        <div className="ap-file-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} /> Evidence Preview
                </span>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <a href={url} target="_blank" rel="noreferrer" className="no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textDecoration: 'underline' }}>
                        {isOffice ? 'Download / View Native' : 'Open Fullscreen'}
                    </a>
                    {!disabled && onRemove && (
                        <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, display: 'flex' }} title="Remove Evidence"><Trash2 size={15} /></button>
                    )}
                </div>
            </div>
            <div className="no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: isImage || isVideo ? '10px' : '0', minHeight: '100px' }}>
                {isImage && <img src={url} alt="Preview" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '4px' }} />}
                {isVideo && <video src={url} controls style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px' }} />}
                {isPdf && <iframe src={url} style={{ width: '100%', height: '400px', border: 'none' }} title="PDF Preview" />}

                {isOffice && (
                    <div style={{ width: '100%' }}>
                        <div style={{ padding: '8px', background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#b45309', fontSize: '0.75rem', textAlign: 'center' }}>
                            <strong>Note:</strong> If the document appears blank below, please use the <strong>Open Fullscreen / Download</strong> link above.
                        </div>
                        <iframe src={googleDocsViewerUrl} style={{ width: '100%', height: '450px', border: 'none' }} title="Office Document Preview" />
                    </div>
                )}

                {!isImage && !isVideo && !isPdf && !isOffice && (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        <FileText size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '0.8rem' }}>Rich preview not available for this file type.<br />Please use the link above to download it.</p>
                    </div>
                )}
            </div>
            <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                [Digital Evidence Attached: {url.split('?')[0].split('/').pop()}]
            </div>
        </div>
    );
};

// ─── 🚀 ROBUST URL/LINK PREVIEW COMPONENT 🚀 ───
const UrlPreview = ({ url }: { url: string }) => {
    if (!url) return null;

    let embedUrl = url;
    let isEmbeddable = true;

    if (url.includes('youtube.com/watch?v=')) {
        embedUrl = url.replace('watch?v=', 'embed/');
    } else if (url.includes('youtu.be/')) {
        embedUrl = url.replace('youtu.be/', 'youtube.com/embed/');
    } else if (url.includes('docs.google.com') || url.includes('drive.google.com')) {
        embedUrl = url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
    } else if (url.includes('github.com')) {
        isEmbeddable = false;
    }

    return (
        <div className="sr-url-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LinkIcon size={14} /> Link Evidence Provided
                </span>
                <a href={url} target="_blank" rel="noreferrer" className="no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textDecoration: 'underline' }}>Open Link in New Tab</a>
            </div>

            <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                [External Link Evidence: {url}]
            </div>

            <div className="no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80px' }}>
                {isEmbeddable ? (
                    <iframe src={embedUrl} style={{ width: '100%', height: '400px', border: 'none' }} title="URL Preview" />
                ) : (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        <Code size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '0.8rem' }}>This link (e.g. GitHub) blocks inline previewing.<br />Please use the link above to view it securely in a new tab.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const AssessmentPlayer: React.FC = () => {
    const { assessmentId } = useParams<{ assessmentId: string }>();
    const navigate = useNavigate();
    const { user } = useStore();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [assessment, setAssessment] = useState<any>(null);
    const [submission, setSubmission] = useState<any>(null);
    const [answers, setAnswers] = useState<Record<string, any>>({});

    const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

    const [learnerProfile, setLearnerProfile] = useState<any>(null);
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

    // DUAL-PATHWAY STATUS FLAGS
    const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
    const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
    const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
    const isAssDone = ['graded', 'moderated', 'returned'].includes(currentStatus);
    const isModDone = ['moderated'].includes(currentStatus);

    const isRemediation = (submission?.attemptNumber || 1) > 1;
    const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged;
    const isNotStarted = currentStatus === 'not_started';
    const showGate = isNotStarted || needsRemediationGate;
    const isLocked = isSubmitted || isAwaitingSignoff;

    const isPracticalModule = assessment?.moduleType === 'practical' || assessment?.moduleType === 'workplace';

    const getBlockGrading = (blockId: string) => {
        if (!isFacDone) return { score: undefined, facFeedback: '', assFeedback: '', modFeedback: '', facIsCorrect: null, assIsCorrect: null, modIsCorrect: null, isCorrect: null, criteriaResults: [] };

        const g = submission?.grading || {};
        const m = submission?.moderation || {};

        const mLayer = m.breakdown?.[blockId] || {};
        const aLayer = g.assessorBreakdown?.[blockId] || {};
        const fLayer = g.facilitatorBreakdown?.[blockId] || {};
        const legacyLayer = g.breakdown?.[blockId] || {};

        let activeLayer = legacyLayer || { score: 0, isCorrect: null };
        if (isFacDone) activeLayer = fLayer;
        if (isAssDone) activeLayer = aLayer;
        if (isModDone) activeLayer = mLayer;

        return {
            score: activeLayer.score,
            isCorrect: activeLayer.isCorrect,
            facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
            assIsCorrect: aLayer.isCorrect,
            modIsCorrect: mLayer.isCorrect,
            facFeedback: fLayer.feedback || legacyLayer.feedback || '',
            assFeedback: aLayer.feedback || '',
            modFeedback: mLayer.feedback || '',
            criteriaResults: activeLayer.criteriaResults || []
        };
    };

    const sectionTotals: Record<string, { total: number, awarded: number }> = {};
    let currentSectionId = '';
    if (assessment?.blocks) {
        assessment.blocks.forEach((block: any) => {
            if (block.type === 'section') {
                currentSectionId = block.id;
                sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
            } else if (['mcq', 'text', 'task', 'checklist'].includes(block.type) && currentSectionId) {
                const { score } = getBlockGrading(block.id);
                sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
                if (score !== undefined && score !== null) sectionTotals[currentSectionId].awarded += Number(score);
            }
        });
    }

    const getCompetencyStatus = () => {
        if (!isAssDone) return null;
        if (isRemediation && !isLocked) return null;

        const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
        let isCompetent = compStr === 'c' || compStr === 'competent';
        const actualScore = submission?.marks !== undefined ? submission.marks : submission?.totalScore;
        if (!isCompetent && actualScore !== undefined && assessment?.totalMarks) {
            isCompetent = actualScore >= (assessment.totalMarks * 0.6);
        }
        const percentage = actualScore !== undefined && assessment?.totalMarks
            ? Math.round((actualScore / assessment.totalMarks) * 100) : null;

        return {
            label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
            color: isModDone ? 'green' : 'red',
            subtext: isModDone
                ? 'Final Results Verified & Endorsed.'
                : (isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.'),
            score: actualScore, percentage, isCompetent
        };
    };

    const outcome = getCompetencyStatus();

    const getSafeDate = (dateString: string) => {
        if (!dateString) return 'recently';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'recently';
        return date.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    useEffect(() => {
        const fetchSecureTimeOffset = async () => {
            try {
                const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const data = await res.json();
                setTimeOffset(new Date(data.utc_datetime).getTime() - new Date().getTime());
            } catch { setTimeOffset(0); }
        };
        fetchSecureTimeOffset();
    }, []);

    const getSecureNow = () => new Date().getTime() + timeOffset;

    useEffect(() => {
        const loadAssessment = async () => {
            if (!user?.uid || !assessmentId) return;
            if (user.role && user.role !== 'learner') { setIsAdminIntercept(true); setLoading(false); return; }

            try {
                const assessmentSnap = await getDoc(doc(db, 'assessments', assessmentId));
                if (!assessmentSnap.exists()) { toast.error('Assessment template not found.'); setLoading(false); return; }
                const assData = assessmentSnap.data();
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

                const subQuery = query(
                    collection(db, 'learner_submissions'),
                    where('learnerId', '==', actualLearnerDocId),
                    where('assessmentId', '==', assessmentId)
                );
                const subQuerySnap = await getDocs(subQuery);

                let activeSub = null;
                if (!subQuerySnap.empty) {
                    const cohortMatch = subQuerySnap.docs.find(d => d.data().cohortId === activeCohortId);
                    if (cohortMatch) {
                        activeSub = { id: cohortMatch.id, ...cohortMatch.data() };
                    } else {
                        const sorted = subQuerySnap.docs.map(d => ({ id: d.id, ...d.data() }) as any).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                        activeSub = sorted[0];
                    }
                }

                if (activeSub) {
                    setSubmission(activeSub);
                    setAnswers(activeSub.answers || {});

                    if (activeSub.grading?.gradedBy) {
                        const assSnap = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
                        if (assSnap.exists()) setAssessorProfile(assSnap.data());
                    }
                    if (activeSub.moderation?.moderatedBy) {
                        const modSnap = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
                        if (modSnap.exists()) setModeratorProfile(modSnap.data());
                    }

                    const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
                    if (facId) {
                        const facSnap = await getDoc(doc(db, 'users', facId));
                        if (facSnap.exists()) setFacilitatorProfile(facSnap.data());
                    }

                    const _needsRemediationGate = (activeSub.attemptNumber || 1) > 1 && activeSub.latestCoachingLog && !activeSub.latestCoachingLog.acknowledged;
                    const _showGate = activeSub.status === 'not_started' || _needsRemediationGate;

                    const isPractical = assData.moduleType === 'practical' || assData.moduleType === 'workplace';

                    if (!isPractical && activeSub.status === 'in_progress' && assData.moduleInfo?.timeLimit > 0 && !_showGate) {
                        const startTime = new Date(activeSub.startedAt).getTime();
                        const endTime = startTime + (assData.moduleInfo.timeLimit * 60 * 1000);
                        const remainingSeconds = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
                        setTimeLeft(remainingSeconds);
                        if (remainingSeconds === 0) forceAutoSubmit(activeSub.id, activeSub.answers || {});
                    }
                } else {
                    toast.error('You are not assigned to this assessment in your current class.');
                }
            } catch (error) {
                console.error('Error loading assessment:', error);
                toast.error('Failed to load assessment data.');
            } finally {
                setLoading(false);
            }
        };

        if (timeOffset !== null) loadAssessment();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assessmentId, user?.uid, timeOffset]);

    // PREVENT AUTO SUBMIT LOOP FOR PRACTICALS
    useEffect(() => {
        if (isPracticalModule || timeLeft === null || isLocked || showGate) return;
        if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
        const timerId = setInterval(() => {
            const startTime = new Date(submission.startedAt).getTime();
            const endTime = startTime + (assessment.moduleInfo.timeLimit * 60 * 1000);
            setTimeLeft(Math.max(0, Math.floor((endTime - getSecureNow()) / 1000)));
        }, 1000);
        return () => clearInterval(timerId);
    }, [timeLeft, isLocked, showGate, submission?.startedAt, isPracticalModule]);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
        return `${m}m ${s.toString().padStart(2, '0')}s`;
    };

    const handleStartAssessment = async () => {
        if (!startDeclarationChecked) return;
        if (needsRemediationGate && !coachingAckChecked) return;

        setSaving(true);
        try {
            const secureStartTime = new Date(getSecureNow()).toISOString();
            const updatePayload: any = { status: 'in_progress', startedAt: secureStartTime };

            if (needsRemediationGate) {
                updatePayload['latestCoachingLog.acknowledged'] = true;
                updatePayload['latestCoachingLog.acknowledgedAt'] = secureStartTime;
            }

            await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);

            setSubmission((prev: any) => ({
                ...prev, status: 'in_progress', startedAt: secureStartTime,
                latestCoachingLog: prev.latestCoachingLog ? { ...prev.latestCoachingLog, acknowledged: true, acknowledgedAt: secureStartTime } : prev.latestCoachingLog
            }));

            if (!isPracticalModule && assessment.moduleInfo?.timeLimit > 0) setTimeLeft(assessment.moduleInfo.timeLimit * 60);
        } catch { toast.error('Failed to start assessment.'); } finally { setSaving(false); }
    };

    const handleAnswerChange = (blockId: string, value: any) => {
        if (isLocked && !isAwaitingSignoff) return;
        setAnswers(prev => {
            const newAnswers = { ...prev, [blockId]: value };
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(async () => {
                if (!submission?.id) return;
                setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
                } catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
            }, 1200);
            return newAnswers;
        });
    };

    const handleTaskAnswerChange = (blockId: string, field: string, value: string) => {
        if (isLocked && !isAwaitingSignoff) return;
        setAnswers(prev => {
            const blockAns = prev[blockId] || {};
            const newAnswers = { ...prev, [blockId]: { ...blockAns, [field]: value } };

            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(async () => {
                if (!submission?.id) return;
                setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
                } catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
            }, 1200);
            return newAnswers;
        });
    }

    const handleCriterionEvidenceChange = (blockId: string, index: number, field: string, value: string) => {
        if (isLocked && !isAwaitingSignoff) return;
        setAnswers(prev => {
            const blockAns = prev[blockId] || {};
            const critKey = `evidence_${index}`;
            const currentCritEvidence = blockAns[critKey] || {};

            const cleanCritEvidence = typeof currentCritEvidence === 'string' ? { text: currentCritEvidence } : currentCritEvidence;

            const newAnswers = {
                ...prev,
                [blockId]: {
                    ...blockAns,
                    [critKey]: { ...cleanCritEvidence, [field]: value }
                }
            };

            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(async () => {
                if (!submission?.id) return;
                setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
                } catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
            }, 1200);
            return newAnswers;
        });
    };

    // 🚀 FIREBASE STORAGE RESUMABLE UPLOAD 🚀
    const handleFileUpload = (file: File, blockId: string, isChecklist = false, critIndex?: number) => {
        if (!file) return;

        const progressKey = isChecklist ? `${blockId}_${critIndex}` : blockId;
        setUploadProgress(prev => ({ ...prev, [progressKey]: 0 }));
        setSaving(true);
        toast.info(`Uploading ${file.name}...`);

        try {
            const storage = getStorage();
            const path = `evidence/${submission.id}/${blockId}_${Date.now()}_${file.name}`;
            const storageReference = fbStorageRef(storage, path);

            const uploadTask = uploadBytesResumable(storageReference, file);

            uploadTask.on(
                'state_changed',
                (snapshot) => {
                    const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                    setUploadProgress(prev => ({ ...prev, [progressKey]: progress }));
                },
                (error) => {
                    console.error("Upload error:", error);
                    toast.warning(`Cloud upload failed: ${error.message}. Logging filename as fallback.`);
                    if (isChecklist && critIndex !== undefined) {
                        handleCriterionEvidenceChange(blockId, critIndex, 'uploadUrl', file.name);
                    } else {
                        handleTaskAnswerChange(blockId, 'uploadUrl', file.name);
                    }
                    setUploadProgress(prev => { const n = { ...prev }; delete n[progressKey]; return n; });
                    setSaving(false);
                },
                async () => {
                    const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                    if (isChecklist && critIndex !== undefined) {
                        handleCriterionEvidenceChange(blockId, critIndex, 'uploadUrl', downloadUrl);
                    } else {
                        handleTaskAnswerChange(blockId, 'uploadUrl', downloadUrl);
                    }
                    toast.success(`Successfully uploaded: ${file.name}`);
                    setUploadProgress(prev => { const n = { ...prev }; delete n[progressKey]; return n; });
                    setSaving(false);
                }
            );
        } catch (err: any) {
            console.error("Upload setup error:", err);
            toast.error("Upload failed to initialize.");
            setUploadProgress(prev => { const n = { ...prev }; delete n[progressKey]; return n; });
            setSaving(false);
        }
    };

    const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
        setSaving(true);
        const submitTime = new Date(getSecureNow()).toISOString();
        try {
            await updateDoc(doc(db, 'learner_submissions', subId), {
                answers: currentAnswers, status: 'submitted', submittedAt: submitTime, autoSubmitted: true,
                learnerDeclaration: { agreed: true, timestamp: submitTime, learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown', learnerIdNumber: learnerProfile?.idNumber || 'Unknown' }
            });
            toast.success("Time's up! Assessment auto-submitted.");
            setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
            setTimeout(() => navigate(-1), 3000);
        } catch (error) { console.error("Auto-submit failed", error); } finally { setSaving(false); }
    };

    const handleNavigationLeave = () => {
        // Prevent leaving if uploads are in progress
        if (Object.keys(uploadProgress).length > 0) {
            toast.warning("Files are currently uploading. Please wait.");
            return;
        }
        if (!isLocked && !isPracticalModule && assessment.moduleInfo?.timeLimit > 0 && !showGate) setShowLeaveWarning(true);
        else navigate(-1);
    };

    const validateChecklistEvidence = () => {
        for (const block of assessment.blocks || []) {
            if (block.type === 'checklist' && block.requireEvidencePerCriterion !== false) {
                for (let i = 0; i < (block.criteria?.length || 0); i++) {
                    const rawEv = answers[block.id]?.[`evidence_${i}`];
                    const ev = typeof rawEv === 'string' ? { text: rawEv } : (rawEv || {});

                    const hasEv = ev && (
                        (ev.text && ev.text.replace(/<[^>]*>?/gm, '').trim().length > 0) ||
                        (ev.url && ev.url.trim().length > 0) ||
                        (ev.code && ev.code.trim().length > 0) ||
                        (ev.uploadUrl && ev.uploadUrl.trim().length > 0)
                    );

                    if (!hasEv) {
                        return { valid: false, message: `Please provide evidence for task ${i + 1} in "${block.title}" before submitting.` };
                    }
                }
            }
        }
        return { valid: true };
    };

    const triggerSubmitConfirm = () => {
        if (Object.keys(uploadProgress).length > 0) {
            return toast.warning("Files are currently uploading. Please wait until they finish.");
        }
        if (!declarationChecked) return toast.warning('You must agree to the declaration.');

        if (isAwaitingSignoff) {
            const evCheck: any = validateChecklistEvidence();
            if (!evCheck.valid) {
                return toast.warning(evCheck.message);
            }
        }

        setShowSubmitConfirm(true);
    };

    const executeSubmit = async () => {
        setShowSubmitConfirm(false);
        setSaving(true);
        const submitTime = new Date(getSecureNow()).toISOString();
        const nextStatus = isAwaitingSignoff ? 'facilitator_reviewed' : 'submitted';

        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                answers,
                status: nextStatus,
                submittedAt: submitTime,
                learnerDeclaration: {
                    agreed: true,
                    timestamp: submitTime,
                    learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
                    learnerIdNumber: learnerProfile?.idNumber || 'Unknown'
                }
            });
            toast.success(isAwaitingSignoff ? 'Observation acknowledged and submitted!' : 'Assessment submitted successfully!');
            setSubmission((prev: any) => ({ ...prev, status: nextStatus }));
            setTimeout(() => window.scrollTo(0, 0), 1000);
        } catch { toast.error('Failed to submit.'); } finally { setSaving(false); }
    };

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
                <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><ShieldAlert size={32} color="var(--mlab-blue)" /></div>
                <h1 className="ap-state-card__title">Staff Access Detected</h1>
                <p className="ap-state-card__desc">This area is restricted to learners only.<br />Please use Preview mode to view assessments without affecting learner data.</p>
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
                <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', opacity: 0.5 }}><AlertCircle size={32} color="var(--mlab-grey)" /></div>
                <h2 className="ap-state-card__title">Assessment Unavailable</h2>
                <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Please contact your facilitator if you believe this is an error.</p>
                <div className="ap-state-card__actions"><button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button></div>
            </div>
        </div>
    );

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
                            <span style={{ marginLeft: '12px', fontSize: '0.8rem', background: '#f59e0b', color: 'white', padding: '4px 10px', borderRadius: '12px', verticalAlign: 'middle', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Attempt #{submission.attemptNumber}
                            </span>
                        )}
                    </h1>

                    <p className="ap-gate-left__sub">
                        {isRemediation ? "This is a fresh attempt. Your previous answers have been retained. Please use the Facilitator's Coaching Notes below to correct your answers and resubmit." : "Read all instructions carefully before starting."}
                    </p>

                    {needsRemediationGate && (
                        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
                            <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', marginBottom: '8px' }}>
                                <MessageSquare size={18} /> Remediation Coaching Log
                            </strong>
                            <p style={{ margin: '0 0 10px 0', color: '#92400e', fontSize: '0.85rem' }}>
                                Before beginning Attempt #{submission.attemptNumber}, QCTO compliance requires you to acknowledge the feedback session conducted by your facilitator.
                            </p>
                            <div style={{ background: 'white', padding: '10px', borderRadius: '4px', border: '1px solid #fde68a', marginBottom: '10px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 'bold', textTransform: 'uppercase' }}>Facilitator Notes ({getSafeDate(submission.latestCoachingLog.date)}):</span>
                                <p style={{ margin: '4px 0 0 0', color: '#78350f', fontStyle: 'italic', fontSize: '0.9rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                    "{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}
                                </p>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
                                <input
                                    type="checkbox"
                                    checked={coachingAckChecked}
                                    onChange={e => setCoachingAckChecked(e.target.checked)}
                                    style={{ marginTop: '2px', accentColor: '#f59e0b', width: '16px', height: '16px' }}
                                />
                                <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 'bold' }}>
                                    I acknowledge that I received the coaching/feedback detailed above.
                                </span>
                            </label>
                        </div>
                    )}

                    <div className="ap-info-grid">
                        <div className="ap-info-card"><div className="ap-info-card__label"><BookOpen size={12} /> Module</div><div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div><div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div></div>
                        <div className="ap-info-card"><div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div><div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div><div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div></div>
                        <div className="ap-info-card"><div className="ap-info-card__label"><Clock size={12} /> Time Limit</div><div className="ap-info-card__value">{assessment.moduleInfo?.timeLimit ? `${assessment.moduleInfo.timeLimit} Min` : 'No Limit'}</div><div className="ap-info-card__sub">{assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}</div></div>
                        <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Total Marks</div><div className="ap-info-card__value">{assessment.totalMarks}</div><div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div></div>
                    </div>

                    <div className="ap-note-block">
                        <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
                        <p className="ap-note-block__text">{assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
                        {assessment.purpose && <><div className="ap-note-block__heading"><Info size={12} /> Purpose</div><p className="ap-note-block__text">{assessment.purpose}</p></>}
                    </div>
                </div>

                <div className="ap-gate-right">
                    <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
                    <ul className="ap-rules-list">
                        <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or use of unauthorized AI tools violates QCTO guidelines.</p></div></li>
                        <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly stated as a group project, no collaboration is permitted.</p></div></li>
                        <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
                        {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser tab. Plan your time carefully.</p></div></li>}
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

    const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
        if (block.type === 'section') acc.push({ type: 'section', label: block.title, id: block.id });
        else if (['text', 'mcq', 'task', 'checklist', 'logbook'].includes(block.type)) acc.push({ type: 'q', label: block.question || block.title, id: block.id });
        return acc;
    }, []) || [];

    let displayStatus = submission.status.replace('_', ' ');
    if (submission.status === 'returned') displayStatus = 'revision required';

    let qNum = 0;

    // DYNAMIC EDIT PERMISSIONS
    const canEditTask = isPracticalModule ? isAwaitingSignoff : (!isLocked);
    const canEditChecklist = isAwaitingSignoff;
    const canEditLogbook = !isLocked || isAwaitingSignoff;

    return (
        <div className="ap-player ap-animate">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)} />}

            {/* 🚀 DYNAMIC SUBMIT CONFIRM MODAL 🚀 */}
            {showSubmitConfirm && (
                <ConfirmModal
                    title={isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment?"}
                    message={isAwaitingSignoff ? "You are acknowledging the mentor's observation and submitting this workbook directly to the Assessor for final grading." : "You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."}
                    confirmText={isAwaitingSignoff ? "Acknowledge & Submit" : "Submit for Grading"}
                    cancelText="Go Back"
                    onConfirm={executeSubmit}
                    onCancel={() => setShowSubmitConfirm(false)}
                />
            )}

            <div className="ap-player-topbar no-print">
                <div className="ap-player-topbar__left">
                    <button className="ap-player-topbar__back" onClick={handleNavigationLeave}><ArrowLeft size={13} /> Portfolio</button>
                    <div className="ap-player-topbar__separator" />
                    <h1 className="ap-player-topbar__title">
                        {assessment.title}
                        {submission?.attemptNumber > 1 && (
                            <span style={{ marginLeft: '10px', fontSize: '0.7rem', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Attempt #{submission.attemptNumber}
                            </span>
                        )}
                    </h1>
                </div>

                <div className="ap-player-topbar__right">
                    {isLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={13} /> Print Audit</button>}
                    {!isLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
                    {!isLocked && isPracticalModule && <div className="ap-timer" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}><Info size={14} /> Untimed Practical Task</div>}
                    <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
                    <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
                </div>
            </div>

            <div className={`ap-player-body${isLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
                <nav className="ap-sidebar no-print">
                    <div className="ap-sidebar__meta-block">
                        <div className="ap-sidebar__meta-title">{assessment.title}</div>
                        {submission?.attemptNumber > 1 && (
                            <div className="ap-sidebar__detail" style={{ color: '#d97706', fontWeight: 'bold' }}>
                                <RotateCcw size={11} /> Attempt #{submission.attemptNumber}
                            </div>
                        )}
                        <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
                        <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div>
                        <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>
                    </div>

                    {(submission.status !== 'not_started' && submission.status !== 'in_progress' && !isAwaitingSignoff) && (
                        <>
                            <div className="ap-sidebar__label">Status Tracking</div>
                            <div className="ap-sidebar__status-box">

                                {isAssDone && outcome ? (
                                    <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
                                        <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
                                        {outcome.score !== undefined && <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
                                        <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
                                    </div>
                                ) : (
                                    <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}><div className="ap-sidebar__outcome-val" style={{ color: '#cbd5e1' }}>Awaiting Grade</div><div className="ap-sidebar__outcome-note">The Assessor has not yet finalized your official results.</div></div>
                                )}

                                {isFacDone && submission.grading?.facilitatorOverallFeedback && (
                                    <div style={{ background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid rgba(56, 189, 248, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><Info size={11} /> Facilitator Summary</strong>
                                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.grading.facilitatorOverallFeedback}</p>
                                    </div>
                                )}

                                {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
                                    <div style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid rgba(245,158,11,0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'red', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><MessageSquare size={11} /> Assessor Remarks</strong>
                                        <p style={{ margin: 0, color: 'red', fontSize: '0.78rem', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p>
                                    </div>
                                )}

                                {isModDone && submission.moderation?.feedback && (
                                    <div style={{ background: 'rgba(34, 197, 94, 0.08)', borderLeft: '3px solid rgba(34, 197, 94, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#4ade80', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><ShieldCheck size={11} /> QA Endorsement Notes</strong>
                                        <p style={{ margin: 0, color: '#4ade80', fontSize: '0.78rem', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.moderation.feedback}</p>
                                    </div>
                                )}

                                <div className="ap-sidebar__timeline-item">
                                    <div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div>
                                    <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Facilitator Review</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? 'Waiting for Facilitator' : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div>
                                </div>
                                <div className="ap-sidebar__timeline-item">
                                    <div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div>
                                    <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div>
                                </div>
                                <div className="ap-sidebar__timeline-item">
                                    <div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div>
                                    <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `Endorsed ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div>
                                </div>
                            </div>
                        </>
                    )}

                    <div className="ap-sidebar__label">Workbook Contents</div>
                    <div className="ap-sidebar__nav">
                        {navItems.map((item: any) =>
                            item.type === 'section' ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span> : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item">{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
                        )}
                    </div>
                </nav>

                <div className="ap-player-content print-pane">
                    {isLocked && !isAwaitingSignoff && (
                        <div className="print-only-cover">
                            <div className="print-page">
                                <h1 style={{ textAlign: 'center', textTransform: 'uppercase', fontSize: '18pt', marginBottom: '10px' }}>{assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}</h1>
                                <h2 style={{ textAlign: 'center', fontSize: '16pt', marginBottom: '30px', textDecoration: 'underline' }}>
                                    LEARNER WORKBOOK {submission?.attemptNumber > 1 ? `- ATTEMPT #${submission.attemptNumber}` : ''}
                                </h2>

                                <table className="print-table" style={{ width: '100%', marginBottom: '40px' }}>
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

                                <h3 style={{ fontSize: '14pt', marginBottom: '10px' }}>CONTACT INFORMATION:</h3>
                                <table className="print-table" style={{ width: '100%' }}>
                                    <tbody>
                                        <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '________________________'}</td></tr>
                                        <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || user?.email || '________________________'}</td></tr>
                                        <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
                                        <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
                                        <tr><td style={{ fontWeight: 'bold' }}>Telephone (W)</td><td>{learnerProfile?.telephoneWork || '________________________'}</td></tr>
                                        <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="print-page">
                                <h3>Note to the learner</h3><p>{assessment?.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
                                <h3>Purpose</h3><p>{assessment?.purpose || 'The main focus of the learning in this knowledge module is to build an understanding of the concepts related to this subject matter.'}</p>
                                <h3>Topic elements to be covered include</h3>
                                <table className="print-table no-border" style={{ width: '100%', fontSize: '10pt' }}>
                                    <tbody>
                                        {assessment?.moduleInfo?.topics && assessment.moduleInfo.topics.length > 0 ? (
                                            assessment.moduleInfo.topics.map((topic: any, idx: number) => (
                                                <tr key={idx}><td>{topic.code ? <strong>{topic.code}: </strong> : ''}{topic.title || topic.name}</td><td>{topic.weight || topic.percentage}%</td></tr>
                                            ))
                                        ) : (assessment?.blocks?.filter((b: any) => b.type === 'section').length > 0) ? (
                                            assessment.blocks.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
                                                const secTotal = sectionTotals[sec.id]?.total || 0;
                                                const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
                                                return (<tr key={idx}><td><strong>Section {idx + 1}: </strong> {sec.title}</td><td>{secTotal > 0 ? `${pct}%` : '—'}</td></tr>)
                                            })
                                        ) : (<tr><td colSpan={2} style={{ fontStyle: 'italic', color: '#64748b' }}>(No specific sections mapped)</td></tr>)}
                                    </tbody>
                                </table>
                            </div>

                            <div className="print-page">
                                <h3>Entry Requirements</h3><p>{assessment?.moduleInfo?.entryRequirements || `NQF Level ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}</p>
                                <h3>Provider Accreditation Requirements for the Knowledge Module</h3><p><strong>Physical Requirements:</strong><br />{assessment?.moduleInfo?.physicalRequirements || 'The provider must have structured learning material or provide learners with access to structured learning material that addresses all the topics in all the knowledge modules.'}</p>
                                <h3>QCTO / SETA requirements</h3>
                                <p><strong>Human Resource Requirements:</strong></p>
                                <ul style={{ marginBottom: '15px' }}>
                                    <li>Lecturer/learner ratio of {assessment?.moduleInfo?.lecturerRatio || '1:20'} (Maximum)</li>
                                    <li>Qualification of lecturer (SME): {assessment?.moduleInfo?.lecturerQualification || `Industry recognised qualifications with experience in the related industry`}</li>
                                    {assessment?.moduleInfo?.vendorCertification && <li>{assessment.moduleInfo.vendorCertification}</li>}
                                    <li>Assessors and moderators: accredited by the relevant SETA</li>
                                </ul>
                                <p><strong>Legal Requirements:</strong></p>
                                <ul style={{ marginBottom: '15px' }}>
                                    <li>Legal (product) licences to use the software for learning and training (where applicable)</li>
                                    <li>OHS compliance certificate</li>
                                    <li>Ethical clearance (where necessary)</li>
                                </ul>
                                <h3>Exemptions</h3><p>{assessment?.moduleInfo?.exemptions || 'No exemptions, but the module can be achieved in full through a normal RPL process.'}</p>
                                <h3>Venue, Date and Time:</h3><p><strong>Venue:</strong> {assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform'}</p><p><strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}</p>
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

                                        <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
                                            <span style={{ color: 'black' }}>Learner Acknowledgement</span>
                                            {submission.latestCoachingLog.acknowledged ? (
                                                <>
                                                    {learnerProfile?.signatureUrl
                                                        ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
                                                        : <div className="sr-sig-no-image" style={{ color: 'black' }}>No Canvas Signature</div>
                                                    }
                                                    <strong style={{ color: 'black' }}>{learnerProfile?.fullName || user?.fullName}</strong>
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
                    )}

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

                    <div className="ap-blocks">
                        {assessment.blocks?.map((block: any, idx: number) => {

                            if (block.type === 'section') {
                                const totals = sectionTotals[block.id];
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="ap-block-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>{block.title}</span>
                                            {isAssDone && totals && totals.total > 0 && (
                                                <span className="no-print" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px' }}>
                                                    <BarChart size={13} /> {totals.awarded}/{totals.total}
                                                </span>
                                            )}
                                        </div>
                                        {block.content && (
                                            <div className="quill-read-only-content" style={{ color: 'white', fontSize: '0.95rem' }} dangerouslySetInnerHTML={{ __html: block.content }} />
                                        )}
                                    </div>
                                );
                            }

                            if (block.type === 'info') return (
                                <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
                                    <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
                                    <p className="ap-block-info__text" style={{ whiteSpace: 'pre-wrap' }}>{block.content}</p>
                                </div>
                            );

                            if (['mcq', 'text', 'task', 'checklist', 'logbook'].includes(block.type)) {
                                qNum++;
                                const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
                                const learnerAns = answers[block.id] || {};

                                let activeInkColor = 'transparent';
                                if (isModDone) activeInkColor = 'green';
                                else if (isAssDone) activeInkColor = 'red';
                                else if (isFacDone && !isAwaitingSignoff) activeInkColor = 'blue';

                                const markLabel = isFacDone && blockScore !== undefined && blockScore !== null
                                    ? `${blockScore} / ${block.marks}`
                                    : `${block.marks} Marks`;

                                const TopRightIndicator = () => {
                                    return (
                                        <div style={{ display: 'flex', gap: '8px', marginLeft: '12px', alignItems: 'center' }}>
                                            {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && (
                                                <div title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
                                                    {facIsCorrect ? <Check size={18} color="#0284c7" strokeWidth={3} /> : <X size={18} color="#0284c7" strokeWidth={3} />}
                                                </div>
                                            )}
                                            {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && (
                                                <div title="Official Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px' }}>
                                                    {assIsCorrect ? <Check size={18} color="#ef4444" strokeWidth={3} /> : <X size={18} color="#ef4444" strokeWidth={3} />}
                                                </div>
                                            )}
                                            {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && (
                                                <div title="Internal Moderation QA" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 6px', borderRadius: '4px' }}>
                                                    {modIsCorrect ? <Check size={18} color="#22c55e" strokeWidth={3} /> : <X size={18} color="#22c55e" strokeWidth={3} />}
                                                </div>
                                            )}
                                        </div>
                                    );
                                };

                                return (
                                    <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>

                                        {/* ── HEADER ── */}
                                        <div className="ap-block-question__header">
                                            <div className="ap-block-question__text-wrap" style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
                                                <span className="ap-block-question__text">
                                                    <strong style={{
                                                        color: block.type === 'checklist' ? '#0d9488' : block.type === 'logbook' ? '#ea580c' : block.type === 'task' ? '#8b5cf6' : '#94a3b8',
                                                        background: block.type === 'checklist' ? '#ccfbf1' : block.type === 'logbook' ? '#ffedd5' : block.type === 'task' ? '#ede9fe' : 'transparent',
                                                        padding: block.type === 'checklist' || block.type === 'logbook' || block.type === 'task' ? '2px 8px' : '0',
                                                        borderRadius: '4px',
                                                        marginRight: '8px'
                                                    }}>
                                                        {block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : `Q${qNum}.`}
                                                    </strong>
                                                    {block.question || block.title}
                                                </span>
                                                <TopRightIndicator />
                                            </div>
                                            <span className="ap-block-question__marks" style={{ color: activeInkColor !== 'transparent' ? activeInkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
                                        </div>

                                        {/* ── BODY ── */}
                                        <div className="ap-block-question__body">

                                            {/* MCQ */}
                                            {block.type === 'mcq' && (
                                                <div className="ap-mcq-options">
                                                    {block.options?.map((opt: string, i: number) => {
                                                        const selected = learnerAns === i;
                                                        return (
                                                            <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', (!canEditTask) ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
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
                                                <div className={`ap-quill-wrapper ${!canEditTask ? 'locked' : ''}`}>
                                                    <ReactQuill theme="snow" value={learnerAns || ''} onChange={(content) => handleAnswerChange(block.id, content)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder={!canEditTask ? 'No answer provided.' : 'Type your detailed response here...'} />
                                                </div>
                                            )}

                                            {/* 🚀 MULTI-MODAL TASK 🚀 */}
                                            {block.type === 'task' && (() => {
                                                const taskTabs = [
                                                    { id: 'text', icon: <FileText size={14} />, label: 'Rich Text', allowed: block.allowText, val: learnerAns?.text },
                                                    { id: 'audio', icon: <Mic size={14} />, label: 'Audio', allowed: block.allowAudio, val: learnerAns?.audioUrl },
                                                    { id: 'url', icon: <LinkIcon size={14} />, label: 'Link', allowed: block.allowUrl, val: learnerAns?.url },
                                                    { id: 'upload', icon: <UploadCloud size={14} />, label: 'File Upload', allowed: block.allowUpload, val: learnerAns?.uploadUrl },
                                                    { id: 'code', icon: <Code size={14} />, label: 'Code', allowed: block.allowCode, val: learnerAns?.code }
                                                ].filter(t => t.allowed);

                                                const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
                                                const currentProgress = uploadProgress[block.id];

                                                return (
                                                    <div className="ap-evidence-container" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>

                                                        {isPracticalModule && !isAwaitingSignoff && !isSubmitted && (
                                                            <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '10px 15px', color: '#b45309', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <Lock size={16} /> <span>Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</span>
                                                            </div>
                                                        )}

                                                        <div className="no-print" style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
                                                            {taskTabs.map(t => (
                                                                <button
                                                                    key={t.id}
                                                                    onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
                                                                    style={{
                                                                        padding: '10px 15px', border: 'none', borderBottom: activeTabId === t.id ? '2px solid var(--mlab-blue)' : '2px solid transparent',
                                                                        background: activeTabId === t.id ? 'white' : 'transparent',
                                                                        color: activeTabId === t.id ? 'var(--mlab-blue)' : '#64748b',
                                                                        fontWeight: activeTabId === t.id ? 'bold' : 'normal',
                                                                        fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap'
                                                                    }}
                                                                >
                                                                    {t.icon} {t.label}
                                                                    {!!t.val && <CheckCircle size={12} color="#10b981" />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div style={{ padding: '15px' }}>
                                                            {activeTabId === 'text' && (
                                                                <div className={`ap-quill-wrapper ${!canEditTask ? 'locked' : ''}`} style={{ border: 'none', padding: 0 }}>
                                                                    <ReactQuill theme="snow" value={learnerAns?.text || ''} onChange={(content) => handleTaskAnswerChange(block.id, 'text', content)} readOnly={!canEditTask} modules={quillModules} formats={quillFormats} placeholder={!canEditTask ? 'No text answer provided.' : 'Type your answer here...'} />
                                                                </div>
                                                            )}
                                                            {activeTabId === 'audio' && (
                                                                learnerAns?.audioUrl ? (
                                                                    <audio controls src={learnerAns.audioUrl} style={{ width: '100%', height: '40px' }} />
                                                                ) : (
                                                                    <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '6px', color: '#94a3b8' }}>
                                                                        {!canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}
                                                                    </div>
                                                                )
                                                            )}
                                                            {activeTabId === 'url' && (
                                                                <div>
                                                                    {canEditTask && (
                                                                        <div style={{ background: '#e0f2fe', borderLeft: '3px solid #0ea5e9', padding: '8px', marginBottom: '10px', fontSize: '0.75rem', color: '#0369a1', borderRadius: '4px' }}>
                                                                            <strong>Note:</strong> If pasting a Google Drive/Docs link, ensure it is set to <em>"Anyone with the link can view"</em> so assessors can access it.
                                                                        </div>
                                                                    )}
                                                                    {learnerAns?.url && !canEditTask ? (
                                                                        <UrlPreview url={learnerAns.url} />
                                                                    ) : (
                                                                        <input type="url" className="ab-input" value={learnerAns?.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={!canEditTask} placeholder="https://..." style={{ borderColor: '#cbd5e1' }} />
                                                                    )}
                                                                </div>
                                                            )}
                                                            {activeTabId === 'upload' && (
                                                                currentProgress !== undefined ? (
                                                                    <div style={{ padding: '20px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>
                                                                            <span>Uploading...</span>
                                                                            <span>{currentProgress}%</span>
                                                                        </div>
                                                                        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                                                            <div style={{ width: `${currentProgress}%`, height: '100%', background: 'var(--mlab-blue)', transition: 'width 0.2s' }} />
                                                                        </div>
                                                                    </div>
                                                                ) : learnerAns?.uploadUrl ? (
                                                                    <FilePreview url={learnerAns.uploadUrl} onRemove={canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={!canEditTask} />
                                                                ) : (
                                                                    <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '6px', color: '#94a3b8' }}>
                                                                        {!canEditTask ? 'No file uploaded.' : (
                                                                            <div>
                                                                                <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#475569' }}>Select a file to upload (Allowed: {block.allowedFileTypes})</p>
                                                                                <input type="file" onChange={(e) => {
                                                                                    if (e.target.files && e.target.files.length > 0) {
                                                                                        handleFileUpload(e.target.files[0], block.id, false);
                                                                                    }
                                                                                }} style={{ fontSize: '0.8rem' }} />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )
                                                            )}
                                                            {activeTabId === 'code' && (
                                                                <textarea className="ab-input" rows={6} value={learnerAns?.code || ''} onChange={e => handleTaskAnswerChange(block.id, 'code', e.target.value)} disabled={!canEditTask} placeholder="Paste your code here..." style={{ fontFamily: 'monospace', background: '#1e293b', color: '#f8fafc', border: 'none' }} />
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* 🚀 PRACTICAL CHECKLIST (LEARNER VIEW WITH TABBED EVIDENCE UPLOADS) 🚀 */}
                                            {block.type === 'checklist' && (
                                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '6px' }}>
                                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#166534', fontWeight: 'bold' }}><Info size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Your Mentor/Assessor completes the evaluation, but you must upload evidence for each item if required below.</p>

                                                    {!isAwaitingSignoff && !isSubmitted && (
                                                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '10px', borderRadius: '6px', marginBottom: '15px', color: '#b45309', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Lock size={16} /> <span>Evidence uploads will be unlocked <strong>after</strong> your Mentor completes the observation.</span>
                                                        </div>
                                                    )}

                                                    {block.criteria?.map((crit: string, i: number) => {
                                                        const res = criteriaResults?.[i] || {};

                                                        const rawEv = learnerAns?.[`evidence_${i}`];
                                                        const critEvidence = typeof rawEv === 'string' ? { text: rawEv } : (rawEv || {});

                                                        const cTabKey = `${block.id}_${i}`;
                                                        const checklistTabs = [
                                                            { id: 'upload', icon: <UploadCloud size={12} />, label: 'File', val: critEvidence?.uploadUrl },
                                                            { id: 'url', icon: <LinkIcon size={12} />, label: 'Link', val: critEvidence?.url },
                                                            { id: 'code', icon: <Code size={12} />, label: 'Code', val: critEvidence?.code },
                                                            { id: 'text', icon: <FileText size={12} />, label: 'Notes', val: critEvidence?.text }
                                                        ];

                                                        const availableTabs = !canEditChecklist ? checklistTabs.filter(t => t.val) : checklistTabs;
                                                        const activeCTab = activeTabs[cTabKey] || (availableTabs[0]?.id || 'upload');
                                                        const currentProgress = uploadProgress[`${block.id}_${i}`];

                                                        return (
                                                            <div key={i} style={{ padding: '15px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '10px' }}>
                                                                <p style={{ margin: '0 0 10px 0', color: '#334155', fontSize: '0.95rem', fontWeight: 'bold' }}>{i + 1}. {crit}</p>

                                                                {/* Assessor Marks (Read-Only to Learner) */}
                                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px', background: '#f8fafc', padding: '10px', borderRadius: '4px', borderLeft: '3px solid #cbd5e1' }}>
                                                                    {isFacDone ? (
                                                                        <>
                                                                            <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: res.status === 'C' ? '#dcfce7' : res.status === 'NYC' ? '#fee2e2' : '#f1f5f9', color: res.status === 'C' ? '#166534' : res.status === 'NYC' ? '#991b1b' : '#64748b', fontWeight: 'bold' }}>
                                                                                {res.status ? `Assessor marked: ${res.status}` : 'Not Graded'}
                                                                            </span>
                                                                            {res.comment && <span style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>"{res.comment}"</span>}
                                                                        </>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>Pending Observation</span>
                                                                    )}
                                                                </div>

                                                                {/* 🚀 Tabbed Learner Evidence Input per Criterion 🚀 */}
                                                                {block.requireEvidencePerCriterion !== false && (
                                                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                                                                        <div className="no-print" style={{ display: 'flex', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                                            {availableTabs.length > 0 ? availableTabs.map(t => (
                                                                                <button
                                                                                    key={t.id}
                                                                                    onClick={() => setActiveTabs({ ...activeTabs, [cTabKey]: t.id })}
                                                                                    style={{
                                                                                        flex: 1, padding: '8px', border: 'none', borderBottom: activeCTab === t.id ? '2px solid #8b5cf6' : '2px solid transparent',
                                                                                        background: activeCTab === t.id ? 'white' : 'transparent',
                                                                                        color: activeCTab === t.id ? '#7c3aed' : '#64748b',
                                                                                        fontSize: '0.75rem', fontWeight: activeCTab === t.id ? 'bold' : 'normal',
                                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer'
                                                                                    }}
                                                                                >
                                                                                    {t.icon} {t.label}
                                                                                    {!!t.val && <CheckCircle size={10} color="#10b981" />}
                                                                                </button>
                                                                            )) : (
                                                                                <div style={{ padding: '10px', fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>No evidence provided by learner.</div>
                                                                            )}
                                                                        </div>

                                                                        {availableTabs.length > 0 && (
                                                                            <div style={{ padding: '15px', background: 'white' }}>
                                                                                {activeCTab === 'upload' && (
                                                                                    currentProgress !== undefined ? (
                                                                                        <div style={{ padding: '15px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc' }}>
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>
                                                                                                <span>Uploading...</span>
                                                                                                <span>{currentProgress}%</span>
                                                                                            </div>
                                                                                            <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                                                                                <div style={{ width: `${currentProgress}%`, height: '100%', background: 'var(--mlab-blue)', transition: 'width 0.2s' }} />
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : critEvidence.uploadUrl ? (
                                                                                        <FilePreview url={critEvidence.uploadUrl} onRemove={canEditChecklist ? () => handleCriterionEvidenceChange(block.id, i, 'uploadUrl', '') : undefined} disabled={!canEditChecklist} />
                                                                                    ) : (
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                                            <input type="file" disabled={!canEditChecklist} onChange={(e) => {
                                                                                                if (e.target.files && e.target.files.length > 0) {
                                                                                                    handleFileUpload(e.target.files[0], block.id, true, i);
                                                                                                }
                                                                                            }} style={{ fontSize: '0.8rem', width: '100%' }} />
                                                                                        </div>
                                                                                    )
                                                                                )}
                                                                                {activeCTab === 'url' && (
                                                                                    <div>
                                                                                        {canEditChecklist && (
                                                                                            <div style={{ background: '#e0f2fe', borderLeft: '3px solid #0ea5e9', padding: '8px', marginBottom: '8px', fontSize: '0.75rem', color: '#0369a1', borderRadius: '4px' }}>
                                                                                                <strong>Note:</strong> If pasting a Google Drive/Docs link, ensure it is set to <em>"Anyone with the link can view"</em> so assessors can access it.
                                                                                            </div>
                                                                                        )}
                                                                                        {critEvidence.url && !canEditChecklist ? (
                                                                                            <UrlPreview url={critEvidence.url} />
                                                                                        ) : (
                                                                                            <input type="url" className="ab-input" value={critEvidence.url || ''} onChange={e => handleCriterionEvidenceChange(block.id, i, 'url', e.target.value)} disabled={!canEditChecklist} placeholder="https:// (Google Drive, Github, Docs...)" style={{ fontSize: '0.8rem' }} />
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                                {activeCTab === 'code' && (
                                                                                    <textarea className="ab-input" rows={3} value={critEvidence.code || ''} onChange={e => handleCriterionEvidenceChange(block.id, i, 'code', e.target.value)} disabled={!canEditChecklist} placeholder="Paste code snippet here..." style={{ fontSize: '0.8rem', fontFamily: 'monospace', background: '#1e293b', color: '#f8fafc', border: 'none' }} />
                                                                                )}
                                                                                {activeCTab === 'text' && (
                                                                                    <div className={`ap-quill-wrapper ${!canEditChecklist ? 'locked' : ''}`} style={{ border: 'none', padding: 0 }}>
                                                                                        <ReactQuill theme="snow" value={critEvidence.text || ''} onChange={(content) => handleCriterionEvidenceChange(block.id, i, 'text', content)} readOnly={!canEditChecklist} modules={quillModules} formats={quillFormats} placeholder="Type evidence notes here..." />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* 🚀 LOGBOOK (LEARNER INTERACTIVE) 🚀 */}
                                            {block.type === 'logbook' && (
                                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                                                    <div style={{ background: '#f8fafc', padding: '10px', borderBottom: '1px solid #e2e8f0' }}>
                                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>{block.content}</p>
                                                    </div>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left', background: 'white' }}>
                                                        <thead>
                                                            <tr style={{ background: '#f1f5f9', color: '#334155' }}>
                                                                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Date</th>
                                                                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Assignment Task</th>
                                                                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Start</th>
                                                                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Finish</th>
                                                                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1', width: '80px' }}>Hours</th>
                                                                {canEditLogbook && <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1', width: '40px' }}></th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
                                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                    <td style={{ padding: '5px' }}><input type="date" value={entry.date} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px' }} /></td>
                                                                    <td style={{ padding: '5px' }}><input type="text" value={entry.task} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].task = e.target.value; handleAnswerChange(block.id, n); }} style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px' }} placeholder="Task description" /></td>
                                                                    <td style={{ padding: '5px' }}><input type="time" value={entry.startTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px' }} /></td>
                                                                    <td style={{ padding: '5px' }}><input type="time" value={entry.endTime} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px' }} /></td>
                                                                    <td style={{ padding: '5px' }}><input type="number" value={entry.hours} disabled={!canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px' }} /></td>
                                                                    {canEditLogbook && <td style={{ padding: '5px', textAlign: 'center' }}><button onClick={() => { const n = learnerAns.filter((_: any, idx: number) => idx !== i); handleAnswerChange(block.id, n); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={14} /></button></td>}
                                                                </tr>
                                                            ))}
                                                            {canEditLogbook && (
                                                                <tr>
                                                                    <td colSpan={6} style={{ padding: '10px', textAlign: 'center' }}>
                                                                        <button onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])} style={{ background: '#f1f5f9', color: '#475569', border: '1px dashed #cbd5e1', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}><Plus size={14} /> Add Logbook Entry</button>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            <tr style={{ background: '#f8fafc' }}>
                                                                <td colSpan={4} style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#334155' }}>Total Logged Hours:</td>
                                                                <td style={{ padding: '10px', fontWeight: 'bold', color: '#ea580c' }}>{(Array.isArray(learnerAns) ? learnerAns : []).reduce((acc: number, curr: any) => acc + (Number(curr.hours) || 0), 0)}</td>
                                                                {canEditLogbook && <td></td>}
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {/* ── FEEDBACK PANELS ── */}
                                            {isFacDone && facFeedback && (
                                                <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, background: '#eff6ff', padding: '0.75rem', borderRadius: '4px', marginTop: '1rem' }}>
                                                    <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                        <span style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Info size={12} /> Facilitator Coaching</span>
                                                    </div>
                                                    <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#0369a1', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{facFeedback}</p>
                                                </div>
                                            )}
                                            {isAssDone && assFeedback && (
                                                <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, background: '#fef2f2', padding: '0.75rem', borderRadius: '4px', marginTop: '1rem' }}>
                                                    <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                        <span style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Award size={12} /> Assessor Grade</span>
                                                    </div>
                                                    <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#991b1b', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{assFeedback}</p>
                                                </div>
                                            )}
                                            {isModDone && modFeedback && (
                                                <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #22c55e`, background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px', marginTop: '1rem' }}>
                                                    <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                        <span style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} /> Moderator QA Notes</span>
                                                    </div>
                                                    <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#16a34a', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{modFeedback}</p>
                                                </div>
                                            )}

                                        </div>
                                    </div>
                                );
                            }

                            return null;
                        })}
                    </div>

                    {/* 🚀 POST-OBSERVATION SIGN-OFF BANNER OR STANDARD FOOTER 🚀 */}
                    {isAwaitingSignoff ? (
                        <div className="ap-footer" style={{ borderTop: '4px solid #f59e0b', background: '#fffbeb' }}>
                            <h3 className="ap-footer__title" style={{ color: '#d97706' }}>Practical Observation Completed</h3>
                            <p className="ap-footer__desc" style={{ color: '#92400e' }}>Your Mentor/Facilitator has evaluated your practical tasks. Please ensure you have uploaded your evidence links above, then review their feedback and sign off.</p>
                            <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`} style={{ borderColor: '#fcd34d' }}>
                                <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} style={{ accentColor: '#d97706' }} />
                                <span className="ap-footer-declaration__text" style={{ color: '#92400e' }}>
                                    <strong>Learner Observation Acknowledgement</strong>
                                    I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.
                                </span>
                            </label>
                            <div className="ap-footer-actions">
                                <span className="ap-autosave-label">
                                    {saving && <><div className="ap-spinner ap-spinner--sm" /> Saving…</>}
                                    {Object.keys(uploadProgress).length > 0 && <span style={{ color: '#d97706', fontWeight: 'bold', marginLeft: '10px' }}>Uploads in progress...</span>}
                                </span>
                                <button className="ap-btn" style={{ background: '#d97706', color: 'white' }} onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}>
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
                                <span className="ap-footer-declaration__text">
                                    <strong>Learner Final Declaration</strong>
                                    I confirm that this is my own work, completed without unauthorized assistance.
                                </span>
                            </label>
                            <div className="ap-footer-actions">
                                <span className="ap-autosave-label">
                                    {saving
                                        ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</>
                                        : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>
                                    }
                                    {Object.keys(uploadProgress).length > 0 && <span style={{ color: 'var(--mlab-blue)', fontWeight: 'bold', marginLeft: '10px' }}>Uploads in progress...</span>}
                                </span>
                                <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked || Object.keys(uploadProgress).length > 0}>
                                    <Save size={14} /> Submit for Grading
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="ap-footer ap-footer--locked no-print">
                            <div className="ap-footer--locked__icon-wrap">
                                {isModDone && outcome?.isCompetent === false ? (
                                    <AlertTriangle size={36} color="#d97706" />
                                ) : (
                                    <CheckCircle size={36} color="var(--mlab-green)" />
                                )}
                            </div>

                            {/* 🚀 MAX ATTEMPTS LOCKOUT VS STANDARD REMEDIATION */}
                            {isModDone && outcome?.isCompetent === false ? (
                                <>
                                    <h3 className="ap-footer--locked__title" style={{ color: '#d97706' }}>
                                        Assessment Outcome: Not Yet Competent (NYC)
                                    </h3>
                                    <div style={{ textAlign: 'left', maxWidth: '600px', margin: '1rem auto', background: '#fffbeb', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                                        <p style={{ margin: '0 0 1rem 0', color: '#92400e', fontSize: '0.9rem', lineHeight: '1.5' }}>
                                            Your assessment has been fully verified. At this stage, you have not yet met all the requirements for competency.
                                        </p>

                                        {(submission.attemptNumber || 1) >= 3 ? (
                                            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '1rem', borderRadius: '6px' }}>
                                                <h4 style={{ color: '#b91c1c', margin: '0 0 0.5rem 0', fontSize: '0.9rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <ShieldAlert size={16} /> Maximum Attempts Reached
                                                </h4>
                                                <p style={{ margin: 0, color: '#991b1b', fontSize: '0.85rem', lineHeight: '1.5' }}>
                                                    You have exhausted all 3 permitted attempts for this assessment. Under QCTO regulations, this workbook is now permanently locked. You must re-enroll in the module to try again, or you may lodge a formal appeal if you disagree with the assessment outcome.
                                                </p>
                                            </div>
                                        ) : (
                                            <>
                                                <h4 style={{ color: '#b45309', margin: '0 0 0.5rem 0', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>What happens next?</h4>
                                                <ol style={{ color: '#92400e', fontSize: '0.85rem', lineHeight: '1.6', paddingLeft: '1.25rem', margin: '0 0 1rem 0' }}>
                                                    <li><strong>Review Feedback:</strong> Please scroll up and review the Assessor's Red Pen feedback on your incorrect answers.</li>
                                                    <li><strong>Coaching:</strong> Your facilitator will schedule a brief intervention with you to discuss the feedback and guide you.</li>
                                                    <li><strong>Remediation:</strong> Following the coaching session, your facilitator will unlock this workbook so you can correct your answers and resubmit (Attempt {submission.attemptNumber ? submission.attemptNumber + 1 : 2} of 3).</li>
                                                </ol>
                                                <p style={{ margin: 0, color: '#b45309', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                                    Academic Rights: If you strongly disagree with this outcome after reviewing the feedback, you have the right to lodge a formal appeal with your training provider.
                                                </p>
                                            </>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3 className="ap-footer--locked__title">
                                        {submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}
                                    </h3>
                                    <p className="ap-footer--locked__desc">
                                        This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>.{' '}
                                        {isAssDone ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}
                                    </p>
                                </>
                            )}

                            <button className="ap-btn ap-btn--primary" onClick={() => navigate(-1)}>
                                <ArrowLeft size={14} /> Return to Portfolio
                            </button>
                        </div>
                    )}

                    {/* 🚀 TRI-LAYER PRINT SIGNATURES 🚀 */}
                    {(isLocked && !isAwaitingSignoff) && (
                        <div className="ap-signature-blocks">
                            <div className="ap-sig-box">
                                <span className="ap-sig-box__label">Learner Declaration</span>
                                <div className="ap-sig-box__img-wrap">
                                    {learnerProfile?.signatureUrl
                                        ? <img src={learnerProfile.signatureUrl} alt="Learner Signature" />
                                        : <span className="ap-sig-box__no-sig">No canvas signature on file</span>
                                    }
                                </div>
                                <span className="ap-sig-box__name">
                                    {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}
                                </span>
                                <span className="ap-sig-box__date">
                                    <Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}
                                </span>
                            </div>

                            {isAssDone && (
                                <div className="ap-sig-box">
                                    <span className="ap-sig-box__label" style={{ color: 'red' }}>Assessor Verification</span>
                                    <div className="ap-sig-box__img-wrap">
                                        {assessorProfile?.signatureUrl
                                            ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
                                            : <span className="ap-sig-box__no-sig" style={{ color: 'red' }}>No canvas signature on file</span>
                                        }
                                    </div>
                                    <span className="ap-sig-box__name" style={{ color: 'red' }}>
                                        {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
                                    </span>
                                    <span className="ap-sig-box__reg" style={{ color: 'red' }}>
                                        Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
                                    </span>
                                    <span className="ap-sig-box__date" style={{ color: 'red' }}>
                                        <Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
                                    </span>
                                </div>
                            )}

                            {isModDone && (
                                <div className="ap-sig-box">
                                    <span className="ap-sig-box__label" style={{ color: 'green' }}>Internal Moderation QA</span>
                                    <div className="ap-sig-box__img-wrap">
                                        {moderatorProfile?.signatureUrl
                                            ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
                                            : <span className="ap-sig-box__no-sig" style={{ color: 'green' }}>No canvas signature on file</span>
                                        }
                                    </div>
                                    <span className="ap-sig-box__name" style={{ color: 'green' }}>
                                        {moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}
                                    </span>
                                    <span className="ap-sig-box__reg" style={{ color: 'green' }}>
                                        Outcome: {submission.moderation?.outcome}
                                    </span>
                                    <span className="ap-sig-box__date" style={{ color: 'green' }}>
                                        <Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT SIDEBAR: AUDIT TRAIL */}
                {isLocked && !isAwaitingSignoff && (
                    <aside className="ap-right-sidebar no-print">
                        <h3 className="ap-right-sidebar__title">
                            <ShieldCheck size={16} color="#073f4e" /> Official Audit Trail
                        </h3>

                        <div className="ap-audit-card">
                            <span className="ap-audit-card__label">Learner Declaration</span>
                            <div className="ap-audit-card__sig-wrap">
                                {learnerProfile?.signatureUrl
                                    ? <img src={learnerProfile.signatureUrl} alt="Learner signature" />
                                    : <span className="ap-audit-card__sig-placeholder">No signature on file</span>
                                }
                            </div>
                            <span className="ap-audit-card__name">
                                {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}
                            </span>
                            <span className="ap-audit-card__sub">
                                <Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}
                            </span>
                        </div>

                        {outcome ? (
                            <div className="ap-audit-outcome" style={{ borderLeftColor: outcome.color }}>
                                <div className="ap-audit-outcome__label" style={{ color: outcome.color }}>{outcome.label}</div>
                                {outcome.score !== undefined && (
                                    <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>
                                        Score: {outcome.score} / {assessment.totalMarks} ({outcome.percentage}%)
                                    </div>
                                )}
                                <div className="ap-audit-outcome__note">{outcome.subtext}</div>
                            </div>
                        ) : (
                            <div className="ap-audit-card" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', textAlign: 'center', padding: '1.5rem' }}>
                                <Clock size={24} color="#94a3b8" style={{ margin: '0 auto 0.5rem' }} />
                                <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold' }}>Pending Outcome</span>
                                <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Your workbook is currently being evaluated.</span>
                            </div>
                        )}

                        {isFacDone && (
                            <div className="ap-audit-card">
                                <span className="ap-audit-card__label" style={{ color: 'blue' }}>Facilitator Pre-Marking</span>
                                <span className="ap-audit-card__name" style={{ color: 'blue' }}>
                                    {submission.grading?.facilitatorName || 'Facilitator'}
                                </span>
                                <span className="ap-audit-card__sub" style={{ color: 'blue' }}>
                                    <Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
                                </span>
                            </div>
                        )}

                        {isAssDone && (
                            <div className="ap-audit-card">
                                <span className="ap-audit-card__label" style={{ color: 'red' }}>Assessor Verification</span>
                                <div className="ap-audit-card__sig-wrap">
                                    {assessorProfile?.signatureUrl
                                        ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
                                        : <span className="ap-audit-card__sig-placeholder" style={{ color: 'red' }}>No signature on file</span>
                                    }
                                </div>
                                <span className="ap-audit-card__name" style={{ color: 'red' }}>
                                    {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
                                </span>
                                <span className="ap-audit-card__reg" style={{ color: 'red' }}>
                                    Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
                                </span>
                                <span className="ap-audit-card__sub" style={{ color: 'red' }}>
                                    <Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
                                </span>
                            </div>
                        )}

                        {isModDone && (
                            <div className="ap-audit-card">
                                <span className="ap-audit-card__label" style={{ color: 'green' }}>Internal Moderation QA</span>
                                <div className="ap-audit-card__sig-wrap">
                                    {moderatorProfile?.signatureUrl
                                        ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
                                        : <span className="ap-audit-card__sig-placeholder" style={{ color: 'green' }}>No signature on file</span>
                                    }
                                </div>
                                <span className="ap-audit-card__name" style={{ color: 'green' }}>
                                    {moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}
                                </span>
                                <span className="ap-audit-card__reg" style={{ color: 'green' }}>
                                    Outcome: {submission.moderation?.outcome}
                                </span>
                                <span className="ap-audit-card__sub" style={{ color: 'green' }}>
                                    <Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
                                </span>
                            </div>
                        )}
                    </aside>
                )}
            </div>
        </div>
    );
};

/* ── Confirm Modal ────────────────────────────────────────────────────────── */
const ConfirmModal: React.FC<{
    title: string; message: string; confirmText: string; cancelText: string;
    onConfirm: () => void; onCancel: () => void;
}> = ({ title, message, confirmText, cancelText, onConfirm, onCancel }) => {
    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; } .ap-player, .ap-player-body { overflow: hidden !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const modalContent = (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(5,46,58,0.7)', backdropFilter: 'blur(3px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', margin: 0 }}>
            <div className="ap-animate" style={{ background: 'white', maxWidth: '420px', width: '100%', textAlign: 'center', padding: 0, boxShadow: '0 24px 48px -8px rgba(5,46,58,0.35)', border: '1px solid var(--mlab-border)', borderTop: '5px solid var(--mlab-blue)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                <div style={{ padding: '2rem 2rem 1.25rem', borderBottom: '1px solid var(--mlab-border)' }}>
                    <div style={{ width: 56, height: 56, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}><AlertTriangle size={28} color="#d97706" /></div>
                    <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>{title}</h2>
                    <p style={{ color: 'var(--mlab-grey)', lineHeight: '1.65', margin: 0, fontSize: '0.9rem' }}>{message}</p>
                </div>
                <div style={{ display: 'flex' }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: '1rem', border: 'none', borderRight: '1px solid var(--mlab-border)', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{cancelText}</button>
                    <button onClick={onConfirm} style={{ flex: 1, padding: '1rem', border: 'none', background: 'var(--mlab-blue)', color: 'white', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{confirmText}</button>
                </div>
            </div>
        </div>
    );
    return createPortal(modalContent, document.body);
};

export default AssessmentPlayer;








// import React, { useState, useEffect, useRef } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import {
//     ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
//     AlertCircle, Play, Clock, GraduationCap,
//     BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
//     ShieldCheck, Hash, Activity, Award, BarChart, MessageSquare, Printer, Check, X,
//     RotateCcw
// } from 'lucide-react';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';

// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';

// import { createPortal } from 'react-dom';
// import './AssessmentPlayer.css';
// import moment from 'moment';

// export const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
//     const filterMap: any = {
//         black: 'brightness(0)',
//         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
//         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
//         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
//     };
//     return <img src={imageUrl} alt="Signature" style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain', filter: filterMap[color] || 'none' }} />;
// };

// const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['clean']] };
// const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// interface GradeData { score: number; feedback: string; isCorrect?: boolean | null; }

// export type StatusType = 'info' | 'success' | 'error' | 'warning';

// const AssessmentPlayer: React.FC = () => {
//     const { assessmentId } = useParams<{ assessmentId: string }>();
//     const navigate = useNavigate();
//     const { user } = useStore();
//     const toast = useToast();

//     const [loading, setLoading] = useState(true);
//     const [saving, setSaving] = useState(false);
//     const [assessment, setAssessment] = useState<any>(null);
//     const [submission, setSubmission] = useState<any>(null);
//     const [answers, setAnswers] = useState<Record<string, any>>({});

//     const [learnerProfile, setLearnerProfile] = useState<any>(null);
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

//     // 🚀 STRICT STATUS FLAGS (Controls visibility of marking elements)
//     const isSubmitted = ['submitted', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
//     const isFacDone = ['facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(currentStatus);
//     const isAssDone = ['graded', 'moderated', 'returned'].includes(currentStatus);
//     const isModDone = ['moderated'].includes(currentStatus);

//     const isRemediation = (submission?.attemptNumber || 1) > 1;
//     const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged;
//     const isNotStarted = currentStatus === 'not_started';
//     const showGate = isNotStarted || needsRemediationGate;
//     const isLocked = isSubmitted;

//     const getBlockGrading = (blockId: string) => {
//         if (!isFacDone) return { score: undefined, facFeedback: '', assFeedback: '', modFeedback: '', facIsCorrect: null, assIsCorrect: null, modIsCorrect: null, isCorrect: null };

//         const g = submission?.grading || {};
//         const m = submission?.moderation || {};

//         const mLayer = m.breakdown?.[blockId] || {};
//         const aLayer = g.assessorBreakdown?.[blockId] || {};
//         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
//         const legacyLayer = g.breakdown?.[blockId] || {};

//         let activeLayer = legacyLayer || { score: 0, isCorrect: null };
//         if (isFacDone) activeLayer = fLayer;
//         if (isAssDone) activeLayer = aLayer;
//         if (isModDone) activeLayer = mLayer;

//         return {
//             score: activeLayer.score,
//             isCorrect: activeLayer.isCorrect,
//             facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
//             assIsCorrect: aLayer.isCorrect,
//             modIsCorrect: mLayer.isCorrect,
//             facFeedback: fLayer.feedback || legacyLayer.feedback || '',
//             assFeedback: aLayer.feedback || '',
//             modFeedback: mLayer.feedback || ''
//         };
//     };

//     const sectionTotals: Record<string, { total: number, awarded: number }> = {};
//     let currentSectionId = '';
//     if (assessment?.blocks) {
//         assessment.blocks.forEach((block: any) => {
//             if (block.type === 'section') {
//                 currentSectionId = block.id;
//                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
//             } else if ((block.type === 'mcq' || block.type === 'text') && currentSectionId) {
//                 const { score } = getBlockGrading(block.id);
//                 sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
//                 if (score !== undefined && score !== null) sectionTotals[currentSectionId].awarded += Number(score);
//             }
//         });
//     }

//     const getCompetencyStatus = () => {
//         if (!isAssDone) return null;
//         if (isRemediation && !isLocked) return null;

//         const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
//         let isCompetent = compStr === 'c' || compStr === 'competent';
//         const actualScore = submission?.marks !== undefined ? submission.marks : submission?.totalScore;
//         if (!isCompetent && actualScore !== undefined && assessment?.totalMarks) {
//             isCompetent = actualScore >= (assessment.totalMarks * 0.6);
//         }
//         const percentage = actualScore !== undefined && assessment?.totalMarks
//             ? Math.round((actualScore / assessment.totalMarks) * 100) : null;

//         return {
//             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
//             color: isModDone ? 'green' : 'red',
//             subtext: isModDone
//                 ? 'Final Results Verified & Endorsed.'
//                 : (isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.'),
//             score: actualScore, percentage, isCompetent
//         };
//     };

//     const outcome = getCompetencyStatus();

//     const getSafeDate = (dateString: string) => {
//         if (!dateString) return 'recently';
//         const date = new Date(dateString);
//         if (isNaN(date.getTime())) return 'recently';
//         return date.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
//     };

//     useEffect(() => {
//         const fetchSecureTimeOffset = async () => {
//             try {
//                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
//                 const data = await res.json();
//                 setTimeOffset(new Date(data.utc_datetime).getTime() - new Date().getTime());
//             } catch { setTimeOffset(0); }
//         };
//         fetchSecureTimeOffset();
//     }, []);

//     const getSecureNow = () => new Date().getTime() + timeOffset;

//     useEffect(() => {
//         const loadAssessment = async () => {
//             if (!user?.uid || !assessmentId) return;
//             if (user.role && user.role !== 'learner') { setIsAdminIntercept(true); setLoading(false); return; }

//             try {
//                 const assessmentSnap = await getDoc(doc(db, 'assessments', assessmentId));
//                 if (!assessmentSnap.exists()) { toast.error('Assessment template not found.'); setLoading(false); return; }
//                 setAssessment(assessmentSnap.data());

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

//                 const subQuery = query(
//                     collection(db, 'learner_submissions'),
//                     where('learnerId', '==', actualLearnerDocId),
//                     where('assessmentId', '==', assessmentId)
//                 );
//                 const subQuerySnap = await getDocs(subQuery);

//                 let activeSub = null;
//                 if (!subQuerySnap.empty) {
//                     const cohortMatch = subQuerySnap.docs.find(d => d.data().cohortId === activeCohortId);
//                     if (cohortMatch) {
//                         activeSub = { id: cohortMatch.id, ...cohortMatch.data() };
//                     } else {
//                         const sorted = subQuerySnap.docs.map(d => ({ id: d.id, ...d.data() }) as any).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
//                         activeSub = sorted[0];
//                     }
//                 }

//                 if (activeSub) {
//                     setSubmission(activeSub);
//                     setAnswers(activeSub.answers || {});

//                     if (activeSub.grading?.gradedBy) {
//                         const assSnap = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
//                         if (assSnap.exists()) setAssessorProfile(assSnap.data());
//                     }
//                     if (activeSub.moderation?.moderatedBy) {
//                         const modSnap = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
//                         if (modSnap.exists()) setModeratorProfile(modSnap.data());
//                     }

//                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
//                     if (facId) {
//                         const facSnap = await getDoc(doc(db, 'users', facId));
//                         if (facSnap.exists()) setFacilitatorProfile(facSnap.data());
//                     }

//                     const _needsRemediationGate = (activeSub.attemptNumber || 1) > 1 && activeSub.latestCoachingLog && !activeSub.latestCoachingLog.acknowledged;
//                     const _showGate = activeSub.status === 'not_started' || _needsRemediationGate;

//                     if (activeSub.status === 'in_progress' && assessmentSnap.data().moduleInfo?.timeLimit > 0 && !_showGate) {
//                         const startTime = new Date(activeSub.startedAt).getTime();
//                         const endTime = startTime + (assessmentSnap.data().moduleInfo.timeLimit * 60 * 1000);
//                         const remainingSeconds = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
//                         setTimeLeft(remainingSeconds);
//                         if (remainingSeconds === 0) forceAutoSubmit(activeSub.id, activeSub.answers || {});
//                     }
//                 } else {
//                     toast.error('You are not assigned to this assessment in your current class.');
//                 }
//             } catch (error) {
//                 console.error('Error loading assessment:', error);
//                 toast.error('Failed to load assessment data.');
//             } finally {
//                 setLoading(false);
//             }
//         };

//         if (timeOffset !== null) loadAssessment();
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [assessmentId, user?.uid, timeOffset]);

//     useEffect(() => {
//         if (timeLeft === null || isLocked || showGate) return;
//         if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
//         const timerId = setInterval(() => {
//             const startTime = new Date(submission.startedAt).getTime();
//             const endTime = startTime + (assessment.moduleInfo.timeLimit * 60 * 1000);
//             setTimeLeft(Math.max(0, Math.floor((endTime - getSecureNow()) / 1000)));
//         }, 1000);
//         return () => clearInterval(timerId);
//     }, [timeLeft, isLocked, showGate, submission?.startedAt]);

//     const formatTime = (seconds: number) => {
//         const h = Math.floor(seconds / 3600);
//         const m = Math.floor((seconds % 3600) / 60);
//         const s = seconds % 60;
//         if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
//         return `${m}m ${s.toString().padStart(2, '0')}s`;
//     };

//     const handleStartAssessment = async () => {
//         if (!startDeclarationChecked) return;
//         if (needsRemediationGate && !coachingAckChecked) return;

//         setSaving(true);
//         try {
//             const secureStartTime = new Date(getSecureNow()).toISOString();
//             const updatePayload: any = { status: 'in_progress', startedAt: secureStartTime };

//             if (needsRemediationGate) {
//                 updatePayload['latestCoachingLog.acknowledged'] = true;
//                 updatePayload['latestCoachingLog.acknowledgedAt'] = secureStartTime;
//             }

//             await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);

//             setSubmission((prev: any) => ({
//                 ...prev, status: 'in_progress', startedAt: secureStartTime,
//                 latestCoachingLog: prev.latestCoachingLog ? { ...prev.latestCoachingLog, acknowledged: true, acknowledgedAt: secureStartTime } : prev.latestCoachingLog
//             }));

//             if (assessment.moduleInfo?.timeLimit > 0) setTimeLeft(assessment.moduleInfo.timeLimit * 60);
//         } catch { toast.error('Failed to start assessment.'); } finally { setSaving(false); }
//     };

//     const handleAnswerChange = (blockId: string, value: string | number) => {
//         if (isLocked) return;
//         setAnswers(prev => {
//             const newAnswers = { ...prev, [blockId]: value };
//             if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
//             saveTimeoutRef.current = setTimeout(async () => {
//                 if (!submission?.id) return;
//                 setSaving(true);
//                 try {
//                     await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
//                 } catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
//             }, 1200);
//             return newAnswers;
//         });
//     };

//     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
//         setSaving(true);
//         const submitTime = new Date(getSecureNow()).toISOString();
//         try {
//             await updateDoc(doc(db, 'learner_submissions', subId), {
//                 answers: currentAnswers, status: 'submitted', submittedAt: submitTime, autoSubmitted: true,
//                 learnerDeclaration: { agreed: true, timestamp: submitTime, learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown', learnerIdNumber: learnerProfile?.idNumber || 'Unknown' }
//             });
//             toast.success("Time's up! Assessment auto-submitted.");
//             setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
//             setTimeout(() => navigate(-1), 3000);
//         } catch (error) { console.error("Auto-submit failed", error); } finally { setSaving(false); }
//     };

//     const handleNavigationLeave = () => {
//         if (!isLocked && assessment.moduleInfo?.timeLimit > 0 && !showGate) setShowLeaveWarning(true);
//         else navigate(-1);
//     };

//     const triggerSubmitConfirm = () => {
//         if (!declarationChecked) return toast.warning('You must agree to the final declaration.');
//         setShowSubmitConfirm(true);
//     };

//     const executeSubmit = async () => {
//         setShowSubmitConfirm(false);
//         setSaving(true);
//         const submitTime = new Date(getSecureNow()).toISOString();
//         try {
//             await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                 answers, status: 'submitted', submittedAt: submitTime,
//                 learnerDeclaration: { agreed: true, timestamp: submitTime, learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown', learnerIdNumber: learnerProfile?.idNumber || 'Unknown' }
//             });
//             toast.success('Assessment submitted!');
//             setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
//             setTimeout(() => window.scrollTo(0, 0), 1000);
//         } catch { toast.error('Failed to submit.'); } finally { setSaving(false); }
//     };

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
//                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><ShieldAlert size={32} color="var(--mlab-blue)" /></div>
//                 <h1 className="ap-state-card__title">Staff Access Detected</h1>
//                 <p className="ap-state-card__desc">This area is restricted to learners only.<br />Please use Preview mode to view assessments without affecting learner data.</p>
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
//                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', opacity: 0.5 }}><AlertCircle size={32} color="var(--mlab-grey)" /></div>
//                 <h2 className="ap-state-card__title">Assessment Unavailable</h2>
//                 <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Please contact your facilitator if you believe this is an error.</p>
//                 <div className="ap-state-card__actions"><button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button></div>
//             </div>
//         </div>
//     );

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
//                             <span style={{ marginLeft: '12px', fontSize: '0.8rem', background: '#f59e0b', color: 'white', padding: '4px 10px', borderRadius: '12px', verticalAlign: 'middle', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                 Attempt #{submission.attemptNumber}
//                             </span>
//                         )}
//                     </h1>

//                     <p className="ap-gate-left__sub">
//                         {isRemediation ? "This is a fresh attempt. Your previous answers have been retained. Please use the Facilitator's Coaching Notes below to correct your answers and resubmit." : "Read all instructions carefully before starting."}
//                     </p>

//                     {needsRemediationGate && (
//                         <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
//                             <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', marginBottom: '8px' }}>
//                                 <MessageSquare size={18} /> Remediation Coaching Log
//                             </strong>
//                             <p style={{ margin: '0 0 10px 0', color: '#92400e', fontSize: '0.85rem' }}>
//                                 Before beginning Attempt #{submission.attemptNumber}, QCTO compliance requires you to acknowledge the feedback session conducted by your facilitator.
//                             </p>
//                             <div style={{ background: 'white', padding: '10px', borderRadius: '4px', border: '1px solid #fde68a', marginBottom: '10px' }}>
//                                 <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 'bold', textTransform: 'uppercase' }}>Facilitator Notes ({getSafeDate(submission.latestCoachingLog.date)}):</span>
//                                 <p style={{ margin: '4px 0 0 0', color: '#78350f', fontStyle: 'italic', fontSize: '0.9rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
//                                     "{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}
//                                 </p>
//                             </div>
//                             <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
//                                 <input
//                                     type="checkbox"
//                                     checked={coachingAckChecked}
//                                     onChange={e => setCoachingAckChecked(e.target.checked)}
//                                     style={{ marginTop: '2px', accentColor: '#f59e0b', width: '16px', height: '16px' }}
//                                 />
//                                 <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 'bold' }}>
//                                     I acknowledge that I received the coaching/feedback detailed above.
//                                 </span>
//                             </label>
//                         </div>
//                     )}

//                     <div className="ap-info-grid">
//                         <div className="ap-info-card"><div className="ap-info-card__label"><BookOpen size={12} /> Module</div><div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div><div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div></div>
//                         <div className="ap-info-card"><div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div><div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div><div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div></div>
//                         <div className="ap-info-card"><div className="ap-info-card__label"><Clock size={12} /> Time Limit</div><div className="ap-info-card__value">{assessment.moduleInfo?.timeLimit ? `${assessment.moduleInfo.timeLimit} Min` : 'No Limit'}</div><div className="ap-info-card__sub">{assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}</div></div>
//                         <div className="ap-info-card"><div className="ap-info-card__label"><Scale size={12} /> Total Marks</div><div className="ap-info-card__value">{assessment.totalMarks}</div><div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div></div>
//                     </div>

//                     <div className="ap-note-block">
//                         <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
//                         <p className="ap-note-block__text">{assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
//                         {assessment.purpose && <><div className="ap-note-block__heading"><Info size={12} /> Purpose</div><p className="ap-note-block__text">{assessment.purpose}</p></>}
//                     </div>
//                 </div>

//                 <div className="ap-gate-right">
//                     <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
//                     <ul className="ap-rules-list">
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><Scale size={18} /></div><div><span className="ap-rule-title">Academic Integrity</span><p className="ap-rule-desc">All work must be entirely your own. Plagiarism or use of unauthorized AI tools violates QCTO guidelines.</p></div></li>
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><UserCheck size={18} /></div><div><span className="ap-rule-title">Independent Work</span><p className="ap-rule-desc">Unless explicitly stated as a group project, no collaboration is permitted.</p></div></li>
//                         <li className="ap-rule-item"><div className="ap-rule-icon"><Wifi size={18} /></div><div><span className="ap-rule-title">Auto-Save</span><p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p></div></li>
//                         {assessment.moduleInfo?.timeLimit > 0 && <li className="ap-rule-item"><div className="ap-rule-icon"><Clock size={18} /></div><div><span className="ap-rule-title">Timed Assessment</span><p className="ap-rule-desc">The countdown continues even if you close the browser tab. Plan your time carefully.</p></div></li>}
//                     </ul>

//                     <div className="ap-declaration">
//                         <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
//                             <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
//                             <span className="ap-declaration-check__text"><strong>Declaration of Authenticity</strong> I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.</span>
//                         </label>
//                         <button className={`ap-start-btn${(startDeclarationChecked && (!needsRemediationGate || coachingAckChecked)) ? ' ap-start-btn--ready' : ''}`} onClick={handleStartAssessment} disabled={saving || !startDeclarationChecked || (needsRemediationGate && !coachingAckChecked)}>
//                             {saving ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> {needsRemediationGate ? `Acknowledge & Resume Attempt #${submission.attemptNumber}` : 'I Agree, Begin Assessment'}</>}
//                         </button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );

//     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
//         if (block.type === 'section') acc.push({ type: 'section', label: block.title, id: block.id });
//         else if (block.type === 'text' || block.type === 'mcq') acc.push({ type: 'q', label: block.question, id: block.id });
//         return acc;
//     }, []) || [];

//     let displayStatus = submission.status.replace('_', ' ');
//     if (submission.status === 'returned') displayStatus = 'revision required';

//     return (
//         <div className="ap-player ap-animate">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)} />}
//             {showSubmitConfirm && <ConfirmModal title="Submit Assessment?" message="You are about to submit this workbook for grading. You will NOT be able to change your answers after submission." confirmText="Submit for Grading" cancelText="Go Back" onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}

//             <div className="ap-player-topbar no-print">
//                 <div className="ap-player-topbar__left">
//                     <button className="ap-player-topbar__back" onClick={handleNavigationLeave}><ArrowLeft size={13} /> Portfolio</button>
//                     <div className="ap-player-topbar__separator" />
//                     <h1 className="ap-player-topbar__title">
//                         {assessment.title}
//                         {submission?.attemptNumber > 1 && (
//                             <span style={{ marginLeft: '10px', fontSize: '0.7rem', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                 Attempt #{submission.attemptNumber}
//                             </span>
//                         )}
//                     </h1>
//                 </div>

//                 <div className="ap-player-topbar__right">
//                     {isLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={13} /> Print Audit</button>}
//                     {!isLocked && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
//                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
//                     <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
//                 </div>
//             </div>

//             <div className={`ap-player-body${isLocked ? ' is-locked' : ''}`}>
//                 <nav className="ap-sidebar no-print">
//                     <div className="ap-sidebar__meta-block">
//                         <div className="ap-sidebar__meta-title">{assessment.title}</div>
//                         {submission?.attemptNumber > 1 && (
//                             <div className="ap-sidebar__detail" style={{ color: '#d97706', fontWeight: 'bold' }}>
//                                 <RotateCcw size={11} /> Attempt #{submission.attemptNumber}
//                             </div>
//                         )}
//                         <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
//                         <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div>
//                         <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>
//                     </div>

//                     {(submission.status !== 'not_started' && submission.status !== 'in_progress') && (
//                         <>
//                             <div className="ap-sidebar__label">Status Tracking</div>
//                             <div className="ap-sidebar__status-box">

//                                 {isAssDone && outcome ? (
//                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
//                                         <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
//                                         {outcome.score !== undefined && <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
//                                         <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
//                                     </div>
//                                 ) : (
//                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}><div className="ap-sidebar__outcome-val" style={{ color: '#cbd5e1' }}>Awaiting Grade</div><div className="ap-sidebar__outcome-note">The Assessor has not yet finalized your official results.</div></div>
//                                 )}

//                                 {isFacDone && submission.grading?.facilitatorOverallFeedback && (
//                                     <div style={{ background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid rgba(56, 189, 248, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
//                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><Info size={11} /> Facilitator Summary</strong>
//                                         <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.grading.facilitatorOverallFeedback}</p>
//                                     </div>
//                                 )}

//                                 {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
//                                     <div style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid rgba(245,158,11,0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
//                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'red', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><MessageSquare size={11} /> Assessor Remarks</strong>
//                                         <p style={{ margin: 0, color: 'red', fontSize: '0.78rem', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p>
//                                     </div>
//                                 )}

//                                 {isModDone && submission.moderation?.feedback && (
//                                     <div style={{ background: 'rgba(34, 197, 94, 0.08)', borderLeft: '3px solid rgba(34, 197, 94, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
//                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#4ade80', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><ShieldCheck size={11} /> QA Endorsement Notes</strong>
//                                         <p style={{ margin: 0, color: '#4ade80', fontSize: '0.78rem', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.moderation.feedback}</p>
//                                     </div>
//                                 )}

//                                 <div className="ap-sidebar__timeline-item">
//                                     <div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div>
//                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Facilitator Review</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? 'Waiting for Facilitator' : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div>
//                                 </div>
//                                 <div className="ap-sidebar__timeline-item">
//                                     <div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div>
//                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div>
//                                 </div>
//                                 <div className="ap-sidebar__timeline-item">
//                                     <div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div>
//                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `Endorsed ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div>
//                                 </div>
//                             </div>
//                         </>
//                     )}

//                     <div className="ap-sidebar__label">Workbook Contents</div>
//                     <div className="ap-sidebar__nav">
//                         {navItems.map((item: any) =>
//                             item.type === 'section' ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span> : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item">{item.label.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
//                         )}
//                     </div>
//                 </nav>

//                 <div className="ap-player-content print-pane">
//                     {isLocked && (
//                         <div className="print-only-cover">
//                             <div className="print-page">
//                                 <h1 style={{ textAlign: 'center', textTransform: 'uppercase', fontSize: '18pt', marginBottom: '10px' }}>{assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}</h1>
//                                 <h2 style={{ textAlign: 'center', fontSize: '16pt', marginBottom: '30px', textDecoration: 'underline' }}>
//                                     LEARNER WORKBOOK {submission?.attemptNumber > 1 ? `- ATTEMPT #${submission.attemptNumber}` : ''}
//                                 </h2>

//                                 <table className="print-table" style={{ width: '100%', marginBottom: '40px' }}>
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

//                                 <h3 style={{ fontSize: '14pt', marginBottom: '10px' }}>CONTACT INFORMATION:</h3>
//                                 <table className="print-table" style={{ width: '100%' }}>
//                                     <tbody>
//                                         <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '________________________'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || user?.email || '________________________'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Telephone (W)</td><td>{learnerProfile?.telephoneWork || '________________________'}</td></tr>
//                                         <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
//                                     </tbody>
//                                 </table>
//                             </div>

//                             <div className="print-page">
//                                 <h3>Note to the learner</h3><p>{assessment?.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
//                                 <h3>Purpose</h3><p>{assessment?.purpose || 'The main focus of the learning in this knowledge module is to build an understanding of the concepts related to this subject matter.'}</p>
//                                 <h3>Topic elements to be covered include</h3>
//                                 <table className="print-table no-border" style={{ width: '100%', fontSize: '10pt' }}>
//                                     <tbody>
//                                         {assessment?.moduleInfo?.topics && assessment.moduleInfo.topics.length > 0 ? (
//                                             assessment.moduleInfo.topics.map((topic: any, idx: number) => (
//                                                 <tr key={idx}><td>{topic.code ? <strong>{topic.code}: </strong> : ''}{topic.title || topic.name}</td><td>{topic.weight || topic.percentage}%</td></tr>
//                                             ))
//                                         ) : (assessment?.blocks?.filter((b: any) => b.type === 'section').length > 0) ? (
//                                             assessment.blocks.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
//                                                 const secTotal = sectionTotals[sec.id]?.total || 0;
//                                                 const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
//                                                 return (<tr key={idx}><td><strong>Section {idx + 1}: </strong> {sec.title}</td><td>{secTotal > 0 ? `${pct}%` : '—'}</td></tr>)
//                                             })
//                                         ) : (<tr><td colSpan={2} style={{ fontStyle: 'italic', color: '#64748b' }}>(No specific sections mapped)</td></tr>)}
//                                     </tbody>
//                                 </table>
//                             </div>

//                             <div className="print-page">
//                                 <h3>Entry Requirements</h3><p>{assessment?.moduleInfo?.entryRequirements || `NQF Level ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}</p>
//                                 <h3>Provider Accreditation Requirements for the Knowledge Module</h3><p><strong>Physical Requirements:</strong><br />{assessment?.moduleInfo?.physicalRequirements || 'The provider must have structured learning material or provide learners with access to structured learning material that addresses all the topics in all the knowledge modules.'}</p>
//                                 <h3>QCTO / SETA requirements</h3>
//                                 <p><strong>Human Resource Requirements:</strong></p>
//                                 <ul style={{ marginBottom: '15px' }}>
//                                     <li>Lecturer/learner ratio of {assessment?.moduleInfo?.lecturerRatio || '1:20'} (Maximum)</li>
//                                     <li>Qualification of lecturer (SME): {assessment?.moduleInfo?.lecturerQualification || `Industry recognised qualifications with experience in the related industry`}</li>
//                                     {assessment?.moduleInfo?.vendorCertification && <li>{assessment.moduleInfo.vendorCertification}</li>}
//                                     <li>Assessors and moderators: accredited by the relevant SETA</li>
//                                 </ul>
//                                 <p><strong>Legal Requirements:</strong></p>
//                                 <ul style={{ marginBottom: '15px' }}>
//                                     <li>Legal (product) licences to use the software for learning and training (where applicable)</li>
//                                     <li>OHS compliance certificate</li>
//                                     <li>Ethical clearance (where necessary)</li>
//                                 </ul>
//                                 <h3>Exemptions</h3><p>{assessment?.moduleInfo?.exemptions || 'No exemptions, but the module can be achieved in full through a normal RPL process.'}</p>
//                                 <h3>Venue, Date and Time:</h3><p><strong>Venue:</strong> {assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform'}</p><p><strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}</p>
//                             </div>

//                             {/* 🚀 OFFICIAL REMEDIATION RECORD (PRINT ONLY) 🚀 */}
//                             {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
//                                 <div className="print-page">
//                                     <h3>Record of Developmental Intervention (Remediation)</h3>
//                                     <p style={{ marginBottom: '15px' }}>This section serves as official evidence that a developmental intervention was conducted prior to the learner's Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>

//                                     <table className="print-table" style={{ width: '100%', marginBottom: '30px' }}>
//                                         <tbody>
//                                             <tr><td style={{ width: '30%', fontWeight: 'bold' }}>Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
//                                             <tr><td style={{ fontWeight: 'bold' }}>Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString()}</td></tr>
//                                             <tr><td style={{ fontWeight: 'bold' }}>Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
//                                             <tr><td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>Coaching Notes</td><td style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.latestCoachingLog.notes}</td></tr>
//                                         </tbody>
//                                     </table>

//                                     <div className="sr-signature-block" style={{ marginTop: '40px', justifyContent: 'flex-start', gap: '2rem' }}>
//                                         <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue', flex: '0 1 300px' }}>
//                                             <span style={{ color: 'blue' }}>Facilitator Declaration</span>
//                                             {facilitatorProfile?.signatureUrl
//                                                 ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" />
//                                                 : <div className="sr-sig-no-image" style={{ color: 'blue' }}>No Canvas Signature</div>
//                                             }
//                                             <strong style={{ color: 'blue' }}>{submission.latestCoachingLog.facilitatorName}</strong>
//                                             <em style={{ color: 'blue' }}>Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</em>
//                                             <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>Coaching Conducted</div>
//                                         </div>

//                                         <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
//                                             <span style={{ color: 'black' }}>Learner Acknowledgement</span>
//                                             {submission.latestCoachingLog.acknowledged ? (
//                                                 <>
//                                                     {learnerProfile?.signatureUrl
//                                                         ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
//                                                         : <div className="sr-sig-no-image" style={{ color: 'black' }}>No Canvas Signature</div>
//                                                     }
//                                                     <strong style={{ color: 'black' }}>{learnerProfile?.fullName || user?.fullName}</strong>
//                                                     <em style={{ color: 'black' }}>Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString()}</em>
//                                                     <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Intervention Received</div>
//                                                 </>
//                                             ) : (
//                                                 <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
//                                                     <div className="sr-sig-no-image" style={{ color: 'black', border: 'none' }}>Pending Signature</div>
//                                                     <div className="sr-sig-line" style={{ borderTopColor: 'black', width: '80%', marginTop: '10px' }}>Awaiting Learner</div>
//                                                 </div>
//                                             )}
//                                         </div>
//                                     </div>
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {isLocked && (
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

//                     <div className="ap-blocks">
//                         {assessment.blocks?.map((block: any, idx: number) => {

//                             if (block.type === 'section') {
//                                 const totals = sectionTotals[block.id];
//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
//                                         <span>{block.title}</span>
//                                         {isAssDone && totals && totals.total > 0 && (
//                                             <span className="no-print" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px' }}>
//                                                 <BarChart size={13} /> {totals.awarded}/{totals.total}
//                                             </span>
//                                         )}
//                                     </div>
//                                 );
//                             }

//                             if (block.type === 'info') return (
//                                 <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
//                                     <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
//                                     <p className="ap-block-info__text">{block.content}</p>
//                                 </div>
//                             );

//                             const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect } = getBlockGrading(block.id);

//                             let activeInkColor = 'transparent';
//                             if (isModDone) activeInkColor = 'green';
//                             else if (isAssDone) activeInkColor = 'red';
//                             else if (isFacDone) activeInkColor = 'blue';

//                             const markLabel = isFacDone && blockScore !== undefined && blockScore !== null
//                                 ? `${blockScore} / ${block.marks}`
//                                 : `${block.marks} Marks`;

//                             const TopRightIndicator = () => {
//                                 return (
//                                     <div style={{ display: 'flex', gap: '8px', marginLeft: '12px', alignItems: 'center' }}>
//                                         {isFacDone && facIsCorrect !== null && facIsCorrect !== undefined && (
//                                             <div title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
//                                                 {facIsCorrect ? <Check size={18} color="#0284c7" strokeWidth={3} /> : <X size={18} color="#0284c7" strokeWidth={3} />}
//                                             </div>
//                                         )}
//                                         {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && (
//                                             <div title="Official Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px' }}>
//                                                 {assIsCorrect ? <Check size={18} color="#ef4444" strokeWidth={3} /> : <X size={18} color="#ef4444" strokeWidth={3} />}
//                                             </div>
//                                         )}
//                                         {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && (
//                                             <div title="Internal Moderation QA" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 6px', borderRadius: '4px' }}>
//                                                 {modIsCorrect ? <Check size={18} color="#22c55e" strokeWidth={3} /> : <X size={18} color="#22c55e" strokeWidth={3} />}
//                                             </div>
//                                         )}
//                                     </div>
//                                 );
//                             };

//                             if (block.type === 'mcq') return (
//                                 <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
//                                     <div className="ap-block-question__header">
//                                         <div className="ap-block-question__text-wrap" style={{ display: 'flex', alignItems: 'flex-start' }}>
//                                             <span className="ap-block-question__text"><strong style={{ color: '#94a3b8', marginRight: '8px' }}>Q{idx + 1}.</strong>{block.question}</span>
//                                             <TopRightIndicator />
//                                         </div>
//                                         <span className="ap-block-question__marks" style={{ color: activeInkColor !== 'transparent' ? activeInkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
//                                     </div>
//                                     <div className="ap-block-question__body">
//                                         <div className="ap-mcq-options">
//                                             {block.options?.map((opt: string, i: number) => {
//                                                 const selected = answers[block.id] === i;
//                                                 return (
//                                                     <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isLocked ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
//                                                         <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isLocked} onChange={() => handleAnswerChange(block.id, i)} />
//                                                         <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
//                                                         <span className="ap-mcq-label__text">{opt}</span>
//                                                     </label>
//                                                 );
//                                             })}
//                                         </div>

//                                         <div className="ap-feedback-stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
//                                             {isFacDone && facFeedback && (
//                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, background: '#eff6ff', padding: '0.75rem', borderRadius: '4px' }}>
//                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
//                                                         <span style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Info size={12} /> Facilitator Coaching</span>
//                                                     </div>
//                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#0369a1', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{facFeedback}</p>
//                                                 </div>
//                                             )}
//                                             {isAssDone && assFeedback && (
//                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, background: '#fef2f2', padding: '0.75rem', borderRadius: '4px' }}>
//                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
//                                                         <span style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Award size={12} /> Assessor Grade</span>
//                                                     </div>
//                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#991b1b', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{assFeedback}</p>
//                                                 </div>
//                                             )}
//                                             {isModDone && modFeedback && (
//                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #22c55e`, background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px' }}>
//                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
//                                                         <span style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} /> Moderator QA Notes</span>
//                                                     </div>
//                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#16a34a', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{modFeedback}</p>
//                                                 </div>
//                                             )}
//                                         </div>
//                                     </div>
//                                 </div>
//                             );

//                             if (block.type === 'text') return (
//                                 <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
//                                     <div className="ap-block-question__header">
//                                         <div className="ap-block-question__text-wrap" style={{ display: 'flex', alignItems: 'flex-start' }}>
//                                             <span className="ap-block-question__text"><strong style={{ color: '#94a3b8', marginRight: '8px' }}>Q{idx + 1}.</strong>{block.question}</span>
//                                             <TopRightIndicator />
//                                         </div>
//                                         <span className="ap-block-question__marks" style={{ color: activeInkColor !== 'transparent' ? activeInkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
//                                     </div>
//                                     <div className="ap-block-question__body">
//                                         <div className={`ap-quill-wrapper ${isLocked ? 'locked' : ''}`}>
//                                             <ReactQuill theme="snow" value={answers[block.id] || ''} onChange={(content) => handleAnswerChange(block.id, content)} readOnly={isLocked} modules={quillModules} formats={quillFormats} placeholder={isLocked ? 'No answer provided.' : 'Type your detailed response here...'} />
//                                         </div>

//                                         <div className="ap-feedback-stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
//                                             {isFacDone && facFeedback && (
//                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, background: '#eff6ff', padding: '0.75rem', borderRadius: '4px' }}>
//                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
//                                                         <span style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Info size={12} /> Facilitator Coaching</span>
//                                                     </div>
//                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#0369a1', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{facFeedback}</p>
//                                                 </div>
//                                             )}
//                                             {isAssDone && assFeedback && (
//                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, background: '#fef2f2', padding: '0.75rem', borderRadius: '4px' }}>
//                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
//                                                         <span style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Award size={12} /> Assessor Grade</span>
//                                                     </div>
//                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#991b1b', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{assFeedback}</p>
//                                                 </div>
//                                             )}
//                                             {isModDone && modFeedback && (
//                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #22c55e`, background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px' }}>
//                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
//                                                         <span style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} /> Moderator QA Notes</span>
//                                                     </div>
//                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#16a34a', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{modFeedback}</p>
//                                                 </div>
//                                             )}
//                                         </div>
//                                     </div>
//                                 </div>
//                             );

//                             return null;
//                         })}
//                     </div>

//                     {!isLocked ? (
//                         <div className="ap-footer">
//                             <h3 className="ap-footer__title">Final Submission</h3>
//                             <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
//                             <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
//                                 <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
//                                 <span className="ap-footer-declaration__text">
//                                     <strong>Learner Final Declaration</strong>
//                                     I confirm that this is my own work, completed without unauthorized assistance.
//                                 </span>
//                             </label>
//                             <div className="ap-footer-actions">
//                                 <span className="ap-autosave-label">
//                                     {saving
//                                         ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</>
//                                         : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>
//                                     }
//                                 </span>
//                                 <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}>
//                                     <Save size={14} /> Submit for Grading
//                                 </button>
//                             </div>
//                         </div>
//                     ) : (
//                         <div className="ap-footer ap-footer--locked no-print">
//                             <div className="ap-footer--locked__icon-wrap">
//                                 {isModDone && outcome?.isCompetent === false ? (
//                                     <AlertTriangle size={36} color="#d97706" />
//                                 ) : (
//                                     <CheckCircle size={36} color="var(--mlab-green)" />
//                                 )}
//                             </div>

//                             {/* 🚀 MAX ATTEMPTS LOCKOUT VS STANDARD REMEDIATION */}
//                             {isModDone && outcome?.isCompetent === false ? (
//                                 <>
//                                     <h3 className="ap-footer--locked__title" style={{ color: '#d97706' }}>
//                                         Assessment Outcome: Not Yet Competent (NYC)
//                                     </h3>
//                                     <div style={{ textAlign: 'left', maxWidth: '600px', margin: '1rem auto', background: '#fffbeb', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
//                                         <p style={{ margin: '0 0 1rem 0', color: '#92400e', fontSize: '0.9rem', lineHeight: '1.5' }}>
//                                             Your assessment has been fully verified. At this stage, you have not yet met all the requirements for competency.
//                                         </p>

//                                         {(submission.attemptNumber || 1) >= 3 ? (
//                                             <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '1rem', borderRadius: '6px' }}>
//                                                 <h4 style={{ color: '#b91c1c', margin: '0 0 0.5rem 0', fontSize: '0.9rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     <ShieldAlert size={16} /> Maximum Attempts Reached
//                                                 </h4>
//                                                 <p style={{ margin: 0, color: '#991b1b', fontSize: '0.85rem', lineHeight: '1.5' }}>
//                                                     You have exhausted all 3 permitted attempts for this assessment. Under QCTO regulations, this workbook is now permanently locked. You must re-enroll in the module to try again, or you may lodge a formal appeal if you disagree with the assessment outcome.
//                                                 </p>
//                                             </div>
//                                         ) : (
//                                             <>
//                                                 <h4 style={{ color: '#b45309', margin: '0 0 0.5rem 0', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>What happens next?</h4>
//                                                 <ol style={{ color: '#92400e', fontSize: '0.85rem', lineHeight: '1.6', paddingLeft: '1.25rem', margin: '0 0 1rem 0' }}>
//                                                     <li><strong>Review Feedback:</strong> Please scroll up and review the Assessor's Red Pen feedback on your incorrect answers.</li>
//                                                     <li><strong>Coaching:</strong> Your facilitator will schedule a brief intervention with you to discuss the feedback and guide you.</li>
//                                                     <li><strong>Remediation:</strong> Following the coaching session, your facilitator will unlock this workbook so you can correct your answers and resubmit (Attempt {submission.attemptNumber ? submission.attemptNumber + 1 : 2} of 3).</li>
//                                                 </ol>
//                                                 <p style={{ margin: 0, color: '#b45309', fontSize: '0.75rem', fontStyle: 'italic' }}>
//                                                     Academic Rights: If you strongly disagree with this outcome after reviewing the feedback, you have the right to lodge a formal appeal with your training provider.
//                                                 </p>
//                                             </>
//                                         )}
//                                     </div>
//                                 </>
//                             ) : (
//                                 <>
//                                     <h3 className="ap-footer--locked__title">
//                                         {submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}
//                                     </h3>
//                                     <p className="ap-footer--locked__desc">
//                                         This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>.{' '}
//                                         {isAssDone ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}
//                                     </p>
//                                 </>
//                             )}

//                             <button className="ap-btn ap-btn--primary" onClick={() => navigate(-1)}>
//                                 <ArrowLeft size={14} /> Return to Portfolio
//                             </button>
//                         </div>
//                     )}

//                     {/* 🚀 TRI-LAYER PRINT SIGNATURES 🚀 */}
//                     {isLocked && (
//                         <div className="ap-signature-blocks">
//                             <div className="ap-sig-box">
//                                 <span className="ap-sig-box__label">Learner Declaration</span>
//                                 <div className="ap-sig-box__img-wrap">
//                                     {learnerProfile?.signatureUrl
//                                         ? <img src={learnerProfile.signatureUrl} alt="Learner Signature" />
//                                         : <span className="ap-sig-box__no-sig">No canvas signature on file</span>
//                                     }
//                                 </div>
//                                 <span className="ap-sig-box__name">
//                                     {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}
//                                 </span>
//                                 <span className="ap-sig-box__date">
//                                     <Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}
//                                 </span>
//                             </div>

//                             {isAssDone && (
//                                 <div className="ap-sig-box">
//                                     <span className="ap-sig-box__label" style={{ color: 'red' }}>Assessor Verification</span>
//                                     <div className="ap-sig-box__img-wrap">
//                                         {assessorProfile?.signatureUrl
//                                             ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
//                                             : <span className="ap-sig-box__no-sig" style={{ color: 'red' }}>No canvas signature on file</span>
//                                         }
//                                     </div>
//                                     <span className="ap-sig-box__name" style={{ color: 'red' }}>
//                                         {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
//                                     </span>
//                                     <span className="ap-sig-box__reg" style={{ color: 'red' }}>
//                                         Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
//                                     </span>
//                                     <span className="ap-sig-box__date" style={{ color: 'red' }}>
//                                         <Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
//                                     </span>
//                                 </div>
//                             )}

//                             {isModDone && (
//                                 <div className="ap-sig-box">
//                                     <span className="ap-sig-box__label" style={{ color: 'green' }}>Internal Moderation QA</span>
//                                     <div className="ap-sig-box__img-wrap">
//                                         {moderatorProfile?.signatureUrl
//                                             ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
//                                             : <span className="ap-sig-box__no-sig" style={{ color: 'green' }}>No canvas signature on file</span>
//                                         }
//                                     </div>
//                                     <span className="ap-sig-box__name" style={{ color: 'green' }}>
//                                         {moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}
//                                     </span>
//                                     <span className="ap-sig-box__reg" style={{ color: 'green' }}>
//                                         Outcome: {submission.moderation?.outcome}
//                                     </span>
//                                     <span className="ap-sig-box__date" style={{ color: 'green' }}>
//                                         <Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
//                                     </span>
//                                 </div>
//                             )}
//                         </div>
//                     )}
//                 </div>

//                 {/* RIGHT SIDEBAR: AUDIT TRAIL */}
//                 {isLocked && (
//                     <aside className="ap-right-sidebar no-print">
//                         <h3 className="ap-right-sidebar__title">
//                             <ShieldCheck size={16} color="#073f4e" /> Official Audit Trail
//                         </h3>

//                         <div className="ap-audit-card">
//                             <span className="ap-audit-card__label">Learner Declaration</span>
//                             <div className="ap-audit-card__sig-wrap">
//                                 {learnerProfile?.signatureUrl
//                                     ? <img src={learnerProfile.signatureUrl} alt="Learner signature" />
//                                     : <span className="ap-audit-card__sig-placeholder">No signature on file</span>
//                                 }
//                             </div>
//                             <span className="ap-audit-card__name">
//                                 {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}
//                             </span>
//                             <span className="ap-audit-card__sub">
//                                 <Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}
//                             </span>
//                         </div>

//                         {outcome ? (
//                             <div className="ap-audit-outcome" style={{ borderLeftColor: outcome.color }}>
//                                 <div className="ap-audit-outcome__label" style={{ color: outcome.color }}>{outcome.label}</div>
//                                 {outcome.score !== undefined && (
//                                     <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>
//                                         Score: {outcome.score} / {assessment.totalMarks} ({outcome.percentage}%)
//                                     </div>
//                                 )}
//                                 <div className="ap-audit-outcome__note">{outcome.subtext}</div>
//                             </div>
//                         ) : (
//                             <div className="ap-audit-card" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', textAlign: 'center', padding: '1.5rem' }}>
//                                 <Clock size={24} color="#94a3b8" style={{ margin: '0 auto 0.5rem' }} />
//                                 <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold' }}>Pending Outcome</span>
//                                 <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Your workbook is currently being evaluated.</span>
//                             </div>
//                         )}

//                         {isFacDone && (
//                             <div className="ap-audit-card">
//                                 <span className="ap-audit-card__label" style={{ color: 'blue' }}>Facilitator Pre-Marking</span>
//                                 <span className="ap-audit-card__name" style={{ color: 'blue' }}>
//                                     {submission.grading?.facilitatorName || 'Facilitator'}
//                                 </span>
//                                 <span className="ap-audit-card__sub" style={{ color: 'blue' }}>
//                                     <Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
//                                 </span>
//                             </div>
//                         )}

//                         {isAssDone && (
//                             <div className="ap-audit-card">
//                                 <span className="ap-audit-card__label" style={{ color: 'red' }}>Assessor Verification</span>
//                                 <div className="ap-audit-card__sig-wrap">
//                                     {assessorProfile?.signatureUrl
//                                         ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
//                                         : <span className="ap-audit-card__sig-placeholder" style={{ color: 'red' }}>No signature on file</span>
//                                     }
//                                 </div>
//                                 <span className="ap-audit-card__name" style={{ color: 'red' }}>
//                                     {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
//                                 </span>
//                                 <span className="ap-audit-card__reg" style={{ color: 'red' }}>
//                                     Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
//                                 </span>
//                                 <span className="ap-audit-card__sub" style={{ color: 'red' }}>
//                                     <Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
//                                 </span>
//                             </div>
//                         )}

//                         {isModDone && (
//                             <div className="ap-audit-card">
//                                 <span className="ap-audit-card__label" style={{ color: 'green' }}>Internal Moderation QA</span>
//                                 <div className="ap-audit-card__sig-wrap">
//                                     {moderatorProfile?.signatureUrl
//                                         ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
//                                         : <span className="ap-audit-card__sig-placeholder" style={{ color: 'green' }}>No signature on file</span>
//                                     }
//                                 </div>
//                                 <span className="ap-audit-card__name" style={{ color: 'green' }}>
//                                     {moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}
//                                 </span>
//                                 <span className="ap-audit-card__reg" style={{ color: 'green' }}>
//                                     Outcome: {submission.moderation?.outcome}
//                                 </span>
//                                 <span className="ap-audit-card__sub" style={{ color: 'green' }}>
//                                     <Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
//                                 </span>
//                             </div>
//                         )}
//                     </aside>
//                 )}
//             </div>
//         </div>
//     );
// };

// /* ── Confirm Modal ────────────────────────────────────────────────────────── */
// const ConfirmModal: React.FC<{
//     title: string; message: string; confirmText: string; cancelText: string;
//     onConfirm: () => void; onCancel: () => void;
// }> = ({ title, message, confirmText, cancelText, onConfirm, onCancel }) => {
//     useEffect(() => {
//         const style = document.createElement('style');
//         style.innerHTML = `body, html { overflow: hidden !important; } .ap-player, .ap-player-body { overflow: hidden !important; }`;
//         document.head.appendChild(style);
//         return () => { document.head.removeChild(style); };
//     }, []);

//     const modalContent = (
//         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(5,46,58,0.7)', backdropFilter: 'blur(3px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', margin: 0 }}>
//             <div className="ap-animate" style={{ background: 'white', maxWidth: '420px', width: '100%', textAlign: 'center', padding: 0, boxShadow: '0 24px 48px -8px rgba(5,46,58,0.35)', border: '1px solid var(--mlab-border)', borderTop: '5px solid var(--mlab-blue)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
//                 <div style={{ padding: '2rem 2rem 1.25rem', borderBottom: '1px solid var(--mlab-border)' }}>
//                     <div style={{ width: 56, height: 56, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}><AlertTriangle size={28} color="#d97706" /></div>
//                     <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>{title}</h2>
//                     <p style={{ color: 'var(--mlab-grey)', lineHeight: '1.65', margin: 0, fontSize: '0.9rem' }}>{message}</p>
//                 </div>
//                 <div style={{ display: 'flex' }}>
//                     <button onClick={onCancel} style={{ flex: 1, padding: '1rem', border: 'none', borderRight: '1px solid var(--mlab-border)', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{cancelText}</button>
//                     <button onClick={onConfirm} style={{ flex: 1, padding: '1rem', border: 'none', background: 'var(--mlab-blue)', color: 'white', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{confirmText}</button>
//                 </div>
//             </div>
//         </div>
//     );
//     return createPortal(modalContent, document.body);
// };

// export default AssessmentPlayer;


// // import React, { useState, useEffect, useRef } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import {
// //     ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
// //     AlertCircle, Play, Clock, GraduationCap,
// //     BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
// //     ShieldCheck, Hash, Activity, Award, BarChart, MessageSquare, Printer, Check, X,
// //     RotateCcw
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

// // interface GradeData { score: number; feedback: string; isCorrect?: boolean | null; }

// // export type StatusType = 'info' | 'success' | 'error' | 'warning';

// // const AssessmentPlayer: React.FC = () => {
// //     const { assessmentId } = useParams<{ assessmentId: string }>();
// //     const navigate = useNavigate();
// //     const { user } = useStore();
// //     const toast = useToast();

// //     const [loading, setLoading] = useState(true);
// //     const [saving, setSaving] = useState(false);
// //     const [assessment, setAssessment] = useState<any>(null);
// //     const [submission, setSubmission] = useState<any>(null);
// //     const [answers, setAnswers] = useState<Record<string, any>>({});

// //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);
// //     const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null); // 🚀 NEW: For Print Audit

// //     const [declarationChecked, setDeclarationChecked] = useState(false);
// //     const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);

// //     // 🚀 NEW: Coaching Acknowledgement State
// //     const [coachingAckChecked, setCoachingAckChecked] = useState(false);

// //     const [isAdminIntercept, setIsAdminIntercept] = useState(false);

// //     const [showLeaveWarning, setShowLeaveWarning] = useState(false);
// //     const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

// //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// //     const [timeLeft, setTimeLeft] = useState<number | null>(null);
// //     const [timeOffset, setTimeOffset] = useState<number>(0);

// //     const currentStatus = String(submission?.status || '').toLowerCase();

// //     // 🚀 LOGIC FOR REMEDIATION & GATES
// //     const isRemediation = (submission?.attemptNumber || 1) > 1;
// //     const needsRemediationGate = isRemediation && submission?.latestCoachingLog && !submission?.latestCoachingLog?.acknowledged;
// //     const isNotStarted = currentStatus === 'not_started';
// //     const showGate = isNotStarted || needsRemediationGate;
// //     const isLocked = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'returned'].includes(currentStatus);

// //     const hasBeenReviewed = ['facilitator_reviewed', 'graded', 'moderated', 'returned'].includes(currentStatus) || isRemediation;
// //     const hasBeenGraded = ['graded', 'moderated'].includes(currentStatus) || (isRemediation && submission?.grading?.gradedAt);
// //     const hasBeenModerated = currentStatus === 'moderated' || (isRemediation && submission?.moderation?.moderatedAt);

// //     const getBlockGrading = (blockId: string) => {
// //         if (!hasBeenReviewed) return { score: undefined, facFeedback: '', assFeedback: '', modFeedback: '', facIsCorrect: null, assIsCorrect: null, modIsCorrect: null, isCorrect: null };

// //         const g = submission?.grading || {};
// //         const m = submission?.moderation || {};

// //         const mLayer = m.breakdown?.[blockId] || {};
// //         const aLayer = g.assessorBreakdown?.[blockId] || {};
// //         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
// //         const legacyLayer = g.breakdown?.[blockId] || {};

// //         let activeLayer = legacyLayer || { score: 0, isCorrect: null };
// //         if (hasBeenReviewed) activeLayer = fLayer;
// //         if (hasBeenGraded) activeLayer = aLayer;
// //         if (hasBeenModerated) activeLayer = mLayer;

// //         return {
// //             score: activeLayer.score,
// //             isCorrect: activeLayer.isCorrect,
// //             facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
// //             assIsCorrect: aLayer.isCorrect,
// //             modIsCorrect: mLayer.isCorrect,
// //             facFeedback: fLayer.feedback || legacyLayer.feedback || '',
// //             assFeedback: aLayer.feedback || '',
// //             modFeedback: mLayer.feedback || ''
// //         };
// //     };

// //     const sectionTotals: Record<string, { total: number, awarded: number }> = {};
// //     let currentSectionId = '';
// //     if (assessment?.blocks) {
// //         assessment.blocks.forEach((block: any) => {
// //             if (block.type === 'section') {
// //                 currentSectionId = block.id;
// //                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
// //             } else if ((block.type === 'mcq' || block.type === 'text') && currentSectionId) {
// //                 const { score } = getBlockGrading(block.id);
// //                 sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
// //                 if (score !== undefined && score !== null) sectionTotals[currentSectionId].awarded += Number(score);
// //             }
// //         });
// //     }

// //     const getCompetencyStatus = () => {
// //         if (!hasBeenGraded) return null;
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
// //             color: hasBeenModerated ? 'green' : 'red',
// //             subtext: hasBeenModerated
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
// //         const loadAssessment = async () => {
// //             if (!user?.uid || !assessmentId) return;
// //             if (user.role && user.role !== 'learner') { setIsAdminIntercept(true); setLoading(false); return; }

// //             try {
// //                 const assessmentSnap = await getDoc(doc(db, 'assessments', assessmentId));
// //                 if (!assessmentSnap.exists()) { toast.error('Assessment template not found.'); setLoading(false); return; }
// //                 setAssessment(assessmentSnap.data());

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

// //                     if (activeSub.grading?.gradedBy) {
// //                         const assSnap = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
// //                         if (assSnap.exists()) setAssessorProfile(assSnap.data());
// //                     }
// //                     if (activeSub.moderation?.moderatedBy) {
// //                         const modSnap = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
// //                         if (modSnap.exists()) setModeratorProfile(modSnap.data());
// //                     }

// //                     // 🚀 Fetch Facilitator Profile for Print Record
// //                     const facId = activeSub.latestCoachingLog?.facilitatorId || activeSub.grading?.facilitatorId;
// //                     if (facId) {
// //                         const facSnap = await getDoc(doc(db, 'users', facId));
// //                         if (facSnap.exists()) setFacilitatorProfile(facSnap.data());
// //                     }

// //                     const _needsRemediationGate = (activeSub.attemptNumber || 1) > 1 && activeSub.latestCoachingLog && !activeSub.latestCoachingLog.acknowledged;
// //                     const _showGate = activeSub.status === 'not_started' || _needsRemediationGate;

// //                     if (activeSub.status === 'in_progress' && assessmentSnap.data().moduleInfo?.timeLimit > 0 && !_showGate) {
// //                         const startTime = new Date(activeSub.startedAt).getTime();
// //                         const endTime = startTime + (assessmentSnap.data().moduleInfo.timeLimit * 60 * 1000);
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
// //     }, [assessmentId, user?.uid, timeOffset]);

// //     useEffect(() => {
// //         if (timeLeft === null || isLocked || showGate) return;
// //         if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
// //         const timerId = setInterval(() => {
// //             const startTime = new Date(submission.startedAt).getTime();
// //             const endTime = startTime + (assessment.moduleInfo.timeLimit * 60 * 1000);
// //             setTimeLeft(Math.max(0, Math.floor((endTime - getSecureNow()) / 1000)));
// //         }, 1000);
// //         return () => clearInterval(timerId);
// //     }, [timeLeft, isLocked, showGate, submission?.startedAt]);

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

// //             if (assessment.moduleInfo?.timeLimit > 0) setTimeLeft(assessment.moduleInfo.timeLimit * 60);
// //         } catch { toast.error('Failed to start assessment.'); } finally { setSaving(false); }
// //     };

// //     const handleAnswerChange = (blockId: string, value: string | number) => {
// //         if (isLocked) return;
// //         setAnswers(prev => {
// //             const newAnswers = { ...prev, [blockId]: value };
// //             if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// //             saveTimeoutRef.current = setTimeout(async () => {
// //                 if (!submission?.id) return;
// //                 setSaving(true);
// //                 try {
// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), { answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString() });
// //                 } catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
// //             }, 1200);
// //             return newAnswers;
// //         });
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
// //         if (!isLocked && assessment.moduleInfo?.timeLimit > 0 && !showGate) setShowLeaveWarning(true);
// //         else navigate(-1);
// //     };

// //     const triggerSubmitConfirm = () => {
// //         if (!declarationChecked) return toast.warning('You must agree to the final declaration.');
// //         setShowSubmitConfirm(true);
// //     };

// //     const executeSubmit = async () => {
// //         setShowSubmitConfirm(false);
// //         setSaving(true);
// //         const submitTime = new Date(getSecureNow()).toISOString();
// //         try {
// //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                 answers, status: 'submitted', submittedAt: submitTime,
// //                 learnerDeclaration: { agreed: true, timestamp: submitTime, learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown', learnerIdNumber: learnerProfile?.idNumber || 'Unknown' }
// //             });
// //             toast.success('Assessment submitted!');
// //             setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
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
// //                     <h1 className="ap-gate-left__title">{assessment.title}</h1>
// //                     <p className="ap-gate-left__sub">Read all instructions carefully before starting.</p>

// //                     {/* 🚀 REMEDIATION ALERT & COACHING ACKNOWLEDGEMENT ON GATE 🚀 */}
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
// //                                 <p style={{ margin: '4px 0 0 0', color: '#78350f', fontStyle: 'italic', fontSize: '0.9rem' }}>
// //                                     "{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}
// //                                 </p>
// //                             </div>
// //                             <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
// //                                 <input type="checkbox" checked={coachingAckChecked} onChange={e => setCoachingAckChecked(e.target.checked)} style={{ marginTop: '2px', accentColor: '#f59e0b', width: '16px', height: '16px' }} />
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
// //         else if (block.type === 'text' || block.type === 'mcq') acc.push({ type: 'q', label: block.question, id: block.id });
// //         return acc;
// //     }, []) || [];

// //     let displayStatus = submission.status.replace('_', ' ');
// //     if (submission.status === 'returned') displayStatus = 'revision required';

// //     return (
// //         <div className="ap-player ap-animate">
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {showLeaveWarning && <ConfirmModal title="Leave Timed Assessment?" message="Your timer will NOT pause. If you leave, the clock continues counting down in the background." confirmText="Yes, Leave" cancelText="Stay Here" onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)} />}
// //             {showSubmitConfirm && <ConfirmModal title="Submit Assessment?" message="You are about to submit this workbook for grading. You will NOT be able to change your answers after submission." confirmText="Submit for Grading" cancelText="Go Back" onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}

// //             <div className="ap-player-topbar no-print">
// //                 <div className="ap-player-topbar__left">
// //                     <button className="ap-player-topbar__back" onClick={handleNavigationLeave}><ArrowLeft size={13} /> Portfolio</button>
// //                     <div className="ap-player-topbar__separator" />
// //                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
// //                 </div>

// //                 <div className="ap-player-topbar__right">
// //                     {isLocked && <button className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={13} /> Print Audit</button>}
// //                     {!isLocked && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
// //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
// //                     <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
// //                 </div>
// //             </div>

// //             <div className={`ap-player-body${isLocked ? ' is-locked' : ''}`}>
// //                 <nav className="ap-sidebar no-print">
// //                     <div className="ap-sidebar__meta-block">
// //                         <div className="ap-sidebar__meta-title">{assessment.title}</div>
// //                         <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
// //                         <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div>
// //                         <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>
// //                     </div>

// //                     {(submission.status !== 'not_started' && submission.status !== 'in_progress') && (
// //                         <>
// //                             <div className="ap-sidebar__label">Status Tracking</div>
// //                             <div className="ap-sidebar__status-box">

// //                                 {hasBeenGraded && outcome ? (
// //                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
// //                                         <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
// //                                         {outcome.score !== undefined && <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
// //                                         <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
// //                                     </div>
// //                                 ) : (
// //                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}><div className="ap-sidebar__outcome-val" style={{ color: '#cbd5e1' }}>Awaiting Grade</div><div className="ap-sidebar__outcome-note">The Assessor has not yet finalized your official results.</div></div>
// //                                 )}

// //                                 {hasBeenReviewed && submission.grading?.facilitatorOverallFeedback && (
// //                                     <div style={{ background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid rgba(56, 189, 248, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
// //                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><Info size={11} /> Facilitator Summary</strong>
// //                                         <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', lineHeight: '1.55' }}>{submission.grading.facilitatorOverallFeedback}</p>
// //                                     </div>
// //                                 )}

// //                                 {hasBeenGraded && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
// //                                     <div style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid rgba(245,158,11,0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
// //                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'red', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><MessageSquare size={11} /> Assessor Remarks</strong>
// //                                         <p style={{ margin: 0, color: 'red', fontSize: '0.78rem', lineHeight: '1.55' }}>{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p>
// //                                     </div>
// //                                 )}

// //                                 {hasBeenModerated && submission.moderation?.feedback && (
// //                                     <div style={{ background: 'rgba(34, 197, 94, 0.08)', borderLeft: '3px solid rgba(34, 197, 94, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
// //                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#4ade80', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}><ShieldCheck size={11} /> QA Endorsement Notes</strong>
// //                                         <p style={{ margin: 0, color: '#4ade80', fontSize: '0.78rem', lineHeight: '1.55' }}>{submission.moderation.feedback}</p>
// //                                     </div>
// //                                 )}

// //                                 <div className="ap-sidebar__timeline-item">
// //                                     <div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}><UserCheck size={13} /></div>
// //                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Facilitator Review</span><span className="ap-sidebar__timeline-desc">{submission.status === 'submitted' ? 'Waiting for Facilitator' : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}</span></div>
// //                                 </div>
// //                                 <div className="ap-sidebar__timeline-item">
// //                                     <div className={`ap-sidebar__timeline-icon${hasBeenGraded ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div>
// //                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{hasBeenGraded ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div>
// //                                 </div>
// //                                 <div className="ap-sidebar__timeline-item">
// //                                     <div className={`ap-sidebar__timeline-icon${hasBeenModerated ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div>
// //                                     <div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{hasBeenModerated ? `Endorsed ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div>
// //                                 </div>
// //                             </div>
// //                         </>
// //                     )}

// //                     <div className="ap-sidebar__label">Workbook Contents</div>
// //                     <div className="ap-sidebar__nav">
// //                         {navItems.map((item: any) =>
// //                             item.type === 'section' ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span> : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item">{item.label.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
// //                         )}
// //                     </div>
// //                 </nav>

// //                 <div className="ap-player-content print-pane">

// //                     {/* ═════════════════════════════════════════════════════════════════════════
// //                         🚀 OFFICIAL QCTO PRINT COVER (INVISIBLE ON SCREEN, VISIBLE ON PDF) 🚀
// //                     ═════════════════════════════════════════════════════════════════════════ */}
// //                     {isLocked && (
// //                         <div className="print-only-cover">
// //                             <div className="print-page">
// //                                 <h1 style={{ textAlign: 'center', textTransform: 'uppercase', fontSize: '18pt', marginBottom: '10px' }}>{assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}</h1>
// //                                 <h2 style={{ textAlign: 'center', fontSize: '16pt', marginBottom: '30px', textDecoration: 'underline' }}>
// //                                     LEARNER WORKBOOK {submission?.attemptNumber > 1 ? `- ATTEMPT #${submission.attemptNumber}` : ''}
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
// //                                 <h3>Venue, Date and Time:</h3><p><strong>Venue:</strong> {assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform'}</p><p><strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}</p>
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
// //                                             <tr><td style={{ fontWeight: 'bold' }}>Coaching Notes</td><td>{submission.latestCoachingLog.notes}</td></tr>
// //                                         </tbody>
// //                                     </table>

// //                                     <div className="sr-signature-block" style={{ marginTop: '40px', justifyContent: 'flex-start', gap: '2rem' }}>
// //                                         {/* Facilitator Sig */}
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

// //                                         {/* Learner Sig */}
// //                                         <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
// //                                             <span style={{ color: 'black' }}>Learner Acknowledgement</span>
// //                                             {submission.latestCoachingLog.acknowledged ? (
// //                                                 <>
// //                                                     {learnerProfile?.signatureUrl
// //                                                         ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" />
// //                                                         : <div className="sr-sig-no-image" style={{ color: 'black' }}>No Canvas Signature</div>
// //                                                     }
// //                                                     <strong style={{ color: 'black' }}>{learnerProfile?.fullName || learnerProfile?.fullName}</strong>
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

// //                     {isLocked && (
// //                         <div className="ap-print-header">
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
// //                                 <div>
// //                                     <p style={{ margin: '0 0 4px' }}><strong>Learner:</strong> {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName}</p>
// //                                     <p style={{ margin: 0 }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber}</p>
// //                                 </div>
// //                                 <div style={{ textAlign: 'right' }}>
// //                                     <p style={{ margin: '0 0 4px' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
// //                                     <p style={{ margin: '0 0 4px' }}><strong>Submitted:</strong> {getSafeDate(submission.submittedAt)}</p>
// //                                     {hasBeenGraded && <p style={{ margin: 0 }}><strong>Outcome:</strong> {outcome?.label} ({outcome?.percentage}%)</p>}
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     <div className="ap-blocks">
// //                         {assessment.blocks?.map((block: any, idx: number) => {

// //                             if (block.type === 'section') {
// //                                 const totals = sectionTotals[block.id];
// //                                 return (
// //                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
// //                                         <span>{block.title}</span>
// //                                         {hasBeenGraded && totals && totals.total > 0 && (
// //                                             <span className="no-print" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px' }}>
// //                                                 <BarChart size={13} /> {totals.awarded}/{totals.total}
// //                                             </span>
// //                                         )}
// //                                     </div>
// //                                 );
// //                             }

// //                             if (block.type === 'info') return (
// //                                 <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
// //                                     <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
// //                                     <p className="ap-block-info__text">{block.content}</p>
// //                                 </div>
// //                             );

// //                             const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect } = getBlockGrading(block.id);

// //                             let activeInkColor = 'transparent';
// //                             if (hasBeenModerated) activeInkColor = 'green';
// //                             else if (hasBeenGraded) activeInkColor = 'red';
// //                             else if (hasBeenReviewed) activeInkColor = 'blue';

// //                             const markLabel = hasBeenReviewed && blockScore !== undefined && blockScore !== null
// //                                 ? `${blockScore} / ${block.marks}`
// //                                 : `${block.marks} Marks`;

// //                             const TopRightIndicator = () => {
// //                                 return (
// //                                     <div style={{ display: 'flex', gap: '8px', marginLeft: '12px', alignItems: 'center' }}>
// //                                         {hasBeenReviewed && facIsCorrect !== null && facIsCorrect !== undefined && (
// //                                             <div title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
// //                                                 {facIsCorrect ? <Check size={18} color="#0284c7" strokeWidth={3} /> : <X size={18} color="#0284c7" strokeWidth={3} />}
// //                                             </div>
// //                                         )}
// //                                         {hasBeenGraded && assIsCorrect !== null && assIsCorrect !== undefined && (
// //                                             <div title="Official Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px' }}>
// //                                                 {assIsCorrect ? <Check size={18} color="#ef4444" strokeWidth={3} /> : <X size={18} color="#ef4444" strokeWidth={3} />}
// //                                             </div>
// //                                         )}
// //                                         {hasBeenModerated && modIsCorrect !== null && modIsCorrect !== undefined && (
// //                                             <div title="Internal Moderation QA" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 6px', borderRadius: '4px' }}>
// //                                                 {modIsCorrect ? <Check size={18} color="#22c55e" strokeWidth={3} /> : <X size={18} color="#22c55e" strokeWidth={3} />}
// //                                             </div>
// //                                         )}
// //                                     </div>
// //                                 );
// //                             };

// //                             if (block.type === 'mcq') return (
// //                                 <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
// //                                     <div className="ap-block-question__header">
// //                                         <div className="ap-block-question__text-wrap" style={{ display: 'flex', alignItems: 'flex-start' }}>
// //                                             <span className="ap-block-question__text"><strong style={{ color: '#94a3b8', marginRight: '8px' }}>Q{idx + 1}.</strong>{block.question}</span>
// //                                             <TopRightIndicator />
// //                                         </div>
// //                                         <span className="ap-block-question__marks" style={{ color: activeInkColor !== 'transparent' ? activeInkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
// //                                     </div>
// //                                     <div className="ap-block-question__body">
// //                                         <div className="ap-mcq-options">
// //                                             {block.options?.map((opt: string, i: number) => {
// //                                                 const selected = answers[block.id] === i;
// //                                                 return (
// //                                                     <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isLocked ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
// //                                                         <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isLocked} onChange={() => handleAnswerChange(block.id, i)} />
// //                                                         <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
// //                                                         <span className="ap-mcq-label__text">{opt}</span>
// //                                                     </label>
// //                                                 );
// //                                             })}
// //                                         </div>

// //                                         <div className="ap-feedback-stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
// //                                             {hasBeenReviewed && facFeedback && (
// //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, background: '#eff6ff', padding: '0.75rem', borderRadius: '4px' }}>
// //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// //                                                         <span style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Info size={12} /> Facilitator Coaching</span>
// //                                                     </div>
// //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#0369a1', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>{facFeedback}</p>
// //                                                 </div>
// //                                             )}
// //                                             {hasBeenGraded && assFeedback && (
// //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, background: '#fef2f2', padding: '0.75rem', borderRadius: '4px' }}>
// //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// //                                                         <span style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Award size={12} /> Assessor Grade</span>
// //                                                     </div>
// //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#991b1b', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>{assFeedback}</p>
// //                                                 </div>
// //                                             )}
// //                                             {hasBeenModerated && modFeedback && (
// //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #22c55e`, background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px' }}>
// //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// //                                                         <span style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} /> Moderator QA Notes</span>
// //                                                     </div>
// //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#16a34a', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>{modFeedback}</p>
// //                                                 </div>
// //                                             )}
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                             );

// //                             if (block.type === 'text') return (
// //                                 <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
// //                                     <div className="ap-block-question__header">
// //                                         <div className="ap-block-question__text-wrap" style={{ display: 'flex', alignItems: 'flex-start' }}>
// //                                             <span className="ap-block-question__text"><strong style={{ color: '#94a3b8', marginRight: '8px' }}>Q{idx + 1}.</strong>{block.question}</span>
// //                                             <TopRightIndicator />
// //                                         </div>
// //                                         <span className="ap-block-question__marks" style={{ color: activeInkColor !== 'transparent' ? activeInkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
// //                                     </div>
// //                                     <div className="ap-block-question__body">
// //                                         <div className={`ap-quill-wrapper ${isLocked ? 'locked' : ''}`}>
// //                                             <ReactQuill theme="snow" value={answers[block.id] || ''} onChange={(content) => handleAnswerChange(block.id, content)} readOnly={isLocked} modules={quillModules} formats={quillFormats} placeholder={isLocked ? 'No answer provided.' : 'Type your detailed response here...'} />
// //                                         </div>

// //                                         <div className="ap-feedback-stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
// //                                             {hasBeenReviewed && facFeedback && (
// //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, background: '#eff6ff', padding: '0.75rem', borderRadius: '4px' }}>
// //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// //                                                         <span style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Info size={12} /> Facilitator Coaching</span>
// //                                                     </div>
// //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#0369a1', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>{facFeedback}</p>
// //                                                 </div>
// //                                             )}
// //                                             {hasBeenGraded && assFeedback && (
// //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, background: '#fef2f2', padding: '0.75rem', borderRadius: '4px' }}>
// //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// //                                                         <span style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Award size={12} /> Assessor Grade</span>
// //                                                     </div>
// //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#991b1b', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>{assFeedback}</p>
// //                                                 </div>
// //                                             )}
// //                                             {hasBeenModerated && modFeedback && (
// //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #22c55e`, background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px' }}>
// //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// //                                                         <span style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} /> Moderator QA Notes</span>
// //                                                     </div>
// //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#16a34a', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>{modFeedback}</p>
// //                                                 </div>
// //                                             )}
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                             );

// //                             return null;
// //                         })}
// //                     </div>

// //                     {!isLocked ? (
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
// //                                 </span>
// //                                 <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}>
// //                                     <Save size={14} /> Submit for Grading
// //                                 </button>
// //                             </div>
// //                         </div>
// //                     ) : (
// //                         <div className="ap-footer ap-footer--locked no-print">
// //                             <div className="ap-footer--locked__icon-wrap">
// //                                 {hasBeenModerated && outcome?.isCompetent === false ? (
// //                                     <AlertTriangle size={36} color="#d97706" />
// //                                 ) : (
// //                                     <CheckCircle size={36} color="var(--mlab-green)" />
// //                                 )}
// //                             </div>

// //                             {hasBeenModerated && outcome?.isCompetent === false ? (
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
// //                                         {hasBeenGraded ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}
// //                                     </p>
// //                                 </>
// //                             )}

// //                             <button className="ap-btn ap-btn--primary" onClick={() => navigate(-1)}>
// //                                 <ArrowLeft size={14} /> Return to Portfolio
// //                             </button>
// //                         </div>
// //                     )}

// //                     {/* 🚀 TRI-LAYER PRINT SIGNATURES 🚀 */}
// //                     {isLocked && (
// //                         <div className="ap-signature-blocks">
// //                             <div className="ap-sig-box">
// //                                 <span className="ap-sig-box__label">Learner Declaration</span>
// //                                 <div className="ap-sig-box__img-wrap">
// //                                     {learnerProfile?.signatureUrl
// //                                         ? <img src={learnerProfile.signatureUrl} alt="Learner Signature" />
// //                                         : <span className="ap-sig-box__no-sig">No canvas signature on file</span>
// //                                     }
// //                                 </div>
// //                                 <span className="ap-sig-box__name">
// //                                     {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}
// //                                 </span>
// //                                 <span className="ap-sig-box__date">
// //                                     <Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}
// //                                 </span>
// //                             </div>

// //                             {hasBeenGraded && (
// //                                 <div className="ap-sig-box">
// //                                     <span className="ap-sig-box__label" style={{ color: 'red' }}>Assessor Verification</span>
// //                                     <div className="ap-sig-box__img-wrap">
// //                                         {assessorProfile?.signatureUrl
// //                                             ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// //                                             : <span className="ap-sig-box__no-sig" style={{ color: 'red' }}>No canvas signature on file</span>
// //                                         }
// //                                     </div>
// //                                     <span className="ap-sig-box__name" style={{ color: 'red' }}>
// //                                         {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
// //                                     </span>
// //                                     <span className="ap-sig-box__reg" style={{ color: 'red' }}>
// //                                         Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
// //                                     </span>
// //                                     <span className="ap-sig-box__date" style={{ color: 'red' }}>
// //                                         <Clock size={11} /> {moment(submission.grading?.gradedAt).format('DD/MM/YYYY HH:mm')}
// //                                     </span>
// //                                 </div>
// //                             )}

// //                             {hasBeenModerated && (
// //                                 <div className="ap-sig-box">
// //                                     <span className="ap-sig-box__label" style={{ color: 'green' }}>Internal Moderation QA</span>
// //                                     <div className="ap-sig-box__img-wrap">
// //                                         {moderatorProfile?.signatureUrl
// //                                             ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
// //                                             : <span className="ap-sig-box__no-sig" style={{ color: 'green' }}>No canvas signature on file</span>
// //                                         }
// //                                     </div>
// //                                     <span className="ap-sig-box__name" style={{ color: 'green' }}>
// //                                         {moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}
// //                                     </span>
// //                                     <span className="ap-sig-box__reg" style={{ color: 'green' }}>
// //                                         Outcome: {submission.moderation?.outcome}
// //                                     </span>
// //                                     <span className="ap-sig-box__date" style={{ color: 'green' }}>
// //                                         <Clock size={11} /> {moment(submission.moderation?.moderatedAt).format('DD/MM/YYYY HH:mm')}
// //                                     </span>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}
// //                 </div>

// //                 {/* RIGHT SIDEBAR: AUDIT TRAIL */}
// //                 {isLocked && (
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

// //                         {hasBeenGraded && (
// //                             <div className="ap-audit-card">
// //                                 <span className="ap-audit-card__label" style={{ color: 'red' }}>Assessor Verification</span>
// //                                 <div className="ap-audit-card__sig-wrap">
// //                                     {assessorProfile?.signatureUrl
// //                                         ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// //                                         : <span className="ap-audit-card__sig-placeholder" style={{ color: 'red' }}>No signature on file</span>
// //                                     }
// //                                 </div>
// //                                 <span className="ap-audit-card__name" style={{ color: 'red' }}>
// //                                     {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
// //                                 </span>
// //                                 <span className="ap-audit-card__reg" style={{ color: 'red' }}>
// //                                     Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
// //                                 </span>
// //                                 <span className="ap-audit-card__sub" style={{ color: 'red' }}>
// //                                     <Clock size={11} /> {moment(submission.grading?.gradedAt).format('DD/MM/YYYY HH:mm')}
// //                                 </span>
// //                             </div>
// //                         )}

// //                         {hasBeenModerated && (
// //                             <div className="ap-audit-card">
// //                                 <span className="ap-audit-card__label" style={{ color: 'green' }}>Internal Moderation QA</span>
// //                                 <div className="ap-audit-card__sig-wrap">
// //                                     {moderatorProfile?.signatureUrl
// //                                         ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
// //                                         : <span className="ap-audit-card__sig-placeholder" style={{ color: 'green' }}>No signature on file</span>
// //                                     }
// //                                 </div>
// //                                 <span className="ap-audit-card__name" style={{ color: 'green' }}>
// //                                     {moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}
// //                                 </span>
// //                                 <span className="ap-audit-card__reg" style={{ color: 'green' }}>
// //                                     Outcome: {submission.moderation?.outcome}
// //                                 </span>
// //                                 <span className="ap-audit-card__sub" style={{ color: 'green' }}>
// //                                     <Clock size={11} /> {moment(submission.moderation?.moderatedAt).format('DD/MM/YYYY HH:mm')}
// //                                 </span>
// //                             </div>
// //                         )}
// //                     </aside>
// //                 )}
// //             </div>
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




// // // import React, { useState, useEffect, useRef } from 'react';
// // // import { useParams, useNavigate } from 'react-router-dom';
// // // import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
// // // import { db } from '../../../lib/firebase';
// // // import { useStore } from '../../../store/useStore';
// // // import {
// // //     ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
// // //     AlertCircle, Play, Clock, GraduationCap,
// // //     BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
// // //     ShieldCheck, Hash, Activity, Award, BarChart, MessageSquare, Printer, Check, X,
// // //     RotateCcw
// // // } from 'lucide-react';
// // // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';

// // // import ReactQuill from 'react-quill-new';
// // // import 'react-quill-new/dist/quill.snow.css';

// // // import { createPortal } from 'react-dom';
// // // import './AssessmentPlayer.css';
// // // import moment from 'moment';

// // // // ─── HELPER COMPONENTS ────────────────────────────────────────────────────
// // // export const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
// // //     const filterMap: any = {
// // //         black: 'brightness(0)',
// // //         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
// // //         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
// // //         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
// // //     };
// // //     return <img src={imageUrl} alt="Signature" style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain', filter: filterMap[color] || 'none' }} />;
// // // };

// // // // ─── QUILL CONFIGURATION ──────────────────────────────────────────────────
// // // const quillModules = {
// // //     toolbar: [
// // //         ['bold', 'italic', 'underline', 'code-block'],
// // //         [{ 'list': 'ordered' }, { 'list': 'bullet' }],
// // //         ['clean']
// // //     ],
// // // };

// // // const quillFormats = [
// // //     'bold', 'italic', 'underline', 'code-block',
// // //     'list', 'bullet'
// // // ];

// // // interface GradeData {
// // //     score: number;
// // //     feedback: string;
// // //     isCorrect?: boolean | null;
// // // }

// // // export type StatusType = 'info' | 'success' | 'error' | 'warning';

// // // const AssessmentPlayer: React.FC = () => {
// // //     const { assessmentId } = useParams<{ assessmentId: string }>();
// // //     const navigate = useNavigate();
// // //     const { user } = useStore();
// // //     const toast = useToast();

// // //     const [loading, setLoading] = useState(true);
// // //     const [saving, setSaving] = useState(false);
// // //     const [assessment, setAssessment] = useState<any>(null);
// // //     const [submission, setSubmission] = useState<any>(null);
// // //     const [answers, setAnswers] = useState<Record<string, any>>({});
// // //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// // //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// // //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);

// // //     const [declarationChecked, setDeclarationChecked] = useState(false);
// // //     const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
// // //     const [isAdminIntercept, setIsAdminIntercept] = useState(false);

// // //     const [showLeaveWarning, setShowLeaveWarning] = useState(false);
// // //     const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

// // //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// // //     const [timeLeft, setTimeLeft] = useState<number | null>(null);
// // //     const [timeOffset, setTimeOffset] = useState<number>(0);

// // //     const currentStatus = String(submission?.status || '').toLowerCase();

// // //     // 🚀 NEW: Check if this is a remediation attempt
// // //     const isRemediation = (submission?.attemptNumber || 1) > 1;

// // //     // 🚀 UPDATED LOCK LOGIC: It is NOT locked if it's in_progress, even during remediation
// // //     const isLocked = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'returned'].includes(currentStatus);
// // //     const isNotStarted = currentStatus === 'not_started';

// // //     // 🚀 UPDATED VIEW LOGIC: Show feedback if it was reviewed OR if it's currently a remediation attempt
// // //     const hasBeenReviewed = ['facilitator_reviewed', 'graded', 'moderated', 'returned'].includes(currentStatus) || isRemediation;
// // //     const hasBeenGraded = ['graded', 'moderated'].includes(currentStatus) || (isRemediation && submission?.grading?.gradedAt);
// // //     const hasBeenModerated = currentStatus === 'moderated' || (isRemediation && submission?.moderation?.moderatedAt);

// // //     // ─── 🚀 UPDATED TRI-LAYER HELPERS ──────────────────────────────────────────
// // //     const getBlockGrading = (blockId: string) => {
// // //         if (!hasBeenReviewed) return { score: undefined, facFeedback: '', assFeedback: '', modFeedback: '', facIsCorrect: null, assIsCorrect: null, modIsCorrect: null, isCorrect: null };

// // //         const g = submission?.grading || {};
// // //         const m = submission?.moderation || {};

// // //         const mLayer = m.breakdown?.[blockId] || {};
// // //         const aLayer = g.assessorBreakdown?.[blockId] || {};
// // //         const fLayer = g.facilitatorBreakdown?.[blockId] || {};
// // //         const legacyLayer = g.breakdown?.[blockId] || {};

// // //         let activeLayer = legacyLayer || { score: 0, isCorrect: null };
// // //         if (hasBeenReviewed) activeLayer = fLayer;
// // //         if (hasBeenGraded) activeLayer = aLayer;
// // //         if (hasBeenModerated) activeLayer = mLayer;

// // //         return {
// // //             score: activeLayer.score,
// // //             isCorrect: activeLayer.isCorrect,
// // //             facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect,
// // //             assIsCorrect: aLayer.isCorrect,
// // //             modIsCorrect: mLayer.isCorrect,
// // //             facFeedback: fLayer.feedback || legacyLayer.feedback || '',
// // //             assFeedback: aLayer.feedback || '',
// // //             modFeedback: mLayer.feedback || ''
// // //         };
// // //     };

// // //     const sectionTotals: Record<string, { total: number, awarded: number }> = {};
// // //     let currentSectionId = '';
// // //     if (assessment?.blocks) {
// // //         assessment.blocks.forEach((block: any) => {
// // //             if (block.type === 'section') {
// // //                 currentSectionId = block.id;
// // //                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
// // //             } else if ((block.type === 'mcq' || block.type === 'text') && currentSectionId) {
// // //                 const { score } = getBlockGrading(block.id);
// // //                 sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
// // //                 if (score !== undefined && score !== null) sectionTotals[currentSectionId].awarded += Number(score);
// // //             }
// // //         });
// // //     }

// // //     const getCompetencyStatus = () => {
// // //         if (!hasBeenGraded) return null;

// // //         // 🚀 If currently remediating, outcome is technically pending again
// // //         if (isRemediation && !isLocked) return null;

// // //         const compStr = (submission?.competency || submission?.overallCompetency || submission?.outcome || '').toString().toLowerCase();
// // //         let isCompetent = compStr === 'c' || compStr === 'competent';
// // //         const actualScore = submission?.marks !== undefined ? submission.marks : submission?.totalScore;
// // //         if (!isCompetent && actualScore !== undefined && assessment?.totalMarks) {
// // //             isCompetent = actualScore >= (assessment.totalMarks * 0.6);
// // //         }
// // //         const percentage = actualScore !== undefined && assessment?.totalMarks
// // //             ? Math.round((actualScore / assessment.totalMarks) * 100) : null;

// // //         const printColor = hasBeenModerated ? 'green' : 'red';

// // //         return {
// // //             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
// // //             color: printColor,
// // //             subtext: hasBeenModerated
// // //                 ? 'Final Results Verified & Endorsed.'
// // //                 : (isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.'),
// // //             score: actualScore, percentage, isCompetent
// // //         };
// // //     };

// // //     const outcome = getCompetencyStatus();

// // //     const getSafeDate = (dateString: string) => {
// // //         if (!dateString) return 'recently';
// // //         const date = new Date(dateString);
// // //         if (isNaN(date.getTime())) return 'recently';
// // //         return date.toLocaleString('en-ZA', {
// // //             day: 'numeric', month: 'short', year: 'numeric',
// // //             hour: '2-digit', minute: '2-digit',
// // //         });
// // //     };

// // //     // ─── SERVER TIME ─────────────────────────────────────────────────────────
// // //     useEffect(() => {
// // //         const fetchSecureTimeOffset = async () => {
// // //             try {
// // //                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
// // //                 const data = await res.json();
// // //                 setTimeOffset(new Date(data.utc_datetime).getTime() - new Date().getTime());
// // //             } catch { setTimeOffset(0); }
// // //         };
// // //         fetchSecureTimeOffset();
// // //     }, []);

// // //     const getSecureNow = () => new Date().getTime() + timeOffset;

// // //     // ─── DATA LOAD ────────────────────────────────────────────────────────────
// // //     useEffect(() => {
// // //         const loadAssessment = async () => {
// // //             if (!user?.uid || !assessmentId) return;
// // //             if (user.role && user.role !== 'learner') { setIsAdminIntercept(true); setLoading(false); return; }

// // //             try {
// // //                 const assessmentSnap = await getDoc(doc(db, 'assessments', assessmentId));
// // //                 if (!assessmentSnap.exists()) { toast.error('Assessment template not found.'); setLoading(false); return; }
// // //                 setAssessment(assessmentSnap.data());

// // //                 const learnersRef = collection(db, 'learners');
// // //                 let actualLearnerDocId = '';
// // //                 let activeCohortId = '';

// // //                 const authSnap = await getDocs(query(learnersRef, where('authUid', '==', user.uid)));
// // //                 if (!authSnap.empty) {
// // //                     actualLearnerDocId = authSnap.docs[0].id;
// // //                     activeCohortId = authSnap.docs[0].data().cohortId;
// // //                 } else {
// // //                     const emailSnap = await getDocs(query(learnersRef, where('email', '==', user.email)));
// // //                     if (emailSnap.empty) { toast.error('Learner profile not found.'); setLoading(false); return; }
// // //                     actualLearnerDocId = emailSnap.docs[0].id;
// // //                     activeCohortId = emailSnap.docs[0].data().cohortId;
// // //                 }

// // //                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
// // //                 if (userDocSnap.exists()) setLearnerProfile(userDocSnap.data());

// // //                 const subQuery = query(
// // //                     collection(db, 'learner_submissions'),
// // //                     where('learnerId', '==', actualLearnerDocId),
// // //                     where('assessmentId', '==', assessmentId)
// // //                 );
// // //                 const subQuerySnap = await getDocs(subQuery);

// // //                 let activeSub = null;

// // //                 if (!subQuerySnap.empty) {
// // //                     const cohortMatch = subQuerySnap.docs.find(d => d.data().cohortId === activeCohortId);
// // //                     if (cohortMatch) {
// // //                         activeSub = { id: cohortMatch.id, ...cohortMatch.data() };
// // //                     } else {
// // //                         const sorted = subQuerySnap.docs.map(d => ({ id: d.id, ...d.data() }) as any)
// // //                             .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
// // //                         activeSub = sorted[0];
// // //                     }
// // //                 }

// // //                 if (activeSub) {
// // //                     setSubmission(activeSub);
// // //                     setAnswers(activeSub.answers || {});

// // //                     if (activeSub.grading?.gradedBy) {
// // //                         const assSnap = await getDoc(doc(db, 'users', activeSub.grading.gradedBy));
// // //                         if (assSnap.exists()) setAssessorProfile(assSnap.data());
// // //                     }
// // //                     if (activeSub.moderation?.moderatedBy) {
// // //                         const modSnap = await getDoc(doc(db, 'users', activeSub.moderation.moderatedBy));
// // //                         if (modSnap.exists()) setModeratorProfile(modSnap.data());
// // //                     }

// // //                     if (activeSub.status === 'in_progress' && assessmentSnap.data().moduleInfo?.timeLimit > 0) {
// // //                         const startTime = new Date(activeSub.startedAt).getTime();
// // //                         const endTime = startTime + (assessmentSnap.data().moduleInfo.timeLimit * 60 * 1000);
// // //                         const remainingSeconds = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
// // //                         setTimeLeft(remainingSeconds);
// // //                         if (remainingSeconds === 0) forceAutoSubmit(activeSub.id, activeSub.answers || {});
// // //                     }
// // //                 } else {
// // //                     toast.error('You are not assigned to this assessment in your current class.');
// // //                 }
// // //             } catch (error) {
// // //                 console.error('Error loading assessment:', error);
// // //                 toast.error('Failed to load assessment data.');
// // //             } finally {
// // //                 setLoading(false);
// // //             }
// // //         };

// // //         if (timeOffset !== null) loadAssessment();
// // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // //     }, [assessmentId, user?.uid, timeOffset]);

// // //     // ─── COUNTDOWN ────────────────────────────────────────────────────────────
// // //     useEffect(() => {
// // //         if (timeLeft === null || isLocked || isNotStarted) return;
// // //         if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
// // //         const timerId = setInterval(() => {
// // //             const startTime = new Date(submission.startedAt).getTime();
// // //             const endTime = startTime + (assessment.moduleInfo.timeLimit * 60 * 1000);
// // //             setTimeLeft(Math.max(0, Math.floor((endTime - getSecureNow()) / 1000)));
// // //         }, 1000);
// // //         return () => clearInterval(timerId);
// // //     }, [timeLeft, isLocked, isNotStarted, submission?.startedAt]);

// // //     const formatTime = (seconds: number) => {
// // //         const h = Math.floor(seconds / 3600);
// // //         const m = Math.floor((seconds % 3600) / 60);
// // //         const s = seconds % 60;
// // //         if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
// // //         return `${m}m ${s.toString().padStart(2, '0')}s`;
// // //     };

// // //     // ─── HANDLERS ────────────────────────────────────────────────────────────
// // //     const handleStartAssessment = async () => {
// // //         if (!startDeclarationChecked) return;
// // //         setSaving(true);
// // //         try {
// // //             const secureStartTime = new Date(getSecureNow()).toISOString();
// // //             await updateDoc(doc(db, 'learner_submissions', submission.id), { status: 'in_progress', startedAt: secureStartTime });
// // //             setSubmission((prev: any) => ({ ...prev, status: 'in_progress', startedAt: secureStartTime }));
// // //             if (assessment.moduleInfo?.timeLimit > 0) setTimeLeft(assessment.moduleInfo.timeLimit * 60);
// // //         } catch { toast.error('Failed to start assessment.'); } finally { setSaving(false); }
// // //     };

// // //     const handleAnswerChange = (blockId: string, value: string | number) => {
// // //         if (isLocked) return;
// // //         setAnswers(prev => {
// // //             const newAnswers = { ...prev, [blockId]: value };
// // //             if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// // //             saveTimeoutRef.current = setTimeout(async () => {
// // //                 if (!submission?.id) return;
// // //                 setSaving(true);
// // //                 try {
// // //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // //                         answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString()
// // //                     });
// // //                 } catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
// // //             }, 1200);
// // //             return newAnswers;
// // //         });
// // //     };

// // //     const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
// // //         setSaving(true);
// // //         const submitTime = new Date(getSecureNow()).toISOString();
// // //         try {
// // //             await updateDoc(doc(db, 'learner_submissions', subId), {
// // //                 answers: currentAnswers,
// // //                 status: 'submitted',
// // //                 submittedAt: submitTime,
// // //                 autoSubmitted: true,
// // //                 learnerDeclaration: {
// // //                     agreed: true,
// // //                     timestamp: submitTime,
// // //                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// // //                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown'
// // //                 }
// // //             });
// // //             toast.success("Time's up! Assessment auto-submitted.");
// // //             setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
// // //             setTimeout(() => navigate(-1), 3000);
// // //         } catch (error) { console.error("Auto-submit failed", error); } finally { setSaving(false); }
// // //     };

// // //     const handleNavigationLeave = () => {
// // //         if (!isLocked && assessment.moduleInfo?.timeLimit > 0) setShowLeaveWarning(true);
// // //         else navigate(-1);
// // //     };

// // //     const triggerSubmitConfirm = () => {
// // //         if (!declarationChecked) return toast.warning('You must agree to the final declaration.');
// // //         setShowSubmitConfirm(true);
// // //     };

// // //     const executeSubmit = async () => {
// // //         setShowSubmitConfirm(false);
// // //         setSaving(true);
// // //         const submitTime = new Date(getSecureNow()).toISOString();
// // //         try {
// // //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// // //                 answers,
// // //                 status: 'submitted',
// // //                 submittedAt: submitTime,
// // //                 learnerDeclaration: {
// // //                     agreed: true,
// // //                     timestamp: submitTime,
// // //                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// // //                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown'
// // //                 }
// // //             });
// // //             toast.success('Assessment submitted!');
// // //             setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
// // //             setTimeout(() => window.scrollTo(0, 0), 1000);
// // //         } catch { toast.error('Failed to submit.'); } finally { setSaving(false); }
// // //     };

// // //     // ══════════════════════════════════════════════════════════════════════════
// // //     // LOADING & ERROR SCREENS
// // //     // ══════════════════════════════════════════════════════════════════════════
// // //     if (loading) return (
// // //         <div className="ap-fullscreen">
// // //             <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
// // //                 <div className="ap-spinner" />
// // //                 <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
// // //                     Loading Assessment…
// // //                 </span>
// // //             </div>
// // //         </div>
// // //     );

// // //     if (isAdminIntercept) return (
// // //         <div className="ap-fullscreen">
// // //             <div className="ap-state-card">
// // //                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
// // //                     <ShieldAlert size={32} color="var(--mlab-blue)" />
// // //                 </div>
// // //                 <h1 className="ap-state-card__title">Staff Access Detected</h1>
// // //                 <p className="ap-state-card__desc">This area is restricted to learners only.<br />Please use Preview mode to view assessments without affecting learner data.</p>
// // //                 <div className="ap-state-card__actions">
// // //                     <button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Go Back</button>
// // //                     <button className="ap-btn ap-btn--primary" onClick={() => navigate(`/admin/assessment/preview/${assessmentId}`)}>Open Preview Mode</button>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );

// // //     if (!assessment || !submission) return (
// // //         <div className="ap-fullscreen">
// // //             <div className="ap-state-card">
// // //                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', opacity: 0.5 }}>
// // //                     <AlertCircle size={32} color="var(--mlab-grey)" />
// // //                 </div>
// // //                 <h2 className="ap-state-card__title">Assessment Unavailable</h2>
// // //                 <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Please contact your facilitator if you believe this is an error.</p>
// // //                 <div className="ap-state-card__actions">
// // //                     <button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );

// // //     // ══════════════════════════════════════════════════════════════════════════
// // //     // GATE SCREEN (BEFORE STARTING)
// // //     // ══════════════════════════════════════════════════════════════════════════
// // //     if (isNotStarted) return (
// // //         <div className="ap-gate ap-animate">
// // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// // //             <div className="ap-gate-topbar">
// // //                 <button className="ap-gate-topbar__back" onClick={() => navigate(-1)}>
// // //                     <ArrowLeft size={14} /> Back to Portfolio
// // //                 </button>
// // //                 <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
// // //             </div>

// // //             <div className="ap-gate-body">
// // //                 <div className="ap-gate-left">
// // //                     <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
// // //                     <h1 className="ap-gate-left__title">{assessment.title}</h1>
// // //                     <p className="ap-gate-left__sub">Read all instructions carefully before starting.</p>

// // //                     {/* 🚀 REMEDIATION ALERT ON GATE */}
// // //                     {isRemediation && (
// // //                         <div style={{ background: '#fef3c7', borderLeft: '4px solid #d97706', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
// // //                             <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '4px' }}>
// // //                                 <RotateCcw size={16} /> Remediation Attempt #{submission.attemptNumber}
// // //                             </strong>
// // //                             <p style={{ margin: 0, color: '#92400e', fontSize: '0.85rem' }}>
// // //                                 This workbook has been unlocked for remediation. Your previous answers are still loaded.
// // //                                 Review the assessor's feedback, update your answers, and resubmit.
// // //                             </p>
// // //                         </div>
// // //                     )}

// // //                     <div className="ap-info-grid">
// // //                         <div className="ap-info-card">
// // //                             <div className="ap-info-card__label"><BookOpen size={12} /> Module</div>
// // //                             <div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div>
// // //                             <div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div>
// // //                         </div>
// // //                         <div className="ap-info-card">
// // //                             <div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div>
// // //                             <div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div>
// // //                             <div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div>
// // //                         </div>
// // //                         <div className="ap-info-card">
// // //                             <div className="ap-info-card__label"><Clock size={12} /> Time Limit</div>
// // //                             <div className="ap-info-card__value">{assessment.moduleInfo?.timeLimit ? `${assessment.moduleInfo.timeLimit} Min` : 'No Limit'}</div>
// // //                             <div className="ap-info-card__sub">{assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}</div>
// // //                         </div>
// // //                         <div className="ap-info-card">
// // //                             <div className="ap-info-card__label"><Scale size={12} /> Total Marks</div>
// // //                             <div className="ap-info-card__value">{assessment.totalMarks}</div>
// // //                             <div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div>
// // //                         </div>
// // //                     </div>

// // //                     <div className="ap-note-block">
// // //                         <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
// // //                         <p className="ap-note-block__text">{assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
// // //                         {assessment.purpose && <>
// // //                             <div className="ap-note-block__heading"><Info size={12} /> Purpose</div>
// // //                             <p className="ap-note-block__text">{assessment.purpose}</p>
// // //                         </>}
// // //                     </div>
// // //                 </div>

// // //                 <div className="ap-gate-right">
// // //                     <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
// // //                     <ul className="ap-rules-list">
// // //                         <li className="ap-rule-item">
// // //                             <div className="ap-rule-icon"><Scale size={18} /></div>
// // //                             <div>
// // //                                 <span className="ap-rule-title">Academic Integrity</span>
// // //                                 <p className="ap-rule-desc">All work must be entirely your own. Plagiarism or use of unauthorized AI tools violates QCTO guidelines.</p>
// // //                             </div>
// // //                         </li>
// // //                         <li className="ap-rule-item">
// // //                             <div className="ap-rule-icon"><UserCheck size={18} /></div>
// // //                             <div>
// // //                                 <span className="ap-rule-title">Independent Work</span>
// // //                                 <p className="ap-rule-desc">Unless explicitly stated as a group project, no collaboration is permitted.</p>
// // //                             </div>
// // //                         </li>
// // //                         <li className="ap-rule-item">
// // //                             <div className="ap-rule-icon"><Wifi size={18} /></div>
// // //                             <div>
// // //                                 <span className="ap-rule-title">Auto-Save</span>
// // //                                 <p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p>
// // //                             </div>
// // //                         </li>
// // //                         {assessment.moduleInfo?.timeLimit > 0 && (
// // //                             <li className="ap-rule-item">
// // //                                 <div className="ap-rule-icon"><Clock size={18} /></div>
// // //                                 <div>
// // //                                     <span className="ap-rule-title">Timed Assessment</span>
// // //                                     <p className="ap-rule-desc">The countdown continues even if you close the browser tab. Plan your time carefully.</p>
// // //                                 </div>
// // //                             </li>
// // //                         )}
// // //                     </ul>

// // //                     <div className="ap-declaration">
// // //                         <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
// // //                             <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
// // //                             <span className="ap-declaration-check__text">
// // //                                 <strong>Declaration of Authenticity</strong>
// // //                                 I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.
// // //                             </span>
// // //                         </label>
// // //                         <button className={`ap-start-btn${startDeclarationChecked ? ' ap-start-btn--ready' : ''}`} onClick={handleStartAssessment} disabled={saving || !startDeclarationChecked}>
// // //                             {saving ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> I Agree, Begin Assessment</>}
// // //                         </button>
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );

// // //     // ══════════════════════════════════════════════════════════════════════════
// // //     // MAIN PLAYER SCREEN
// // //     // ══════════════════════════════════════════════════════════════════════════
// // //     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
// // //         if (block.type === 'section') acc.push({ type: 'section', label: block.title, id: block.id });
// // //         else if (block.type === 'text' || block.type === 'mcq') acc.push({ type: 'q', label: block.question, id: block.id });
// // //         return acc;
// // //     }, []) || [];

// // //     let displayStatus = submission.status.replace('_', ' ');
// // //     if (submission.status === 'returned') displayStatus = 'revision required';

// // //     return (
// // //         <div className="ap-player ap-animate">
// // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // //             {/* 🚀 MODALS USING PORTAL TO PREVENT SCROLL BUGS 🚀 */}
// // //             {showLeaveWarning && (
// // //                 <ConfirmModal
// // //                     title="Leave Timed Assessment?"
// // //                     message="Your timer will NOT pause. If you leave, the clock continues counting down in the background."
// // //                     confirmText="Yes, Leave" cancelText="Stay Here"
// // //                     onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)}
// // //                 />
// // //             )}
// // //             {showSubmitConfirm && (
// // //                 <ConfirmModal
// // //                     title="Submit Assessment?"
// // //                     message="You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."
// // //                     confirmText="Submit for Grading" cancelText="Go Back"
// // //                     onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)}
// // //                 />
// // //             )}

// // //             {/* ── Top Bar ── */}
// // //             <div className="ap-player-topbar no-print">
// // //                 <div className="ap-player-topbar__left">
// // //                     <button className="ap-player-topbar__back" onClick={handleNavigationLeave}>
// // //                         <ArrowLeft size={13} /> Portfolio
// // //                     </button>
// // //                     <div className="ap-player-topbar__separator" />
// // //                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
// // //                 </div>

// // //                 <div className="ap-player-topbar__right">
// // //                     {/* 🚀 ONLY VISIBLE IF SUBMITTED 🚀 */}
// // //                     {isLocked && (
// // //                         <button className="ap-topbar-print-btn" onClick={() => window.print()}>
// // //                             <Printer size={13} /> Print Audit
// // //                         </button>
// // //                     )}
// // //                     {!isLocked && timeLeft !== null && (
// // //                         <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}>
// // //                             <Timer size={14} /> {formatTime(timeLeft)}
// // //                         </div>
// // //                     )}
// // //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
// // //                         {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}
// // //                     </span>
// // //                     <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>
// // //                         {displayStatus}
// // //                     </span>
// // //                 </div>
// // //             </div>

// // //             {/* ── Body: 2-col (active) or 3-col (locked) ── */}
// // //             <div className={`ap-player-body${isLocked ? ' is-locked' : ''}`}>

// // //                 {/* LEFT SIDEBAR */}
// // //                 <nav className="ap-sidebar no-print">
// // //                     <div className="ap-sidebar__meta-block">
// // //                         <div className="ap-sidebar__meta-title">{assessment.title}</div>
// // //                         <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
// // //                         <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div>
// // //                         <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>
// // //                     </div>

// // //                     {(submission.status !== 'not_started' && submission.status !== 'in_progress') && (
// // //                         <>
// // //                             <div className="ap-sidebar__label">Status Tracking</div>
// // //                             <div className="ap-sidebar__status-box">

// // //                                 {hasBeenGraded && outcome ? (
// // //                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
// // //                                         <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
// // //                                         {outcome.score !== undefined && (
// // //                                             <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>
// // //                                                 {outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%
// // //                                             </div>
// // //                                         )}
// // //                                         <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
// // //                                     </div>
// // //                                 ) : (
// // //                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}>
// // //                                         <div className="ap-sidebar__outcome-val" style={{ color: '#cbd5e1' }}>Awaiting Grade</div>
// // //                                         <div className="ap-sidebar__outcome-note">The Assessor has not yet finalized your official results.</div>
// // //                                     </div>
// // //                                 )}

// // //                                 {/* Feedback Stack */}
// // //                                 {hasBeenReviewed && submission.grading?.facilitatorOverallFeedback && (
// // //                                     <div style={{ background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid rgba(56, 189, 248, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
// // //                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
// // //                                             <Info size={11} /> Facilitator Summary
// // //                                         </strong>
// // //                                         <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', lineHeight: '1.55' }}>
// // //                                             {submission.grading.facilitatorOverallFeedback}
// // //                                         </p>
// // //                                     </div>
// // //                                 )}

// // //                                 {hasBeenGraded && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
// // //                                     <div style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid rgba(245,158,11,0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
// // //                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'red', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
// // //                                             <MessageSquare size={11} /> Assessor Remarks
// // //                                         </strong>
// // //                                         <p style={{ margin: 0, color: 'red', fontSize: '0.78rem', lineHeight: '1.55' }}>
// // //                                             {submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}
// // //                                         </p>
// // //                                     </div>
// // //                                 )}

// // //                                 {hasBeenModerated && submission.moderation?.feedback && (
// // //                                     <div style={{ background: 'rgba(34, 197, 94, 0.08)', borderLeft: '3px solid rgba(34, 197, 94, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
// // //                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#4ade80', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
// // //                                             <ShieldCheck size={11} /> QA Endorsement Notes
// // //                                         </strong>
// // //                                         <p style={{ margin: 0, color: '#4ade80', fontSize: '0.78rem', lineHeight: '1.55' }}>
// // //                                             {submission.moderation.feedback}
// // //                                         </p>
// // //                                     </div>
// // //                                 )}

// // //                                 <div className="ap-sidebar__timeline-item">
// // //                                     <div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}>
// // //                                         <UserCheck size={13} />
// // //                                     </div>
// // //                                     <div className="ap-sidebar__timeline-content">
// // //                                         <span className="ap-sidebar__timeline-title">Facilitator Review</span>
// // //                                         <span className="ap-sidebar__timeline-desc">
// // //                                             {submission.status === 'submitted' ? 'Waiting for Facilitator' : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}
// // //                                         </span>
// // //                                     </div>
// // //                                 </div>

// // //                                 <div className="ap-sidebar__timeline-item">
// // //                                     <div className={`ap-sidebar__timeline-icon${hasBeenGraded ? ' ap-sidebar__timeline-icon--done' : ''}`}>
// // //                                         <Award size={13} />
// // //                                     </div>
// // //                                     <div className="ap-sidebar__timeline-content">
// // //                                         <span className="ap-sidebar__timeline-title">Assessor Grading</span>
// // //                                         <span className="ap-sidebar__timeline-desc">
// // //                                             {hasBeenGraded ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}
// // //                                         </span>
// // //                                     </div>
// // //                                 </div>

// // //                                 <div className="ap-sidebar__timeline-item">
// // //                                     <div className={`ap-sidebar__timeline-icon${hasBeenModerated ? ' ap-sidebar__timeline-icon--done' : ''}`}>
// // //                                         <ShieldCheck size={13} />
// // //                                     </div>
// // //                                     <div className="ap-sidebar__timeline-content">
// // //                                         <span className="ap-sidebar__timeline-title">Internal Moderation</span>
// // //                                         <span className="ap-sidebar__timeline-desc">
// // //                                             {hasBeenModerated ? `Endorsed ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}
// // //                                         </span>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                         </>
// // //                     )}

// // //                     <div className="ap-sidebar__label">Workbook Contents</div>
// // //                     <div className="ap-sidebar__nav">
// // //                         {navItems.map((item: any) =>
// // //                             item.type === 'section' ? (
// // //                                 <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
// // //                             ) : (
// // //                                 <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item">
// // //                                     {item.label.length > 36 ? item.label.slice(0, 36) + '…' : item.label}
// // //                                 </a>
// // //                             )
// // //                         )}
// // //                     </div>

// // //                     <div className="ap-sidebar__footer">
// // //                         <div className="ap-sidebar__footer-item">
// // //                             <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={11} /> Reference</span>
// // //                             <strong>{submission.id?.split('_')[0] || 'N/A'}</strong>
// // //                         </div>
// // //                         <div className="ap-sidebar__footer-item">
// // //                             <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Activity size={11} /> Last Sync</span>
// // //                             <strong>
// // //                                 {submission.lastSavedAt
// // //                                     ? new Date(submission.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
// // //                                     : 'Offline'}
// // //                             </strong>
// // //                         </div>
// // //                     </div>
// // //                 </nav>

// // //                 {/* CENTRE CONTENT */}
// // //                 <div className="ap-player-content print-pane">

// // //                     {/* ═════════════════════════════════════════════════════════════════════════
// // //                         🚀 OFFICIAL QCTO PRINT COVER (INVISIBLE ON SCREEN, VISIBLE ON PDF) 🚀
// // //                     ═════════════════════════════════════════════════════════════════════════ */}
// // //                     {isLocked && (
// // //                         <div className="print-only-cover">

// // //                             {/* --- COVER PAGE --- */}
// // //                             <div className="print-page">
// // //                                 <h1 style={{ textAlign: 'center', textTransform: 'uppercase', fontSize: '18pt', marginBottom: '10px' }}>
// // //                                     {assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}
// // //                                 </h1>
// // //                                 <h2 style={{ textAlign: 'center', fontSize: '16pt', marginBottom: '30px', textDecoration: 'underline' }}>
// // //                                     LEARNER WORKBOOK
// // //                                 </h2>

// // //                                 <table className="print-table" style={{ width: '100%', marginBottom: '40px' }}>
// // //                                     <tbody>
// // //                                         <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Module #</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>Notional hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>Credit(s)</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
// // //                                     </tbody>
// // //                                 </table>

// // //                                 <h3 style={{ fontSize: '14pt', marginBottom: '10px' }}>CONTACT INFORMATION:</h3>
// // //                                 <table className="print-table" style={{ width: '100%' }}>
// // //                                     <tbody>
// // //                                         <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || user?.fullName || '________________________'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || user?.email || '________________________'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>Telephone (W)</td><td>{learnerProfile?.telephoneWork || '________________________'}</td></tr>
// // //                                         <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
// // //                                     </tbody>
// // //                                 </table>
// // //                             </div>

// // //                             {/* --- PAGE 2: INSTRUCTIONS & TOPICS --- */}
// // //                             <div className="print-page">
// // //                                 <h3>Note to the learner</h3>
// // //                                 <p>{assessment?.instructions || 'This Learner Guide provides a comprehensive overview of the module. It is designed to improve the skills and knowledge of learners, and thus enabling them to effectively and efficiently complete specific tasks.'}</p>

// // //                                 <h3>Purpose</h3>
// // //                                 <p>{assessment?.purpose || 'The main focus of the learning in this knowledge module is to build an understanding of the concepts related to this subject matter.'}</p>

// // //                                 <h3>Topic elements to be covered include</h3>
// // //                                 <p>The learning will enable learners to demonstrate an understanding of:</p>
// // //                                 <table className="print-table no-border" style={{ width: '100%', fontSize: '10pt' }}>
// // //                                     <tbody>
// // //                                         {assessment?.moduleInfo?.topics && assessment.moduleInfo.topics.length > 0 ? (
// // //                                             assessment.moduleInfo.topics.map((topic: any, idx: number) => (
// // //                                                 <tr key={idx}>
// // //                                                     <td>
// // //                                                         {topic.code ? <strong>{topic.code}: </strong> : ''}
// // //                                                         {topic.title || topic.name}
// // //                                                     </td>
// // //                                                     <td>{topic.weight || topic.percentage}%</td>
// // //                                                 </tr>
// // //                                             ))
// // //                                         ) : (assessment?.blocks?.filter((b: any) => b.type === 'section').length > 0) ? (
// // //                                             assessment.blocks.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
// // //                                                 const secTotal = sectionTotals[sec.id]?.total || 0;
// // //                                                 const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
// // //                                                 return (
// // //                                                     <tr key={idx}>
// // //                                                         <td><strong>Section {idx + 1}: </strong> {sec.title}</td>
// // //                                                         <td>{secTotal > 0 ? `${pct}%` : '—'}</td>
// // //                                                     </tr>
// // //                                                 )
// // //                                             })
// // //                                         ) : (
// // //                                             <tr>
// // //                                                 <td colSpan={2} style={{ fontStyle: 'italic', color: '#64748b' }}>
// // //                                                     (No specific sections mapped)
// // //                                                 </td>
// // //                                             </tr>
// // //                                         )}
// // //                                     </tbody>
// // //                                 </table>
// // //                             </div>

// // //                             {/* --- PAGE 3: REQUIREMENTS & COMPLIANCE --- */}
// // //                             <div className="print-page">
// // //                                 <h3>Entry Requirements</h3>
// // //                                 <p>{assessment?.moduleInfo?.entryRequirements || `NQF Level ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}</p>

// // //                                 <h3>Provider Accreditation Requirements for the Knowledge Module</h3>
// // //                                 <p><strong>Physical Requirements:</strong><br />{assessment?.moduleInfo?.physicalRequirements || 'The provider must have structured learning material or provide learners with access to structured learning material that addresses all the topics in all the knowledge modules.'}</p>

// // //                                 <h3>QCTO / SETA requirements</h3>
// // //                                 <p><strong>Human Resource Requirements:</strong></p>
// // //                                 <ul style={{ marginBottom: '15px' }}>
// // //                                     <li>Lecturer/learner ratio of {assessment?.moduleInfo?.lecturerRatio || '1:20'} (Maximum)</li>
// // //                                     <li>Qualification of lecturer (SME): {assessment?.moduleInfo?.lecturerQualification || `Industry recognised qualifications with experience in the related industry`}</li>
// // //                                     {assessment?.moduleInfo?.vendorCertification && <li>{assessment.moduleInfo.vendorCertification}</li>}
// // //                                     <li>Assessors and moderators: accredited by the relevant SETA</li>
// // //                                 </ul>

// // //                                 <p><strong>Legal Requirements:</strong></p>
// // //                                 <ul style={{ marginBottom: '15px' }}>
// // //                                     <li>Legal (product) licences to use the software for learning and training (where applicable)</li>
// // //                                     <li>OHS compliance certificate</li>
// // //                                     <li>Ethical clearance (where necessary)</li>
// // //                                 </ul>

// // //                                 <h3>Exemptions</h3>
// // //                                 <p>{assessment?.moduleInfo?.exemptions || 'No exemptions, but the module can be achieved in full through a normal RPL process.'}</p>

// // //                                 <h3>Venue, Date and Time:</h3>
// // //                                 <p><strong>Venue:</strong> {assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform'}</p>
// // //                                 <p><strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}</p>

// // //                                 <h3>Assessments</h3>
// // //                                 <p>The only way to establish whether you are competent and have accomplished the learning outcomes is through continuous assessments. This assessment process involves interpreting evidence about your ability to perform certain tasks.</p>
// // //                                 <p>This module includes assessments in the form of self-evaluations/activities and exercises. These exercises/activities or self-assessments (Learner workbook) must be handed to the facilitator. It will be added to your portfolio of evidence, which will be proof signed by your facilitator that you have successfully performed these tasks.</p>
// // //                             </div>
// // //                         </div>
// // //                     )}


// // //                     {isLocked && (
// // //                         <div className="ap-print-header">
// // //                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
// // //                                 <div>
// // //                                     <p style={{ margin: '0 0 4px' }}><strong>Learner:</strong> {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName}</p>
// // //                                     <p style={{ margin: 0 }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber}</p>
// // //                                 </div>
// // //                                 <div style={{ textAlign: 'right' }}>
// // //                                     <p style={{ margin: '0 0 4px' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
// // //                                     <p style={{ margin: '0 0 4px' }}><strong>Submitted:</strong> {getSafeDate(submission.submittedAt)}</p>
// // //                                     {hasBeenGraded && <p style={{ margin: 0 }}><strong>Outcome:</strong> {outcome?.label} ({outcome?.percentage}%)</p>}
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     <div className="ap-blocks">
// // //                         {assessment.blocks?.map((block: any, idx: number) => {

// // //                             if (block.type === 'section') {
// // //                                 const totals = sectionTotals[block.id];
// // //                                 return (
// // //                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
// // //                                         <span>{block.title}</span>
// // //                                         {hasBeenGraded && totals && totals.total > 0 && (
// // //                                             <span className="no-print" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px' }}>
// // //                                                 <BarChart size={13} /> {totals.awarded}/{totals.total}
// // //                                             </span>
// // //                                         )}
// // //                                     </div>
// // //                                 );
// // //                             }

// // //                             if (block.type === 'info') return (
// // //                                 <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
// // //                                     <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
// // //                                     <p className="ap-block-info__text">{block.content}</p>
// // //                                 </div>
// // //                             );

// // //                             const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect } = getBlockGrading(block.id);

// // //                             let activeInkColor = 'transparent';
// // //                             if (hasBeenModerated) activeInkColor = 'green';
// // //                             else if (hasBeenGraded) activeInkColor = 'red';
// // //                             else if (hasBeenReviewed) activeInkColor = 'blue';

// // //                             const markLabel = hasBeenReviewed && blockScore !== undefined && blockScore !== null
// // //                                 ? `${blockScore} / ${block.marks}`
// // //                                 : `${block.marks} Marks`;

// // //                             // 🚀 HORIZONTAL TRI-LAYER VISUAL INDICATORS
// // //                             const TopRightIndicator = () => {
// // //                                 return (
// // //                                     <div style={{ display: 'flex', gap: '8px', marginLeft: '12px', alignItems: 'center' }}>
// // //                                         {/* Facilitator Blue Pen Indicator */}
// // //                                         {hasBeenReviewed && facIsCorrect !== null && facIsCorrect !== undefined && (
// // //                                             <div title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
// // //                                                 {facIsCorrect
// // //                                                     ? <Check size={18} color="#0284c7" strokeWidth={3} />
// // //                                                     : <X size={18} color="#0284c7" strokeWidth={3} />}
// // //                                             </div>
// // //                                         )}
// // //                                         {/* Assessor Red Pen Indicator */}
// // //                                         {hasBeenGraded && assIsCorrect !== null && assIsCorrect !== undefined && (
// // //                                             <div title="Official Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px' }}>
// // //                                                 {assIsCorrect
// // //                                                     ? <Check size={18} color="#ef4444" strokeWidth={3} />
// // //                                                     : <X size={18} color="#ef4444" strokeWidth={3} />}
// // //                                             </div>
// // //                                         )}
// // //                                         {/* Moderator Green Pen Indicator */}
// // //                                         {hasBeenModerated && modIsCorrect !== null && modIsCorrect !== undefined && (
// // //                                             <div title="Internal Moderation QA" style={{ display: 'flex', alignItems: 'center', background: '#f0fdf4', padding: '2px 6px', borderRadius: '4px' }}>
// // //                                                 {modIsCorrect
// // //                                                     ? <Check size={18} color="#22c55e" strokeWidth={3} />
// // //                                                     : <X size={18} color="#22c55e" strokeWidth={3} />}
// // //                                             </div>
// // //                                         )}
// // //                                     </div>
// // //                                 );
// // //                             };

// // //                             if (block.type === 'mcq') return (
// // //                                 <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
// // //                                     <div className="ap-block-question__header">
// // //                                         <div className="ap-block-question__text-wrap" style={{ display: 'flex', alignItems: 'flex-start' }}>
// // //                                             <span className="ap-block-question__text">
// // //                                                 <strong style={{ color: '#94a3b8', marginRight: '8px' }}>Q{idx + 1}.</strong>
// // //                                                 {block.question}
// // //                                             </span>
// // //                                             <TopRightIndicator />
// // //                                         </div>
// // //                                         <span className="ap-block-question__marks" style={{ color: activeInkColor !== 'transparent' ? activeInkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
// // //                                     </div>
// // //                                     <div className="ap-block-question__body">
// // //                                         <div className="ap-mcq-options">
// // //                                             {block.options?.map((opt: string, i: number) => {
// // //                                                 const selected = answers[block.id] === i;
// // //                                                 return (
// // //                                                     <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isLocked ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
// // //                                                         <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isLocked} onChange={() => handleAnswerChange(block.id, i)} />
// // //                                                         <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
// // //                                                         <span className="ap-mcq-label__text">{opt}</span>
// // //                                                     </label>
// // //                                                 );
// // //                                             })}
// // //                                         </div>

// // //                                         {/* 🚀 TRI-LAYER FEEDBACK DISPLAY */}
// // //                                         <div className="ap-feedback-stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
// // //                                             {hasBeenReviewed && facFeedback && (
// // //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, background: '#eff6ff', padding: '0.75rem', borderRadius: '4px' }}>
// // //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // //                                                         <span style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                             <Info size={12} /> Facilitator Coaching
// // //                                                         </span>
// // //                                                     </div>
// // //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#0369a1', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>
// // //                                                         {facFeedback}
// // //                                                     </p>
// // //                                                 </div>
// // //                                             )}

// // //                                             {hasBeenGraded && assFeedback && (
// // //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, background: '#fef2f2', padding: '0.75rem', borderRadius: '4px' }}>
// // //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // //                                                         <span style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                             <Award size={12} /> Assessor Grade
// // //                                                         </span>
// // //                                                     </div>
// // //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#991b1b', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>
// // //                                                         {assFeedback}
// // //                                                     </p>
// // //                                                 </div>
// // //                                             )}

// // //                                             {hasBeenModerated && modFeedback && (
// // //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #22c55e`, background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px' }}>
// // //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // //                                                         <span style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                             <ShieldCheck size={12} /> Moderator QA Notes
// // //                                                         </span>
// // //                                                     </div>
// // //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#16a34a', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>
// // //                                                         {modFeedback}
// // //                                                     </p>
// // //                                                 </div>
// // //                                             )}
// // //                                         </div>

// // //                                     </div>
// // //                                 </div>
// // //                             );

// // //                             if (block.type === 'text') return (
// // //                                 <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
// // //                                     <div className="ap-block-question__header">
// // //                                         <div className="ap-block-question__text-wrap" style={{ display: 'flex', alignItems: 'flex-start' }}>
// // //                                             <span className="ap-block-question__text">
// // //                                                 <strong style={{ color: '#94a3b8', marginRight: '8px' }}>Q{idx + 1}.</strong>
// // //                                                 {block.question}
// // //                                             </span>
// // //                                             <TopRightIndicator />
// // //                                         </div>
// // //                                         <span className="ap-block-question__marks" style={{ color: activeInkColor !== 'transparent' ? activeInkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
// // //                                     </div>
// // //                                     <div className="ap-block-question__body">
// // //                                         <div className={`ap-quill-wrapper ${isLocked ? 'locked' : ''}`}>
// // //                                             <ReactQuill
// // //                                                 theme="snow"
// // //                                                 value={answers[block.id] || ''}
// // //                                                 onChange={(content) => handleAnswerChange(block.id, content)}
// // //                                                 readOnly={isLocked}
// // //                                                 modules={quillModules}
// // //                                                 formats={quillFormats}
// // //                                                 placeholder={isLocked ? 'No answer provided.' : 'Type your detailed response here...'}
// // //                                             />
// // //                                         </div>

// // //                                         {/* 🚀 TRI-LAYER FEEDBACK DISPLAY */}
// // //                                         <div className="ap-feedback-stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
// // //                                             {hasBeenReviewed && facFeedback && (
// // //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, background: '#eff6ff', padding: '0.75rem', borderRadius: '4px' }}>
// // //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // //                                                         <span style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                             <Info size={12} /> Facilitator Coaching
// // //                                                         </span>
// // //                                                     </div>
// // //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#0369a1', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>
// // //                                                         {facFeedback}
// // //                                                     </p>
// // //                                                 </div>
// // //                                             )}

// // //                                             {hasBeenGraded && assFeedback && (
// // //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, background: '#fef2f2', padding: '0.75rem', borderRadius: '4px' }}>
// // //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // //                                                         <span style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                             <Award size={12} /> Assessor Grade
// // //                                                         </span>
// // //                                                     </div>
// // //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#991b1b', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>
// // //                                                         {assFeedback}
// // //                                                     </p>
// // //                                                 </div>
// // //                                             )}

// // //                                             {hasBeenModerated && modFeedback && (
// // //                                                 <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #22c55e`, background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px' }}>
// // //                                                     <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // //                                                         <span style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                             <ShieldCheck size={12} /> Moderator QA Notes
// // //                                                         </span>
// // //                                                     </div>
// // //                                                     <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#16a34a', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>
// // //                                                         {modFeedback}
// // //                                                     </p>
// // //                                                 </div>
// // //                                             )}
// // //                                         </div>

// // //                                     </div>
// // //                                 </div>
// // //                             );

// // //                             return null;
// // //                         })}
// // //                     </div>

// // //                     {!isLocked ? (
// // //                         <div className="ap-footer">
// // //                             <h3 className="ap-footer__title">Final Submission</h3>
// // //                             <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
// // //                             <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// // //                                 <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// // //                                 <span className="ap-footer-declaration__text">
// // //                                     <strong>Learner Final Declaration</strong>
// // //                                     I confirm that this is my own work, completed without unauthorized assistance.
// // //                                 </span>
// // //                             </label>
// // //                             <div className="ap-footer-actions">
// // //                                 <span className="ap-autosave-label">
// // //                                     {saving
// // //                                         ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</>
// // //                                         : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>
// // //                                     }
// // //                                 </span>
// // //                                 <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}>
// // //                                     <Save size={14} /> Submit for Grading
// // //                                 </button>
// // //                             </div>
// // //                         </div>
// // //                     ) : (
// // //                         <div className="ap-footer ap-footer--locked no-print">
// // //                             <div className="ap-footer--locked__icon-wrap">
// // //                                 {/* 🚀 UPDATED LEARNER NOTIFICATION FOR NYC */}
// // //                                 {hasBeenModerated && outcome?.isCompetent === false ? (
// // //                                     <AlertTriangle size={36} color="#d97706" />
// // //                                 ) : (
// // //                                     <CheckCircle size={36} color="var(--mlab-green)" />
// // //                                 )}
// // //                             </div>

// // //                             {/* 🚀 CONDITIONAL RENDER FOR NYC OUTCOME */}
// // //                             {hasBeenModerated && outcome?.isCompetent === false ? (
// // //                                 <>
// // //                                     <h3 className="ap-footer--locked__title" style={{ color: '#d97706' }}>
// // //                                         Assessment Outcome: Not Yet Competent (NYC)
// // //                                     </h3>
// // //                                     <div style={{ textAlign: 'left', maxWidth: '600px', margin: '1rem auto', background: '#fffbeb', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
// // //                                         <p style={{ margin: '0 0 1rem 0', color: '#92400e', fontSize: '0.9rem', lineHeight: '1.5' }}>
// // //                                             Your assessment has been fully verified. At this stage, you have not yet met all the requirements for competency.
// // //                                         </p>
// // //                                         <h4 style={{ color: '#b45309', margin: '0 0 0.5rem 0', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>What happens next?</h4>
// // //                                         <ol style={{ color: '#92400e', fontSize: '0.85rem', lineHeight: '1.6', paddingLeft: '1.25rem', margin: '0 0 1rem 0' }}>
// // //                                             <li><strong>Review Feedback:</strong> Please scroll up and review the Assessor's Red Pen feedback on your incorrect answers.</li>
// // //                                             <li><strong>Coaching:</strong> Your facilitator will schedule a brief intervention with you to discuss the feedback and guide you.</li>
// // //                                             <li><strong>Remediation:</strong> Following the coaching session, your facilitator will unlock this workbook so you can correct your answers and resubmit (Attempt {submission.attemptNumber ? submission.attemptNumber + 1 : 2}).</li>
// // //                                         </ol>
// // //                                         <p style={{ margin: 0, color: '#b45309', fontSize: '0.75rem', fontStyle: 'italic' }}>
// // //                                             Academic Rights: If you strongly disagree with this outcome after reviewing the feedback, you have the right to lodge a formal appeal with your training provider.
// // //                                         </p>
// // //                                     </div>
// // //                                 </>
// // //                             ) : (
// // //                                 <>
// // //                                     <h3 className="ap-footer--locked__title">
// // //                                         {submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}
// // //                                     </h3>
// // //                                     <p className="ap-footer--locked__desc">
// // //                                         This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>.{' '}
// // //                                         {hasBeenGraded ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}
// // //                                     </p>
// // //                                 </>
// // //                             )}

// // //                             <button className="ap-btn ap-btn--primary" onClick={() => navigate(-1)}>
// // //                                 <ArrowLeft size={14} /> Return to Portfolio
// // //                             </button>
// // //                         </div>
// // //                     )}

// // //                     {/* 🚀 TRI-LAYER PRINT SIGNATURES 🚀 */}
// // //                     {isLocked && (
// // //                         <div className="ap-signature-blocks">
// // //                             <div className="ap-sig-box">
// // //                                 <span className="ap-sig-box__label">Learner Declaration</span>
// // //                                 <div className="ap-sig-box__img-wrap">
// // //                                     {learnerProfile?.signatureUrl
// // //                                         ? <img src={learnerProfile.signatureUrl} alt="Learner Signature" />
// // //                                         : <span className="ap-sig-box__no-sig">No canvas signature on file</span>
// // //                                     }
// // //                                 </div>
// // //                                 <span className="ap-sig-box__name">
// // //                                     {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}
// // //                                 </span>
// // //                                 <span className="ap-sig-box__date">
// // //                                     <Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}
// // //                                 </span>
// // //                             </div>

// // //                             {hasBeenGraded && (
// // //                                 <div className="ap-sig-box">
// // //                                     <span className="ap-sig-box__label" style={{ color: 'red' }}>Assessor Verification</span>
// // //                                     <div className="ap-sig-box__img-wrap">
// // //                                         {assessorProfile?.signatureUrl
// // //                                             ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// // //                                             : <span className="ap-sig-box__no-sig" style={{ color: 'red' }}>No canvas signature on file</span>
// // //                                         }
// // //                                     </div>
// // //                                     <span className="ap-sig-box__name" style={{ color: 'red' }}>
// // //                                         {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
// // //                                     </span>
// // //                                     <span className="ap-sig-box__reg" style={{ color: 'red' }}>
// // //                                         Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
// // //                                     </span>
// // //                                     <span className="ap-sig-box__date" style={{ color: 'red' }}>
// // //                                         <Clock size={11} /> {moment(submission.grading?.gradedAt).format('DD/MM/YYYY HH:mm')}
// // //                                     </span>
// // //                                 </div>
// // //                             )}

// // //                             {hasBeenModerated && (
// // //                                 <div className="ap-sig-box">
// // //                                     <span className="ap-sig-box__label" style={{ color: 'green' }}>Internal Moderation QA</span>
// // //                                     <div className="ap-sig-box__img-wrap">
// // //                                         {moderatorProfile?.signatureUrl
// // //                                             ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
// // //                                             : <span className="ap-sig-box__no-sig" style={{ color: 'green' }}>No canvas signature on file</span>
// // //                                         }
// // //                                     </div>
// // //                                     <span className="ap-sig-box__name" style={{ color: 'green' }}>
// // //                                         {moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}
// // //                                     </span>
// // //                                     <span className="ap-sig-box__reg" style={{ color: 'green' }}>
// // //                                         Outcome: {submission.moderation?.outcome}
// // //                                     </span>
// // //                                     <span className="ap-sig-box__date" style={{ color: 'green' }}>
// // //                                         <Clock size={11} /> {moment(submission.moderation?.moderatedAt).format('DD/MM/YYYY HH:mm')}
// // //                                     </span>
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     )}
// // //                 </div>

// // //                 {/* RIGHT SIDEBAR: AUDIT TRAIL */}
// // //                 {isLocked && (
// // //                     <aside className="ap-right-sidebar no-print">
// // //                         <h3 className="ap-right-sidebar__title">
// // //                             <ShieldCheck size={16} color="#073f4e" /> Official Audit Trail
// // //                         </h3>

// // //                         <div className="ap-audit-card">
// // //                             <span className="ap-audit-card__label">Learner Declaration</span>
// // //                             <div className="ap-audit-card__sig-wrap">
// // //                                 {learnerProfile?.signatureUrl
// // //                                     ? <img src={learnerProfile.signatureUrl} alt="Learner signature" />
// // //                                     : <span className="ap-audit-card__sig-placeholder">No signature on file</span>
// // //                                 }
// // //                             </div>
// // //                             <span className="ap-audit-card__name">
// // //                                 {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || '—'}
// // //                             </span>
// // //                             <span className="ap-audit-card__sub">
// // //                                 <Clock size={11} /> {moment(submission.learnerDeclaration?.timestamp || submission.submittedAt).format('DD/MM/YYYY HH:mm')}
// // //                             </span>
// // //                         </div>

// // //                         {outcome ? (
// // //                             <div className="ap-audit-outcome" style={{ borderLeftColor: outcome.color }}>
// // //                                 <div className="ap-audit-outcome__label" style={{ color: outcome.color }}>{outcome.label}</div>
// // //                                 {outcome.score !== undefined && (
// // //                                     <div className="ap-audit-outcome__score" style={{ color: outcome.color }}>
// // //                                         Score: {outcome.score} / {assessment.totalMarks} ({outcome.percentage}%)
// // //                                     </div>
// // //                                 )}
// // //                                 <div className="ap-audit-outcome__note">{outcome.subtext}</div>
// // //                             </div>
// // //                         ) : (
// // //                             <div className="ap-audit-card" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', textAlign: 'center', padding: '1.5rem' }}>
// // //                                 <Clock size={24} color="#94a3b8" style={{ margin: '0 auto 0.5rem' }} />
// // //                                 <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold' }}>Pending Outcome</span>
// // //                                 <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Your workbook is currently being evaluated.</span>
// // //                             </div>
// // //                         )}

// // //                         {hasBeenGraded && (
// // //                             <div className="ap-audit-card">
// // //                                 <span className="ap-audit-card__label" style={{ color: 'red' }}>Assessor Verification</span>
// // //                                 <div className="ap-audit-card__sig-wrap">
// // //                                     {assessorProfile?.signatureUrl
// // //                                         ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// // //                                         : <span className="ap-audit-card__sig-placeholder" style={{ color: 'red' }}>No signature on file</span>
// // //                                     }
// // //                                 </div>
// // //                                 <span className="ap-audit-card__name" style={{ color: 'red' }}>
// // //                                     {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
// // //                                 </span>
// // //                                 <span className="ap-audit-card__reg" style={{ color: 'red' }}>
// // //                                     Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
// // //                                 </span>
// // //                                 <span className="ap-audit-card__sub" style={{ color: 'red' }}>
// // //                                     <Clock size={11} /> {moment(submission.grading?.gradedAt).format('DD/MM/YYYY HH:mm')}
// // //                                 </span>
// // //                             </div>
// // //                         )}

// // //                         {hasBeenModerated && (
// // //                             <div className="ap-audit-card">
// // //                                 <span className="ap-audit-card__label" style={{ color: 'green' }}>Internal Moderation QA</span>
// // //                                 <div className="ap-audit-card__sig-wrap">
// // //                                     {moderatorProfile?.signatureUrl
// // //                                         ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} />
// // //                                         : <span className="ap-audit-card__sig-placeholder" style={{ color: 'green' }}>No signature on file</span>
// // //                                     }
// // //                                 </div>
// // //                                 <span className="ap-audit-card__name" style={{ color: 'green' }}>
// // //                                     {moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}
// // //                                 </span>
// // //                                 <span className="ap-audit-card__reg" style={{ color: 'green' }}>
// // //                                     Outcome: {submission.moderation?.outcome}
// // //                                 </span>
// // //                                 <span className="ap-audit-card__sub" style={{ color: 'green' }}>
// // //                                     <Clock size={11} /> {moment(submission.moderation?.moderatedAt).format('DD/MM/YYYY HH:mm')}
// // //                                 </span>
// // //                             </div>
// // //                         )}
// // //                     </aside>
// // //                 )}
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // /* ── Confirm Modal ────────────────────────────────────────────────────────── */
// // // const ConfirmModal: React.FC<{
// // //     title: string; message: string; confirmText: string; cancelText: string;
// // //     onConfirm: () => void; onCancel: () => void;
// // // }> = ({ title, message, confirmText, cancelText, onConfirm, onCancel }) => {
// // //     // Scroll Lock
// // //     useEffect(() => {
// // //         const style = document.createElement('style');
// // //         style.innerHTML = `
// // //             body, html { overflow: hidden !important; }
// // //             .ap-player, .ap-player-body { overflow: hidden !important; }
// // //         `;
// // //         document.head.appendChild(style);
// // //         return () => { document.head.removeChild(style); };
// // //     }, []);

// // //     const modalContent = (
// // //         <div style={{
// // //             position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
// // //             background: 'rgba(5,46,58,0.7)',
// // //             backdropFilter: 'blur(3px)',
// // //             zIndex: 99999, // Super high z-index
// // //             display: 'flex', alignItems: 'center', justifyContent: 'center',
// // //             padding: '1rem',
// // //             margin: 0
// // //         }}>
// // //             <div className="ap-animate" style={{
// // //                 background: 'white', maxWidth: '420px', width: '100%',
// // //                 textAlign: 'center', padding: 0,
// // //                 boxShadow: '0 24px 48px -8px rgba(5,46,58,0.35)',
// // //                 border: '1px solid var(--mlab-border)',
// // //                 borderTop: '5px solid var(--mlab-blue)',
// // //                 borderRadius: '8px', overflow: 'hidden',
// // //                 position: 'relative'
// // //             }}>
// // //                 <div style={{ padding: '2rem 2rem 1.25rem', borderBottom: '1px solid var(--mlab-border)' }}>
// // //                     <div style={{ width: 56, height: 56, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
// // //                         <AlertTriangle size={28} color="#d97706" />
// // //                     </div>
// // //                     <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>
// // //                         {title}
// // //                     </h2>
// // //                     <p style={{ color: 'var(--mlab-grey)', lineHeight: '1.65', margin: 0, fontSize: '0.9rem' }}>{message}</p>
// // //                 </div>
// // //                 <div style={{ display: 'flex' }}>
// // //                     <button onClick={onCancel} style={{
// // //                         flex: 1, padding: '1rem', border: 'none', borderRight: '1px solid var(--mlab-border)',
// // //                         background: 'var(--mlab-bg)', color: 'var(--mlab-grey)',
// // //                         fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem',
// // //                         letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
// // //                     }}>
// // //                         {cancelText}
// // //                     </button>
// // //                     <button onClick={onConfirm} style={{
// // //                         flex: 1, padding: '1rem', border: 'none',
// // //                         background: 'var(--mlab-blue)', color: 'white',
// // //                         fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem',
// // //                         letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
// // //                     }}>
// // //                         {confirmText}
// // //                     </button>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );

// // //     return createPortal(modalContent, document.body);
// // // };

// // // export default AssessmentPlayer;

