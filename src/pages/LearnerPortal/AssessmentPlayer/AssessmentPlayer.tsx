// src/pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer.tsx


import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
    AlertCircle, Play, Clock, GraduationCap,
    BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
    ShieldCheck, Hash, Activity, Award, BarChart, MessageSquare, Printer, Check, X
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';

import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

import './AssessmentPlayer.css';
import moment from 'moment';

// ─── HELPER COMPONENTS ────────────────────────────────────────────────────
// Using pure CSS tinting for signatures to match the Staff portal
export const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
    const filterMap: any = {
        black: 'brightness(0)',
        blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
        red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
        green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
    };
    return <img src={imageUrl} alt="Signature" style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain', filter: filterMap[color] || 'none' }} />;
};

// ─── QUILL CONFIGURATION ──────────────────────────────────────────────────
const quillModules = {
    toolbar: [
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['clean']
    ],
};

const quillFormats = [
    'bold', 'italic', 'underline',
    'list', 'bullet'
];

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
    const [learnerProfile, setLearnerProfile] = useState<any>(null);
    const [assessorProfile, setAssessorProfile] = useState<any>(null);
    const [moderatorProfile, setModeratorProfile] = useState<any>(null);

    const [declarationChecked, setDeclarationChecked] = useState(false);
    const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
    const [isAdminIntercept, setIsAdminIntercept] = useState(false);

    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [timeOffset, setTimeOffset] = useState<number>(0);

    const isLocked = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'returned'].includes(submission?.status);
    const isNotStarted = submission?.status === 'not_started';
    const hasBeenGraded = ['graded', 'moderated'].includes(submission?.status);
    const hasBeenReviewed = ['facilitator_reviewed', 'graded', 'moderated', 'returned'].includes(submission?.status);

    // ─── 🚀 UPDATED DUAL-LAYER HELPERS ──────────────────────────────────────────
    const getBlockGrading = (blockId: string) => {
        if (!hasBeenReviewed) return { score: undefined, facFeedback: '', assFeedback: '', facIsCorrect: null, assIsCorrect: null, isCorrect: null };

        const g = submission.grading || {};

        // Get both layers
        const aLayer = g.assessorBreakdown?.[blockId] || {};
        const fLayer = g.facilitatorBreakdown?.[blockId] || {};
        const legacyLayer = g.breakdown?.[blockId] || {};

        // The final displayed score and logic is dictated by the highest authority that has marked it
        const activeLayer = (hasBeenGraded ? aLayer : fLayer) || legacyLayer || { score: 0, isCorrect: null };

        return {
            score: activeLayer.score,
            isCorrect: activeLayer.isCorrect, // The active, final boolean for calculating logic
            facIsCorrect: fLayer.isCorrect !== undefined ? fLayer.isCorrect : legacyLayer.isCorrect, // The Facilitator's explicit mark
            assIsCorrect: aLayer.isCorrect, // The Assessor's explicit mark
            facFeedback: fLayer.feedback || legacyLayer.feedback || '',
            assFeedback: aLayer.feedback || ''
        };
    };

    const sectionTotals: Record<string, { total: number, awarded: number }> = {};
    let currentSectionId = '';
    if (assessment?.blocks) {
        assessment.blocks.forEach((block: any) => {
            if (block.type === 'section') {
                currentSectionId = block.id;
                sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
            } else if ((block.type === 'mcq' || block.type === 'text') && currentSectionId) {
                const { score } = getBlockGrading(block.id);
                sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
                if (score !== undefined && score !== null) sectionTotals[currentSectionId].awarded += Number(score);
            }
        });
    }

    const getCompetencyStatus = () => {
        if (!hasBeenGraded) return null;
        const compStr = (submission.competency || submission.overallCompetency || submission.outcome || '').toString().toLowerCase();
        let isCompetent = compStr === 'c' || compStr === 'competent';
        const actualScore = submission.marks !== undefined ? submission.marks : submission.totalScore;
        if (!isCompetent && actualScore !== undefined && assessment?.totalMarks) {
            isCompetent = actualScore >= (assessment.totalMarks * 0.6);
        }
        const percentage = actualScore !== undefined && assessment?.totalMarks
            ? Math.round((actualScore / assessment.totalMarks) * 100) : null;
        return {
            label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
            color: isCompetent ? 'red' : 'red', // Assessor grades are always declared in red ink
            subtext: submission.status === 'moderated'
                ? 'Final Results Verified.'
                : (isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.'),
            score: actualScore, percentage, isCompetent
        };
    };

    const outcome = getCompetencyStatus();

    const getSafeDate = (dateString: string) => {
        if (!dateString) return 'recently';

        const date = new Date(dateString);

        if (isNaN(date.getTime())) return 'recently';

        return date.toLocaleString('en-ZA', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // ─── SERVER TIME ─────────────────────────────────────────────────────────
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

    // ─── DATA LOAD ────────────────────────────────────────────────────────────
    useEffect(() => {
        const loadAssessment = async () => {
            if (!user?.uid || !assessmentId) return;
            if (user.role && user.role !== 'learner') { setIsAdminIntercept(true); setLoading(false); return; }

            try {
                const assessmentSnap = await getDoc(doc(db, 'assessments', assessmentId));
                if (!assessmentSnap.exists()) { toast.error('Assessment template not found.'); setLoading(false); return; }
                setAssessment(assessmentSnap.data());

                const learnersRef = collection(db, 'learners');
                let actualLearnerDocId = '';
                const authSnap = await getDocs(query(learnersRef, where('authUid', '==', user.uid)));
                if (!authSnap.empty) {
                    actualLearnerDocId = authSnap.docs[0].id;
                } else {
                    const emailSnap = await getDocs(query(learnersRef, where('email', '==', user.email)));
                    if (emailSnap.empty) { toast.error('Learner profile not found.'); setLoading(false); return; }
                    actualLearnerDocId = emailSnap.docs[0].id;
                }

                const userDocSnap = await getDoc(doc(db, 'users', user.uid));
                if (userDocSnap.exists()) setLearnerProfile(userDocSnap.data());

                const submissionId = `${actualLearnerDocId}_${assessmentId}`;
                const submissionSnap = await getDoc(doc(db, 'learner_submissions', submissionId));

                if (submissionSnap.exists()) {
                    const subData = submissionSnap.data();
                    setSubmission({ ...subData, id: submissionId });
                    setAnswers(subData.answers || {});

                    // Fetch signatures
                    if (subData.grading?.gradedBy) {
                        const assSnap = await getDoc(doc(db, 'users', subData.grading.gradedBy));
                        if (assSnap.exists()) setAssessorProfile(assSnap.data());
                    }
                    if (subData.moderation?.moderatedBy) {
                        const modSnap = await getDoc(doc(db, 'users', subData.moderation.moderatedBy));
                        if (modSnap.exists()) setModeratorProfile(modSnap.data());
                    }

                    if (subData.status === 'in_progress' && assessmentSnap.data().moduleInfo?.timeLimit > 0) {
                        const startTime = new Date(subData.startedAt).getTime();
                        const endTime = startTime + (assessmentSnap.data().moduleInfo.timeLimit * 60 * 1000);
                        const remainingSeconds = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
                        setTimeLeft(remainingSeconds);
                        if (remainingSeconds === 0) forceAutoSubmit(submissionId, subData.answers || {});
                    }
                } else {
                    toast.error('You are not assigned to this assessment.');
                }
            } catch (error) {
                console.error('Error loading assessment:', error);
                toast.error('Failed to load assessment data.');
            } finally {
                setLoading(false);
            }
        };
        if (timeOffset !== null) loadAssessment();
    }, [assessmentId, user?.uid, user?.role, user?.email, timeOffset]);

    // ─── COUNTDOWN ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (timeLeft === null || isLocked || isNotStarted) return;
        if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
        const timerId = setInterval(() => {
            const startTime = new Date(submission.startedAt).getTime();
            const endTime = startTime + (assessment.moduleInfo.timeLimit * 60 * 1000);
            setTimeLeft(Math.max(0, Math.floor((endTime - getSecureNow()) / 1000)));
        }, 1000);
        return () => clearInterval(timerId);
    }, [timeLeft, isLocked, isNotStarted, submission?.startedAt]);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
        return `${m}m ${s.toString().padStart(2, '0')}s`;
    };

    // ─── HANDLERS ────────────────────────────────────────────────────────────
    const handleStartAssessment = async () => {
        if (!startDeclarationChecked) return;
        setSaving(true);
        try {
            const secureStartTime = new Date(getSecureNow()).toISOString();
            await updateDoc(doc(db, 'learner_submissions', submission.id), { status: 'in_progress', startedAt: secureStartTime });
            setSubmission((prev: any) => ({ ...prev, status: 'in_progress', startedAt: secureStartTime }));
            if (assessment.moduleInfo?.timeLimit > 0) setTimeLeft(assessment.moduleInfo.timeLimit * 60);
        } catch { toast.error('Failed to start assessment.'); } finally { setSaving(false); }
    };

    const handleAnswerChange = (blockId: string, value: string | number) => {
        if (isLocked) return;
        setAnswers(prev => {
            const newAnswers = { ...prev, [blockId]: value };
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(async () => {
                if (!submission?.id) return;
                setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString()
                    });
                } catch { toast.error('Auto-save failed.'); } finally { setSaving(false); }
            }, 1200);
            return newAnswers;
        });
    };

    const forceAutoSubmit = async (subId: string, currentAnswers: any) => {
        setSaving(true);
        const submitTime = new Date(getSecureNow()).toISOString();
        try {
            await updateDoc(doc(db, 'learner_submissions', subId), {
                answers: currentAnswers,
                status: 'submitted',
                submittedAt: submitTime,
                autoSubmitted: true,
                learnerDeclaration: {
                    agreed: true,
                    timestamp: submitTime,
                    learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
                    learnerIdNumber: learnerProfile?.idNumber || 'Unknown'
                }
            });
            toast.success("Time's up! Assessment auto-submitted.");
            setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
            setTimeout(() => navigate(-1), 3000);
        } catch (error) { console.error("Auto-submit failed", error); } finally { setSaving(false); }
    };

    const handleNavigationLeave = () => {
        if (!isLocked && assessment.moduleInfo?.timeLimit > 0) setShowLeaveWarning(true);
        else navigate(-1);
    };

    const triggerSubmitConfirm = () => {
        if (!declarationChecked) return toast.warning('You must agree to the final declaration.');
        setShowSubmitConfirm(true);
    };

    const executeSubmit = async () => {
        setShowSubmitConfirm(false);
        setSaving(true);
        const submitTime = new Date(getSecureNow()).toISOString();
        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                answers,
                status: 'submitted',
                submittedAt: submitTime,
                learnerDeclaration: {
                    agreed: true,
                    timestamp: submitTime,
                    learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
                    learnerIdNumber: learnerProfile?.idNumber || 'Unknown'
                }
            });
            toast.success('Assessment submitted!');
            setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
            setTimeout(() => window.scrollTo(0, 0), 1000);
        } catch { toast.error('Failed to submit.'); } finally { setSaving(false); }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // LOADING & ERROR SCREENS
    // ══════════════════════════════════════════════════════════════════════════
    if (loading) return (
        <div className="ap-fullscreen">
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div className="ap-spinner" />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
                    Loading Assessment…
                </span>
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
                <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', opacity: 0.5 }}>
                    <AlertCircle size={32} color="var(--mlab-grey)" />
                </div>
                <h2 className="ap-state-card__title">Assessment Unavailable</h2>
                <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Please contact your assessor if you believe this is an error.</p>
                <div className="ap-state-card__actions">
                    <button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button>
                </div>
            </div>
        </div>
    );

    // ══════════════════════════════════════════════════════════════════════════
    // GATE SCREEN (BEFORE STARTING)
    // ══════════════════════════════════════════════════════════════════════════
    if (isNotStarted) return (
        <div className="ap-gate ap-animate">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
            <div className="ap-gate-topbar">
                <button className="ap-gate-topbar__back" onClick={() => navigate(-1)}>
                    <ArrowLeft size={14} /> Back to Portfolio
                </button>
                <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
            </div>

            <div className="ap-gate-body">
                <div className="ap-gate-left">
                    <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
                    <h1 className="ap-gate-left__title">{assessment.title}</h1>
                    <p className="ap-gate-left__sub">Read all instructions carefully before starting.</p>

                    <div className="ap-info-grid">
                        <div className="ap-info-card">
                            <div className="ap-info-card__label"><BookOpen size={12} /> Module</div>
                            <div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div>
                            <div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div>
                        </div>
                        <div className="ap-info-card">
                            <div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div>
                            <div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div>
                            <div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div>
                        </div>
                        <div className="ap-info-card">
                            <div className="ap-info-card__label"><Clock size={12} /> Time Limit</div>
                            <div className="ap-info-card__value">{assessment.moduleInfo?.timeLimit ? `${assessment.moduleInfo.timeLimit} Min` : 'No Limit'}</div>
                            <div className="ap-info-card__sub">{assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}</div>
                        </div>
                        <div className="ap-info-card">
                            <div className="ap-info-card__label"><Scale size={12} /> Total Marks</div>
                            <div className="ap-info-card__value">{assessment.totalMarks}</div>
                            <div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div>
                        </div>
                    </div>

                    <div className="ap-note-block">
                        <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
                        <p className="ap-note-block__text">{assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
                        {assessment.purpose && <>
                            <div className="ap-note-block__heading"><Info size={12} /> Purpose</div>
                            <p className="ap-note-block__text">{assessment.purpose}</p>
                        </>}
                    </div>
                </div>

                <div className="ap-gate-right">
                    <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
                    <ul className="ap-rules-list">
                        <li className="ap-rule-item">
                            <div className="ap-rule-icon"><Scale size={18} /></div>
                            <div>
                                <span className="ap-rule-title">Academic Integrity</span>
                                <p className="ap-rule-desc">All work must be entirely your own. Plagiarism or use of unauthorized AI tools violates QCTO guidelines.</p>
                            </div>
                        </li>
                        <li className="ap-rule-item">
                            <div className="ap-rule-icon"><UserCheck size={18} /></div>
                            <div>
                                <span className="ap-rule-title">Independent Work</span>
                                <p className="ap-rule-desc">Unless explicitly stated as a group project, no collaboration is permitted.</p>
                            </div>
                        </li>
                        <li className="ap-rule-item">
                            <div className="ap-rule-icon"><Wifi size={18} /></div>
                            <div>
                                <span className="ap-rule-title">Auto-Save</span>
                                <p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p>
                            </div>
                        </li>
                        {assessment.moduleInfo?.timeLimit > 0 && (
                            <li className="ap-rule-item">
                                <div className="ap-rule-icon"><Clock size={18} /></div>
                                <div>
                                    <span className="ap-rule-title">Timed Assessment</span>
                                    <p className="ap-rule-desc">The countdown continues even if you close the browser tab. Plan your time carefully.</p>
                                </div>
                            </li>
                        )}
                    </ul>

                    <div className="ap-declaration">
                        <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
                            <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
                            <span className="ap-declaration-check__text">
                                <strong>Declaration of Authenticity</strong>
                                I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.
                            </span>
                        </label>
                        <button className={`ap-start-btn${startDeclarationChecked ? ' ap-start-btn--ready' : ''}`} onClick={handleStartAssessment} disabled={saving || !startDeclarationChecked}>
                            {saving ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> I Agree, Begin Assessment</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    // ══════════════════════════════════════════════════════════════════════════
    // MAIN PLAYER SCREEN
    // ══════════════════════════════════════════════════════════════════════════
    const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
        if (block.type === 'section') acc.push({ type: 'section', label: block.title, id: block.id });
        else if (block.type === 'text' || block.type === 'mcq') acc.push({ type: 'q', label: block.question, id: block.id });
        return acc;
    }, []) || [];

    // The display status string
    let displayStatus = submission.status.replace('_', ' ');
    if (submission.status === 'returned') displayStatus = 'revision required';

    return (
        <div className="ap-player ap-animate">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {showLeaveWarning && (
                <ConfirmModal
                    title="Leave Timed Assessment?"
                    message="Your timer will NOT pause. If you leave, the clock continues counting down in the background."
                    confirmText="Yes, Leave" cancelText="Stay Here"
                    onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)}
                />
            )}
            {showSubmitConfirm && (
                <ConfirmModal
                    title="Submit Assessment?"
                    message="You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."
                    confirmText="Submit for Grading" cancelText="Go Back"
                    onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)}
                />
            )}

            {/* ── Top Bar ── */}
            <div className="ap-player-topbar no-print">
                <div className="ap-player-topbar__left">
                    <button className="ap-player-topbar__back" onClick={handleNavigationLeave}>
                        <ArrowLeft size={13} /> Portfolio
                    </button>
                    <div className="ap-player-topbar__separator" />
                    <h1 className="ap-player-topbar__title">{assessment.title}</h1>
                </div>

                <div className="ap-player-topbar__right">
                    {isLocked && (
                        <button className="ap-topbar-print-btn" onClick={() => window.print()}>
                            <Printer size={13} /> Print Audit
                        </button>
                    )}
                    {!isLocked && timeLeft !== null && (
                        <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}>
                            <Timer size={14} /> {formatTime(timeLeft)}
                        </div>
                    )}
                    <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
                        {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}
                    </span>
                    <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>
                        {displayStatus}
                    </span>
                </div>
            </div>

            {/* ── Body: 2-col (active) or 3-col (locked) ── */}
            <div className={`ap-player-body${isLocked ? ' is-locked' : ''}`}>

                {/* LEFT SIDEBAR */}
                <nav className="ap-sidebar no-print">
                    <div className="ap-sidebar__meta-block">
                        <div className="ap-sidebar__meta-title">{assessment.title}</div>
                        <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
                        <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div>
                        <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>
                    </div>

                    {(submission.status !== 'not_started' && submission.status !== 'in_progress') && (
                        <>
                            <div className="ap-sidebar__label">Status Tracking</div>
                            <div className="ap-sidebar__status-box">

                                {/* 🚀 Dynamic Outcome or Pending Card */}
                                {hasBeenGraded && outcome ? (
                                    <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
                                        <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
                                        {outcome.score !== undefined && (
                                            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>
                                                {outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%
                                            </div>
                                        )}
                                        <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
                                    </div>
                                ) : (
                                    <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}>
                                        <div className="ap-sidebar__outcome-val" style={{ color: '#cbd5e1' }}>Awaiting Grade</div>
                                        <div className="ap-sidebar__outcome-note">The Assessor has not yet finalized your official results.</div>
                                    </div>
                                )}

                                {/* 🚀 UPDATED: Display Facilitator and/or Assessor Overall Remarks */}
                                {hasBeenReviewed && submission.grading?.facilitatorOverallFeedback && (
                                    <div style={{ background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid rgba(56, 189, 248, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
                                            <Info size={11} /> Facilitator Summary
                                        </strong>
                                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', lineHeight: '1.55' }}>
                                            {submission.grading.facilitatorOverallFeedback}
                                        </p>
                                    </div>
                                )}

                                {hasBeenGraded && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
                                    <div style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid rgba(245,158,11,0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'red', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
                                            <MessageSquare size={11} /> Assessor Final Remarks
                                        </strong>
                                        <p style={{ margin: 0, color: 'red', fontSize: '0.78rem', lineHeight: '1.55' }}>
                                            {submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}
                                        </p>
                                    </div>
                                )}

                                {/* Dynamic Timeline */}
                                <div className="ap-sidebar__timeline-item">
                                    <div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}>
                                        <UserCheck size={13} />
                                    </div>
                                    <div className="ap-sidebar__timeline-content">
                                        <span className="ap-sidebar__timeline-title">Facilitator Review</span>
                                        <span className="ap-sidebar__timeline-desc">
                                            {submission.status === 'submitted' ? 'Waiting for Facilitator' : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}
                                        </span>
                                    </div>
                                </div>

                                <div className="ap-sidebar__timeline-item">
                                    <div className={`ap-sidebar__timeline-icon${hasBeenGraded ? ' ap-sidebar__timeline-icon--done' : ''}`}>
                                        <Award size={13} />
                                    </div>
                                    <div className="ap-sidebar__timeline-content">
                                        <span className="ap-sidebar__timeline-title">Assessor Grading</span>
                                        <span className="ap-sidebar__timeline-desc">
                                            {hasBeenGraded ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}
                                        </span>
                                    </div>
                                </div>

                                <div className="ap-sidebar__timeline-item">
                                    <div className={`ap-sidebar__timeline-icon${submission.status === 'moderated' ? ' ap-sidebar__timeline-icon--done' : ''}`}>
                                        <ShieldCheck size={13} />
                                    </div>
                                    <div className="ap-sidebar__timeline-content">
                                        <span className="ap-sidebar__timeline-title">Internal Moderation</span>
                                        <span className="ap-sidebar__timeline-desc">
                                            {submission.status === 'moderated' ? 'QA Complete' : 'Awaiting QA Verification'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    <div className="ap-sidebar__label">Workbook Contents</div>
                    <div className="ap-sidebar__nav">
                        {navItems.map((item: any) =>
                            item.type === 'section' ? (
                                <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
                            ) : (
                                <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item">
                                    {item.label.length > 36 ? item.label.slice(0, 36) + '…' : item.label}
                                </a>
                            )
                        )}
                    </div>

                    <div className="ap-sidebar__footer">
                        <div className="ap-sidebar__footer-item">
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={11} /> Reference</span>
                            <strong>{submission.id?.split('_')[0] || 'N/A'}</strong>
                        </div>
                        <div className="ap-sidebar__footer-item">
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Activity size={11} /> Last Sync</span>
                            <strong>
                                {submission.lastSavedAt
                                    ? new Date(submission.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    : 'Offline'}
                            </strong>
                        </div>
                    </div>
                </nav>

                {/* CENTRE CONTENT */}
                <div className="ap-player-content print-pane">

                    {isLocked && (
                        <div className="ap-print-header">
                            <h2>Official Assessment Record</h2>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <div>
                                    <p style={{ margin: '0 0 4px' }}><strong>Learner:</strong> {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName}</p>
                                    <p style={{ margin: 0 }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber}</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ margin: '0 0 4px' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
                                    <p style={{ margin: '0 0 4px' }}><strong>Submitted:</strong> {getSafeDate(submission.submittedAt)}</p>
                                    {hasBeenGraded && <p style={{ margin: 0 }}><strong>Outcome:</strong> {outcome?.label} ({outcome?.percentage}%)</p>}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="ap-blocks">
                        {assessment.blocks?.map((block: any, idx: number) => {

                            if (block.type === 'section') {
                                const totals = sectionTotals[block.id];
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
                                        <span>{block.title}</span>
                                        {hasBeenGraded && totals && totals.total > 0 && (
                                            <span className="no-print" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px' }}>
                                                <BarChart size={13} /> {totals.awarded}/{totals.total}
                                            </span>
                                        )}
                                    </div>
                                );
                            }

                            if (block.type === 'info') return (
                                <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
                                    <div className="ap-block-info__label"><Info size={13} /> Reading Material</div>
                                    <p className="ap-block-info__text">{block.content}</p>
                                </div>
                            );

                            const { score: blockScore, facFeedback, assFeedback, facIsCorrect, assIsCorrect } = getBlockGrading(block.id);

                            let activeInkColor = 'transparent';
                            if (hasBeenGraded) activeInkColor = 'red';
                            else if (hasBeenReviewed) activeInkColor = 'blue';

                            const markLabel = hasBeenReviewed && blockScore !== undefined && blockScore !== null
                                ? `${blockScore} / ${block.marks}`
                                : `${block.marks} Marks`;

                            // 🚀 HORIZONTAL DUAL LAYER VISUAL INDICATORS
                            const TopRightIndicator = () => {
                                return (
                                    <div style={{ display: 'flex', gap: '8px', marginLeft: '12px', alignItems: 'center' }}>
                                        {/* Facilitator Blue Pen Indicator */}
                                        {hasBeenReviewed && facIsCorrect !== null && facIsCorrect !== undefined && (
                                            <div title="Facilitator Pre-Mark" style={{ display: 'flex', alignItems: 'center', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
                                                {facIsCorrect
                                                    ? <Check size={18} color="#0284c7" strokeWidth={3} />
                                                    : <X size={18} color="#0284c7" strokeWidth={3} />}
                                            </div>
                                        )}
                                        {/* Assessor Red Pen Indicator */}
                                        {hasBeenGraded && assIsCorrect !== null && assIsCorrect !== undefined && (
                                            <div title="Official Assessor Grade" style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px' }}>
                                                {assIsCorrect
                                                    ? <Check size={18} color="#ef4444" strokeWidth={3} />
                                                    : <X size={18} color="#ef4444" strokeWidth={3} />}
                                            </div>
                                        )}
                                    </div>
                                );
                            };

                            if (block.type === 'mcq') return (
                                <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
                                    <div className="ap-block-question__header">
                                        <div className="ap-block-question__text-wrap" style={{ display: 'flex', alignItems: 'flex-start' }}>
                                            <span className="ap-block-question__text">
                                                <strong style={{ color: '#94a3b8', marginRight: '8px' }}>Q{idx + 1}.</strong>
                                                {block.question}
                                            </span>
                                            <TopRightIndicator />
                                        </div>
                                        <span className="ap-block-question__marks" style={{ color: activeInkColor !== 'transparent' ? activeInkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
                                    </div>
                                    <div className="ap-block-question__body">
                                        <div className="ap-mcq-options">
                                            {block.options?.map((opt: string, i: number) => {
                                                const selected = answers[block.id] === i;
                                                return (
                                                    <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isLocked ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
                                                        <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isLocked} onChange={() => handleAnswerChange(block.id, i)} />
                                                        <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
                                                        <span className="ap-mcq-label__text">{opt}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>

                                        {/* 🚀 DUAL LAYER FEEDBACK DISPLAY */}
                                        <div className="ap-feedback-stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                                            {hasBeenReviewed && facFeedback && (
                                                <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, background: '#eff6ff', padding: '0.75rem', borderRadius: '4px' }}>
                                                    <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                        <span style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Info size={12} /> Facilitator Coaching
                                                        </span>
                                                    </div>
                                                    <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#0369a1', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>
                                                        {facFeedback}
                                                    </p>
                                                </div>
                                            )}

                                            {hasBeenGraded && assFeedback && (
                                                <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, background: '#fef2f2', padding: '0.75rem', borderRadius: '4px' }}>
                                                    <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                        <span style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Award size={12} /> Assessor Grade
                                                        </span>
                                                    </div>
                                                    <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#991b1b', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>
                                                        {assFeedback}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                </div>
                            );

                            if (block.type === 'text') return (
                                <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
                                    <div className="ap-block-question__header">
                                        <div className="ap-block-question__text-wrap" style={{ display: 'flex', alignItems: 'flex-start' }}>
                                            <span className="ap-block-question__text">
                                                <strong style={{ color: '#94a3b8', marginRight: '8px' }}>Q{idx + 1}.</strong>
                                                {block.question}
                                            </span>
                                            <TopRightIndicator />
                                        </div>
                                        <span className="ap-block-question__marks" style={{ color: activeInkColor !== 'transparent' ? activeInkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
                                    </div>
                                    <div className="ap-block-question__body">
                                        <div className={`ap-quill-wrapper ${isLocked ? 'locked' : ''}`}>
                                            <ReactQuill
                                                theme="snow"
                                                value={answers[block.id] || ''}
                                                onChange={(content) => handleAnswerChange(block.id, content)}
                                                readOnly={isLocked}
                                                modules={quillModules}
                                                formats={quillFormats}
                                                placeholder={isLocked ? 'No answer provided.' : 'Type your detailed response here...'}
                                            />
                                        </div>

                                        {/* 🚀 DUAL LAYER FEEDBACK DISPLAY */}
                                        <div className="ap-feedback-stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                                            {hasBeenReviewed && facFeedback && (
                                                <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, background: '#eff6ff', padding: '0.75rem', borderRadius: '4px' }}>
                                                    <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                        <span style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Info size={12} /> Facilitator Coaching
                                                        </span>
                                                    </div>
                                                    <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#0369a1', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>
                                                        {facFeedback}
                                                    </p>
                                                </div>
                                            )}

                                            {hasBeenGraded && assFeedback && (
                                                <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, background: '#fef2f2', padding: '0.75rem', borderRadius: '4px' }}>
                                                    <div className="ap-feedback-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                        <span style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Award size={12} /> Assessor Grade
                                                        </span>
                                                    </div>
                                                    <p className="ap-feedback-panel__text" style={{ margin: 0, color: '#991b1b', fontStyle: 'italic', fontWeight: 500, fontSize: '0.85rem' }}>
                                                        {assFeedback}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                </div>
                            );

                            return null;
                        })}
                    </div>

                    {!isLocked ? (
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
                                </span>
                                <button className="ap-btn ap-btn--green" onClick={triggerSubmitConfirm} disabled={saving || !declarationChecked}>
                                    <Save size={14} /> Submit for Grading
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="ap-footer ap-footer--locked no-print">
                            <div className="ap-footer--locked__icon-wrap">
                                <CheckCircle size={36} color="var(--mlab-green)" />
                            </div>
                            <h3 className="ap-footer--locked__title">
                                {submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}
                            </h3>
                            <p className="ap-footer--locked__desc">
                                This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>.{' '}
                                {hasBeenGraded ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}
                            </p>
                            <button className="ap-btn ap-btn--primary" onClick={() => navigate(-1)}>
                                <ArrowLeft size={14} /> Return to Portfolio
                            </button>
                        </div>
                    )}

                    {isLocked && (
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

                            {hasBeenGraded && (
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
                                        <Clock size={11} /> {moment(submission.grading?.gradedAt).format('DD/MM/YYYY HH:mm')}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT SIDEBAR: AUDIT TRAIL */}
                {isLocked && (
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

                        {hasBeenGraded && (
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
                                    <Clock size={11} /> {moment(submission.grading?.gradedAt).format('DD/MM/YYYY HH:mm')}
                                </span>
                            </div>
                        )}

                        {submission.status === 'moderated' && (
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
                                    <Clock size={11} /> {moment(submission.moderation?.moderatedAt).format('DD/MM/YYYY HH:mm')}
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
    // Scroll Lock
    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(5,46,58,0.7)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999, // Ensure it sits on top
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem'
        }}>
            <div className="ap-animate" style={{
                background: 'white', maxWidth: '420px', width: '100%',
                textAlign: 'center', padding: 0,
                boxShadow: '0 24px 48px -8px rgba(5,46,58,0.35)',
                border: '1px solid var(--mlab-border)',
                borderTop: '5px solid var(--mlab-blue)',
                borderRadius: '8px', overflow: 'hidden'
            }}>
                <div style={{ padding: '2rem 2rem 1.25rem', borderBottom: '1px solid var(--mlab-border)' }}>
                    <div style={{ width: 56, height: 56, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                        <AlertTriangle size={28} color="#d97706" />
                    </div>
                    <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>
                        {title}
                    </h2>
                    <p style={{ color: 'var(--mlab-grey)', lineHeight: '1.65', margin: 0, fontSize: '0.9rem' }}>{message}</p>
                </div>
                <div style={{ display: 'flex' }}>
                    <button onClick={onCancel} style={{
                        flex: 1, padding: '1rem', border: 'none', borderRight: '1px solid var(--mlab-border)',
                        background: 'var(--mlab-bg)', color: 'var(--mlab-grey)',
                        fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem',
                        letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                    }}>
                        {cancelText}
                    </button>
                    <button onClick={onConfirm} style={{
                        flex: 1, padding: '1rem', border: 'none',
                        background: 'var(--mlab-blue)', color: 'white',
                        fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem',
                        letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                    }}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
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
//     ShieldCheck, Hash, Activity, Award, BarChart, MessageSquare, Printer, Check, X
// } from 'lucide-react';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';

// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';

// import './AssessmentPlayer.css';

// // ─── HELPER COMPONENTS ────────────────────────────────────────────────────
// // Using pure CSS tinting for signatures to match the Staff portal
// export const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
//     const filterMap: any = {
//         black: 'brightness(0)',
//         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
//         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
//         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
//     };
//     return <img src={imageUrl} alt="Signature" style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain', filter: filterMap[color] || 'none' }} />;
// };

// // ─── QUILL CONFIGURATION ──────────────────────────────────────────────────
// const quillModules = {
//     toolbar: [
//         ['bold', 'italic', 'underline'],
//         [{ 'list': 'ordered' }, { 'list': 'bullet' }],
//         ['clean']
//     ],
// };

// const quillFormats = [
//     'bold', 'italic', 'underline',
//     'list', 'bullet'
// ];

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

//     const [declarationChecked, setDeclarationChecked] = useState(false);
//     const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
//     const [isAdminIntercept, setIsAdminIntercept] = useState(false);

//     const [showLeaveWarning, setShowLeaveWarning] = useState(false);
//     const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

//     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
//     const [timeLeft, setTimeLeft] = useState<number | null>(null);
//     const [timeOffset, setTimeOffset] = useState<number>(0);

//     const isLocked = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'returned'].includes(submission?.status);
//     const isNotStarted = submission?.status === 'not_started';
//     const hasBeenGraded = ['graded', 'moderated'].includes(submission?.status);
//     const hasBeenReviewed = ['facilitator_reviewed', 'graded', 'moderated', 'returned'].includes(submission?.status);

//     // ─── 🚀 UPDATED DUAL-LAYER HELPERS ──────────────────────────────────────────
//     // This safely pulls the data from the new structure built in the Staff Portal.
//     const getBlockGrading = (blockId: string) => {
//         if (!hasBeenReviewed) return { score: undefined, facFeedback: '', assFeedback: '', isCorrect: null };

//         const g = submission.grading || {};

//         // 1. Try to get Assessor Layer (The official grade)
//         const aLayer = g.assessorBreakdown?.[blockId];
//         // 2. Try to get Facilitator Layer (The coaching grade)
//         const fLayer = g.facilitatorBreakdown?.[blockId];
//         // 3. Fallback for legacy scripts graded before the update
//         const legacyLayer = g.breakdown?.[blockId];

//         // The final displayed score and visual tick/cross is dictated by the Assessor, 
//         // fallback to Facilitator, then legacy.
//         const activeLayer = aLayer || fLayer || legacyLayer || { score: 0, isCorrect: null };

//         return {
//             score: activeLayer.score,
//             isCorrect: activeLayer.isCorrect,
//             assFeedback: aLayer?.feedback || legacyLayer?.feedback || '',
//             facFeedback: fLayer?.feedback || ''
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
//         if (!hasBeenGraded) return null;
//         const compStr = (submission.competency || submission.overallCompetency || submission.outcome || '').toString().toLowerCase();
//         let isCompetent = compStr === 'c' || compStr === 'competent';
//         const actualScore = submission.marks !== undefined ? submission.marks : submission.totalScore;
//         if (!isCompetent && actualScore !== undefined && assessment?.totalMarks) {
//             isCompetent = actualScore >= (assessment.totalMarks * 0.6);
//         }
//         const percentage = actualScore !== undefined && assessment?.totalMarks
//             ? Math.round((actualScore / assessment.totalMarks) * 100) : null;
//         return {
//             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
//             color: isCompetent ? 'red' : 'red', // Assessor grades are always declared in red ink
//             subtext: submission.status === 'moderated'
//                 ? 'Final Results Verified.'
//                 : (isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.'),
//             score: actualScore, percentage, isCompetent
//         };
//     };

//     const outcome = getCompetencyStatus();

//     const getSafeDate = (dateString: string) => {
//         if (!dateString) return 'recently';

//         const date = new Date(dateString);

//         if (isNaN(date.getTime())) return 'recently';

//         return date.toLocaleString('en-ZA', {
//             day: 'numeric',
//             month: 'short',
//             year: 'numeric',
//             hour: '2-digit',
//             minute: '2-digit',
//         });
//     };

//     // ─── SERVER TIME ─────────────────────────────────────────────────────────
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

//     // ─── DATA LOAD ────────────────────────────────────────────────────────────
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
//                 const authSnap = await getDocs(query(learnersRef, where('authUid', '==', user.uid)));
//                 if (!authSnap.empty) {
//                     actualLearnerDocId = authSnap.docs[0].id;
//                 } else {
//                     const emailSnap = await getDocs(query(learnersRef, where('email', '==', user.email)));
//                     if (emailSnap.empty) { toast.error('Learner profile not found.'); setLoading(false); return; }
//                     actualLearnerDocId = emailSnap.docs[0].id;
//                 }

//                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
//                 if (userDocSnap.exists()) setLearnerProfile(userDocSnap.data());

//                 const submissionId = `${actualLearnerDocId}_${assessmentId}`;
//                 const submissionSnap = await getDoc(doc(db, 'learner_submissions', submissionId));

//                 if (submissionSnap.exists()) {
//                     const subData = submissionSnap.data();
//                     setSubmission({ ...subData, id: submissionId });
//                     setAnswers(subData.answers || {});

//                     // Fetch signatures
//                     if (subData.grading?.gradedBy) {
//                         const assSnap = await getDoc(doc(db, 'users', subData.grading.gradedBy));
//                         if (assSnap.exists()) setAssessorProfile(assSnap.data());
//                     }
//                     if (subData.moderation?.moderatedBy) {
//                         const modSnap = await getDoc(doc(db, 'users', subData.moderation.moderatedBy));
//                         if (modSnap.exists()) setModeratorProfile(modSnap.data());
//                     }

//                     if (subData.status === 'in_progress' && assessmentSnap.data().moduleInfo?.timeLimit > 0) {
//                         const startTime = new Date(subData.startedAt).getTime();
//                         const endTime = startTime + (assessmentSnap.data().moduleInfo.timeLimit * 60 * 1000);
//                         const remainingSeconds = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
//                         setTimeLeft(remainingSeconds);
//                         if (remainingSeconds === 0) forceAutoSubmit(submissionId, subData.answers || {});
//                     }
//                 } else {
//                     toast.error('You are not assigned to this assessment.');
//                 }
//             } catch (error) {
//                 console.error('Error loading assessment:', error);
//                 toast.error('Failed to load assessment data.');
//             } finally {
//                 setLoading(false);
//             }
//         };
//         if (timeOffset !== null) loadAssessment();
//     }, [assessmentId, user?.uid, user?.role, user?.email, timeOffset]);

//     // ─── COUNTDOWN ────────────────────────────────────────────────────────────
//     useEffect(() => {
//         if (timeLeft === null || isLocked || isNotStarted) return;
//         if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
//         const timerId = setInterval(() => {
//             const startTime = new Date(submission.startedAt).getTime();
//             const endTime = startTime + (assessment.moduleInfo.timeLimit * 60 * 1000);
//             setTimeLeft(Math.max(0, Math.floor((endTime - getSecureNow()) / 1000)));
//         }, 1000);
//         return () => clearInterval(timerId);
//     }, [timeLeft, isLocked, isNotStarted, submission?.startedAt]);

//     const formatTime = (seconds: number) => {
//         const h = Math.floor(seconds / 3600);
//         const m = Math.floor((seconds % 3600) / 60);
//         const s = seconds % 60;
//         if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
//         return `${m}m ${s.toString().padStart(2, '0')}s`;
//     };

//     // ─── HANDLERS ────────────────────────────────────────────────────────────
//     const handleStartAssessment = async () => {
//         if (!startDeclarationChecked) return;
//         setSaving(true);
//         try {
//             const secureStartTime = new Date(getSecureNow()).toISOString();
//             await updateDoc(doc(db, 'learner_submissions', submission.id), { status: 'in_progress', startedAt: secureStartTime });
//             setSubmission((prev: any) => ({ ...prev, status: 'in_progress', startedAt: secureStartTime }));
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
//                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString()
//                     });
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
//                 answers: currentAnswers,
//                 status: 'submitted',
//                 submittedAt: submitTime,
//                 autoSubmitted: true,
//                 learnerDeclaration: {
//                     agreed: true,
//                     timestamp: submitTime,
//                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
//                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown'
//                 }
//             });
//             toast.success("Time's up! Assessment auto-submitted.");
//             setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
//             setTimeout(() => navigate(-1), 3000);
//         } catch (error) { console.error("Auto-submit failed", error); } finally { setSaving(false); }
//     };

//     const handleNavigationLeave = () => {
//         if (!isLocked && assessment.moduleInfo?.timeLimit > 0) setShowLeaveWarning(true);
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
//                 answers,
//                 status: 'submitted',
//                 submittedAt: submitTime,
//                 learnerDeclaration: {
//                     agreed: true,
//                     timestamp: submitTime,
//                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
//                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown'
//                 }
//             });
//             toast.success('Assessment submitted!');
//             setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
//             setTimeout(() => window.scrollTo(0, 0), 1000);
//         } catch { toast.error('Failed to submit.'); } finally { setSaving(false); }
//     };

//     // ══════════════════════════════════════════════════════════════════════════
//     // LOADING & ERROR SCREENS
//     // ══════════════════════════════════════════════════════════════════════════
//     if (loading) return (
//         <div className="ap-fullscreen">
//             <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
//                 <div className="ap-spinner" />
//                 <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
//                     Loading Assessment…
//                 </span>
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
//                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', opacity: 0.5 }}>
//                     <AlertCircle size={32} color="var(--mlab-grey)" />
//                 </div>
//                 <h2 className="ap-state-card__title">Assessment Unavailable</h2>
//                 <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Please contact your assessor if you believe this is an error.</p>
//                 <div className="ap-state-card__actions">
//                     <button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button>
//                 </div>
//             </div>
//         </div>
//     );

//     // ══════════════════════════════════════════════════════════════════════════
//     // GATE SCREEN (BEFORE STARTING)
//     // ══════════════════════════════════════════════════════════════════════════
//     if (isNotStarted) return (
//         <div className="ap-gate ap-animate">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
//             <div className="ap-gate-topbar">
//                 <button className="ap-gate-topbar__back" onClick={() => navigate(-1)}>
//                     <ArrowLeft size={14} /> Back to Portfolio
//                 </button>
//                 <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
//             </div>

//             <div className="ap-gate-body">
//                 <div className="ap-gate-left">
//                     <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
//                     <h1 className="ap-gate-left__title">{assessment.title}</h1>
//                     <p className="ap-gate-left__sub">Read all instructions carefully before starting.</p>

//                     <div className="ap-info-grid">
//                         <div className="ap-info-card">
//                             <div className="ap-info-card__label"><BookOpen size={12} /> Module</div>
//                             <div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div>
//                             <div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div>
//                         </div>
//                         <div className="ap-info-card">
//                             <div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div>
//                             <div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div>
//                             <div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div>
//                         </div>
//                         <div className="ap-info-card">
//                             <div className="ap-info-card__label"><Clock size={12} /> Time Limit</div>
//                             <div className="ap-info-card__value">{assessment.moduleInfo?.timeLimit ? `${assessment.moduleInfo.timeLimit} Min` : 'No Limit'}</div>
//                             <div className="ap-info-card__sub">{assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}</div>
//                         </div>
//                         <div className="ap-info-card">
//                             <div className="ap-info-card__label"><Scale size={12} /> Total Marks</div>
//                             <div className="ap-info-card__value">{assessment.totalMarks}</div>
//                             <div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div>
//                         </div>
//                     </div>

//                     <div className="ap-note-block">
//                         <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
//                         <p className="ap-note-block__text">{assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
//                         {assessment.purpose && <>
//                             <div className="ap-note-block__heading"><Info size={12} /> Purpose</div>
//                             <p className="ap-note-block__text">{assessment.purpose}</p>
//                         </>}
//                     </div>
//                 </div>

//                 <div className="ap-gate-right">
//                     <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
//                     <ul className="ap-rules-list">
//                         <li className="ap-rule-item">
//                             <div className="ap-rule-icon"><Scale size={18} /></div>
//                             <div>
//                                 <span className="ap-rule-title">Academic Integrity</span>
//                                 <p className="ap-rule-desc">All work must be entirely your own. Plagiarism or use of unauthorized AI tools violates QCTO guidelines.</p>
//                             </div>
//                         </li>
//                         <li className="ap-rule-item">
//                             <div className="ap-rule-icon"><UserCheck size={18} /></div>
//                             <div>
//                                 <span className="ap-rule-title">Independent Work</span>
//                                 <p className="ap-rule-desc">Unless explicitly stated as a group project, no collaboration is permitted.</p>
//                             </div>
//                         </li>
//                         <li className="ap-rule-item">
//                             <div className="ap-rule-icon"><Wifi size={18} /></div>
//                             <div>
//                                 <span className="ap-rule-title">Auto-Save</span>
//                                 <p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p>
//                             </div>
//                         </li>
//                         {assessment.moduleInfo?.timeLimit > 0 && (
//                             <li className="ap-rule-item">
//                                 <div className="ap-rule-icon"><Clock size={18} /></div>
//                                 <div>
//                                     <span className="ap-rule-title">Timed Assessment</span>
//                                     <p className="ap-rule-desc">The countdown continues even if you close the browser tab. Plan your time carefully.</p>
//                                 </div>
//                             </li>
//                         )}
//                     </ul>

//                     <div className="ap-declaration">
//                         <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
//                             <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
//                             <span className="ap-declaration-check__text">
//                                 <strong>Declaration of Authenticity</strong>
//                                 I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.
//                             </span>
//                         </label>
//                         <button className={`ap-start-btn${startDeclarationChecked ? ' ap-start-btn--ready' : ''}`} onClick={handleStartAssessment} disabled={saving || !startDeclarationChecked}>
//                             {saving ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> I Agree, Begin Assessment</>}
//                         </button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );

//     // ══════════════════════════════════════════════════════════════════════════
//     // MAIN PLAYER SCREEN
//     // ══════════════════════════════════════════════════════════════════════════
//     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
//         if (block.type === 'section') acc.push({ type: 'section', label: block.title, id: block.id });
//         else if (block.type === 'text' || block.type === 'mcq') acc.push({ type: 'q', label: block.question, id: block.id });
//         return acc;
//     }, []) || [];

//     // The display status string
//     let displayStatus = submission.status.replace('_', ' ');
//     if (submission.status === 'returned') displayStatus = 'revision required';

//     return (
//         <div className="ap-player ap-animate">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {showLeaveWarning && (
//                 <ConfirmModal
//                     title="Leave Timed Assessment?"
//                     message="Your timer will NOT pause. If you leave, the clock continues counting down in the background."
//                     confirmText="Yes, Leave" cancelText="Stay Here"
//                     onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)}
//                 />
//             )}
//             {showSubmitConfirm && (
//                 <ConfirmModal
//                     title="Submit Assessment?"
//                     message="You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."
//                     confirmText="Submit for Grading" cancelText="Go Back"
//                     onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)}
//                 />
//             )}

//             {/* ── Top Bar ── */}
//             <div className="ap-player-topbar no-print">
//                 <div className="ap-player-topbar__left">
//                     <button className="ap-player-topbar__back" onClick={handleNavigationLeave}>
//                         <ArrowLeft size={13} /> Portfolio
//                     </button>
//                     <div className="ap-player-topbar__separator" />
//                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
//                 </div>

//                 <div className="ap-player-topbar__right">
//                     {isLocked && (
//                         <button className="ap-topbar-print-btn" onClick={() => window.print()}>
//                             <Printer size={13} /> Print Audit
//                         </button>
//                     )}
//                     {!isLocked && timeLeft !== null && (
//                         <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}>
//                             <Timer size={14} /> {formatTime(timeLeft)}
//                         </div>
//                     )}
//                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
//                         {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}
//                     </span>
//                     <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>
//                         {displayStatus}
//                     </span>
//                 </div>
//             </div>

//             {/* ── Body: 2-col (active) or 3-col (locked) ── */}
//             <div className={`ap-player-body${isLocked ? ' is-locked' : ''}`}>

//                 {/* LEFT SIDEBAR */}
//                 <nav className="ap-sidebar no-print">
//                     <div className="ap-sidebar__meta-block">
//                         <div className="ap-sidebar__meta-title">{assessment.title}</div>
//                         <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
//                         <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div>
//                         <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>
//                     </div>

//                     {(submission.status !== 'not_started' && submission.status !== 'in_progress') && (
//                         <>
//                             <div className="ap-sidebar__label">Status Tracking</div>
//                             <div className="ap-sidebar__status-box">

//                                 {/* 🚀 Dynamic Outcome or Pending Card */}
//                                 {hasBeenGraded && outcome ? (
//                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
//                                         <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
//                                         {outcome.score !== undefined && (
//                                             <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>
//                                                 {outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%
//                                             </div>
//                                         )}
//                                         <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
//                                     </div>
//                                 ) : (
//                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}>
//                                         <div className="ap-sidebar__outcome-val" style={{ color: '#cbd5e1' }}>Awaiting Grade</div>
//                                         <div className="ap-sidebar__outcome-note">The Assessor has not yet finalized your official results.</div>
//                                     </div>
//                                 )}

//                                 {/* 🚀 UPDATED: Display Facilitator and/or Assessor Overall Remarks */}
//                                 {hasBeenReviewed && submission.grading?.facilitatorOverallFeedback && (
//                                     <div style={{ background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid rgba(56, 189, 248, 0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
//                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
//                                             <Info size={11} /> Facilitator Summary
//                                         </strong>
//                                         <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', lineHeight: '1.55' }}>
//                                             {submission.grading.facilitatorOverallFeedback}
//                                         </p>
//                                     </div>
//                                 )}

//                                 {hasBeenGraded && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && (
//                                     <div style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid rgba(245,158,11,0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
//                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'red', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
//                                             <MessageSquare size={11} /> Assessor Final Remarks
//                                         </strong>
//                                         <p style={{ margin: 0, color: 'red', fontSize: '0.78rem', lineHeight: '1.55' }}>
//                                             {submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}
//                                         </p>
//                                     </div>
//                                 )}

//                                 {/* Dynamic Timeline */}
//                                 <div className="ap-sidebar__timeline-item">
//                                     <div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}>
//                                         <UserCheck size={13} />
//                                     </div>
//                                     <div className="ap-sidebar__timeline-content">
//                                         <span className="ap-sidebar__timeline-title">Facilitator Review</span>
//                                         <span className="ap-sidebar__timeline-desc">
//                                             {submission.status === 'submitted' ? 'Waiting for Facilitator' : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}
//                                         </span>
//                                     </div>
//                                 </div>

//                                 <div className="ap-sidebar__timeline-item">
//                                     <div className={`ap-sidebar__timeline-icon${hasBeenGraded ? ' ap-sidebar__timeline-icon--done' : ''}`}>
//                                         <Award size={13} />
//                                     </div>
//                                     <div className="ap-sidebar__timeline-content">
//                                         <span className="ap-sidebar__timeline-title">Assessor Grading</span>
//                                         <span className="ap-sidebar__timeline-desc">
//                                             {hasBeenGraded ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}
//                                         </span>
//                                     </div>
//                                 </div>

//                                 <div className="ap-sidebar__timeline-item">
//                                     <div className={`ap-sidebar__timeline-icon${submission.status === 'moderated' ? ' ap-sidebar__timeline-icon--done' : ''}`}>
//                                         <ShieldCheck size={13} />
//                                     </div>
//                                     <div className="ap-sidebar__timeline-content">
//                                         <span className="ap-sidebar__timeline-title">Internal Moderation</span>
//                                         <span className="ap-sidebar__timeline-desc">
//                                             {submission.status === 'moderated' ? 'QA Complete' : 'Awaiting QA Verification'}
//                                         </span>
//                                     </div>
//                                 </div>
//                             </div>
//                         </>
//                     )}

//                     <div className="ap-sidebar__label">Workbook Contents</div>
//                     <div className="ap-sidebar__nav">
//                         {navItems.map((item: any) =>
//                             item.type === 'section' ? (
//                                 <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
//                             ) : (
//                                 <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item">
//                                     {item.label.length > 36 ? item.label.slice(0, 36) + '…' : item.label}
//                                 </a>
//                             )
//                         )}
//                     </div>

//                     <div className="ap-sidebar__footer">
//                         <div className="ap-sidebar__footer-item">
//                             <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={11} /> Reference</span>
//                             <strong>{submission.id?.split('_')[0] || 'N/A'}</strong>
//                         </div>
//                         <div className="ap-sidebar__footer-item">
//                             <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Activity size={11} /> Last Sync</span>
//                             <strong>
//                                 {submission.lastSavedAt
//                                     ? new Date(submission.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
//                                     : 'Offline'}
//                             </strong>
//                         </div>
//                     </div>
//                 </nav>

//                 {/* CENTRE CONTENT */}
//                 <div className="ap-player-content print-pane">

//                     {isLocked && (
//                         <div className="ap-print-header">
//                             <h2>Official Assessment Record</h2>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
//                                 <div>
//                                     <p style={{ margin: '0 0 4px' }}><strong>Learner:</strong> {submission.learnerDeclaration?.learnerName || learnerProfile?.fullName}</p>
//                                     <p style={{ margin: 0 }}><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learnerProfile?.idNumber}</p>
//                                 </div>
//                                 <div style={{ textAlign: 'right' }}>
//                                     <p style={{ margin: '0 0 4px' }}><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
//                                     <p style={{ margin: '0 0 4px' }}><strong>Submitted:</strong> {getSafeDate(submission.submittedAt)}</p>
//                                     {hasBeenGraded && <p style={{ margin: 0 }}><strong>Outcome:</strong> {outcome?.label} ({outcome?.percentage}%)</p>}
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
//                                         {hasBeenGraded && totals && totals.total > 0 && (
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

//                             const { score: blockScore, facFeedback, assFeedback, isCorrect } = getBlockGrading(block.id);

//                             // 🚀 INK COLOR LOGIC
//                             // If it's graded, the final say is Red. If only reviewed by facilitator, it's Blue.
//                             let inkColor = 'transparent';
//                             if (hasBeenGraded && (blockScore !== undefined || assFeedback)) inkColor = 'red';
//                             else if (hasBeenReviewed && (blockScore !== undefined || facFeedback)) inkColor = 'blue';

//                             const markLabel = hasBeenReviewed && blockScore !== undefined && blockScore !== null
//                                 ? `${blockScore} / ${block.marks}`
//                                 : `${block.marks} Marks`;

//                             const QuestionIndicator = () => {
//                                 if (isCorrect !== undefined && isCorrect !== null && hasBeenReviewed) {
//                                     return (
//                                         <span className="ap-result-indicator">
//                                             {isCorrect
//                                                 ? <Check size={16} color={inkColor} strokeWidth={3} />
//                                                 : <X size={16} color={inkColor} strokeWidth={3} />}
//                                         </span>
//                                     );
//                                 }
//                                 return null;
//                             };

//                             if (block.type === 'mcq') return (
//                                 <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
//                                     <div className="ap-block-question__header">
//                                         <div className="ap-block-question__text-wrap">
//                                             <span className="ap-block-question__text">
//                                                 <strong style={{ color: '#94a3b8', marginRight: '8px' }}>Q{idx + 1}.</strong>
//                                                 {block.question}
//                                             </span>
//                                             <QuestionIndicator />
//                                         </div>
//                                         <span className="ap-block-question__marks" style={{ color: inkColor !== 'transparent' ? inkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
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

//                                         {/* 🚀 DUAL LAYER FEEDBACK DISPLAY */}
//                                         {hasBeenReviewed && facFeedback && (
//                                             <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, marginTop: '1rem', background: '#eff6ff' }}>
//                                                 <div className="ap-feedback-panel__label" style={{ color: '#0284c7' }}>Facilitator Coaching Notes</div>
//                                                 <p className="ap-feedback-panel__text" style={{ color: '#0369a1', fontStyle: 'italic', fontWeight: 500 }}>{facFeedback}</p>
//                                             </div>
//                                         )}
//                                         {hasBeenGraded && assFeedback && (
//                                             <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, marginTop: '0.5rem', background: '#fef2f2' }}>
//                                                 <div className="ap-feedback-panel__label" style={{ color: '#b91c1c' }}>Assessor Verification</div>
//                                                 <p className="ap-feedback-panel__text" style={{ color: '#991b1b', fontStyle: 'italic', fontWeight: 500 }}>{assFeedback}</p>
//                                             </div>
//                                         )}
//                                     </div>
//                                 </div>
//                             );

//                             if (block.type === 'text') return (
//                                 <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
//                                     <div className="ap-block-question__header">
//                                         <div className="ap-block-question__text-wrap">
//                                             <span className="ap-block-question__text">
//                                                 <strong style={{ color: '#94a3b8', marginRight: '8px' }}>Q{idx + 1}.</strong>
//                                                 {block.question}
//                                             </span>
//                                             <QuestionIndicator />
//                                         </div>
//                                         <span className="ap-block-question__marks" style={{ color: inkColor !== 'transparent' ? inkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
//                                     </div>
//                                     <div className="ap-block-question__body">
//                                         <div className={`ap-quill-wrapper ${isLocked ? 'locked' : ''}`}>
//                                             <ReactQuill
//                                                 theme="snow"
//                                                 value={answers[block.id] || ''}
//                                                 onChange={(content) => handleAnswerChange(block.id, content)}
//                                                 readOnly={isLocked}
//                                                 modules={quillModules}
//                                                 formats={quillFormats}
//                                                 placeholder={isLocked ? 'No answer provided.' : 'Type your detailed response here...'}
//                                             />
//                                         </div>

//                                         {/* 🚀 DUAL LAYER FEEDBACK DISPLAY */}
//                                         {hasBeenReviewed && facFeedback && (
//                                             <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #3b82f6`, marginTop: '1rem', background: '#eff6ff' }}>
//                                                 <div className="ap-feedback-panel__label" style={{ color: '#0284c7' }}>Facilitator Coaching Notes</div>
//                                                 <p className="ap-feedback-panel__text" style={{ color: '#0369a1', fontStyle: 'italic', fontWeight: 500 }}>{facFeedback}</p>
//                                             </div>
//                                         )}
//                                         {hasBeenGraded && assFeedback && (
//                                             <div className="ap-feedback-panel" style={{ borderLeft: `3px solid #ef4444`, marginTop: '0.5rem', background: '#fef2f2' }}>
//                                                 <div className="ap-feedback-panel__label" style={{ color: '#b91c1c' }}>Assessor Verification</div>
//                                                 <p className="ap-feedback-panel__text" style={{ color: '#991b1b', fontStyle: 'italic', fontWeight: 500 }}>{assFeedback}</p>
//                                             </div>
//                                         )}
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
//                                 <CheckCircle size={36} color="var(--mlab-green)" />
//                             </div>
//                             <h3 className="ap-footer--locked__title">
//                                 {submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}
//                             </h3>
//                             <p className="ap-footer--locked__desc">
//                                 This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>.{' '}
//                                 {hasBeenGraded ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}
//                             </p>
//                             <button className="ap-btn ap-btn--primary" onClick={() => navigate(-1)}>
//                                 <ArrowLeft size={14} /> Return to Portfolio
//                             </button>
//                         </div>
//                     )}

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
//                                     <Clock size={11} /> {getSafeDate(submission.learnerDeclaration?.timestamp || submission.submittedAt)}
//                                 </span>
//                             </div>

//                             {hasBeenGraded && (
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
//                                         <Clock size={11} /> {getSafeDate(submission.grading?.gradedAt)}
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
//                                 <Clock size={11} /> {getSafeDate(submission.learnerDeclaration?.timestamp || submission.submittedAt)}
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

//                         {hasBeenGraded && (
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
//                                     <Clock size={11} /> {getSafeDate(submission.grading?.gradedAt)}
//                                 </span>
//                             </div>
//                         )}

//                         {submission.status === 'moderated' && (
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
//                                     <Clock size={11} /> {getSafeDate(submission.moderation?.moderatedAt)}
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
// }> = ({ title, message, confirmText, cancelText, onConfirm, onCancel }) => (
//     <div style={{
//         position: 'fixed', inset: 0,
//         background: 'rgba(5,46,58,0.7)',
//         backdropFilter: 'blur(3px)',
//         zIndex: 2000,
//         display: 'flex', alignItems: 'center', justifyContent: 'center',
//         padding: '1rem'
//     }}>
//         <div className="ap-animate" style={{
//             background: 'white', maxWidth: '420px', width: '100%',
//             textAlign: 'center', padding: 0,
//             boxShadow: '0 24px 48px -8px rgba(5,46,58,0.35)',
//             border: '1px solid var(--mlab-border)',
//             borderTop: '5px solid var(--mlab-blue)',
//             borderRadius: '8px', overflow: 'hidden'
//         }}>
//             <div style={{ padding: '2rem 2rem 1.25rem', borderBottom: '1px solid var(--mlab-border)' }}>
//                 <div style={{ width: 56, height: 56, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
//                     <AlertTriangle size={28} color="#d97706" />
//                 </div>
//                 <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>
//                     {title}
//                 </h2>
//                 <p style={{ color: 'var(--mlab-grey)', lineHeight: '1.65', margin: 0, fontSize: '0.9rem' }}>{message}</p>
//             </div>
//             <div style={{ display: 'flex' }}>
//                 <button onClick={onCancel} style={{
//                     flex: 1, padding: '1rem', border: 'none', borderRight: '1px solid var(--mlab-border)',
//                     background: 'var(--mlab-bg)', color: 'var(--mlab-grey)',
//                     fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem',
//                     letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
//                 }}>
//                     {cancelText}
//                 </button>
//                 <button onClick={onConfirm} style={{
//                     flex: 1, padding: '1rem', border: 'none',
//                     background: 'var(--mlab-blue)', color: 'white',
//                     fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem',
//                     letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
//                 }}>
//                     {confirmText}
//                 </button>
//             </div>
//         </div>
//     </div>
// );

// export default AssessmentPlayer;


// // // src/pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer.tsx
// // // mLab CI Brand-aligned Assessment Player v2.1 (With Modern Rich Text Editor)

// // import React, { useState, useEffect, useRef } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import {
// //     ArrowLeft, Save, CheckCircle, Info, ShieldAlert,
// //     AlertCircle, Play, Clock, GraduationCap,
// //     BookOpen, Scale, Wifi, UserCheck, Timer, AlertTriangle,
// //     ShieldCheck, Hash, Activity, Award, BarChart, MessageSquare, Printer, Check, X
// // } from 'lucide-react';
// // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';

// // // 🚀 FIX: Using the modern, React 18/19 compatible fork of Quill
// // import ReactQuill from 'react-quill-new';
// // import 'react-quill-new/dist/quill.snow.css';

// // import './AssessmentPlayer.css';
// // import { TintedSignature } from '../../FacilitatorDashboard/FacilitatorProfileView/FacilitatorProfileView';

// // // ─── QUILL CONFIGURATION ──────────────────────────────────────────────────
// // const quillModules = {
// //     toolbar: [
// //         ['bold', 'italic', 'underline'],
// //         [{ 'list': 'ordered' }, { 'list': 'bullet' }],
// //         ['clean']
// //     ],
// // };

// // const quillFormats = [
// //     'bold', 'italic', 'underline',
// //     'list', 'bullet'
// // ];

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

// //     const [declarationChecked, setDeclarationChecked] = useState(false);
// //     const [startDeclarationChecked, setStartDeclarationChecked] = useState(false);
// //     const [isAdminIntercept, setIsAdminIntercept] = useState(false);

// //     const [showLeaveWarning, setShowLeaveWarning] = useState(false);
// //     const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

// //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// //     const [timeLeft, setTimeLeft] = useState<number | null>(null);
// //     const [timeOffset, setTimeOffset] = useState<number>(0);

// //     const isLocked = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'returned'].includes(submission?.status);
// //     const isNotStarted = submission?.status === 'not_started';
// //     const hasBeenGraded = ['graded', 'moderated'].includes(submission?.status);
// //     const hasBeenReviewed = ['facilitator_reviewed', 'graded', 'moderated', 'returned'].includes(submission?.status);

// //     // ─── HELPERS ─────────────────────────────────────────────────────────────
// //     const getBlockGrading = (blockId: string) => {
// //         if (!hasBeenReviewed) return { score: undefined, feedback: '', isCorrect: null };
// //         const breakdown = submission.grading?.breakdown;
// //         if (breakdown && breakdown[blockId]) {
// //             return {
// //                 score: breakdown[blockId].score,
// //                 feedback: breakdown[blockId].feedback,
// //                 isCorrect: breakdown[blockId].isCorrect
// //             };
// //         }
// //         return {
// //             score: submission.grading?.[blockId]?.score ?? submission.scores?.[blockId],
// //             feedback: submission.grading?.[blockId]?.feedback ?? submission.feedback?.[blockId],
// //             isCorrect: submission.grading?.[blockId]?.isCorrect ?? null
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
// //         const compStr = (submission.competency || submission.overallCompetency || submission.outcome || '').toString().toLowerCase();
// //         let isCompetent = compStr === 'c' || compStr === 'competent';
// //         const actualScore = submission.marks !== undefined ? submission.marks : submission.totalScore;
// //         if (!isCompetent && actualScore !== undefined && assessment?.totalMarks) {
// //             isCompetent = actualScore >= (assessment.totalMarks * 0.6);
// //         }
// //         const percentage = actualScore !== undefined && assessment?.totalMarks
// //             ? Math.round((actualScore / assessment.totalMarks) * 100) : null;
// //         return {
// //             label: isCompetent ? 'Competent (C)' : 'Not Yet Competent (NYC)',
// //             color: isCompetent ? 'red' : 'red', // Assessor grade is always red ink for outcome
// //             subtext: submission.status === 'moderated'
// //                 ? 'Final Results Verified.'
// //                 : (isCompetent ? 'Result pending internal moderation sign-off.' : 'Remediation may be required.'),
// //             score: actualScore, percentage, isCompetent
// //         };
// //     };

// //     const outcome = getCompetencyStatus();

// //     const getSafeDate = (dateString: string) => {
// //         if (!dateString) return 'recently';
// //         const d = new Date(dateString);
// //         return isNaN(d.getTime()) ? 'recently' : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
// //     };

// //     // ─── SERVER TIME ─────────────────────────────────────────────────────────
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

// //     // ─── DATA LOAD ────────────────────────────────────────────────────────────
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
// //                 const authSnap = await getDocs(query(learnersRef, where('authUid', '==', user.uid)));
// //                 if (!authSnap.empty) {
// //                     actualLearnerDocId = authSnap.docs[0].id;
// //                 } else {
// //                     const emailSnap = await getDocs(query(learnersRef, where('email', '==', user.email)));
// //                     if (emailSnap.empty) { toast.error('Learner profile not found.'); setLoading(false); return; }
// //                     actualLearnerDocId = emailSnap.docs[0].id;
// //                 }

// //                 const userDocSnap = await getDoc(doc(db, 'users', user.uid));
// //                 if (userDocSnap.exists()) setLearnerProfile(userDocSnap.data());

// //                 const submissionId = `${actualLearnerDocId}_${assessmentId}`;
// //                 const submissionSnap = await getDoc(doc(db, 'learner_submissions', submissionId));

// //                 if (submissionSnap.exists()) {
// //                     const subData = submissionSnap.data();
// //                     setSubmission({ ...subData, id: submissionId });
// //                     setAnswers(subData.answers || {});

// //                     if (subData.grading?.gradedBy) {
// //                         const assSnap = await getDoc(doc(db, 'users', subData.grading.gradedBy));
// //                         if (assSnap.exists()) setAssessorProfile(assSnap.data());
// //                     }

// //                     if (subData.status === 'in_progress' && assessmentSnap.data().moduleInfo?.timeLimit > 0) {
// //                         const startTime = new Date(subData.startedAt).getTime();
// //                         const endTime = startTime + (assessmentSnap.data().moduleInfo.timeLimit * 60 * 1000);
// //                         const remainingSeconds = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
// //                         setTimeLeft(remainingSeconds);
// //                         if (remainingSeconds === 0) forceAutoSubmit(submissionId, subData.answers || {});
// //                     }
// //                 } else {
// //                     toast.error('You are not assigned to this assessment.');
// //                 }
// //             } catch (error) {
// //                 console.error('Error loading assessment:', error);
// //                 toast.error('Failed to load assessment data.');
// //             } finally {
// //                 setLoading(false);
// //             }
// //         };
// //         if (timeOffset !== null) loadAssessment();
// //     }, [assessmentId, user?.uid, user?.role, user?.email, timeOffset]);

// //     // ─── COUNTDOWN ────────────────────────────────────────────────────────────
// //     useEffect(() => {
// //         if (timeLeft === null || isLocked || isNotStarted) return;
// //         if (timeLeft <= 0) { toast.error("Time is up! Auto-submitting."); forceAutoSubmit(submission.id, answers); return; }
// //         const timerId = setInterval(() => {
// //             const startTime = new Date(submission.startedAt).getTime();
// //             const endTime = startTime + (assessment.moduleInfo.timeLimit * 60 * 1000);
// //             setTimeLeft(Math.max(0, Math.floor((endTime - getSecureNow()) / 1000)));
// //         }, 1000);
// //         return () => clearInterval(timerId);
// //     }, [timeLeft, isLocked, isNotStarted, submission?.startedAt]);

// //     const formatTime = (seconds: number) => {
// //         const h = Math.floor(seconds / 3600);
// //         const m = Math.floor((seconds % 3600) / 60);
// //         const s = seconds % 60;
// //         if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
// //         return `${m}m ${s.toString().padStart(2, '0')}s`;
// //     };

// //     // ─── HANDLERS ────────────────────────────────────────────────────────────
// //     const handleStartAssessment = async () => {
// //         if (!startDeclarationChecked) return;
// //         setSaving(true);
// //         try {
// //             const secureStartTime = new Date(getSecureNow()).toISOString();
// //             await updateDoc(doc(db, 'learner_submissions', submission.id), { status: 'in_progress', startedAt: secureStartTime });
// //             setSubmission((prev: any) => ({ ...prev, status: 'in_progress', startedAt: secureStartTime }));
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
// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         answers: newAnswers, lastSavedAt: new Date(getSecureNow()).toISOString()
// //                     });
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
// //                 answers: currentAnswers,
// //                 status: 'submitted',
// //                 submittedAt: submitTime,
// //                 autoSubmitted: true,
// //                 learnerDeclaration: {
// //                     agreed: true,
// //                     timestamp: submitTime,
// //                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// //                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown'
// //                 }
// //             });
// //             toast.success("Time's up! Assessment auto-submitted.");
// //             setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
// //             setTimeout(() => navigate(-1), 3000);
// //         } catch (error) { console.error("Auto-submit failed", error); } finally { setSaving(false); }
// //     };

// //     const handleNavigationLeave = () => {
// //         if (!isLocked && assessment.moduleInfo?.timeLimit > 0) setShowLeaveWarning(true);
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
// //                 answers,
// //                 status: 'submitted',
// //                 submittedAt: submitTime,
// //                 learnerDeclaration: {
// //                     agreed: true,
// //                     timestamp: submitTime,
// //                     learnerName: learnerProfile?.fullName || user?.fullName || 'Unknown',
// //                     learnerIdNumber: learnerProfile?.idNumber || 'Unknown'
// //                 }
// //             });
// //             toast.success('Assessment submitted!');
// //             setSubmission((prev: any) => ({ ...prev, status: 'submitted' }));
// //             setTimeout(() => navigate(-1), 2000);
// //         } catch { toast.error('Failed to submit.'); } finally { setSaving(false); }
// //     };

// //     // ══════════════════════════════════════════════════════════════════════════
// //     // LOADING
// //     // ══════════════════════════════════════════════════════════════════════════
// //     if (loading) return (
// //         <div className="ap-fullscreen">
// //             <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
// //                 <div className="ap-spinner" />
// //                 <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
// //                     Loading Assessment…
// //                 </span>
// //             </div>
// //         </div>
// //     );

// //     if (isAdminIntercept) return (
// //         <div className="ap-fullscreen">
// //             <div className="ap-state-card">
// //                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
// //                     <ShieldAlert size={32} color="var(--mlab-blue)" />
// //                 </div>
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
// //                 <div style={{ width: 64, height: 64, background: 'var(--mlab-light-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', opacity: 0.5 }}>
// //                     <AlertCircle size={32} color="var(--mlab-grey)" />
// //                 </div>
// //                 <h2 className="ap-state-card__title">Assessment Unavailable</h2>
// //                 <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Please contact your assessor if you believe this is an error.</p>
// //                 <div className="ap-state-card__actions">
// //                     <button className="ap-btn ap-btn--outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Return to Portfolio</button>
// //                 </div>
// //             </div>
// //         </div>
// //     );

// //     // ══════════════════════════════════════════════════════════════════════════
// //     // GATE SCREEN
// //     // ══════════════════════════════════════════════════════════════════════════
// //     if (isNotStarted) return (
// //         <div className="ap-gate ap-animate">
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// //             <div className="ap-gate-topbar">
// //                 <button className="ap-gate-topbar__back" onClick={() => navigate(-1)}>
// //                     <ArrowLeft size={14} /> Back to Portfolio
// //                 </button>
// //                 <span className="ap-gate-topbar__badge">{assessment.type || 'Summative Assessment'}</span>
// //             </div>

// //             <div className="ap-gate-body">
// //                 <div className="ap-gate-left">
// //                     <p className="ap-gate-left__eyebrow">Pre-Assessment Briefing</p>
// //                     <h1 className="ap-gate-left__title">{assessment.title}</h1>
// //                     <p className="ap-gate-left__sub">Read all instructions carefully before starting.</p>

// //                     <div className="ap-info-grid">
// //                         <div className="ap-info-card">
// //                             <div className="ap-info-card__label"><BookOpen size={12} /> Module</div>
// //                             <div className="ap-info-card__value">{assessment.moduleInfo?.moduleNumber || '—'}</div>
// //                             <div className="ap-info-card__sub">Code: {assessment.moduleInfo?.occupationalCode || 'N/A'}</div>
// //                         </div>
// //                         <div className="ap-info-card">
// //                             <div className="ap-info-card__label"><GraduationCap size={12} /> Qualification</div>
// //                             <div className="ap-info-card__value">NQF Level {assessment.moduleInfo?.nqfLevel || '4'}</div>
// //                             <div className="ap-info-card__sub">Credits: {assessment.moduleInfo?.credits || '12'} · Hours: {assessment.moduleInfo?.notionalHours || '120'}</div>
// //                         </div>
// //                         <div className="ap-info-card">
// //                             <div className="ap-info-card__label"><Clock size={12} /> Time Limit</div>
// //                             <div className="ap-info-card__value">{assessment.moduleInfo?.timeLimit ? `${assessment.moduleInfo.timeLimit} Min` : 'No Limit'}</div>
// //                             <div className="ap-info-card__sub">{assessment.moduleInfo?.timeLimit ? 'Timer starts when you begin.' : 'Work at your own pace.'}</div>
// //                         </div>
// //                         <div className="ap-info-card">
// //                             <div className="ap-info-card__label"><Scale size={12} /> Total Marks</div>
// //                             <div className="ap-info-card__value">{assessment.totalMarks}</div>
// //                             <div className="ap-info-card__sub">Pass mark: 60% ({Math.ceil(assessment.totalMarks * 0.6)} marks)</div>
// //                         </div>
// //                     </div>

// //                     <div className="ap-note-block">
// //                         <div className="ap-note-block__heading"><Info size={12} /> Note to the Learner</div>
// //                         <p className="ap-note-block__text">{assessment.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
// //                         {assessment.purpose && <>
// //                             <div className="ap-note-block__heading"><Info size={12} /> Purpose</div>
// //                             <p className="ap-note-block__text">{assessment.purpose}</p>
// //                         </>}
// //                     </div>
// //                 </div>

// //                 <div className="ap-gate-right">
// //                     <h3 className="ap-rules-title"><ShieldAlert size={15} color="var(--mlab-red)" /> Assessment Rules</h3>
// //                     <ul className="ap-rules-list">
// //                         <li className="ap-rule-item">
// //                             <div className="ap-rule-icon"><Scale size={18} /></div>
// //                             <div>
// //                                 <span className="ap-rule-title">Academic Integrity</span>
// //                                 <p className="ap-rule-desc">All work must be entirely your own. Plagiarism or use of unauthorized AI tools violates QCTO guidelines.</p>
// //                             </div>
// //                         </li>
// //                         <li className="ap-rule-item">
// //                             <div className="ap-rule-icon"><UserCheck size={18} /></div>
// //                             <div>
// //                                 <span className="ap-rule-title">Independent Work</span>
// //                                 <p className="ap-rule-desc">Unless explicitly stated as a group project, no collaboration is permitted.</p>
// //                             </div>
// //                         </li>
// //                         <li className="ap-rule-item">
// //                             <div className="ap-rule-icon"><Wifi size={18} /></div>
// //                             <div>
// //                                 <span className="ap-rule-title">Auto-Save</span>
// //                                 <p className="ap-rule-desc">Progress saves automatically. Ensure a stable connection before submitting.</p>
// //                             </div>
// //                         </li>
// //                         {assessment.moduleInfo?.timeLimit > 0 && (
// //                             <li className="ap-rule-item">
// //                                 <div className="ap-rule-icon"><Clock size={18} /></div>
// //                                 <div>
// //                                     <span className="ap-rule-title">Timed Assessment</span>
// //                                     <p className="ap-rule-desc">The countdown continues even if you close the browser tab. Plan your time carefully.</p>
// //                                 </div>
// //                             </li>
// //                         )}
// //                     </ul>

// //                     <div className="ap-declaration">
// //                         <label className={`ap-declaration-check${startDeclarationChecked ? ' ap-declaration-check--checked' : ''}`}>
// //                             <input type="checkbox" checked={startDeclarationChecked} onChange={e => setStartDeclarationChecked(e.target.checked)} />
// //                             <span className="ap-declaration-check__text">
// //                                 <strong>Declaration of Authenticity</strong>
// //                                 I have read and understood the rules above. I confirm that I am the registered learner and the work I submit will be entirely my own.
// //                             </span>
// //                         </label>
// //                         <button className={`ap-start-btn${startDeclarationChecked ? ' ap-start-btn--ready' : ''}`} onClick={handleStartAssessment} disabled={saving || !startDeclarationChecked}>
// //                             {saving ? <><div className="ap-spinner ap-spinner--sm" /> Preparing…</> : <><Play size={16} /> I Agree, Begin Assessment</>}
// //                         </button>
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>
// //     );

// //     // ══════════════════════════════════════════════════════════════════════════
// //     // PLAYER SCREEN
// //     // ══════════════════════════════════════════════════════════════════════════
// //     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
// //         if (block.type === 'section') acc.push({ type: 'section', label: block.title, id: block.id });
// //         else if (block.type === 'text' || block.type === 'mcq') acc.push({ type: 'q', label: block.question, id: block.id });
// //         return acc;
// //     }, []) || [];

// //     return (
// //         <div className="ap-player ap-animate">
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {showLeaveWarning && (
// //                 <ConfirmModal
// //                     title="Leave Timed Assessment?"
// //                     message="Your timer will NOT pause. If you leave, the clock continues counting down in the background."
// //                     confirmText="Yes, Leave" cancelText="Stay Here"
// //                     onConfirm={() => navigate(-1)} onCancel={() => setShowLeaveWarning(false)}
// //                 />
// //             )}
// //             {showSubmitConfirm && (
// //                 <ConfirmModal
// //                     title="Submit Assessment?"
// //                     message="You are about to submit this workbook for grading. You will NOT be able to change your answers after submission."
// //                     confirmText="Submit for Grading" cancelText="Go Back"
// //                     onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)}
// //                 />
// //             )}

// //             {/* ── Top Bar ── */}
// //             <div className="ap-player-topbar no-print">
// //                 <div className="ap-player-topbar__left">
// //                     <button className="ap-player-topbar__back" onClick={handleNavigationLeave}>
// //                         <ArrowLeft size={13} /> Portfolio
// //                     </button>
// //                     <div className="ap-player-topbar__separator" />
// //                     <h1 className="ap-player-topbar__title">{assessment.title}</h1>
// //                 </div>

// //                 <div className="ap-player-topbar__right">
// //                     {isLocked && (
// //                         <button className="ap-topbar-print-btn" onClick={() => window.print()}>
// //                             <Printer size={13} /> Print Audit
// //                         </button>
// //                     )}
// //                     {!isLocked && timeLeft !== null && (
// //                         <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}>
// //                             <Timer size={14} /> {formatTime(timeLeft)}
// //                         </div>
// //                     )}
// //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
// //                         {saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}
// //                     </span>
// //                     <span className={`ap-status-badge${isLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>
// //                         {submission.status.replace('_', ' ')}
// //                     </span>
// //                 </div>
// //             </div>

// //             {/* ── Body: 2-col (active) or 3-col (locked) ── */}
// //             <div className={`ap-player-body${isLocked ? ' is-locked' : ''}`}>

// //                 {/* LEFT SIDEBAR */}
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

// //                                 {/* 🚀 NEW: Dynamic Outcome or Pending Card */}
// //                                 {hasBeenGraded && outcome ? (
// //                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
// //                                         <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
// //                                         {outcome.score !== undefined && (
// //                                             <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', color: 'rgba(255,255,255,0.75)' }}>
// //                                                 {outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%
// //                                             </div>
// //                                         )}
// //                                         <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
// //                                     </div>
// //                                 ) : (
// //                                     <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}>
// //                                         <div className="ap-sidebar__outcome-val" style={{ color: '#cbd5e1' }}>Awaiting Grade</div>
// //                                         <div className="ap-sidebar__outcome-note">The Assessor has not yet finalized your official results.</div>
// //                                     </div>
// //                                 )}

// //                                 {/* Assessor Overall Remarks */}
// //                                 {hasBeenGraded && submission.grading?.overallFeedback && (
// //                                     <div style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid rgba(245,158,11,0.5)', padding: '0.75rem', marginBottom: '0.75rem' }}>
// //                                         <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f59e0b', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
// //                                             <MessageSquare size={11} /> Assessor Remarks
// //                                         </strong>
// //                                         <p style={{ margin: 0, color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', lineHeight: '1.55' }}>
// //                                             {submission.grading.overallFeedback}
// //                                         </p>
// //                                     </div>
// //                                 )}

// //                                 {/* 🚀 NEW: Dynamic Timeline */}
// //                                 <div className="ap-sidebar__timeline-item">
// //                                     <div className={`ap-sidebar__timeline-icon${submission.status !== 'submitted' ? ' ap-sidebar__timeline-icon--done' : ''}`}>
// //                                         <UserCheck size={13} />
// //                                     </div>
// //                                     <div className="ap-sidebar__timeline-content">
// //                                         <span className="ap-sidebar__timeline-title">Facilitator Review</span>
// //                                         <span className="ap-sidebar__timeline-desc">
// //                                             {submission.status === 'submitted' ? 'Waiting for Facilitator' : `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt || submission.updatedAt)}`}
// //                                         </span>
// //                                     </div>
// //                                 </div>

// //                                 <div className="ap-sidebar__timeline-item">
// //                                     <div className={`ap-sidebar__timeline-icon${hasBeenGraded ? ' ap-sidebar__timeline-icon--done' : ''}`}>
// //                                         <Award size={13} />
// //                                     </div>
// //                                     <div className="ap-sidebar__timeline-content">
// //                                         <span className="ap-sidebar__timeline-title">Assessor Grading</span>
// //                                         <span className="ap-sidebar__timeline-desc">
// //                                             {hasBeenGraded ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}
// //                                         </span>
// //                                     </div>
// //                                 </div>

// //                                 <div className="ap-sidebar__timeline-item">
// //                                     <div className={`ap-sidebar__timeline-icon${submission.status === 'moderated' ? ' ap-sidebar__timeline-icon--done' : ''}`}>
// //                                         <ShieldCheck size={13} />
// //                                     </div>
// //                                     <div className="ap-sidebar__timeline-content">
// //                                         <span className="ap-sidebar__timeline-title">Internal Moderation</span>
// //                                         <span className="ap-sidebar__timeline-desc">
// //                                             {submission.status === 'moderated' ? 'QA Complete' : 'Awaiting QA Verification'}
// //                                         </span>
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         </>
// //                     )}

// //                     <div className="ap-sidebar__label">Workbook Contents</div>
// //                     <div className="ap-sidebar__nav">
// //                         {navItems.map((item: any) =>
// //                             item.type === 'section' ? (
// //                                 <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
// //                             ) : (
// //                                 <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item">
// //                                     {item.label.length > 36 ? item.label.slice(0, 36) + '…' : item.label}
// //                                 </a>
// //                             )
// //                         )}
// //                     </div>

// //                     <div className="ap-sidebar__footer">
// //                         <div className="ap-sidebar__footer-item">
// //                             <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={11} /> Reference</span>
// //                             <strong>{submission.id?.split('_')[0] || 'N/A'}</strong>
// //                         </div>
// //                         <div className="ap-sidebar__footer-item">
// //                             <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Activity size={11} /> Last Sync</span>
// //                             <strong>
// //                                 {submission.lastSavedAt
// //                                     ? new Date(submission.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
// //                                     : 'Offline'}
// //                             </strong>
// //                         </div>
// //                     </div>
// //                 </nav>

// //                 {/* CENTRE CONTENT */}
// //                 <div className="ap-player-content print-pane">

// //                     {isLocked && (
// //                         <div className="ap-print-header">
// //                             <h2>Official Assessment Record</h2>
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
// //                         {assessment.blocks?.map((block: any) => {

// //                             if (block.type === 'section') {
// //                                 const totals = sectionTotals[block.id];
// //                                 return (
// //                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
// //                                         <span>{block.title}</span>
// //                                         {hasBeenGraded && totals && totals.total > 0 && (
// //                                             <span className="no-print" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em' }}>
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

// //                             const { score: blockScore, feedback: blockFeedback, isCorrect } = getBlockGrading(block.id);

// //                             // 🚀 DYNAMIC INK COLOR FOR THE LEARNER VIEW
// //                             // Red if graded, Blue if only facilitator reviewed
// //                             let inkColor = 'transparent';
// //                             if (hasBeenGraded && (blockScore !== undefined || blockFeedback)) inkColor = 'red';
// //                             else if (hasBeenReviewed && (blockScore !== undefined || blockFeedback)) inkColor = 'blue';

// //                             const markLabel = hasBeenReviewed && blockScore !== undefined && blockScore !== null
// //                                 ? `${blockScore} / ${block.marks}`
// //                                 : `${block.marks} Marks`;

// //                             const QuestionIndicator = () => {
// //                                 if (isCorrect !== undefined && isCorrect !== null && hasBeenReviewed) {
// //                                     return (
// //                                         <span className="ap-result-indicator">
// //                                             {isCorrect
// //                                                 ? <Check size={16} color={inkColor} strokeWidth={3} />
// //                                                 : <X size={16} color={inkColor} strokeWidth={3} />}
// //                                         </span>
// //                                     );
// //                                 }
// //                                 return null;
// //                             };

// //                             if (block.type === 'mcq') return (
// //                                 <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
// //                                     <div className="ap-block-question__header">
// //                                         <div className="ap-block-question__text-wrap">
// //                                             <span className="ap-block-question__text">{block.question}</span>
// //                                             <QuestionIndicator />
// //                                         </div>
// //                                         <span className="ap-block-question__marks" style={{ color: inkColor !== 'transparent' ? inkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
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
// //                                         {hasBeenReviewed && blockFeedback && (
// //                                             <div className="ap-feedback-panel" style={{ borderLeft: `3px solid ${inkColor}` }}>
// //                                                 <div className="ap-feedback-panel__label" style={{ color: inkColor }}>
// //                                                     {inkColor === 'red' ? 'Assessor Feedback' : 'Facilitator Feedback'}
// //                                                 </div>
// //                                                 <p className="ap-feedback-panel__text" style={{ color: inkColor, fontStyle: 'italic', fontWeight: 500 }}>{blockFeedback}</p>
// //                                             </div>
// //                                         )}
// //                                     </div>
// //                                 </div>
// //                             );

// //                             if (block.type === 'text') return (
// //                                 <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isLocked ? ' ap-block-question--locked' : ''}`}>
// //                                     <div className="ap-block-question__header">
// //                                         <div className="ap-block-question__text-wrap">
// //                                             <span className="ap-block-question__text">{block.question}</span>
// //                                             <QuestionIndicator />
// //                                         </div>
// //                                         <span className="ap-block-question__marks" style={{ color: inkColor !== 'transparent' ? inkColor : '#64748b', fontWeight: 'bold', background: 'transparent' }}>{markLabel}</span>
// //                                     </div>
// //                                     <div className="ap-block-question__body">
// //                                         <div className={`ap-quill-wrapper ${isLocked ? 'locked' : ''}`}>
// //                                             <ReactQuill
// //                                                 theme="snow"
// //                                                 value={answers[block.id] || ''}
// //                                                 onChange={(content) => handleAnswerChange(block.id, content)}
// //                                                 readOnly={isLocked}
// //                                                 modules={quillModules}
// //                                                 formats={quillFormats}
// //                                                 placeholder={isLocked ? 'No answer provided.' : 'Type your detailed response here...'}
// //                                             />
// //                                         </div>

// //                                         {hasBeenReviewed && blockFeedback && (
// //                                             <div className="ap-feedback-panel" style={{ borderLeft: `3px solid ${inkColor}`, marginTop: '1rem' }}>
// //                                                 <div className="ap-feedback-panel__label" style={{ color: inkColor }}>
// //                                                     {inkColor === 'red' ? 'Assessor Feedback' : 'Facilitator Feedback'}
// //                                                 </div>
// //                                                 <p className="ap-feedback-panel__text" style={{ color: inkColor, fontStyle: 'italic', fontWeight: 500 }}>{blockFeedback}</p>
// //                                             </div>
// //                                         )}
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
// //                                 <CheckCircle size={36} color="var(--mlab-green)" />
// //                             </div>
// //                             <h3 className="ap-footer--locked__title">
// //                                 {submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}
// //                             </h3>
// //                             <p className="ap-footer--locked__desc">
// //                                 This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>.{' '}
// //                                 {hasBeenGraded ? 'It has been graded and is awaiting internal moderation.' : 'It is currently under review by our faculty.'}
// //                             </p>
// //                             <button className="ap-btn ap-btn--primary" onClick={() => navigate(-1)}>
// //                                 <ArrowLeft size={14} /> Return to Portfolio
// //                             </button>
// //                         </div>
// //                     )}

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
// //                                     <Clock size={11} /> {getSafeDate(submission.learnerDeclaration?.timestamp || submission.submittedAt)}
// //                                 </span>
// //                             </div>

// //                             {hasBeenGraded && (
// //                                 <div className="ap-sig-box">
// //                                     <span className="ap-sig-box__label">Assessor Verification</span>
// //                                     <div className="ap-sig-box__img-wrap">
// //                                         {assessorProfile?.signatureUrl
// //                                             ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// //                                             // <img src={assessorProfile.signatureUrl} alt="Assessor Signature" />
// //                                             : <span className="ap-sig-box__no-sig">No canvas signature on file</span>
// //                                         }
// //                                     </div>
// //                                     <span className="ap-sig-box__name" style={{ color: 'red' }}>
// //                                         {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
// //                                     </span>
// //                                     <span className="ap-sig-box__reg" style={{ color: 'red' }}>
// //                                         Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
// //                                     </span>
// //                                     <span className="ap-sig-box__date" style={{ color: 'red' }}>
// //                                         <Clock size={11} /> {getSafeDate(submission.grading?.gradedAt)}
// //                                     </span>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}
// //                 </div>

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
// //                                 <Clock size={11} /> {getSafeDate(submission.learnerDeclaration?.timestamp || submission.submittedAt)}
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
// //                                 <span className="ap-audit-card__label">Assessor Verification</span>
// //                                 <div className="ap-audit-card__sig-wrap">
// //                                     {assessorProfile?.signatureUrl
// //                                         ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} />
// //                                         // <img src={assessorProfile.signatureUrl} alt="Assessor signature" />
// //                                         : <span className="ap-audit-card__sig-placeholder">No signature on file</span>
// //                                     }
// //                                 </div>
// //                                 <span className="ap-audit-card__name" style={{ color: 'red' }}>
// //                                     {assessorProfile?.fullName || submission.grading?.assessorName || '—'}
// //                                 </span>
// //                                 <span className="ap-audit-card__reg" style={{ color: 'red' }}>
// //                                     Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}
// //                                 </span>
// //                                 <span className="ap-audit-card__sub" style={{ color: 'red' }}>
// //                                     <Clock size={11} /> {getSafeDate(submission.grading?.gradedAt)}
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
// // }> = ({ title, message, confirmText, cancelText, onConfirm, onCancel }) => (
// //     <div style={{
// //         position: 'fixed', inset: 0,
// //         background: 'rgba(5,46,58,0.7)',
// //         backdropFilter: 'blur(3px)',
// //         zIndex: 2000,
// //         display: 'flex', alignItems: 'center', justifyContent: 'center',
// //         padding: '1rem'
// //     }}>
// //         <div className="ap-animate" style={{
// //             background: 'white', maxWidth: '420px', width: '100%',
// //             textAlign: 'center', padding: 0,
// //             boxShadow: '0 24px 48px -8px rgba(5,46,58,0.35)',
// //             border: '1px solid var(--mlab-border)',
// //             borderTop: '5px solid var(--mlab-blue)',
// //         }}>
// //             <div style={{ padding: '2rem 2rem 1.25rem', borderBottom: '1px solid var(--mlab-border)' }}>
// //                 <div style={{ width: 56, height: 56, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
// //                     <AlertTriangle size={28} color="#d97706" />
// //                 </div>
// //                 <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>
// //                     {title}
// //                 </h2>
// //                 <p style={{ color: 'var(--mlab-grey)', lineHeight: '1.65', margin: 0, fontSize: '0.9rem' }}>{message}</p>
// //             </div>
// //             <div style={{ display: 'flex' }}>
// //                 <button onClick={onCancel} style={{
// //                     flex: 1, padding: '1rem', border: 'none', borderRight: '1px solid var(--mlab-border)',
// //                     background: 'var(--mlab-bg)', color: 'var(--mlab-grey)',
// //                     fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem',
// //                     letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
// //                 }}>
// //                     {cancelText}
// //                 </button>
// //                 <button onClick={onConfirm} style={{
// //                     flex: 1, padding: '1rem', border: 'none',
// //                     background: 'var(--mlab-blue)', color: 'white',
// //                     fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.82rem',
// //                     letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
// //                 }}>
// //                     {confirmText}
// //                 </button>
// //             </div>
// //         </div>
// //     </div>
// // );

// // export default AssessmentPlayer;


